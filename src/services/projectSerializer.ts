import { PROJECT_VERSION } from '@/data/defaultProject'
import type { MissionActionType, MissionNode } from '@/types/mission'
import type { MissionProject, MissionSettings } from '@/types/project'
import type {
  ContactLine,
  DroneWaypoint,
  InspectionPoint,
  NoFlyZone,
  Obstacle,
  ObstacleType,
  Point2D,
  Pole,
  RiskLevel,
  RobotMarker,
  SceneObjectType,
} from '@/types/scene'
import { cloneSerializable } from '@/utils/clone'
import { toFileTimestamp } from '@/utils/time'

type UnknownRecord = Record<string, unknown>

export interface ProjectParseSuccess {
  ok: true
  project: MissionProject
}

export interface ProjectParseFailure {
  ok: false
  error: string
  details: string[]
}

export type ProjectParseResult = ProjectParseSuccess | ProjectParseFailure

export const MAX_PROJECT_FILE_SIZE_BYTES = 5 * 1024 * 1024

const missionActions = new Set<MissionActionType>([
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
])

const obstacleTypes = new Set<ObstacleType>([
  'ANCHOR',
  'DROPPER',
  'POSITIONING_DEVICE',
  'CLAMP',
  'UNKNOWN',
])

const riskLevels = new Set<RiskLevel>(['LOW', 'MEDIUM', 'HIGH'])

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(
  source: UnknownRecord,
  key: string,
  path: string,
  errors: string[],
): string | undefined {
  const value = source[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${path}.${key} 必须是非空字符串`)
    return undefined
  }
  return value
}

function optionalString(
  source: UnknownRecord,
  key: string,
  path: string,
  errors: string[],
): string | undefined {
  const value = source[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string') {
    errors.push(`${path}.${key} 必须是字符串`)
    return undefined
  }
  return value
}

function requiredNumber(
  source: UnknownRecord,
  key: string,
  path: string,
  errors: string[],
): number | undefined {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${path}.${key} 必须是有限数值`)
    return undefined
  }
  return value
}

function optionalNumber(
  source: UnknownRecord,
  key: string,
  path: string,
  errors: string[],
): number | undefined {
  const value = source[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${path}.${key} 必须是有限数值`)
    return undefined
  }
  return value
}

function requiredBoolean(
  source: UnknownRecord,
  key: string,
  path: string,
  errors: string[],
): boolean | undefined {
  const value = source[key]
  if (typeof value !== 'boolean') {
    errors.push(`${path}.${key} 必须是布尔值`)
    return undefined
  }
  return value
}

function parsePoint(value: unknown, path: string, errors: string[]): Point2D | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} 必须是坐标对象`)
    return undefined
  }
  const x = requiredNumber(value, 'x', path, errors)
  const y = requiredNumber(value, 'y', path, errors)
  return x === undefined || y === undefined ? undefined : { x, y }
}

function optionalPoint(
  source: UnknownRecord,
  key: string,
  path: string,
  errors: string[],
): Point2D | undefined {
  return source[key] === undefined
    ? undefined
    : parsePoint(source[key], `${path}.${key}`, errors)
}

interface ParsedBase {
  id: string
  name: string
  type: SceneObjectType
  position: Point2D
  visible: boolean
  remark?: string
}

function parseBase(
  value: unknown,
  expectedType: SceneObjectType,
  path: string,
  errors: string[],
): ParsedBase | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} 必须是对象`)
    return undefined
  }

  const id = requiredString(value, 'id', path, errors)
  const name = requiredString(value, 'name', path, errors)
  const type = requiredString(value, 'type', path, errors)
  const position = parsePoint(value.position, `${path}.position`, errors)
  const visible = requiredBoolean(value, 'visible', path, errors)
  const remark = optionalString(value, 'remark', path, errors)

  if (type !== undefined && type !== expectedType) {
    errors.push(`${path}.type 必须是 ${expectedType}`)
  }
  if (!id || !name || type !== expectedType || !position || visible === undefined) {
    return undefined
  }

  return { id, name, type: expectedType, position, visible, remark }
}

function parsePole(value: unknown, path: string, errors: string[]): Pole | undefined {
  const base = parseBase(value, 'POLE', path, errors)
  if (!base || !isRecord(value)) {
    return undefined
  }
  const poleNumber = requiredString(value, 'poleNumber', path, errors)
  return poleNumber ? { ...base, type: 'POLE', poleNumber } : undefined
}

function parseContactLine(
  value: unknown,
  path: string,
  errors: string[],
): ContactLine | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} 必须是对象`)
    return undefined
  }

  const id = requiredString(value, 'id', path, errors)
  const name = requiredString(value, 'name', path, errors)
  const type = requiredString(value, 'type', path, errors)
  const visible = requiredBoolean(value, 'visible', path, errors)
  const robotAccessible = requiredBoolean(value, 'robotAccessible', path, errors)
  const startPoleId = optionalString(value, 'startPoleId', path, errors)
  const endPoleId = optionalString(value, 'endPoleId', path, errors)
  const sectionNumber = optionalString(value, 'sectionNumber', path, errors)
  const remark = optionalString(value, 'remark', path, errors)
  const points: Point2D[] = []

  if (!Array.isArray(value.points)) {
    errors.push(`${path}.points 必须是坐标数组`)
  } else {
    value.points.forEach((point, index) => {
      const parsedPoint = parsePoint(point, `${path}.points[${index}]`, errors)
      if (parsedPoint) {
        points.push(parsedPoint)
      }
    })
  }

  if (type !== 'CONTACT_LINE') {
    errors.push(`${path}.type 必须是 CONTACT_LINE`)
  }
  if (!id || !name || type !== 'CONTACT_LINE' || visible === undefined || robotAccessible === undefined) {
    return undefined
  }

  return {
    id,
    name,
    type: 'CONTACT_LINE',
    points,
    startPoleId,
    endPoleId,
    sectionNumber,
    robotAccessible,
    visible,
    remark,
  }
}

function parseObstacle(value: unknown, path: string, errors: string[]): Obstacle | undefined {
  const base = parseBase(value, 'OBSTACLE', path, errors)
  if (!base || !isRecord(value)) {
    return undefined
  }
  const obstacleType = requiredString(value, 'obstacleType', path, errors)
  const riskLevel = requiredString(value, 'riskLevel', path, errors)
  const robotPassable = requiredBoolean(value, 'robotPassable', path, errors)
  const requiresDroneTransfer = requiredBoolean(value, 'requiresDroneTransfer', path, errors)
  const safetyDistance = requiredNumber(value, 'safetyDistance', path, errors)
  const contactLineId = optionalString(value, 'contactLineId', path, errors)
  const pickupPoint = optionalPoint(value, 'pickupPoint', path, errors)
  const releasePoint = optionalPoint(value, 'releasePoint', path, errors)

  if (!obstacleType || !obstacleTypes.has(obstacleType as ObstacleType)) {
    errors.push(`${path}.obstacleType 不是支持的障碍物类型`)
  }
  if (!riskLevel || !riskLevels.has(riskLevel as RiskLevel)) {
    errors.push(`${path}.riskLevel 不是支持的风险等级`)
  }
  if (
    !obstacleType
    || !obstacleTypes.has(obstacleType as ObstacleType)
    || !riskLevel
    || !riskLevels.has(riskLevel as RiskLevel)
    || robotPassable === undefined
    || requiresDroneTransfer === undefined
    || safetyDistance === undefined
  ) {
    return undefined
  }

  return {
    ...base,
    type: 'OBSTACLE',
    obstacleType: obstacleType as ObstacleType,
    riskLevel: riskLevel as RiskLevel,
    robotPassable,
    requiresDroneTransfer,
    safetyDistance,
    contactLineId,
    pickupPoint,
    releasePoint,
  }
}

function parseInspectionPoint(
  value: unknown,
  path: string,
  errors: string[],
): InspectionPoint | undefined {
  const base = parseBase(value, 'INSPECTION_POINT', path, errors)
  if (!base || !isRecord(value)) {
    return undefined
  }
  const inspectionType = requiredString(value, 'inspectionType', path, errors)
  const stayDuration = requiredNumber(value, 'stayDuration', path, errors)
  const critical = requiredBoolean(value, 'critical', path, errors)
  const contactLineId = optionalString(value, 'contactLineId', path, errors)

  return inspectionType && stayDuration !== undefined && critical !== undefined
    ? {
        ...base,
        type: 'INSPECTION_POINT',
        inspectionType,
        stayDuration,
        critical,
        contactLineId,
      }
    : undefined
}

function parseWaypoint(
  value: unknown,
  path: string,
  errors: string[],
): DroneWaypoint | undefined {
  const base = parseBase(value, 'DRONE_WAYPOINT', path, errors)
  if (!base || !isRecord(value)) {
    return undefined
  }
  const altitude = requiredNumber(value, 'altitude', path, errors)
  const speed = requiredNumber(value, 'speed', path, errors)
  const yaw = requiredNumber(value, 'yaw', path, errors)
  const action = requiredString(value, 'action', path, errors)
  const stayDuration = requiredNumber(value, 'stayDuration', path, errors)
  const maxWaitTime = optionalNumber(value, 'maxWaitTime', path, errors)
  const critical = requiredBoolean(value, 'critical', path, errors)
  const order = requiredNumber(value, 'order', path, errors)

  if (!action || !missionActions.has(action as MissionActionType)) {
    errors.push(`${path}.action 不是支持的任务动作`)
  }
  if (altitude !== undefined && (altitude < 0 || altitude > 120)) {
    errors.push(`${path}.altitude 必须在 0 到 120 之间`)
  }
  if (speed !== undefined && (speed < 0.1 || speed > 20)) {
    errors.push(`${path}.speed 必须在 0.1 到 20 之间`)
  }
  if (yaw !== undefined && (yaw < -180 || yaw > 180)) {
    errors.push(`${path}.yaw 必须在 -180 到 180 之间`)
  }
  if (stayDuration !== undefined && (stayDuration < 0 || stayDuration > 600)) {
    errors.push(`${path}.stayDuration 必须在 0 到 600 之间`)
  }
  if (maxWaitTime !== undefined && maxWaitTime < 0) {
    errors.push(`${path}.maxWaitTime 不能小于 0`)
  }
  if (order !== undefined && (!Number.isInteger(order) || order < 1)) {
    errors.push(`${path}.order 必须是正整数`)
  }
  if (
    base.position.x < 0
    || base.position.x > 1200
    || base.position.y < 0
    || base.position.y > 720
  ) {
    errors.push(`${path}.position 必须位于 1200 × 720 画布范围内`)
  }
  if (
    altitude === undefined
    || altitude < 0
    || altitude > 120
    || speed === undefined
    || speed < 0.1
    || speed > 20
    || yaw === undefined
    || yaw < -180
    || yaw > 180
    || !action
    || !missionActions.has(action as MissionActionType)
    || stayDuration === undefined
    || stayDuration < 0
    || stayDuration > 600
    || (maxWaitTime !== undefined && maxWaitTime < 0)
    || critical === undefined
    || order === undefined
    || !Number.isInteger(order)
    || order < 1
    || base.position.x < 0
    || base.position.x > 1200
    || base.position.y < 0
    || base.position.y > 720
  ) {
    return undefined
  }

  return {
    ...base,
    type: 'DRONE_WAYPOINT',
    altitude,
    speed,
    yaw,
    action: action as MissionActionType,
    stayDuration,
    maxWaitTime,
    critical,
    order,
  }
}

function parseRobotMarker(
  value: unknown,
  path: string,
  errors: string[],
): RobotMarker | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} 必须是对象`)
    return undefined
  }
  const markerType = value.type
  if (markerType !== 'ROBOT_START' && markerType !== 'ROBOT_END') {
    errors.push(`${path}.type 必须是 ROBOT_START 或 ROBOT_END`)
    return undefined
  }
  const base = parseBase(value, markerType, path, errors)
  return base ? { ...base, type: markerType } : undefined
}

function parseNoFlyZone(
  value: unknown,
  path: string,
  errors: string[],
): NoFlyZone | undefined {
  const base = parseBase(value, 'NO_FLY_ZONE', path, errors)
  if (!base || !isRecord(value)) {
    return undefined
  }
  const width = requiredNumber(value, 'width', path, errors)
  const height = requiredNumber(value, 'height', path, errors)
  const riskLevel = requiredString(value, 'riskLevel', path, errors)
  if (!riskLevel || !riskLevels.has(riskLevel as RiskLevel)) {
    errors.push(`${path}.riskLevel 不是支持的风险等级`)
  }
  if (
    width === undefined
    || height === undefined
    || !riskLevel
    || !riskLevels.has(riskLevel as RiskLevel)
  ) {
    return undefined
  }
  return {
    ...base,
    type: 'NO_FLY_ZONE',
    width,
    height,
    riskLevel: riskLevel as RiskLevel,
  }
}

function parseMissionNode(
  value: unknown,
  path: string,
  errors: string[],
): MissionNode | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} 必须是对象`)
    return undefined
  }
  const id = requiredString(value, 'id', path, errors)
  const name = requiredString(value, 'name', path, errors)
  const action = requiredString(value, 'action', path, errors)
  const waypointId = optionalString(value, 'waypointId', path, errors)
  const targetObjectId = optionalString(value, 'targetObjectId', path, errors)
  const duration = optionalNumber(value, 'duration', path, errors)
  const maxWaitTime = optionalNumber(value, 'maxWaitTime', path, errors)
  const speed = optionalNumber(value, 'speed', path, errors)
  const order = requiredNumber(value, 'order', path, errors)
  const parametersValue = value.parameters
  let parameters: Record<string, unknown> | undefined

  if (parametersValue !== undefined) {
    if (isRecord(parametersValue)) {
      parameters = cloneSerializable(parametersValue)
    } else {
      errors.push(`${path}.parameters 必须是对象`)
    }
  }
  if (!action || !missionActions.has(action as MissionActionType)) {
    errors.push(`${path}.action 不是支持的任务动作`)
  }
  if (duration !== undefined && duration < 0) {
    errors.push(`${path}.duration 不能小于 0`)
  }
  if (maxWaitTime !== undefined && maxWaitTime < 0) {
    errors.push(`${path}.maxWaitTime 不能小于 0`)
  }
  if (speed !== undefined && speed <= 0) {
    errors.push(`${path}.speed 必须大于 0`)
  }
  if (order !== undefined && (!Number.isInteger(order) || order < 1)) {
    errors.push(`${path}.order 必须是正整数`)
  }
  if (
    !id
    || !name
    || !action
    || !missionActions.has(action as MissionActionType)
    || order === undefined
    || !Number.isInteger(order)
    || order < 1
    || (duration !== undefined && duration < 0)
    || (maxWaitTime !== undefined && maxWaitTime < 0)
    || (speed !== undefined && speed <= 0)
  ) {
    return undefined
  }

  return {
    id,
    name,
    action: action as MissionActionType,
    waypointId,
    targetObjectId,
    duration,
    maxWaitTime,
    speed,
    order,
    parameters,
  }
}

function parseSettings(value: unknown, path: string, errors: string[]): MissionSettings | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} 必须是对象`)
    return undefined
  }
  const showGrid = requiredBoolean(value, 'showGrid', path, errors)
  const snapToGrid = requiredBoolean(value, 'snapToGrid', path, errors)
  const gridSize = requiredNumber(value, 'gridSize', path, errors)
  const pixelsPerMeter = requiredNumber(value, 'pixelsPerMeter', path, errors)
  const autoSave = requiredBoolean(value, 'autoSave', path, errors)

  if (gridSize !== undefined && gridSize <= 0) {
    errors.push(`${path}.gridSize 必须大于 0`)
  }
  if (pixelsPerMeter !== undefined && pixelsPerMeter <= 0) {
    errors.push(`${path}.pixelsPerMeter 必须大于 0`)
  }
  if (
    showGrid === undefined
    || snapToGrid === undefined
    || gridSize === undefined
    || gridSize <= 0
    || pixelsPerMeter === undefined
    || pixelsPerMeter <= 0
    || autoSave === undefined
  ) {
    return undefined
  }
  return { showGrid, snapToGrid, gridSize, pixelsPerMeter, autoSave }
}

function parseObjectArray<Item>(
  source: UnknownRecord,
  key: string,
  errors: string[],
  parser: (value: unknown, path: string, errors: string[]) => Item | undefined,
): Item[] {
  const value = source[key]
  if (!Array.isArray(value)) {
    errors.push(`project.${key} 必须是数组`)
    return []
  }
  const items: Item[] = []
  value.forEach((item, index) => {
    const parsed = parser(item, `project.${key}[${index}]`, errors)
    if (parsed) {
      items.push(parsed)
    }
  })
  return items
}

function validateUniqueIds(
  entries: Array<{ id: string; path: string }>,
  errors: string[],
): void {
  const firstPathById = new Map<string, string>()
  for (const entry of entries) {
    const firstPath = firstPathById.get(entry.id)
    if (firstPath) {
      errors.push(`${entry.path}.id 与 ${firstPath}.id 重复`)
    } else {
      firstPathById.set(entry.id, entry.path)
    }
  }
}

function validateUniqueOrders(
  entries: Array<{ order: number }>,
  path: string,
  errors: string[],
): void {
  const firstIndexByOrder = new Map<number, number>()
  entries.forEach((entry, index) => {
    const firstIndex = firstIndexByOrder.get(entry.order)
    if (firstIndex !== undefined) {
      errors.push(`${path}[${index}].order 与 ${path}[${firstIndex}].order 重复`)
    } else {
      firstIndexByOrder.set(entry.order, index)
    }
  })
}

function parseProjectValue(value: unknown): ProjectParseResult {
  if (!isRecord(value)) {
    return { ok: false, error: '项目 JSON 顶层必须是对象', details: ['project 必须是对象'] }
  }

  const errors: string[] = []
  const id = requiredString(value, 'id', 'project', errors)
  const name = requiredString(value, 'name', 'project', errors)
  const version = requiredString(value, 'version', 'project', errors)
  const createdAt = requiredString(value, 'createdAt', 'project', errors)
  const updatedAt = requiredString(value, 'updatedAt', 'project', errors)
  const poles = parseObjectArray(value, 'poles', errors, parsePole)
  const contactLines = parseObjectArray(value, 'contactLines', errors, parseContactLine)
  const obstacles = parseObjectArray(value, 'obstacles', errors, parseObstacle)
  const inspectionPoints = parseObjectArray(value, 'inspectionPoints', errors, parseInspectionPoint)
  const droneWaypoints = parseObjectArray(value, 'droneWaypoints', errors, parseWaypoint)
  const robotMarkers = parseObjectArray(value, 'robotMarkers', errors, parseRobotMarker)
  const noFlyZones = parseObjectArray(value, 'noFlyZones', errors, parseNoFlyZone)
  const missionNodes = parseObjectArray(value, 'missionNodes', errors, parseMissionNode)
  const settings = parseSettings(value.settings, 'project.settings', errors)

  if (version && version !== PROJECT_VERSION) {
    errors.push(`project.version 必须是 ${PROJECT_VERSION}`)
  }

  const sceneCollections = [
    ['poles', poles],
    ['contactLines', contactLines],
    ['obstacles', obstacles],
    ['inspectionPoints', inspectionPoints],
    ['droneWaypoints', droneWaypoints],
    ['robotMarkers', robotMarkers],
    ['noFlyZones', noFlyZones],
  ] as const
  const idEntries = sceneCollections.flatMap(([key, items]) =>
    items.map((item, index) => ({ id: item.id, path: `project.${key}[${index}]` })),
  )
  idEntries.push(
    ...missionNodes.map((node, index) => ({
      id: node.id,
      path: `project.missionNodes[${index}]`,
    })),
  )
  validateUniqueIds(idEntries, errors)
  validateUniqueOrders(droneWaypoints, 'project.droneWaypoints', errors)
  validateUniqueOrders(missionNodes, 'project.missionNodes', errors)

  const waypointIds = new Set(droneWaypoints.map((waypoint) => waypoint.id))
  const sceneObjectIds = new Set(idEntries.slice(0, idEntries.length - missionNodes.length).map((entry) => entry.id))
  missionNodes.forEach((node, index) => {
    if (node.waypointId && !waypointIds.has(node.waypointId)) {
      errors.push(`project.missionNodes[${index}].waypointId 未关联现有航点`)
    }
    if (node.targetObjectId && !sceneObjectIds.has(node.targetObjectId)) {
      errors.push(`project.missionNodes[${index}].targetObjectId 未关联现有场景对象`)
    }
  })

  if (errors.length > 0 || !id || !name || !version || !createdAt || !updatedAt || !settings) {
    return {
      ok: false,
      error: errors[0] ?? '项目字段不完整',
      details: errors,
    }
  }

  return {
    ok: true,
    project: {
      id,
      name,
      version,
      createdAt,
      updatedAt,
      poles,
      contactLines,
      obstacles,
      inspectionPoints,
      droneWaypoints,
      robotMarkers,
      noFlyZones,
      missionNodes,
      settings,
    },
  }
}

/** 安全解析未知 JSON，不会把未校验对象直接写入 store。 */
export function parseProject(serializedProject: string): ProjectParseResult {
  try {
    return parseProjectValue(JSON.parse(serializedProject) as unknown)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知 JSON 解析错误'
    return {
      ok: false,
      error: `JSON 格式错误：${message}`,
      details: [message],
    }
  }
}

export function serializeProject(project: MissionProject, pretty = true): string {
  return JSON.stringify(project, null, pretty ? 2 : 0)
}

export async function parseProjectFile(file: File): Promise<ProjectParseResult> {
  if (file.size > MAX_PROJECT_FILE_SIZE_BYTES) {
    const message = '项目文件不能超过 5 MB'
    return { ok: false, error: message, details: [message] }
  }
  try {
    return parseProject(await file.text())
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '文件读取失败'
    return { ok: false, error: message, details: [message] }
  }
}

export function downloadProject(project: MissionProject): void {
  const content = serializeProject(project)
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeName = project.name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'mission-project'
  link.href = objectUrl
  link.download = `${safeName}_${toFileTimestamp()}.json`
  link.click()
  URL.revokeObjectURL(objectUrl)
}
