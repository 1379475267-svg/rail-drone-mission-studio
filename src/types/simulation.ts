import type { Point2D } from './scene'

export type DroneState =
  | 'IDLE'
  | 'TAKING_OFF'
  | 'FLYING'
  | 'HOVERING'
  | 'FOLLOWING_ROBOT'
  | 'APPROACHING_ROBOT'
  | 'PICKING_UP_ROBOT'
  | 'CARRYING_ROBOT'
  | 'RELEASING_ROBOT'
  | 'RETURNING_HOME'
  | 'LANDING'
  | 'LANDED'
  | 'ERROR'

export type RobotState =
  | 'NOT_DEPLOYED'
  | 'DEPLOYING'
  | 'INSPECTING'
  | 'WAITING_FOR_DRONE'
  | 'BEING_PICKED_UP'
  | 'BEING_TRANSPORTED'
  | 'REDEPLOYING'
  | 'MISSION_COMPLETED'
  | 'ERROR'

export type SimulationStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ERROR'
export type SimulationSpeed = 0.5 | 1 | 2 | 4
export type LogLevel = 'INFO' | 'ACTION' | 'WARNING' | 'ERROR' | 'DEVICE' | 'COMMUNICATION'
export type LogSource = 'SYSTEM' | 'DRONE' | 'ROBOT'

export interface MissionLog {
  id: string
  timestamp: number
  level: LogLevel
  source: LogSource
  message: string
}

export interface ValidationIssue {
  id: string
  level: 'WARNING' | 'ERROR'
  objectId?: string
  missionNodeId?: string
  message: string
}

export interface DroneTelemetry {
  position: Point2D
  altitude: number
  speed: number
  targetWaypointId: string | null
  carryingRobot: boolean
}

export interface MissionStatistics {
  projectName: string
  completed: boolean
  elapsedTime: number
  totalDistance: number
  waypointCount: number
  averageSpeed: number
  logCount: number
  warningCount: number
  errorCount: number
  estimatedEnergyConsumption?: number
}
