import type { MissionProject } from '@/types/project'
import type { MissionLog, MissionStatistics, ValidationIssue } from '@/types/simulation'
import { waypointRouteDistance } from '@/utils/geometry'

export interface StatisticsInput {
  elapsedTime: number
  completed: boolean
  logs: readonly MissionLog[]
  validationIssues?: readonly ValidationIssue[]
}

export function generateMissionStatistics(
  project: MissionProject,
  input: StatisticsInput,
): MissionStatistics {
  const waypoints = [...project.droneWaypoints].sort((left, right) => left.order - right.order)
  const totalDistance = waypointRouteDistance(waypoints, project.settings.pixelsPerMeter)
  const elapsedTime = Number.isFinite(input.elapsedTime) ? Math.max(0, input.elapsedTime) : 0
  const logWarnings = input.logs.filter((log) => log.level === 'WARNING').length
  const logErrors = input.logs.filter((log) => log.level === 'ERROR').length
  const validationWarnings = input.validationIssues?.filter((issue) => issue.level === 'WARNING').length ?? 0
  const validationErrors = input.validationIssues?.filter((issue) => issue.level === 'ERROR').length ?? 0

  return {
    projectName: project.name,
    completed: input.completed,
    elapsedTime,
    totalDistance,
    waypointCount: waypoints.length,
    averageSpeed: elapsedTime > 0 ? totalDistance / elapsedTime : 0,
    logCount: input.logs.length,
    warningCount: logWarnings + validationWarnings,
    errorCount: logErrors + validationErrors,
  }
}

export const createMissionStatistics = generateMissionStatistics
