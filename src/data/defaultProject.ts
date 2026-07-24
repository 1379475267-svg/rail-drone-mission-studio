import type { MissionActionType, MissionNode } from '@/types/mission'
import type { MissionProject } from '@/types/project'
import type { DroneWaypoint, Point2D } from '@/types/scene'
import { createId } from '@/utils/id'
import { nowIso } from '@/utils/time'

export const PROJECT_VERSION = '1.0.0'
export const DEFAULT_PROJECT_NAME = '接触网协同巡检演示'

interface DefaultWaypointDefinition {
  name: string
  description: string
  position: Point2D
  altitude: number
  speed: number
  action: MissionActionType
}

export const defaultWaypointDefinitions: readonly DefaultWaypointDefinition[] = [
  {
    name: 'P1',
    description: '起飞点',
    position: { x: 100, y: 420 },
    altitude: 0,
    speed: 1,
    action: 'TAKEOFF',
  },
  {
    name: 'P2',
    description: '接近接触网',
    position: { x: 260, y: 300 },
    altitude: 5,
    speed: 1.5,
    action: 'FLY_TO',
  },
  {
    name: 'P3',
    description: '机器人投放点',
    position: { x: 460, y: 250 },
    altitude: 4,
    speed: 1,
    action: 'DEPLOY_ROBOT',
  },
  {
    name: 'P4',
    description: '障碍前等待点',
    position: { x: 680, y: 220 },
    altitude: 4.5,
    speed: 1.5,
    action: 'WAIT_ROBOT',
  },
  {
    name: 'P5',
    description: '障碍后释放点',
    position: { x: 850, y: 210 },
    altitude: 4,
    speed: 1,
    action: 'RELEASE_ROBOT',
  },
  {
    name: 'P6',
    description: '返航点',
    position: { x: 100, y: 420 },
    altitude: 0,
    speed: 2,
    action: 'RETURN_HOME',
  },
] as const

function createDefaultWaypoint(
  definition: DefaultWaypointDefinition,
  order: number,
): DroneWaypoint {
  return {
    id: createId('waypoint'),
    name: definition.name,
    type: 'DRONE_WAYPOINT',
    position: { ...definition.position },
    visible: true,
    remark: definition.description,
    altitude: definition.altitude,
    speed: definition.speed,
    yaw: 0,
    action: definition.action,
    stayDuration: 0,
    critical: definition.action !== 'FLY_TO',
    order,
  }
}

function missionNodesFromWaypoints(waypoints: readonly DroneWaypoint[]): MissionNode[] {
  return waypoints.map((waypoint, index) => ({
    id: createId('mission-node'),
    name: `${waypoint.name} · ${waypoint.remark ?? '航点动作'}`,
    action: waypoint.action,
    waypointId: waypoint.id,
    duration: waypoint.stayDuration,
    speed: waypoint.speed,
    order: index + 1,
  }))
}

function createProjectShell(name: string, waypoints: DroneWaypoint[]): MissionProject {
  const timestamp = nowIso()
  return {
    id: createId('project'),
    name,
    version: PROJECT_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    poles: [],
    contactLines: [],
    obstacles: [],
    inspectionPoints: [],
    droneWaypoints: waypoints,
    robotMarkers: [],
    noFlyZones: [],
    missionNodes: missionNodesFromWaypoints(waypoints),
    settings: {
      showGrid: true,
      snapToGrid: true,
      gridSize: 20,
      pixelsPerMeter: 40,
      autoSave: true,
    },
  }
}

export function createDefaultProject(name = DEFAULT_PROJECT_NAME): MissionProject {
  const waypoints = defaultWaypointDefinitions.map((definition, index) =>
    createDefaultWaypoint(definition, index + 1),
  )
  return createProjectShell(name, waypoints)
}

export function createEmptyProject(name = '未命名巡检任务'): MissionProject {
  return createProjectShell(name, [])
}
