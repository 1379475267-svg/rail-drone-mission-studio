import { createDefaultCoordinationScenario } from '@/data/defaultCoordinationScenario'
import { MockRobotLink } from '@/services/coordination/mockRobotLink'
import {
  createInitialCoordinationState,
  transitionCoordination,
} from '@/services/coordination/coordinationStateMachine'
import type {
  CoopMessage,
  CoopMessageType,
  CoopPayloadByType,
  CoordinationEvent,
  CoordinationFaultKey,
  CoordinationLogEntry,
  CoordinationMessageRecord,
  CoordinationRuntimeState,
  CoordinationScenario,
  CoordinationSnapshot,
  CoordinationTransitionResult,
  LineTrackingInput,
} from '@/types/coordination'
import { COOP_PROTOCOL } from '@/types/coordination'
import type { WireTrackFrame } from '@/types/tracking'

export interface CoordinationEngineSnapshot {
  scenario: CoordinationScenario
  state: CoordinationRuntimeState
  logs: CoordinationLogEntry[]
  messages: CoordinationMessageRecord[]
}

export interface CoordinationEngineOptions {
  autoLineTracking?: boolean
}

export type CoordinationEngineListener = (snapshot: CoordinationEngineSnapshot) => void

const MAX_STEP_SLICE_MS = 100
const MAX_LOGS = 500
const MAX_MESSAGES = 300

function clone<T>(value: T): T {
  return structuredClone(value)
}

export class CoordinationEngine {
  private scenario: CoordinationScenario
  private state: CoordinationRuntimeState
  private logs: CoordinationLogEntry[] = []
  private messages: CoordinationMessageRecord[] = []
  private logSequence = 0
  private messageRecordSequence = 0
  private droneSequence = 0
  private coordinatorSequence = 0
  private readonly robotLink = new MockRobotLink()
  private readonly listeners = new Set<CoordinationEngineListener>()
  private autoLineTracking: boolean

  constructor(
    scenario: CoordinationScenario = createDefaultCoordinationScenario(),
    options: CoordinationEngineOptions = {},
  ) {
    this.scenario = clone(scenario)
    this.state = createInitialCoordinationState(this.scenario)
    this.autoLineTracking = options.autoLineTracking ?? true
    this.addLog('INFO', 'SYSTEM', `已载入场景：${this.scenario.name}。`)
  }

  getState(): CoordinationRuntimeState {
    return clone(this.state)
  }

  getScenario(): CoordinationScenario {
    return clone(this.scenario)
  }

  getLogs(): CoordinationLogEntry[] {
    return clone(this.logs)
  }

  getMessages(): CoordinationMessageRecord[] {
    return clone(this.messages)
  }

  getSnapshot(): CoordinationEngineSnapshot {
    return {
      scenario: this.getScenario(),
      state: this.getState(),
      logs: this.getLogs(),
      messages: this.getMessages(),
    }
  }

  subscribe(listener: CoordinationEngineListener, immediate = true): () => void {
    this.listeners.add(listener)
    if (immediate) listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  setAutoLineTracking(enabled: boolean): void {
    this.autoLineTracking = enabled
  }

  start(): boolean {
    const event: CoordinationEvent = this.state.lifecycle === 'PAUSED'
      ? { type: 'RESUME' }
      : { type: 'START' }
    return this.apply(event).accepted
  }

  pause(): boolean {
    return this.apply({ type: 'PAUSE' }).accepted
  }

  /**
   * 推进确定性仿真时钟。manual=true 时允许在 PAUSED 状态执行单步。
   */
  step(deltaMs = 100, manual = false): boolean {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return false
    let remainingMs = Math.min(deltaMs, 60_000)
    let advanced = false

    while (remainingMs > 0 && !['COMPLETED', 'ABORTED'].includes(this.state.lifecycle)) {
      const sliceMs = Math.min(MAX_STEP_SLICE_MS, remainingMs)
      const result = this.apply({ type: 'TICK', deltaMs: sliceMs, manual }, false)
      if (!result.accepted) break
      advanced = true
      remainingMs -= sliceMs
      this.runAutomation()
    }

    this.emit()
    return advanced
  }

  updateLineTracking(tracking: LineTrackingInput): boolean {
    return this.apply({ type: 'LINE_TRACK_UPDATED', tracking }).accepted
  }

  /** 将时序跟踪器输出桥接到协同状态机，避免 UI 组件自行解释状态枚举。 */
  ingestWireTrackFrame(frame: WireTrackFrame): boolean {
    const quality: LineTrackingInput['quality'] = frame.status === 'LOST'
      || frame.phase === 'HOLD'
      || frame.phase === 'FAULT'
      ? 'LOST'
      : frame.status === 'AMBIGUOUS'
        ? 'AMBIGUOUS'
        : frame.status === 'PREDICTED' || frame.phase === 'DEGRADED'
          ? 'WEAK'
          : frame.phase === 'TRACKING'
            ? 'STABLE'
            : 'ACQUIRING'
    return this.updateLineTracking({
      quality,
      trackId: frame.trackId,
      confidence: frame.combinedConfidence,
      lateralErrorMeters: frame.lateralError ?? 0,
      headingErrorDegrees: (frame.headingError ?? 0) * (180 / Math.PI),
      curvature: frame.curvature ?? 0,
      observedAtMs: this.state.clockMs,
    })
  }

  receiveMessage(
    message: CoopMessage,
    direction: CoordinationMessageRecord['direction'] = 'INBOUND',
  ): CoordinationTransitionResult {
    if (message.source === 'ROBOT') this.robotLink.observeSequence(message.seq)
    if (message.source === 'DRONE') this.droneSequence = Math.max(this.droneSequence, message.seq)
    if (message.source === 'COORDINATOR') {
      this.coordinatorSequence = Math.max(this.coordinatorSequence, message.seq)
    }

    const result = this.apply({ type: 'COOP_MESSAGE', message }, false)
    this.messageRecordSequence += 1
    this.messages.push({
      id: `message-${this.messageRecordSequence}`,
      timestamp: this.state.clockMs,
      direction,
      accepted: result.accepted,
      rejectionCode: result.rejectionCode,
      reason: result.rejectionReason,
      message: clone(message),
    })
    if (this.messages.length > MAX_MESSAGES) this.messages.shift()
    if (!result.accepted) {
      this.addLog(
        'WARNING',
        'SYSTEM',
        `协议消息 ${message.source}#${message.seq} 被拒绝：${result.rejectionReason ?? '未知原因'}`,
      )
    }
    this.emit()
    return result
  }

  injectFault(fault: CoordinationFaultKey, enabled = true): boolean {
    if (fault === 'emergencyStop' && enabled) return this.emergencyStop()
    const result = this.apply({ type: 'FAULT_CHANGED', fault, enabled }, false)
    if (fault === 'robotLinkDown') this.robotLink.setConnected(!enabled)
    if (fault === 'messageMismatch' && enabled) {
      this.receiveMessage(this.robotLink.createMismatchedMessage(this.state))
    }
    this.emit()
    return result.accepted
  }

  clearSafeHold(): boolean {
    return this.apply({ type: 'CLEAR_SAFE_HOLD' }).accepted
  }

  emergencyStop(reason = '人工急停已触发，所有自动动作停止。'): boolean {
    return this.apply({ type: 'EMERGENCY_STOP', reason }).accepted
  }

  abort(reason: string): boolean {
    return this.apply({ type: 'ABORT', reason }).accepted
  }

  reset(scenario: CoordinationScenario = this.scenario): void {
    this.scenario = clone(scenario)
    this.state = createInitialCoordinationState(this.scenario)
    this.logs = []
    this.messages = []
    this.logSequence = 0
    this.messageRecordSequence = 0
    this.droneSequence = 0
    this.coordinatorSequence = 0
    this.robotLink.reset()
    this.addLog('INFO', 'SYSTEM', `协同任务已重置：${this.scenario.name}。`)
    this.emit()
  }

  exportSnapshot(): CoordinationSnapshot {
    return {
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      scenario: this.getScenario(),
      state: this.getState(),
      logs: this.getLogs(),
      messages: this.getMessages(),
      caveat: '该快照来自浏览器协同仿真，不是实机飞控记录，也不能作为带电线路安全认证依据。',
    }
  }

  private runAutomation(): void {
    const robotMessages = this.robotLink.poll(this.state, this.scenario)
    for (const message of robotMessages) this.receiveMessage(message, 'INBOUND')

    if (this.state.phase === 'ASSIST_REQUESTED' && !this.state.ready.drone) {
      const ready = this.createDroneMessage('READY', {
        ready: true,
        checks: ['flight_stable', 'safety_boundary_clear', 'assist_adapter_ready'],
      })
      this.receiveMessage(ready, 'OUTBOUND')
    }

    if (this.autoLineTracking && [
      'ACQUIRING_LINE',
      'FOLLOWING_LINE',
      'LINE_RECOVERY',
      'APPROACHING_NEXT_OBSTACLE',
    ].includes(this.state.phase)) {
      this.updateSyntheticLineTracking()
    }
  }

  private updateSyntheticLineTracking(): void {
    const forcedLost = this.state.faults.lineLost
    const decay = Math.exp(-this.state.clockMs / 18_000)
    const lateralErrorMeters = forcedLost
      ? 0
      : Math.sin(this.state.clockMs / 820) * 0.18 * decay
    const headingErrorDegrees = forcedLost
      ? 0
      : Math.cos(this.state.clockMs / 1_050) * 3.2 * decay
    this.apply({
      type: 'LINE_TRACK_UPDATED',
      tracking: {
        quality: forcedLost ? 'LOST' : 'STABLE',
        trackId: forcedLost ? null : this.scenario.contactLine.id,
        confidence: forcedLost ? 0.05 : 0.91,
        lateralErrorMeters,
        headingErrorDegrees,
        curvature: 0.035,
        observedAtMs: this.state.clockMs,
      },
    }, false)
  }

  private createDroneMessage<T extends CoopMessageType>(
    type: T,
    payload: CoopPayloadByType[T],
  ): CoopMessage<T> {
    this.droneSequence = Math.max(this.droneSequence, this.state.lastAcceptedSeq.DRONE) + 1
    return {
      protocol: COOP_PROTOCOL,
      missionId: this.state.missionId,
      cycleId: this.state.cycleId,
      obstacleId: this.state.currentObstacleId,
      seq: this.droneSequence,
      sentAt: this.state.clockMs,
      source: 'DRONE',
      type,
      payload,
    }
  }

  private apply(event: CoordinationEvent, emit = true): CoordinationTransitionResult {
    const previousPhase = this.state.phase
    const result = transitionCoordination(this.state, event, this.scenario)
    if (result.accepted) this.state = result.state
    for (const item of result.notices) {
      this.addLog(item.level, item.source, item.message)
    }
    if (result.accepted && previousPhase !== this.state.phase) {
      this.recordPhaseBroadcast(previousPhase, this.state.phase)
    }
    if (emit) this.emit()
    return result
  }

  private recordPhaseBroadcast(previousPhase: string, nextPhase: string): void {
    if (nextPhase === 'ASSIST_EXECUTING') {
      this.recordOutboundStatus(this.createDroneMessage('ASSIST_STARTED', {
        adapter: 'mock-assist-adapter-v1',
      }))
    }
    if (previousPhase === 'ASSIST_EXECUTING' && nextPhase === 'VERIFYING_ROBOT_CLEAR') {
      this.recordOutboundStatus(this.createDroneMessage('ASSIST_COMPLETED', { success: true }))
    }
  }

  private recordOutboundStatus(message: CoopMessage): void {
    this.messageRecordSequence += 1
    this.messages.push({
      id: `message-${this.messageRecordSequence}`,
      timestamp: this.state.clockMs,
      direction: 'OUTBOUND',
      accepted: true,
      rejectionCode: null,
      reason: '状态广播',
      message,
    })
    if (this.messages.length > MAX_MESSAGES) this.messages.shift()
  }

  private addLog(
    level: CoordinationLogEntry['level'],
    source: CoordinationLogEntry['source'],
    message: string,
  ): void {
    this.logSequence += 1
    this.logs.push({
      id: `coord-log-${this.logSequence}`,
      timestamp: this.state.clockMs,
      level,
      source,
      message,
    })
    if (this.logs.length > MAX_LOGS) this.logs.shift()
  }

  private emit(): void {
    if (this.listeners.size === 0) return
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}

export function createCoordinationEngine(
  scenario?: CoordinationScenario,
  options?: CoordinationEngineOptions,
): CoordinationEngine {
  return new CoordinationEngine(scenario, options)
}
