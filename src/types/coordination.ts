export const COOP_PROTOCOL = 'rail-coop/1' as const

export type CoordinationPhase =
  | 'WAITING_FOR_ROBOT'
  | 'ASSIST_REQUESTED'
  | 'ASSIST_PREPARING'
  | 'ASSIST_EXECUTING'
  | 'VERIFYING_ROBOT_CLEAR'
  | 'ACQUIRING_LINE'
  | 'FOLLOWING_LINE'
  | 'LINE_RECOVERY'
  | 'APPROACHING_NEXT_OBSTACLE'
  | 'SAFE_HOLD'
  | 'COMPLETED'
  | 'ABORTED'

export type CoordinationRunStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ABORTED'

export type CoopSource = 'ROBOT' | 'DRONE' | 'COORDINATOR'

export type CoopMessageType =
  | 'ASSIST_REQUEST'
  | 'READY'
  | 'ASSIST_STARTED'
  | 'ASSIST_COMPLETED'
  | 'ROBOT_CLEAR'
  | 'HEARTBEAT'
  | 'HOLD'
  | 'ABORT'

export interface CoopPayloadByType {
  ASSIST_REQUEST: {
    reason: 'OBSTACLE_BLOCKED'
    robotRouteProgress: number
  }
  READY: {
    ready: boolean
    checks: string[]
  }
  ASSIST_STARTED: {
    adapter: string
  }
  ASSIST_COMPLETED: {
    success: boolean
  }
  ROBOT_CLEAR: {
    clear: boolean
    robotRouteProgress: number
  }
  HEARTBEAT: {
    health: 'OK' | 'DEGRADED'
  }
  HOLD: {
    reason: string
  }
  ABORT: {
    reason: string
  }
}

/**
 * 机器人、无人机和协调器之间唯一允许传输的消息信封。
 * source + seq 在同一个任务中单调递增，接收端据此拒绝重放消息。
 */
export interface CoopMessage<T extends CoopMessageType = CoopMessageType> {
  protocol: typeof COOP_PROTOCOL
  missionId: string
  cycleId: string
  obstacleId: string
  seq: number
  sentAt: number
  source: CoopSource
  type: T
  payload: CoopPayloadByType[T]
}

export interface CoordinationPoint {
  x: number
  y: number
}

export interface RouteStation {
  routeProgress: number
  position: CoordinationPoint
}

export interface CoordinationObstacle {
  id: string
  name: string
  routeProgress: number
  pickup: RouteStation
  release: RouteStation
  wait: RouteStation
}

export interface CoordinationTiming {
  preparationMs: number
  assistExecutionMs: number
  robotClearVerificationMs: number
  lineLossHoldMs: number
  stableFramesRequired: number
  robotCruiseProgressPerSecond: number
  droneCruiseProgressPerSecond: number
  droneApproachProgressPerSecond: number
  approachWindowProgress: number
}

export interface CoordinationScenario {
  missionId: string
  name: string
  contactLine: {
    id: string
    name: string
    path: CoordinationPoint[]
  }
  drone: {
    id: string
    name: string
    startProgress: number
  }
  robot: {
    id: string
    name: string
    startProgress: number
  }
  obstacles: CoordinationObstacle[]
  timing: CoordinationTiming
}

export type LineTrackQuality =
  | 'UNAVAILABLE'
  | 'ACQUIRING'
  | 'STABLE'
  | 'WEAK'
  | 'AMBIGUOUS'
  | 'LOST'

export interface LineTrackingInput {
  quality: LineTrackQuality
  trackId: string | null
  confidence: number
  lateralErrorMeters: number
  headingErrorDegrees: number
  curvature: number
  stableFrameCount?: number
  observedAtMs?: number
}

export interface CoordinationTrackingState extends LineTrackingInput {
  stableFrameCount: number
  lastUpdateAtMs: number | null
}

export type SafeHoldReason =
  | 'LINE_LOST'
  | 'ROBOT_LINK_LOST'
  | 'ASSIST_FAILED'
  | 'REMOTE_HOLD'
  | 'MANUAL_HOLD'

export interface CoordinationFaults {
  lineLost: boolean
  robotLinkDown: boolean
  assistFailure: boolean
  messageMismatch: boolean
  emergencyStop: boolean
}

export type CoordinationFaultKey = keyof CoordinationFaults

export interface CoordinationRuntimeState {
  missionId: string
  cycleId: string
  cycleNumber: number
  lifecycle: CoordinationRunStatus
  phase: CoordinationPhase
  phaseElapsedMs: number
  clockMs: number
  transitionCount: number
  currentObstacleIndex: number
  currentObstacleId: string
  nextObstacleId: string | null
  ready: {
    robot: boolean
    drone: boolean
  }
  assistProgress: number
  robot: {
    id: string
    connected: boolean
    routeProgress: number
    clearedObstacleIds: string[]
  }
  drone: {
    id: string
    routeProgress: number
    speedProgressPerSecond: number
    holding: boolean
  }
  tracking: CoordinationTrackingState
  faults: CoordinationFaults
  holdReason: SafeHoldReason | null
  phaseBeforeHold: CoordinationPhase | null
  recoveryTargetPhase: 'FOLLOWING_LINE' | 'APPROACHING_NEXT_OBSTACLE' | null
  lastAcceptedSeq: Record<CoopSource, number>
  processedMessageKeys: string[]
}

export type CoordinationEvent =
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'TICK'; deltaMs: number; manual?: boolean }
  | { type: 'COOP_MESSAGE'; message: CoopMessage }
  | { type: 'LINE_TRACK_UPDATED'; tracking: LineTrackingInput }
  | { type: 'FAULT_CHANGED'; fault: CoordinationFaultKey; enabled: boolean }
  | { type: 'CLEAR_SAFE_HOLD' }
  | { type: 'EMERGENCY_STOP'; reason?: string }
  | { type: 'ABORT'; reason: string }

export type CoordinationRejectionCode =
  | 'INVALID_LIFECYCLE'
  | 'INVALID_EVENT'
  | 'INVALID_PROTOCOL'
  | 'MISSION_MISMATCH'
  | 'CYCLE_MISMATCH'
  | 'OBSTACLE_MISMATCH'
  | 'DUPLICATE_OR_STALE_SEQ'
  | 'INVALID_SOURCE'
  | 'INVALID_PAYLOAD'
  | 'INVALID_PHASE'
  | 'ROBOT_NOT_AT_PICKUP'
  | 'INTERLOCK_NOT_READY'

export interface CoordinationNotice {
  level: 'INFO' | 'ACTION' | 'WARNING' | 'ERROR'
  source: 'SYSTEM' | CoopSource
  message: string
}

export interface CoordinationTransitionResult {
  state: CoordinationRuntimeState
  accepted: boolean
  rejectionCode: CoordinationRejectionCode | null
  rejectionReason: string | null
  phaseChanged: boolean
  notices: CoordinationNotice[]
}

export interface CoordinationLogEntry {
  id: string
  timestamp: number
  level: CoordinationNotice['level']
  source: CoordinationNotice['source']
  message: string
}

export interface CoordinationMessageRecord {
  id: string
  timestamp: number
  direction: 'INBOUND' | 'OUTBOUND'
  accepted: boolean
  rejectionCode: CoordinationRejectionCode | null
  reason: string | null
  message: CoopMessage
}

export interface CoordinationSnapshot {
  schemaVersion: '1.0'
  exportedAt: string
  scenario: CoordinationScenario
  state: CoordinationRuntimeState
  logs: CoordinationLogEntry[]
  messages: CoordinationMessageRecord[]
  caveat: string
}

export const coordinationPhaseLabels: Record<CoordinationPhase, string> = {
  WAITING_FOR_ROBOT: '等待机器人',
  ASSIST_REQUESTED: '收到越障请求',
  ASSIST_PREPARING: '双方准备确认',
  ASSIST_EXECUTING: '执行越障辅助',
  VERIFYING_ROBOT_CLEAR: '确认机器人通过',
  ACQUIRING_LINE: '重新捕获接触线',
  FOLLOWING_LINE: '沿接触线飞行',
  LINE_RECOVERY: '接触线恢复',
  APPROACHING_NEXT_OBSTACLE: '接近下一障碍',
  SAFE_HOLD: '安全悬停',
  COMPLETED: '任务完成',
  ABORTED: '任务中止',
}

export const lineTrackQualityLabels: Record<LineTrackQuality, string> = {
  UNAVAILABLE: '无观测',
  ACQUIRING: '捕获中',
  STABLE: '稳定跟踪',
  WEAK: '弱跟踪',
  AMBIGUOUS: '线路不明确',
  LOST: '线路丢失',
}

export const coordinationFaultLabels: Record<CoordinationFaultKey, string> = {
  lineLost: '接触线丢失',
  robotLinkDown: '机器人通信中断',
  assistFailure: '越障执行失败',
  messageMismatch: '任务编号不匹配',
  emergencyStop: '紧急停止',
}
