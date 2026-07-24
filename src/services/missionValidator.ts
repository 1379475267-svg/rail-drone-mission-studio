import type { MissionActionType } from '@/types/mission'
import type { MissionProject } from '@/types/project'
import type { DroneWaypoint } from '@/types/scene'
import type { ValidationIssue } from '@/types/simulation'
import {
  isFinitePoint,
  segmentIntersectsNoFlyZone,
  waypointRouteSegments,
} from '@/utils/geometry'

const supportedActions = new Set<string>([
  'TAKEOFF',
  'FLY_TO',
  'HOVER',
  'DEPLOY_ROBOT',
  'WAIT_ROBOT',
  'FOLLOW_ROBOT',
  'PICKUP_ROBOT',
  'CROSS_OBSTACLE',
  'RELEASE_ROBOT',
  'INSPECT_POINT',
  'RETURN_HOME',
  'LAND',
] satisfies MissionActionType[])

interface IssueFactory {
  add: (issue: Omit<ValidationIssue, 'id'>, code: string) => void
  issues: ValidationIssue[]
}

function createIssueFactory(): IssueFactory {
  const issues: ValidationIssue[] = []
  const occurrenceCounts = new Map<string, number>()

  return {
    issues,
    add(issue, code) {
      const target = issue.objectId ?? issue.missionNodeId ?? 'project'
      const key = `${code}-${target}`
      const occurrence = (occurrenceCounts.get(key) ?? 0) + 1
      occurrenceCounts.set(key, occurrence)
      issues.push({ ...issue, id: `validation-${key}-${occurrence}` })
    },
  }
}

function checkWaypoint(
  waypoint: DroneWaypoint,
  issueFactory: IssueFactory,
): void {
  if (!isFinitePoint(waypoint.position)) {
    issueFactory.add(
      {
        level: 'ERROR',
        objectId: waypoint.id,
        message: `航点 ${waypoint.name} 的坐标不是有效数值`,
      },
      'invalid-coordinate',
    )
  }
  if (!Number.isFinite(waypoint.speed) || waypoint.speed <= 0) {
    issueFactory.add(
      {
        level: 'ERROR',
        objectId: waypoint.id,
        message: `航点 ${waypoint.name} 的速度必须大于 0`,
      },
      'invalid-speed',
    )
  }
  if (!Number.isFinite(waypoint.altitude) || waypoint.altitude < 0) {
    issueFactory.add(
      {
        level: 'ERROR',
        objectId: waypoint.id,
        message: `航点 ${waypoint.name} 的高度必须大于或等于 0`,
      },
      'invalid-altitude',
    )
  }
  if (!Number.isInteger(waypoint.order) || waypoint.order < 1) {
    issueFactory.add(
      {
        level: 'ERROR',
        objectId: waypoint.id,
        message: `航点 ${waypoint.name} 的顺序必须是正整数`,
      },
      'invalid-order',
    )
  }
  if (!supportedActions.has(waypoint.action)) {
    issueFactory.add(
      {
        level: 'ERROR',
        objectId: waypoint.id,
        message: `航点 ${waypoint.name} 使用了无法识别的动作`,
      },
      'unknown-waypoint-action',
    )
  }
}

function checkDuplicateWaypoints(
  waypoints: readonly DroneWaypoint[],
  issueFactory: IssueFactory,
): void {
  const ids = new Map<string, DroneWaypoint>()
  const orders = new Map<number, DroneWaypoint>()

  for (const waypoint of waypoints) {
    const duplicateId = ids.get(waypoint.id)
    if (duplicateId) {
      issueFactory.add(
        {
          level: 'ERROR',
          objectId: waypoint.id,
          message: `航点 ${duplicateId.name} 与 ${waypoint.name} 使用了重复 ID`,
        },
        'duplicate-id',
      )
    } else {
      ids.set(waypoint.id, waypoint)
    }

    const duplicateOrder = orders.get(waypoint.order)
    if (duplicateOrder) {
      issueFactory.add(
        {
          level: 'ERROR',
          objectId: waypoint.id,
          message: `航点 ${duplicateOrder.name} 与 ${waypoint.name} 使用了重复顺序 ${waypoint.order}`,
        },
        'duplicate-order',
      )
    } else {
      orders.set(waypoint.order, waypoint)
    }
  }
}

export function validateMissionProject(project: MissionProject): ValidationIssue[] {
  const issueFactory = createIssueFactory()
  const waypoints = [...project.droneWaypoints].sort((left, right) => left.order - right.order)

  if (waypoints.length === 0) {
    issueFactory.add(
      { level: 'ERROR', message: '任务中没有无人机航点' },
      'no-waypoint',
    )
  } else if (waypoints.length < 2) {
    issueFactory.add(
      { level: 'ERROR', message: '任务至少需要两个无人机航点' },
      'insufficient-waypoints',
    )
  }

  if (!Number.isFinite(project.settings.pixelsPerMeter) || project.settings.pixelsPerMeter <= 0) {
    issueFactory.add(
      { level: 'ERROR', message: '像素与米的换算比例必须大于 0' },
      'invalid-pixels-per-meter',
    )
  }

  waypoints.forEach((waypoint) => checkWaypoint(waypoint, issueFactory))
  checkDuplicateWaypoints(waypoints, issueFactory)

  const waypointIds = new Set(waypoints.map((waypoint) => waypoint.id))
  for (const node of project.missionNodes) {
    if (!supportedActions.has(node.action)) {
      issueFactory.add(
        {
          level: 'ERROR',
          missionNodeId: node.id,
          message: `任务节点 ${node.name} 使用了无法识别的动作`,
        },
        'unknown-node-action',
      )
    }
    if (node.action === 'FLY_TO' && !node.waypointId) {
      issueFactory.add(
        {
          level: 'ERROR',
          missionNodeId: node.id,
          message: `飞向航点节点 ${node.name} 没有关联航点`,
        },
        'missing-node-waypoint',
      )
    } else if (node.waypointId && !waypointIds.has(node.waypointId)) {
      issueFactory.add(
        {
          level: 'ERROR',
          missionNodeId: node.id,
          message: `任务节点 ${node.name} 关联了不存在的航点`,
        },
        'unknown-node-waypoint',
      )
    }
  }

  for (const segment of waypointRouteSegments(waypoints)) {
    for (const zone of project.noFlyZones) {
      if (segmentIntersectsNoFlyZone(segment.start, segment.end, zone)) {
        issueFactory.add(
          {
            level: 'ERROR',
            objectId: zone.id,
            message: `无人机路线穿过禁飞区域 ${zone.name}`,
          },
          `route-crosses-zone-${segment.startWaypointId ?? 'unknown'}`,
        )
      }
    }
  }

  for (const obstacle of project.obstacles) {
    if (obstacle.requiresDroneTransfer && (!obstacle.pickupPoint || !obstacle.releasePoint)) {
      issueFactory.add(
        {
          level: 'WARNING',
          objectId: obstacle.id,
          message: `障碍物 ${obstacle.name} 需要无人机转运，但缺少接应点或释放点`,
        },
        'incomplete-transfer-points',
      )
    }
  }

  const hasRobotDeployment = project.missionNodes.some((node) => node.action === 'DEPLOY_ROBOT')
  const hasRobotPickup = project.missionNodes.some((node) => node.action === 'PICKUP_ROBOT')
  if (hasRobotDeployment && !hasRobotPickup) {
    issueFactory.add(
      {
        level: 'WARNING',
        message: '任务包含机器人投放，但尚未配置机器人回收步骤',
      },
      'missing-robot-pickup',
    )
  }

  return issueFactory.issues
}

export const validateMission = validateMissionProject
