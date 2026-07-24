import type { MissionActionType } from './mission'

export interface Point2D {
  x: number
  y: number
}

export type SceneObjectType =
  | 'POLE'
  | 'CONTACT_LINE'
  | 'OBSTACLE'
  | 'INSPECTION_POINT'
  | 'DRONE_WAYPOINT'
  | 'ROBOT_START'
  | 'ROBOT_END'
  | 'NO_FLY_ZONE'

export type EditorTool = 'SELECT' | 'PAN' | 'DELETE' | SceneObjectType

export interface BaseSceneObject {
  id: string
  name: string
  type: SceneObjectType
  position: Point2D
  visible: boolean
  remark?: string
}

export interface Pole extends BaseSceneObject {
  type: 'POLE'
  poleNumber: string
}

export interface ContactLine {
  id: string
  name: string
  type: 'CONTACT_LINE'
  points: Point2D[]
  startPoleId?: string
  endPoleId?: string
  sectionNumber?: string
  robotAccessible: boolean
  visible: boolean
  remark?: string
}

export type ObstacleType =
  | 'ANCHOR'
  | 'DROPPER'
  | 'POSITIONING_DEVICE'
  | 'CLAMP'
  | 'UNKNOWN'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export interface Obstacle extends BaseSceneObject {
  type: 'OBSTACLE'
  obstacleType: ObstacleType
  riskLevel: RiskLevel
  robotPassable: boolean
  requiresDroneTransfer: boolean
  safetyDistance: number
  contactLineId?: string
  pickupPoint?: Point2D
  releasePoint?: Point2D
}

export interface InspectionPoint extends BaseSceneObject {
  type: 'INSPECTION_POINT'
  inspectionType: string
  stayDuration: number
  critical: boolean
  contactLineId?: string
}

export interface DroneWaypoint extends BaseSceneObject {
  type: 'DRONE_WAYPOINT'
  altitude: number
  speed: number
  yaw: number
  action: MissionActionType
  stayDuration: number
  maxWaitTime?: number
  critical: boolean
  order: number
}

export interface RobotMarker extends BaseSceneObject {
  type: 'ROBOT_START' | 'ROBOT_END'
}

export interface NoFlyZone extends BaseSceneObject {
  type: 'NO_FLY_ZONE'
  width: number
  height: number
  riskLevel: RiskLevel
}

export type PositionedSceneObject =
  | Pole
  | Obstacle
  | InspectionPoint
  | DroneWaypoint
  | RobotMarker
  | NoFlyZone

export type SceneObject = PositionedSceneObject | ContactLine
