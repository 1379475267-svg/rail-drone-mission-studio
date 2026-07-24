import type {
  CoordinationObstacle,
  CoordinationPoint,
  CoordinationScenario,
  RouteStation,
} from '@/types/coordination'

const contactLinePath: CoordinationPoint[] = [
  { x: 52, y: 336 },
  { x: 144, y: 326 },
  { x: 240, y: 316 },
  { x: 338, y: 310 },
  { x: 438, y: 304 },
  { x: 540, y: 296 },
  { x: 642, y: 286 },
  { x: 740, y: 278 },
  { x: 838, y: 270 },
  { x: 934, y: 266 },
]

function pointOnPath(progress: number): CoordinationPoint {
  const clamped = Math.max(0, Math.min(1, progress))
  if (contactLinePath.length === 1) return { ...contactLinePath[0]! }

  const segments = contactLinePath.slice(0, -1).map((start, index) => {
    const end = contactLinePath[index + 1]!
    return { start, end, length: Math.hypot(end.x - start.x, end.y - start.y) }
  })
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0)
  let remaining = clamped * totalLength
  let selected = segments.at(-1)!
  for (const segment of segments) {
    selected = segment
    if (remaining <= segment.length) break
    remaining -= segment.length
  }
  const amount = selected.length > 0 ? Math.min(1, remaining / selected.length) : 0
  const { start, end } = selected
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  }
}

function station(routeProgress: number): RouteStation {
  return {
    routeProgress,
    position: pointOnPath(routeProgress),
  }
}

function obstacle(
  id: string,
  name: string,
  routeProgress: number,
): CoordinationObstacle {
  return {
    id,
    name,
    routeProgress,
    pickup: station(Math.max(0, routeProgress - 0.022)),
    release: station(Math.min(1, routeProgress + 0.026)),
    wait: station(Math.max(0, routeProgress - 0.04)),
  }
}

export const defaultCoordinationScenario: CoordinationScenario = {
  missionId: 'rail-coop-demo-001',
  name: '接触网协同越障标准场景',
  contactLine: {
    id: 'contact-line-main',
    name: '指定接触线 L1',
    path: contactLinePath,
  },
  drone: {
    id: 'drone-01',
    name: '协同无人机 D1',
    startProgress: 0.14,
  },
  robot: {
    id: 'robot-01',
    name: '锐恩智铁巡检机器人 R1',
    startProgress: 0.035,
  },
  obstacles: [
    obstacle('O1', '障碍点 O1', 0.18),
    obstacle('O2', '障碍点 O2', 0.52),
    obstacle('O3', '障碍点 O3', 0.84),
  ],
  timing: {
    preparationMs: 800,
    assistExecutionMs: 2_200,
    robotClearVerificationMs: 900,
    lineLossHoldMs: 500,
    stableFramesRequired: 3,
    robotCruiseProgressPerSecond: 0.035,
    droneCruiseProgressPerSecond: 0.095,
    droneApproachProgressPerSecond: 0.036,
    approachWindowProgress: 0.055,
  },
}

/** 返回可安全修改的标准场景副本，避免组件误改模块级常量。 */
export function createDefaultCoordinationScenario(): CoordinationScenario {
  return structuredClone(defaultCoordinationScenario)
}
