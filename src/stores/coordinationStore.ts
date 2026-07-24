import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { createDefaultCoordinationScenario } from '@/data/defaultCoordinationScenario'
import {
  CoordinationEngine,
  type CoordinationEngineSnapshot,
} from '@/services/coordination/coordinationEngine'
import type {
  CoopMessage,
  CoordinationFaultKey,
  CoordinationLogEntry,
  CoordinationMessageRecord,
  CoordinationRuntimeState,
  CoordinationScenario,
  CoordinationSnapshot,
  LineTrackingInput,
} from '@/types/coordination'
import { coordinationPhaseLabels } from '@/types/coordination'
import type { WireTrackFrame } from '@/types/tracking'

const supportedSpeeds = new Set([0.5, 1, 2, 4])

export const useCoordinationStore = defineStore('coordination', () => {
  const engine = new CoordinationEngine(createDefaultCoordinationScenario())
  const initial = engine.getSnapshot()
  const scenario = ref<CoordinationScenario>(initial.scenario)
  const machine = ref<CoordinationRuntimeState>(initial.state)
  const logs = ref<CoordinationLogEntry[]>(initial.logs)
  const messages = ref<CoordinationMessageRecord[]>(initial.messages)
  const speedMultiplier = ref(1)
  const autoLineTracking = ref(true)

  let frameHandle: number | null = null
  let lastFrameAt: number | null = null

  function sync(snapshot: CoordinationEngineSnapshot): void {
    scenario.value = snapshot.scenario
    machine.value = snapshot.state
    logs.value = snapshot.logs
    messages.value = snapshot.messages
    if (machine.value.lifecycle !== 'RUNNING') cancelFrame()
  }

  engine.subscribe(sync)

  const phase = computed(() => machine.value.phase)
  const lifecycle = computed(() => machine.value.lifecycle)
  const phaseLabel = computed(() => coordinationPhaseLabels[machine.value.phase])
  const clockMs = computed(() => machine.value.clockMs)
  const elapsedMs = clockMs
  const drone = computed(() => machine.value.drone)
  const robot = computed(() => machine.value.robot)
  const tracking = computed(() => machine.value.tracking)
  const faults = computed(() => machine.value.faults)
  const currentObstacle = computed(
    () => scenario.value.obstacles[machine.value.currentObstacleIndex] ?? null,
  )
  const nextObstacle = computed(
    () => scenario.value.obstacles[machine.value.currentObstacleIndex + 1] ?? null,
  )
  const isRunning = computed(() => machine.value.lifecycle === 'RUNNING')
  const isPaused = computed(() => machine.value.lifecycle === 'PAUSED')
  const isTerminal = computed(
    () => machine.value.lifecycle === 'COMPLETED' || machine.value.lifecycle === 'ABORTED',
  )
  const canStart = computed(
    () => machine.value.lifecycle === 'IDLE' || machine.value.lifecycle === 'PAUSED',
  )
  const rejectedMessageCount = computed(
    () => messages.value.filter((record) => !record.accepted).length,
  )

  function start(): boolean {
    const started = engine.start()
    if (started) scheduleFrame()
    return started
  }

  function pause(): boolean {
    cancelFrame()
    return engine.pause()
  }

  /** 单步按钮在 IDLE 时会先进入 PAUSED，再推进一个确定性步长。 */
  function step(deltaMs = 100): boolean {
    if (machine.value.lifecycle === 'IDLE') {
      if (!engine.start()) return false
      engine.pause()
    }
    const manual = machine.value.lifecycle === 'PAUSED'
    return engine.step(deltaMs * speedMultiplier.value, manual)
  }

  function reset(nextScenario?: CoordinationScenario): void {
    cancelFrame()
    engine.reset(nextScenario ?? createDefaultCoordinationScenario())
  }

  function setSpeedMultiplier(speed: number): boolean {
    if (!supportedSpeeds.has(speed)) return false
    speedMultiplier.value = speed
    return true
  }

  function setAutoLineTracking(enabled: boolean): void {
    autoLineTracking.value = enabled
    engine.setAutoLineTracking(enabled)
  }

  function updateLineTracking(input: LineTrackingInput): boolean {
    return engine.updateLineTracking(input)
  }

  function ingestWireTrackFrame(frame: WireTrackFrame): boolean {
    return engine.ingestWireTrackFrame(frame)
  }

  function receiveMessage(message: CoopMessage): boolean {
    return engine.receiveMessage(message).accepted
  }

  function injectFault(fault: CoordinationFaultKey, enabled = true): boolean {
    const result = engine.injectFault(fault, enabled)
    if (machine.value.lifecycle === 'ABORTED') cancelFrame()
    return result
  }

  function clearSafeHold(): boolean {
    return engine.clearSafeHold()
  }

  function emergencyStop(reason?: string): boolean {
    cancelFrame()
    return engine.emergencyStop(reason)
  }

  function abort(reason: string): boolean {
    cancelFrame()
    return engine.abort(reason)
  }

  function exportSnapshot(): CoordinationSnapshot {
    return engine.exportSnapshot()
  }

  function exportSnapshotJson(): string {
    return JSON.stringify(exportSnapshot(), null, 2)
  }

  function downloadSnapshotJson(): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return
    const blob = new Blob([exportSnapshotJson()], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `rail-coop-${machine.value.missionId}-${machine.value.cycleId}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function dispose(): void {
    cancelFrame()
    if (machine.value.lifecycle === 'RUNNING') engine.pause()
  }

  function scheduleFrame(): void {
    if (
      frameHandle !== null
      || typeof requestAnimationFrame !== 'function'
      || machine.value.lifecycle !== 'RUNNING'
    ) return
    frameHandle = requestAnimationFrame(handleFrame)
  }

  function cancelFrame(): void {
    if (frameHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameHandle)
    }
    frameHandle = null
    lastFrameAt = null
  }

  function handleFrame(timestamp: number): void {
    frameHandle = null
    if (machine.value.lifecycle !== 'RUNNING') return
    if (lastFrameAt === null) {
      lastFrameAt = timestamp
      scheduleFrame()
      return
    }
    const realDeltaMs = Math.min(250, Math.max(0, timestamp - lastFrameAt))
    lastFrameAt = timestamp
    engine.step(realDeltaMs * speedMultiplier.value)
    if (machine.value.lifecycle === 'RUNNING') scheduleFrame()
  }

  return {
    scenario,
    machine,
    logs,
    messages,
    speedMultiplier,
    autoLineTracking,
    phase,
    lifecycle,
    phaseLabel,
    clockMs,
    elapsedMs,
    drone,
    robot,
    tracking,
    faults,
    currentObstacle,
    nextObstacle,
    isRunning,
    isPaused,
    isTerminal,
    canStart,
    rejectedMessageCount,
    start,
    pause,
    step,
    reset,
    setSpeedMultiplier,
    setAutoLineTracking,
    updateLineTracking,
    ingestWireTrackFrame,
    receiveMessage,
    injectFault,
    clearSafeHold,
    emergencyStop,
    abort,
    exportSnapshot,
    exportSnapshotJson,
    downloadSnapshotJson,
    dispose,
  }
})
