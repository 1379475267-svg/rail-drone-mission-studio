import type { MissionNode } from './mission'
import type {
  ContactLine,
  DroneWaypoint,
  InspectionPoint,
  NoFlyZone,
  Obstacle,
  Pole,
  RobotMarker,
} from './scene'

export interface MissionSettings {
  showGrid: boolean
  snapToGrid: boolean
  gridSize: number
  pixelsPerMeter: number
  autoSave: boolean
}

export interface MissionProject {
  id: string
  name: string
  version: string
  createdAt: string
  updatedAt: string
  poles: Pole[]
  contactLines: ContactLine[]
  obstacles: Obstacle[]
  inspectionPoints: InspectionPoint[]
  droneWaypoints: DroneWaypoint[]
  robotMarkers: RobotMarker[]
  noFlyZones: NoFlyZone[]
  missionNodes: MissionNode[]
  settings: MissionSettings
}
