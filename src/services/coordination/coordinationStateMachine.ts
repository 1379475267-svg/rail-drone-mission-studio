import type {
  CoopMessage,
  CoopMessageType,
  CoopSource,
  CoordinationEvent,
  CoordinationFaults,
  CoordinationNotice,
  CoordinationPhase,
  CoordinationRejectionCode,
  CoordinationRuntimeState,
  CoordinationScenario,
  CoordinationTransitionResult,
  LineTrackingInput,
  SafeHoldReason,
} from '@/types/coordination'
import {
  COOP_PROTOCOL,
  coordinationPhaseLabels,
} from '@/types/coordination'

const TERMINAL_PHASES = new Set<CoordinationPhase>(['COMPLETED', 'ABORTED'])
const FLYING_PHASES = new Set<CoordinationPhase>([
  'FOLLOWING_LINE',
  'APPROACHING_NEXT_OBSTACLE',
])
const MINIMUM_MOTION_CONFIDENCE = 0.18
const MAXIMUM_LATERAL_ERROR_METERS = 0.7
const MAXIMUM_HEADING_ERROR_DEGREES = 40
const MAXIMUM_TRACK_CURVATURE = 0.45
const COOP_SOURCES = new Set<CoopSource>(['ROBOT', 'DRONE', 'COORDINATOR'])
const COOP_MESSAGE_TYPES = new Set<CoopMessageType>([
  'ASSIST_REQUEST',
  'READY',
  'ASSIST_STARTED',
  'ASSIST_COMPLETED',
  'ROBOT_CLEAR',
  'HEARTBEAT',
  'HOLD',
  'ABORT',
])

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function cycleId(cycleNumber: number): string {
  return `cycle-${String(cycleNumber).padStart(3, '0')}`
}

function copyState(state: CoordinationRuntimeState): CoordinationRuntimeState {
  return {
    ...state,
    ready: { ...state.ready },
    robot: {
      ...state.robot,
      clearedObstacleIds: [...state.robot.clearedObstacleIds],
    },
    drone: { ...state.drone },
    tracking: { ...state.tracking },
    faults: { ...state.faults },
    lastAcceptedSeq: { ...state.lastAcceptedSeq },
    processedMessageKeys: [...state.processedMessageKeys],
  }
}

function notice(
  message: string,
  level: CoordinationNotice['level'] = 'INFO',
  source: CoordinationNotice['source'] = 'SYSTEM',
): CoordinationNotice {
  return { level, source, message }
}

function rejected(
  state: CoordinationRuntimeState,
  code: CoordinationRejectionCode,
  reason: string,
): CoordinationTransitionResult {
  return {
    state,
    accepted: false,
    rejectionCode: code,
    rejectionReason: reason,
    phaseChanged: false,
    notices: [notice(reason, 'WARNING')],
  }
}

function accepted(
  previous: CoordinationRuntimeState,
  state: CoordinationRuntimeState,
  notices: CoordinationNotice[] = [],
): CoordinationTransitionResult {
  const phaseChanged = previous.phase !== state.phase
  if (phaseChanged) {
    notices = [
      ...notices,
      notice(
        `状态切换：${coordinationPhaseLabels[previous.phase]} → ${coordinationPhaseLabels[state.phase]}`,
        state.phase === 'SAFE_HOLD' || state.phase === 'ABORTED' ? 'WARNING' : 'ACTION',
      ),
    ]
  }
  return {
    state,
    accepted: true,
    rejectionCode: null,
    rejectionReason: null,
    phaseChanged,
    notices,
  }
}

function enterPhase(
  state: CoordinationRuntimeState,
  phase: CoordinationPhase,
): CoordinationRuntimeState {
  if (state.phase === phase) return state
  state.phase = phase
  state.phaseElapsedMs = 0
  state.transitionCount += 1
  state.drone.holding = !FLYING_PHASES.has(phase)
  if (phase === 'COMPLETED') state.lifecycle = 'COMPLETED'
  if (phase === 'ABORTED') state.lifecycle = 'ABORTED'
  return state
}

function enterSafeHold(
  state: CoordinationRuntimeState,
  reason: SafeHoldReason,
): CoordinationRuntimeState {
  if (state.phase !== 'SAFE_HOLD') state.phaseBeforeHold = state.phase
  state.holdReason = reason
  state.drone.speedProgressPerSecond = 0
  state.drone.holding = true
  return enterPhase(state, 'SAFE_HOLD')
}

function advanceRobot(
  state: CoordinationRuntimeState,
  scenario: CoordinationScenario,
  deltaSeconds: number,
): void {
  if (!state.robot.connected || state.faults.robotLinkDown) return
  const currentObstacle = scenario.obstacles[state.currentObstacleIndex]
  if (!currentObstacle) return
  const currentAlreadyCleared = state.robot.clearedObstacleIds.includes(currentObstacle.id)
  const targetObstacle = currentAlreadyCleared
    ? scenario.obstacles[state.currentObstacleIndex + 1]
    : currentObstacle
  if (!targetObstacle) return
  const advancedProgress = Math.min(
    targetObstacle.pickup.routeProgress,
    state.robot.routeProgress + scenario.timing.robotCruiseProgressPerSecond * deltaSeconds,
  )
  // 机器人一旦越过 release 站位，后续时钟推进绝不能把它拉回 pickup。
  state.robot.routeProgress = Math.max(state.robot.routeProgress, advancedProgress)
}

function nextObstacle(scenario: CoordinationScenario, state: CoordinationRuntimeState) {
  return scenario.obstacles[state.currentObstacleIndex + 1] ?? null
}

function arriveAtNextObstacle(
  state: CoordinationRuntimeState,
  scenario: CoordinationScenario,
): void {
  const nextIndex = state.currentObstacleIndex + 1
  const obstacle = scenario.obstacles[nextIndex]
  if (!obstacle) {
    enterPhase(state, 'COMPLETED')
    return
  }

  state.currentObstacleIndex = nextIndex
  state.currentObstacleId = obstacle.id
  state.nextObstacleId = scenario.obstacles[nextIndex + 1]?.id ?? null
  state.cycleNumber += 1
  state.cycleId = cycleId(state.cycleNumber)
  state.ready.robot = false
  state.ready.drone = false
  state.assistProgress = 0
  state.holdReason = null
  state.phaseBeforeHold = null
  state.recoveryTargetPhase = null
  state.drone.routeProgress = obstacle.wait.routeProgress
  state.drone.speedProgressPerSecond = 0
  enterPhase(state, 'WAITING_FOR_ROBOT')
}

function lineIsUnsafe(state: CoordinationRuntimeState): boolean {
  if (state.faults.lineLost) return true
  if (state.tracking.quality === 'LOST' || state.tracking.quality === 'AMBIGUOUS') return true
  if (state.tracking.confidence < MINIMUM_MOTION_CONFIDENCE) return true
  if (Math.abs(state.tracking.lateralErrorMeters) > MAXIMUM_LATERAL_ERROR_METERS) return true
  if (Math.abs(state.tracking.headingErrorDegrees) > MAXIMUM_HEADING_ERROR_DEGREES) return true
  if (Math.abs(state.tracking.curvature) > MAXIMUM_TRACK_CURVATURE) return true
  if (state.tracking.lastUpdateAtMs === null) return true
  return state.clockMs - state.tracking.lastUpdateAtMs >= 500
}

function expectedSource(type: CoopMessageType, source: CoopSource): boolean {
  if (type === 'ASSIST_REQUEST' || type === 'ROBOT_CLEAR') return source === 'ROBOT'
  if (type === 'ASSIST_STARTED' || type === 'ASSIST_COMPLETED') return source === 'DRONE'
  if (type === 'READY') return source === 'ROBOT' || source === 'DRONE'
  return true
}

function hasValidPayload(message: CoopMessage): boolean {
  const payload = message.payload as unknown
  if (!payload || typeof payload !== 'object') return false
  const record = payload as Record<string, unknown>
  switch (message.type) {
    case 'ASSIST_REQUEST':
      return record.reason === 'OBSTACLE_BLOCKED'
        && typeof record.robotRouteProgress === 'number'
    case 'READY':
      return typeof record.ready === 'boolean' && Array.isArray(record.checks)
    case 'ASSIST_STARTED':
      return typeof record.adapter === 'string'
    case 'ASSIST_COMPLETED':
      return typeof record.success === 'boolean'
    case 'ROBOT_CLEAR':
      return typeof record.clear === 'boolean'
        && typeof record.robotRouteProgress === 'number'
    case 'HEARTBEAT':
      return record.health === 'OK' || record.health === 'DEGRADED'
    case 'HOLD':
    case 'ABORT':
      return typeof record.reason === 'string'
  }
}

function validateMessageEnvelope(
  state: CoordinationRuntimeState,
  message: CoopMessage,
): CoordinationTransitionResult | null {
  if (message.protocol !== COOP_PROTOCOL) {
    return rejected(state, 'INVALID_PROTOCOL', '已拒绝消息：协议版本不是 rail-coop/1。')
  }
  if (message.missionId !== state.missionId) {
    return rejected(state, 'MISSION_MISMATCH', '已拒绝消息：missionId 与当前任务不一致。')
  }
  if (message.cycleId !== state.cycleId) {
    return rejected(state, 'CYCLE_MISMATCH', '已拒绝消息：cycleId 已过期或不属于当前循环。')
  }
  if (message.obstacleId !== state.currentObstacleId) {
    return rejected(state, 'OBSTACLE_MISMATCH', '已拒绝消息：obstacleId 与当前障碍不一致。')
  }
  if (!COOP_SOURCES.has(message.source)) {
    return rejected(state, 'INVALID_SOURCE', '已拒绝消息：source 不是已知协同端点。')
  }
  if (!COOP_MESSAGE_TYPES.has(message.type)) {
    return rejected(state, 'INVALID_PAYLOAD', '已拒绝消息：type 不是已知协议消息。')
  }
  if (!Number.isFinite(message.sentAt) || message.sentAt < 0) {
    return rejected(state, 'INVALID_PAYLOAD', '已拒绝消息：sentAt 不是有效时间戳。')
  }
  if (!Number.isSafeInteger(message.seq) || message.seq <= 0) {
    return rejected(state, 'DUPLICATE_OR_STALE_SEQ', '已拒绝消息：seq 必须是正整数。')
  }
  const messageKey = `${message.source}:${message.seq}`
  if (
    message.seq <= state.lastAcceptedSeq[message.source]
    || state.processedMessageKeys.includes(messageKey)
  ) {
    return rejected(state, 'DUPLICATE_OR_STALE_SEQ', '已幂等拒绝重复或过期消息。')
  }
  if (!expectedSource(message.type, message.source)) {
    return rejected(state, 'INVALID_SOURCE', `已拒绝消息：${message.source} 无权发送 ${message.type}。`)
  }
  if (!hasValidPayload(message)) {
    return rejected(state, 'INVALID_PAYLOAD', `已拒绝消息：${message.type} 的 payload 无效。`)
  }
  return null
}

function markMessageAccepted(state: CoordinationRuntimeState, message: CoopMessage): void {
  state.lastAcceptedSeq[message.source] = message.seq
  state.processedMessageKeys.push(`${message.source}:${message.seq}`)
  if (state.processedMessageKeys.length > 120) state.processedMessageKeys.shift()
}

function handleMessage(
  current: CoordinationRuntimeState,
  scenario: CoordinationScenario,
  message: CoopMessage,
): CoordinationTransitionResult {
  const envelopeError = validateMessageEnvelope(current, message)
  if (envelopeError) return envelopeError

  const state = copyState(current)
  const currentObstacle = scenario.obstacles[state.currentObstacleIndex]!
  const notices: CoordinationNotice[] = []

  switch (message.type) {
    case 'ASSIST_REQUEST': {
      if (state.phase !== 'WAITING_FOR_ROBOT') {
        return rejected(current, 'INVALID_PHASE', '越障请求只能在等待机器人阶段受理。')
      }
      if (state.robot.routeProgress + 0.0001 < currentObstacle.pickup.routeProgress) {
        return rejected(current, 'ROBOT_NOT_AT_PICKUP', '机器人尚未到达预设拾取位置，越障请求被拒绝。')
      }
      state.ready.robot = false
      state.ready.drone = false
      enterPhase(state, 'ASSIST_REQUESTED')
      notices.push(notice(`已受理 ${currentObstacle.id} 越障请求。`, 'ACTION', 'ROBOT'))
      break
    }
    case 'READY': {
      if (state.phase !== 'ASSIST_REQUESTED' && state.phase !== 'ASSIST_PREPARING') {
        return rejected(current, 'INVALID_PHASE', 'Ready 消息不属于当前协同阶段。')
      }
      const payload = message.payload as { ready: boolean; checks: string[] }
      if (message.source === 'ROBOT') state.ready.robot = payload.ready
      if (message.source === 'DRONE') state.ready.drone = payload.ready
      notices.push(notice(
        `${message.source === 'ROBOT' ? '机器人' : '无人机'} Ready=${payload.ready ? '是' : '否'}。`,
        payload.ready ? 'INFO' : 'WARNING',
        message.source,
      ))
      if (state.ready.robot && state.ready.drone) {
        enterPhase(state, 'ASSIST_PREPARING')
      } else if (state.phase === 'ASSIST_PREPARING') {
        enterPhase(state, 'ASSIST_REQUESTED')
      }
      break
    }
    case 'ASSIST_STARTED':
      if (state.phase !== 'ASSIST_PREPARING') {
        return rejected(current, 'INVALID_PHASE', '当前阶段不能开始越障辅助。')
      }
      if (!state.ready.robot || !state.ready.drone) {
        return rejected(current, 'INTERLOCK_NOT_READY', '双端 Ready 互锁未满足，禁止执行越障。')
      }
      enterPhase(state, 'ASSIST_EXECUTING')
      break
    case 'ASSIST_COMPLETED': {
      if (state.phase !== 'ASSIST_EXECUTING') {
        return rejected(current, 'INVALID_PHASE', '当前没有正在执行的越障动作。')
      }
      const payload = message.payload as { success: boolean }
      state.assistProgress = payload.success ? 1 : state.assistProgress
      if (payload.success) enterPhase(state, 'VERIFYING_ROBOT_CLEAR')
      else enterSafeHold(state, 'ASSIST_FAILED')
      break
    }
    case 'ROBOT_CLEAR': {
      if (state.phase !== 'VERIFYING_ROBOT_CLEAR') {
        return rejected(current, 'INVALID_PHASE', '只有在通过确认阶段才接受机器人放行消息。')
      }
      const payload = message.payload as { clear: boolean; robotRouteProgress: number }
      if (!payload.clear) {
        return rejected(current, 'INVALID_PAYLOAD', '机器人未确认越过障碍。')
      }
      if (!state.robot.clearedObstacleIds.includes(currentObstacle.id)) {
        state.robot.clearedObstacleIds.push(currentObstacle.id)
      }
      state.robot.routeProgress = Math.max(
        currentObstacle.release.routeProgress,
        clamp(payload.robotRouteProgress, 0, 1),
      )
      state.ready.robot = false
      state.ready.drone = false
      if (state.currentObstacleIndex >= scenario.obstacles.length - 1) {
        enterPhase(state, 'COMPLETED')
      } else {
        state.tracking.quality = 'ACQUIRING'
        state.tracking.stableFrameCount = 0
        state.tracking.lastUpdateAtMs = null
        enterPhase(state, 'ACQUIRING_LINE')
      }
      break
    }
    case 'HEARTBEAT':
      if (message.source === 'ROBOT') state.robot.connected = true
      break
    case 'HOLD':
      enterSafeHold(state, 'REMOTE_HOLD')
      break
    case 'ABORT':
      enterPhase(state, 'ABORTED')
      break
  }

  markMessageAccepted(state, message)
  return accepted(current, state, notices)
}

function handleTracking(
  current: CoordinationRuntimeState,
  scenario: CoordinationScenario,
  input: LineTrackingInput,
): CoordinationTransitionResult {
  if (TERMINAL_PHASES.has(current.phase)) {
    return rejected(current, 'INVALID_LIFECYCLE', '任务已经结束，无法继续更新接触线状态。')
  }

  const state = copyState(current)
  const quality = state.faults.lineLost ? 'LOST' : input.quality
  const previousStableFrames = state.tracking.stableFrameCount
  const stableFrameCount = quality === 'STABLE'
    ? Math.max(input.stableFrameCount ?? previousStableFrames + 1, previousStableFrames + 1)
    : 0
  state.tracking = {
    ...input,
    quality,
    confidence: clamp(input.confidence, 0, 1),
    stableFrameCount,
    lastUpdateAtMs: input.observedAtMs ?? state.clockMs,
  }

  if (
    FLYING_PHASES.has(state.phase)
    && ['UNAVAILABLE', 'ACQUIRING', 'AMBIGUOUS', 'LOST'].includes(quality)
  ) {
    state.recoveryTargetPhase = state.phase as 'FOLLOWING_LINE' | 'APPROACHING_NEXT_OBSTACLE'
    state.drone.speedProgressPerSecond = 0
    enterPhase(state, 'LINE_RECOVERY')
  } else if (
    (state.phase === 'ACQUIRING_LINE' || state.phase === 'LINE_RECOVERY')
    && quality === 'STABLE'
    && stableFrameCount >= scenario.timing.stableFramesRequired
  ) {
    const target = nextObstacle(scenario, state)
    const approaching = target
      ? target.wait.routeProgress - state.drone.routeProgress <= scenario.timing.approachWindowProgress
      : false
    const recoveredPhase = state.recoveryTargetPhase
      ?? (approaching ? 'APPROACHING_NEXT_OBSTACLE' : 'FOLLOWING_LINE')
    state.recoveryTargetPhase = null
    state.holdReason = null
    enterPhase(state, recoveredPhase)
  }

  return accepted(current, state)
}

function handleTick(
  current: CoordinationRuntimeState,
  scenario: CoordinationScenario,
  deltaMs: number,
  manual = false,
): CoordinationTransitionResult {
  if (current.lifecycle !== 'RUNNING' && !(manual && current.lifecycle === 'PAUSED')) {
    return rejected(current, 'INVALID_LIFECYCLE', '当前运行状态不能推进仿真时钟。')
  }
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return rejected(current, 'INVALID_EVENT', '仿真步长必须是正数。')
  }

  const state = copyState(current)
  const safeDeltaMs = Math.min(deltaMs, 5_000)
  const deltaSeconds = safeDeltaMs / 1_000
  state.clockMs += safeDeltaMs
  state.phaseElapsedMs += safeDeltaMs

  switch (state.phase) {
    case 'WAITING_FOR_ROBOT':
      advanceRobot(state, scenario, deltaSeconds)
      break
    case 'ASSIST_REQUESTED':
      if (state.faults.robotLinkDown) enterSafeHold(state, 'ROBOT_LINK_LOST')
      break
    case 'ASSIST_PREPARING':
      if (state.faults.robotLinkDown) {
        enterSafeHold(state, 'ROBOT_LINK_LOST')
      } else if (!state.ready.robot || !state.ready.drone) {
        enterPhase(state, 'ASSIST_REQUESTED')
      } else if (state.phaseElapsedMs >= scenario.timing.preparationMs) {
        enterPhase(state, 'ASSIST_EXECUTING')
      }
      break
    case 'ASSIST_EXECUTING':
      if (state.faults.robotLinkDown) {
        enterSafeHold(state, 'ROBOT_LINK_LOST')
      } else if (state.faults.assistFailure) {
        enterSafeHold(state, 'ASSIST_FAILED')
      } else {
        state.assistProgress = clamp(
          state.phaseElapsedMs / scenario.timing.assistExecutionMs,
          0,
          1,
        )
        if (state.assistProgress >= 1) enterPhase(state, 'VERIFYING_ROBOT_CLEAR')
      }
      break
    case 'VERIFYING_ROBOT_CLEAR':
      if (state.faults.robotLinkDown) enterSafeHold(state, 'ROBOT_LINK_LOST')
      break
    case 'ACQUIRING_LINE':
      advanceRobot(state, scenario, deltaSeconds)
      if (state.faults.robotLinkDown) {
        enterSafeHold(state, 'ROBOT_LINK_LOST')
      } else if (
        (state.faults.lineLost
          || state.tracking.quality === 'LOST'
          || state.tracking.quality === 'AMBIGUOUS')
        && state.phaseElapsedMs >= scenario.timing.lineLossHoldMs
      ) {
        enterSafeHold(state, 'LINE_LOST')
      }
      break
    case 'FOLLOWING_LINE':
    case 'APPROACHING_NEXT_OBSTACLE': {
      advanceRobot(state, scenario, deltaSeconds)
      if (state.faults.robotLinkDown) {
        enterSafeHold(state, 'ROBOT_LINK_LOST')
        break
      }
      if (lineIsUnsafe(state)) {
        state.recoveryTargetPhase = state.phase
        state.drone.speedProgressPerSecond = 0
        enterPhase(state, 'LINE_RECOVERY')
        break
      }

      state.drone.holding = false
      const target = nextObstacle(scenario, state)
      if (!target) {
        enterPhase(state, 'COMPLETED')
        break
      }
      const remaining = target.wait.routeProgress - state.drone.routeProgress
      if (
        state.phase === 'FOLLOWING_LINE'
        && remaining <= scenario.timing.approachWindowProgress
      ) {
        enterPhase(state, 'APPROACHING_NEXT_OBSTACLE')
      }
      const nominalSpeed = state.phase === 'APPROACHING_NEXT_OBSTACLE'
        ? scenario.timing.droneApproachProgressPerSecond
        : scenario.timing.droneCruiseProgressPerSecond
      const trackingScale = state.tracking.quality === 'WEAK' ? 0.45 : 1
      const confidenceScale = clamp(0.35 + state.tracking.confidence * 0.65, 0.35, 1)
      state.drone.speedProgressPerSecond = nominalSpeed * trackingScale * confidenceScale
      state.drone.routeProgress = Math.min(
        target.wait.routeProgress,
        state.drone.routeProgress + state.drone.speedProgressPerSecond * deltaSeconds,
      )
      if (state.drone.routeProgress + 0.000001 >= target.wait.routeProgress) {
        arriveAtNextObstacle(state, scenario)
      }
      break
    }
    case 'LINE_RECOVERY':
      advanceRobot(state, scenario, deltaSeconds)
      state.drone.speedProgressPerSecond = 0
      if (state.faults.robotLinkDown) {
        enterSafeHold(state, 'ROBOT_LINK_LOST')
      } else if (state.phaseElapsedMs >= scenario.timing.lineLossHoldMs) {
        enterSafeHold(state, 'LINE_LOST')
      }
      break
    case 'SAFE_HOLD':
    case 'COMPLETED':
    case 'ABORTED':
      break
  }

  return accepted(current, state)
}

function handleFault(
  current: CoordinationRuntimeState,
  scenario: CoordinationScenario,
  fault: keyof CoordinationFaults,
  enabled: boolean,
): CoordinationTransitionResult {
  const state = copyState(current)
  state.faults[fault] = enabled

  if (fault === 'emergencyStop' && enabled) {
    enterPhase(state, 'ABORTED')
    return accepted(current, state, [notice('人工急停已触发，任务立即中止。', 'ERROR')])
  }
  if (fault === 'robotLinkDown') {
    state.robot.connected = !enabled
    if (enabled && [
      'ASSIST_REQUESTED',
      'ASSIST_PREPARING',
      'ASSIST_EXECUTING',
      'VERIFYING_ROBOT_CLEAR',
      'ACQUIRING_LINE',
      'FOLLOWING_LINE',
      'LINE_RECOVERY',
      'APPROACHING_NEXT_OBSTACLE',
    ].includes(state.phase)) {
      enterSafeHold(state, 'ROBOT_LINK_LOST')
    }
  }
  if (fault === 'lineLost' && enabled && FLYING_PHASES.has(state.phase)) {
    state.tracking.quality = 'LOST'
    state.tracking.stableFrameCount = 0
    state.recoveryTargetPhase = state.phase as 'FOLLOWING_LINE' | 'APPROACHING_NEXT_OBSTACLE'
    enterPhase(state, 'LINE_RECOVERY')
  }
  if (fault === 'assistFailure' && enabled && state.phase === 'ASSIST_EXECUTING') {
    enterSafeHold(state, 'ASSIST_FAILED')
  }
  if (
    !enabled
    && state.phase === 'SAFE_HOLD'
    && ((fault === 'lineLost' && state.holdReason === 'LINE_LOST')
      || (fault === 'robotLinkDown' && state.holdReason === 'ROBOT_LINK_LOST'))
  ) {
    if (fault === 'lineLost') {
      state.tracking.quality = 'ACQUIRING'
      state.tracking.stableFrameCount = 0
      state.tracking.lastUpdateAtMs = null
      state.holdReason = null
      state.phaseBeforeHold = null
      enterPhase(state, 'ACQUIRING_LINE')
    } else {
      const heldPhase = state.phaseBeforeHold
      state.holdReason = null
      if ([
        'ACQUIRING_LINE',
        'FOLLOWING_LINE',
        'LINE_RECOVERY',
        'APPROACHING_NEXT_OBSTACLE',
      ].includes(heldPhase ?? '')) {
        state.tracking.quality = 'ACQUIRING'
        state.tracking.stableFrameCount = 0
        state.tracking.lastUpdateAtMs = null
        state.phaseBeforeHold = null
        enterPhase(state, 'ACQUIRING_LINE')
      } else {
        state.ready.robot = false
        state.ready.drone = false
        state.phaseBeforeHold = null
        enterPhase(state, 'ASSIST_REQUESTED')
      }
    }
  }

  return accepted(current, state, [notice(
    `${enabled ? '已注入' : '已解除'}故障：${fault}。`,
    enabled ? 'WARNING' : 'INFO',
  )])
}

export function createInitialCoordinationState(
  scenario: CoordinationScenario,
): CoordinationRuntimeState {
  const firstObstacle = scenario.obstacles[0]
  if (!firstObstacle) throw new Error('协同场景至少需要一个障碍点。')

  return {
    missionId: scenario.missionId,
    cycleId: cycleId(1),
    cycleNumber: 1,
    lifecycle: 'IDLE',
    phase: 'WAITING_FOR_ROBOT',
    phaseElapsedMs: 0,
    clockMs: 0,
    transitionCount: 0,
    currentObstacleIndex: 0,
    currentObstacleId: firstObstacle.id,
    nextObstacleId: scenario.obstacles[1]?.id ?? null,
    ready: { robot: false, drone: false },
    assistProgress: 0,
    robot: {
      id: scenario.robot.id,
      connected: true,
      routeProgress: clamp(scenario.robot.startProgress, 0, 1),
      clearedObstacleIds: [],
    },
    drone: {
      id: scenario.drone.id,
      routeProgress: clamp(scenario.drone.startProgress, 0, 1),
      speedProgressPerSecond: 0,
      holding: true,
    },
    tracking: {
      quality: 'UNAVAILABLE',
      trackId: null,
      confidence: 0,
      lateralErrorMeters: 0,
      headingErrorDegrees: 0,
      curvature: 0,
      stableFrameCount: 0,
      lastUpdateAtMs: null,
    },
    faults: {
      lineLost: false,
      robotLinkDown: false,
      assistFailure: false,
      messageMismatch: false,
      emergencyStop: false,
    },
    holdReason: null,
    phaseBeforeHold: null,
    recoveryTargetPhase: null,
    lastAcceptedSeq: { ROBOT: 0, DRONE: 0, COORDINATOR: 0 },
    processedMessageKeys: [],
  }
}

/**
 * 无副作用的协同状态转换。相同 state、event、scenario 总会得到相同结果。
 */
export function transitionCoordination(
  state: CoordinationRuntimeState,
  event: CoordinationEvent,
  scenario: CoordinationScenario,
): CoordinationTransitionResult {
  switch (event.type) {
    case 'START': {
      if (state.lifecycle !== 'IDLE' && state.lifecycle !== 'PAUSED') {
        return rejected(state, 'INVALID_LIFECYCLE', '当前任务不能启动。')
      }
      const next = copyState(state)
      next.lifecycle = 'RUNNING'
      return accepted(state, next, [notice('协同任务开始运行。', 'ACTION')])
    }
    case 'RESUME': {
      if (state.lifecycle !== 'PAUSED') {
        return rejected(state, 'INVALID_LIFECYCLE', '只有暂停状态可以继续运行。')
      }
      const next = copyState(state)
      next.lifecycle = 'RUNNING'
      return accepted(state, next, [notice('协同任务继续运行。')])
    }
    case 'PAUSE': {
      if (state.lifecycle !== 'RUNNING') {
        return rejected(state, 'INVALID_LIFECYCLE', '只有运行中的任务可以暂停。')
      }
      const next = copyState(state)
      next.lifecycle = 'PAUSED'
      next.drone.speedProgressPerSecond = 0
      next.drone.holding = true
      return accepted(state, next, [notice('协同任务已暂停。')])
    }
    case 'TICK':
      return handleTick(state, scenario, event.deltaMs, event.manual)
    case 'COOP_MESSAGE':
      return handleMessage(state, scenario, event.message)
    case 'LINE_TRACK_UPDATED':
      return handleTracking(state, scenario, event.tracking)
    case 'FAULT_CHANGED':
      return handleFault(state, scenario, event.fault, event.enabled)
    case 'CLEAR_SAFE_HOLD': {
      if (state.phase !== 'SAFE_HOLD') {
        return rejected(state, 'INVALID_PHASE', '当前不在安全悬停状态。')
      }
      const activeFault = Object.entries(state.faults)
        .some(([key, enabled]) => key !== 'messageMismatch' && enabled)
      if (activeFault) {
        return rejected(state, 'INVALID_EVENT', '仍有活动故障，不能解除安全悬停。')
      }
      const next = copyState(state)
      const linkFailedDuringFlight = next.holdReason === 'ROBOT_LINK_LOST'
        && [
          'ACQUIRING_LINE',
          'FOLLOWING_LINE',
          'LINE_RECOVERY',
          'APPROACHING_NEXT_OBSTACLE',
        ].includes(next.phaseBeforeHold ?? '')
      const target = next.holdReason === 'LINE_LOST' || linkFailedDuringFlight
        ? 'ACQUIRING_LINE'
        : next.holdReason === 'ASSIST_FAILED' || next.holdReason === 'ROBOT_LINK_LOST'
          ? 'ASSIST_REQUESTED'
          : next.phaseBeforeHold ?? 'WAITING_FOR_ROBOT'
      next.holdReason = null
      if (target === 'ASSIST_REQUESTED') {
        next.ready.robot = false
        next.ready.drone = false
        next.assistProgress = 0
      }
      if (target === 'ACQUIRING_LINE') {
        next.tracking.quality = 'ACQUIRING'
        next.tracking.stableFrameCount = 0
        next.tracking.lastUpdateAtMs = null
      }
      next.phaseBeforeHold = null
      enterPhase(next, target)
      return accepted(state, next)
    }
    case 'EMERGENCY_STOP': {
      const next = copyState(state)
      next.faults.emergencyStop = true
      enterPhase(next, 'ABORTED')
      return accepted(state, next, [notice(
        event.reason ?? '人工急停已触发，任务立即中止。',
        'ERROR',
      )])
    }
    case 'ABORT': {
      const next = copyState(state)
      enterPhase(next, 'ABORTED')
      return accepted(state, next, [notice(`任务中止：${event.reason}`, 'ERROR')])
    }
  }
}

export const coordinationTransition = transitionCoordination
