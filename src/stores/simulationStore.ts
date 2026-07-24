import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'

import type { MissionActionType } from '@/types/mission'
import type { DroneWaypoint, Point2D } from '@/types/scene'
import type {
  DroneState,
  DroneTelemetry,
  LogLevel,
  LogSource,
  MissionLog,
  RobotState,
  SimulationSpeed,
  SimulationStatus,
} from '@/types/simulation'
import { clamp } from '@/utils/interpolation'
import { createId } from '@/utils/id'
import { useMissionStore } from './missionStore'

const supportedSpeeds = new Set<number>([0.5, 1, 2, 4])

export const useSimulationStore = defineStore('simulation', () => {
  const missionStore = useMissionStore()
  const status = ref<SimulationStatus>('IDLE')
  const droneState = ref<DroneState>('IDLE')
  const robotState = ref<RobotState>('NOT_DEPLOYED')
  const speedMultiplier = ref<SimulationSpeed>(1)
  const elapsedTime = ref(0)
  const progress = ref(0)
  const segmentProgress = ref(0)
  const currentWaypointIndex = ref(0)
  const currentSegmentIndex = ref(-1)
  const currentAction = ref<MissionActionType | null>(null)
  const totalDistance = ref(0)
  const completedDistance = ref(0)
  const logs = ref<MissionLog[]>([])
  const telemetry = reactive<DroneTelemetry>({
    position: { x: 0, y: 0 },
    altitude: 0,
    speed: 0,
    targetWaypointId: null,
    carryingRobot: false,
  })

  const issues = computed(() => missionStore.validationIssues)
  const isRunning = computed(() => status.value === 'RUNNING')
  const isPaused = computed(() => status.value === 'PAUSED')
  const isCompleted = computed(() => status.value === 'COMPLETED')

  function setStatus(nextStatus: SimulationStatus): void {
    status.value = nextStatus
  }

  function setDroneState(nextState: DroneState): void {
    droneState.value = nextState
  }

  function setRobotState(nextState: RobotState): void {
    robotState.value = nextState
  }

  function setSpeed(speed: number): boolean {
    if (!supportedSpeeds.has(speed)) {
      return false
    }
    speedMultiplier.value = speed as SimulationSpeed
    return true
  }

  function setTelemetry(patch: Partial<DroneTelemetry>): void {
    if (patch.position) {
      telemetry.position = { ...patch.position }
    }
    if (patch.altitude !== undefined) {
      telemetry.altitude = patch.altitude
    }
    if (patch.speed !== undefined) {
      telemetry.speed = patch.speed
    }
    if (patch.targetWaypointId !== undefined) {
      telemetry.targetWaypointId = patch.targetWaypointId
    }
    if (patch.carryingRobot !== undefined) {
      telemetry.carryingRobot = patch.carryingRobot
    }
  }

  function setPosition(position: Point2D): void {
    telemetry.position = { ...position }
  }

  function setProgress(value: number): void {
    progress.value = clamp(value, 0, 100)
  }

  function setSegmentProgress(value: number): void {
    segmentProgress.value = clamp(value, 0, 1)
  }

  /** 运行时间统一以毫秒保存，方便直接与动画帧时间戳配合。 */
  function setElapsedTime(milliseconds: number): void {
    elapsedTime.value = Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0)
  }

  function advanceElapsedTime(milliseconds: number): void {
    if (Number.isFinite(milliseconds) && milliseconds > 0) {
      elapsedTime.value += milliseconds
    }
  }

  function addLog(level: LogLevel, source: LogSource, message: string): MissionLog {
    const log: MissionLog = {
      id: createId('log'),
      timestamp: elapsedTime.value,
      level,
      source,
      message,
    }
    logs.value.push(log)
    return log
  }

  function clearLogs(): void {
    logs.value = []
  }

  function resetSimulation(initialWaypoint?: DroneWaypoint): void {
    status.value = 'IDLE'
    droneState.value = 'IDLE'
    robotState.value = 'NOT_DEPLOYED'
    elapsedTime.value = 0
    progress.value = 0
    segmentProgress.value = 0
    currentWaypointIndex.value = initialWaypoint ? 0 : -1
    currentSegmentIndex.value = -1
    currentAction.value = initialWaypoint?.action ?? null
    totalDistance.value = 0
    completedDistance.value = 0
    logs.value = []
    telemetry.position = initialWaypoint ? { ...initialWaypoint.position } : { x: 0, y: 0 }
    telemetry.altitude = initialWaypoint?.altitude ?? 0
    telemetry.speed = 0
    telemetry.targetWaypointId = initialWaypoint?.id ?? null
    telemetry.carryingRobot = false
  }

  return {
    status,
    droneState,
    robotState,
    speedMultiplier,
    elapsedTime,
    progress,
    segmentProgress,
    currentWaypointIndex,
    currentSegmentIndex,
    currentAction,
    totalDistance,
    completedDistance,
    logs,
    telemetry,
    issues,
    isRunning,
    isPaused,
    isCompleted,
    setStatus,
    setDroneState,
    setRobotState,
    setSpeed,
    setTelemetry,
    updateTelemetry: setTelemetry,
    setPosition,
    setProgress,
    setSegmentProgress,
    setElapsedTime,
    advanceElapsedTime,
    addLog,
    clearLogs,
    resetSimulation,
    resetState: resetSimulation,
  }
})
