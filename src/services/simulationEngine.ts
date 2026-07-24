import { missionActionLabels } from '@/data/actionLabels'
import { generateMissionStatistics } from '@/services/reportGenerator'
import type { useMissionStore } from '@/stores/missionStore'
import type { useProjectStore } from '@/stores/projectStore'
import type { useSimulationStore } from '@/stores/simulationStore'
import type { MissionActionType } from '@/types/mission'
import type { DroneWaypoint, Point2D } from '@/types/scene'
import type { DroneState, RobotState, SimulationSpeed } from '@/types/simulation'
import { distanceInMeters, waypointRouteDistance } from '@/utils/geometry'
import { interpolatePoint, lerp } from '@/utils/interpolation'

type ProjectStore = ReturnType<typeof useProjectStore>
type MissionStore = ReturnType<typeof useMissionStore>
type SimulationStore = ReturnType<typeof useSimulationStore>
type EnginePhase = 'STOPPED' | 'TRAVEL' | 'DWELL'

export const MINIMUM_SEGMENT_DURATION_SECONDS = 0.4
const MAXIMUM_FRAME_DELTA_SECONDS = 0.25

export function calculateSegmentDurationSeconds(
  start: Point2D,
  end: Point2D,
  pixelsPerMeter: number,
  speedMetersPerSecond: number,
  minimumDuration = MINIMUM_SEGMENT_DURATION_SECONDS,
): number {
  if (speedMetersPerSecond <= 0 || !Number.isFinite(speedMetersPerSecond)) {
    return Number.POSITIVE_INFINITY
  }
  const physicalDuration = distanceInMeters(start, end, pixelsPerMeter) / speedMetersPerSecond
  return Math.max(minimumDuration, physicalDuration)
}

function travelStateForAction(action: MissionActionType): DroneState {
  if (action === 'RETURN_HOME') {
    return 'RETURNING_HOME'
  }
  if (action === 'FOLLOW_ROBOT') {
    return 'FOLLOWING_ROBOT'
  }
  if (action === 'CROSS_OBSTACLE') {
    return 'CARRYING_ROBOT'
  }
  return 'FLYING'
}

function arrivalStateForAction(action: MissionActionType): DroneState {
  const states: Partial<Record<MissionActionType, DroneState>> = {
    TAKEOFF: 'TAKING_OFF',
    HOVER: 'HOVERING',
    DEPLOY_ROBOT: 'RELEASING_ROBOT',
    WAIT_ROBOT: 'HOVERING',
    FOLLOW_ROBOT: 'FOLLOWING_ROBOT',
    PICKUP_ROBOT: 'PICKING_UP_ROBOT',
    CROSS_OBSTACLE: 'CARRYING_ROBOT',
    RELEASE_ROBOT: 'RELEASING_ROBOT',
    INSPECT_POINT: 'HOVERING',
    RETURN_HOME: 'RETURNING_HOME',
    LAND: 'LANDING',
  }
  return states[action] ?? 'HOVERING'
}

export class SimulationEngine {
  private frameHandle: number | null = null
  private lastFrameTimestamp: number | null = null
  private route: DroneWaypoint[] = []
  private phase: EnginePhase = 'STOPPED'
  private segmentIndex = -1
  private segmentElapsedSeconds = 0
  private segmentDurationSeconds = 0
  private segmentDistanceMeters = 0
  private distanceBeforeSegment = 0
  private dwellWaypointIndex = -1
  private dwellElapsedSeconds = 0
  private dwellDurationSeconds = 0
  private pixelsPerMeter = 40

  constructor(
    private readonly projectStore: ProjectStore,
    private readonly missionStore: MissionStore,
    private readonly simulationStore: SimulationStore,
  ) {}

  start(): boolean {
    if (this.simulationStore.status === 'RUNNING') {
      return true
    }
    if (this.simulationStore.status === 'PAUSED' && this.route.length >= 2) {
      return this.resume()
    }

    this.cancelFrame()
    const issues = this.missionStore.validateProject(this.projectStore.project)
    this.route = this.projectStore.sortedWaypoints.map((waypoint) => ({
      ...waypoint,
      position: { ...waypoint.position },
    }))
    const firstWaypoint = this.route[0]
    this.simulationStore.resetSimulation(firstWaypoint)
    this.missionStore.clearStatistics()

    const errors = issues.filter((issue) => issue.level === 'ERROR')
    if (errors.length > 0 || !firstWaypoint) {
      this.phase = 'STOPPED'
      this.simulationStore.setStatus('ERROR')
      this.simulationStore.setDroneState('ERROR')
      errors.forEach((issue) => {
        this.simulationStore.addLog('ERROR', 'SYSTEM', issue.message)
      })
      return false
    }

    this.pixelsPerMeter = this.projectStore.project.settings.pixelsPerMeter
    this.simulationStore.totalDistance = waypointRouteDistance(this.route, this.pixelsPerMeter)
    this.simulationStore.setStatus('RUNNING')
    this.simulationStore.addLog('INFO', 'SYSTEM', '任务初始化完成')
    issues
      .filter((issue) => issue.level === 'WARNING')
      .forEach((issue) => this.simulationStore.addLog('WARNING', 'SYSTEM', issue.message))
    this.simulationStore.addLog('ACTION', 'DRONE', '开始执行任务')

    this.distanceBeforeSegment = 0
    this.arriveAtWaypoint(0, true)
    this.lastFrameTimestamp = null
    this.scheduleFrame()
    return true
  }

  pause(writeLog = true): boolean {
    if (this.simulationStore.status !== 'RUNNING') {
      return false
    }
    this.cancelFrame()
    this.simulationStore.setStatus('PAUSED')
    this.simulationStore.setTelemetry({ speed: 0 })
    if (writeLog) {
      this.simulationStore.addLog('INFO', 'SYSTEM', '仿真已暂停')
    }
    return true
  }

  resume(): boolean {
    if (this.simulationStore.status !== 'PAUSED' || this.route.length < 2) {
      return false
    }
    this.simulationStore.setStatus('RUNNING')
    if (this.phase === 'TRAVEL' && this.segmentIndex >= 0) {
      this.simulationStore.setTelemetry({ speed: this.route[this.segmentIndex + 1].speed })
    }
    this.simulationStore.addLog('INFO', 'SYSTEM', '仿真继续运行')
    this.lastFrameTimestamp = null
    this.scheduleFrame()
    return true
  }

  reset(): void {
    this.cancelFrame()
    this.route = this.projectStore.sortedWaypoints.map((waypoint) => ({
      ...waypoint,
      position: { ...waypoint.position },
    }))
    this.phase = 'STOPPED'
    this.segmentIndex = -1
    this.segmentElapsedSeconds = 0
    this.dwellWaypointIndex = -1
    this.dwellElapsedSeconds = 0
    this.distanceBeforeSegment = 0
    this.missionStore.clearStatistics()
    this.missionStore.clearValidation()
    this.simulationStore.resetSimulation(this.route[0])
    this.simulationStore.addLog('INFO', 'SYSTEM', '仿真已重置')
  }

  setSpeed(speed: SimulationSpeed): boolean {
    return this.simulationStore.setSpeed(speed)
  }

  dispose(): void {
    if (this.simulationStore.status === 'RUNNING') {
      this.pause(false)
    } else {
      this.cancelFrame()
    }
  }

  private readonly handleFrame = (timestamp: number): void => {
    if (this.simulationStore.status !== 'RUNNING') {
      return
    }
    if (this.lastFrameTimestamp === null) {
      this.lastFrameTimestamp = timestamp
      this.scheduleFrame()
      return
    }

    const realDeltaSeconds = Math.min(
      MAXIMUM_FRAME_DELTA_SECONDS,
      Math.max(0, (timestamp - this.lastFrameTimestamp) / 1000),
    )
    this.lastFrameTimestamp = timestamp
    const simulationDeltaSeconds = realDeltaSeconds * this.simulationStore.speedMultiplier
    this.simulationStore.advanceElapsedTime(simulationDeltaSeconds * 1000)
    this.advance(simulationDeltaSeconds)

    if (this.simulationStore.status === 'RUNNING') {
      this.scheduleFrame()
    }
  }

  private advance(deltaSeconds: number): void {
    let remainingSeconds = deltaSeconds
    let safetyCounter = 0

    while (remainingSeconds > 0 && this.phase !== 'STOPPED' && safetyCounter < 100) {
      safetyCounter += 1
      if (this.phase === 'TRAVEL') {
        const availableSeconds = Math.max(0, this.segmentDurationSeconds - this.segmentElapsedSeconds)
        const consumedSeconds = Math.min(remainingSeconds, availableSeconds)
        this.segmentElapsedSeconds += consumedSeconds
        remainingSeconds -= consumedSeconds
        this.updateTravelPosition()

        if (this.segmentElapsedSeconds + Number.EPSILON >= this.segmentDurationSeconds) {
          this.arriveAtWaypoint(this.segmentIndex + 1)
        } else {
          break
        }
      } else if (this.phase === 'DWELL') {
        const availableSeconds = Math.max(0, this.dwellDurationSeconds - this.dwellElapsedSeconds)
        const consumedSeconds = Math.min(remainingSeconds, availableSeconds)
        this.dwellElapsedSeconds += consumedSeconds
        remainingSeconds -= consumedSeconds

        if (this.dwellElapsedSeconds + Number.EPSILON >= this.dwellDurationSeconds) {
          this.finishWaypointAction(this.dwellWaypointIndex)
        } else {
          break
        }
      }
    }
  }

  private beginSegment(startIndex: number): void {
    if (startIndex >= this.route.length - 1) {
      this.completeMission()
      return
    }

    const start = this.route[startIndex]
    const target = this.route[startIndex + 1]
    this.phase = 'TRAVEL'
    this.segmentIndex = startIndex
    this.segmentElapsedSeconds = 0
    this.segmentDistanceMeters = distanceInMeters(
      start.position,
      target.position,
      this.pixelsPerMeter,
    )
    this.segmentDurationSeconds = calculateSegmentDurationSeconds(
      start.position,
      target.position,
      this.pixelsPerMeter,
      target.speed,
    )

    this.simulationStore.currentSegmentIndex = startIndex
    this.simulationStore.currentWaypointIndex = startIndex
    this.simulationStore.currentAction = target.action
    this.simulationStore.setSegmentProgress(0)
    this.simulationStore.setDroneState(travelStateForAction(target.action))
    this.simulationStore.setTelemetry({
      targetWaypointId: target.id,
      speed: target.speed,
    })
    this.simulationStore.addLog('ACTION', 'DRONE', `正在前往航点 ${target.name}`)
  }

  private updateTravelPosition(): void {
    const start = this.route[this.segmentIndex]
    const target = this.route[this.segmentIndex + 1]
    const segmentProgress = Math.min(1, this.segmentElapsedSeconds / this.segmentDurationSeconds)
    const completedDistance = this.distanceBeforeSegment + this.segmentDistanceMeters * segmentProgress
    const totalDistance = this.simulationStore.totalDistance
    const routeProgress = totalDistance > 0
      ? completedDistance / totalDistance
      : (this.segmentIndex + segmentProgress) / Math.max(1, this.route.length - 1)

    this.simulationStore.setTelemetry({
      position: interpolatePoint(start.position, target.position, segmentProgress),
      altitude: lerp(start.altitude, target.altitude, segmentProgress),
      speed: segmentProgress >= 1 ? 0 : target.speed,
    })
    this.simulationStore.completedDistance = completedDistance
    this.simulationStore.setSegmentProgress(segmentProgress)
    this.simulationStore.setProgress(routeProgress * 100)
  }

  private arriveAtWaypoint(waypointIndex: number, isInitialWaypoint = false): void {
    const waypoint = this.route[waypointIndex]
    this.simulationStore.currentWaypointIndex = waypointIndex
    this.simulationStore.currentAction = waypoint.action
    this.simulationStore.setTelemetry({
      position: waypoint.position,
      altitude: waypoint.altitude,
      speed: 0,
      targetWaypointId: waypoint.id,
    })
    this.simulationStore.setDroneState(arrivalStateForAction(waypoint.action))
    this.applyRobotActionState(waypoint.action)

    if (!isInitialWaypoint) {
      this.distanceBeforeSegment += this.segmentDistanceMeters
      this.simulationStore.completedDistance = this.distanceBeforeSegment
      this.simulationStore.addLog('INFO', 'DRONE', `已到达航点 ${waypoint.name}`)
    }
    this.simulationStore.addLog(
      'ACTION',
      'DRONE',
      `执行动作：${missionActionLabels[waypoint.action]}`,
    )

    const dwellDuration = Math.max(0, waypoint.stayDuration)
    if (dwellDuration > 0) {
      this.phase = 'DWELL'
      this.dwellWaypointIndex = waypointIndex
      this.dwellElapsedSeconds = 0
      this.dwellDurationSeconds = dwellDuration
      this.simulationStore.setDroneState('HOVERING')
      this.simulationStore.addLog('INFO', 'DRONE', `在 ${waypoint.name} 停留 ${dwellDuration} 秒`)
      return
    }
    this.finishWaypointAction(waypointIndex)
  }

  private finishWaypointAction(waypointIndex: number): void {
    const action = this.route[waypointIndex].action
    if (action === 'DEPLOY_ROBOT' || action === 'RELEASE_ROBOT') {
      this.simulationStore.setRobotState('INSPECTING')
      this.simulationStore.setTelemetry({ carryingRobot: false })
    } else if (action === 'PICKUP_ROBOT') {
      this.simulationStore.setRobotState('BEING_TRANSPORTED')
      this.simulationStore.setTelemetry({ carryingRobot: true })
    }

    this.beginSegment(waypointIndex)
  }

  private applyRobotActionState(action: MissionActionType): void {
    const states: Partial<Record<MissionActionType, RobotState>> = {
      DEPLOY_ROBOT: 'DEPLOYING',
      WAIT_ROBOT: 'WAITING_FOR_DRONE',
      PICKUP_ROBOT: 'BEING_PICKED_UP',
      CROSS_OBSTACLE: 'BEING_TRANSPORTED',
      RELEASE_ROBOT: 'REDEPLOYING',
    }
    const nextState = states[action]
    if (nextState) {
      this.simulationStore.setRobotState(nextState)
    }
  }

  private completeMission(): void {
    this.phase = 'STOPPED'
    this.cancelFrame()
    this.simulationStore.setStatus('COMPLETED')
    this.simulationStore.setProgress(100)
    this.simulationStore.setSegmentProgress(1)
    this.simulationStore.currentSegmentIndex = Math.max(-1, this.route.length - 2)
    this.simulationStore.setTelemetry({ speed: 0, targetWaypointId: null })
    const finalAction = this.route.at(-1)?.action
    this.simulationStore.setDroneState(finalAction === 'LAND' ? 'LANDED' : 'HOVERING')
    if (this.simulationStore.robotState !== 'NOT_DEPLOYED') {
      this.simulationStore.setRobotState('MISSION_COMPLETED')
    }
    this.simulationStore.addLog('INFO', 'SYSTEM', '任务执行完成')
    this.missionStore.setStatistics(generateMissionStatistics(this.projectStore.project, {
      elapsedTime: this.simulationStore.elapsedTime / 1000,
      completed: true,
      logs: this.simulationStore.logs,
      validationIssues: this.missionStore.validationIssues,
    }))
  }

  private scheduleFrame(): void {
    if (this.frameHandle !== null || typeof requestAnimationFrame !== 'function') {
      return
    }
    this.frameHandle = requestAnimationFrame((timestamp) => {
      this.frameHandle = null
      this.handleFrame(timestamp)
    })
  }

  private cancelFrame(): void {
    if (this.frameHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.frameHandle)
    }
    this.frameHandle = null
    this.lastFrameTimestamp = null
  }
}

export function createSimulationEngine(
  projectStore: ProjectStore,
  missionStore: MissionStore,
  simulationStore: SimulationStore,
): SimulationEngine {
  return new SimulationEngine(projectStore, missionStore, simulationStore)
}
