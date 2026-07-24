import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { createDefaultProject, createEmptyProject } from '@/data/defaultProject'
import type { MissionProject } from '@/types/project'
import type { DroneWaypoint, Point2D } from '@/types/scene'
import { cloneSerializable } from '@/utils/clone'
import { createId } from '@/utils/id'
import { nowIso } from '@/utils/time'

export type WaypointUpdate = Partial<Omit<DroneWaypoint, 'id' | 'type'>>
export type NewWaypointOptions = Partial<
  Omit<DroneWaypoint, 'id' | 'type' | 'position' | 'order'>
>

function nextWaypointNumber(waypoints: readonly DroneWaypoint[]): number {
  return waypoints.reduce((highest, waypoint) => {
    const match = /^P(\d+)/i.exec(waypoint.name.trim())
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0) + 1
}

export const useProjectStore = defineStore('project', () => {
  const project = ref<MissionProject>(createDefaultProject())

  const sortedWaypoints = computed(() =>
    [...project.value.droneWaypoints].sort((left, right) => left.order - right.order),
  )

  function touchProject(): void {
    project.value.updatedAt = nowIso()
  }

  function createNewProject(name = '未命名巡检任务'): MissionProject {
    const nextProject = createEmptyProject(name)
    project.value = nextProject
    return nextProject
  }

  function loadDefaultProject(name?: string): MissionProject {
    const nextProject = createDefaultProject(name)
    project.value = nextProject
    return nextProject
  }

  function replaceProject(nextProject: MissionProject): void {
    project.value = cloneSerializable(nextProject)
  }

  function addWaypoint(
    point: Point2D,
    options: NewWaypointOptions = {},
  ): DroneWaypoint {
    const waypointNumber = nextWaypointNumber(project.value.droneWaypoints)
    const highestOrder = project.value.droneWaypoints.reduce(
      (highest, waypoint) => Math.max(highest, waypoint.order),
      0,
    )
    const waypoint: DroneWaypoint = {
      id: createId('waypoint'),
      name: `P${waypointNumber}`,
      type: 'DRONE_WAYPOINT',
      position: { x: point.x, y: point.y },
      visible: true,
      altitude: 5,
      speed: 1.5,
      yaw: 0,
      action: 'FLY_TO',
      stayDuration: 0,
      critical: false,
      order: highestOrder + 1,
      ...options,
    }

    project.value.droneWaypoints.push(waypoint)
    project.value.missionNodes.push({
      id: createId('mission-node'),
      name: `飞向 ${waypoint.name}`,
      action: waypoint.action,
      waypointId: waypoint.id,
      duration: waypoint.stayDuration,
      speed: waypoint.speed,
      order: project.value.missionNodes.length + 1,
    })
    touchProject()
    return waypoint
  }

  function updateWaypoint(id: string, patch: WaypointUpdate): boolean {
    const waypoint = project.value.droneWaypoints.find((candidate) => candidate.id === id)
    if (!waypoint) {
      return false
    }

    const normalizedPatch: WaypointUpdate = { ...patch }
    if (typeof patch.name === 'string') {
      normalizedPatch.name = patch.name.trim() || waypoint.name
    }

    const nextPosition = normalizedPatch.position
      ? { x: normalizedPatch.position.x, y: normalizedPatch.position.y }
      : waypoint.position
    Object.assign(waypoint, normalizedPatch, {
      position: nextPosition,
      id: waypoint.id,
      type: 'DRONE_WAYPOINT',
    })

    const linkedNode = project.value.missionNodes.find((node) => node.waypointId === id)
    if (linkedNode) {
      linkedNode.name = `飞向 ${waypoint.name}`
      linkedNode.action = waypoint.action
      linkedNode.speed = waypoint.speed
      linkedNode.duration = waypoint.stayDuration
    }
    touchProject()
    return true
  }

  function removeWaypoint(id: string): boolean {
    const waypointIndex = project.value.droneWaypoints.findIndex((waypoint) => waypoint.id === id)
    if (waypointIndex < 0) {
      return false
    }

    project.value.droneWaypoints.splice(waypointIndex, 1)
    project.value.droneWaypoints
      .sort((left, right) => left.order - right.order)
      .forEach((waypoint, index) => {
        waypoint.order = index + 1
      })
    project.value.missionNodes = project.value.missionNodes
      .filter((node) => node.waypointId !== id)
      .sort((left, right) => left.order - right.order)
      .map((node, index) => ({ ...node, order: index + 1 }))
    touchProject()
    return true
  }

  function renameProject(name: string): void {
    const normalizedName = name.trim()
    if (normalizedName.length === 0) {
      return
    }
    project.value.name = normalizedName
    touchProject()
  }

  return {
    project,
    sortedWaypoints,
    createNewProject,
    loadDefaultProject,
    replaceProject,
    addWaypoint,
    updateWaypoint,
    removeWaypoint,
    renameProject,
    touchProject,
    new: createNewProject,
    add: addWaypoint,
    update: updateWaypoint,
    remove: removeWaypoint,
    replace: replaceProject,
    touch: touchProject,
  }
})
