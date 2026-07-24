<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import BottomSimulationPanel from '@/components/layout/BottomSimulationPanel.vue'
import LeftToolPanel from '@/components/layout/LeftToolPanel.vue'
import PropertyPanel from '@/components/layout/PropertyPanel.vue'
import TopToolbar from '@/components/layout/TopToolbar.vue'
import WorkspaceNavigation from '@/components/layout/WorkspaceNavigation.vue'
import MissionCanvas from '@/components/canvas/MissionCanvas.vue'
import { useMissionSimulation } from '@/composables/useMissionSimulation'
import { useProjectStorage } from '@/composables/useProjectStorage'
import { parseProjectFile, serializeProject } from '@/services/projectSerializer'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneStore } from '@/stores/sceneStore'
import { useSimulationStore } from '@/stores/simulationStore'
import type { DroneWaypoint, EditorTool, Point2D } from '@/types/scene'
import type { SimulationSpeed } from '@/types/simulation'

const projectStore = useProjectStore()
const sceneStore = useSceneStore()
const simulationStore = useSimulationStore()
const simulation = useMissionSimulation()
const storage = useProjectStorage()
const importInput = ref<HTMLInputElement | null>(null)

watch(storage.storageError, (error, previousError) => {
  if (error && error !== previousError) {
    ElMessage.error(`本地存储异常：${error}`)
  }
})

const selectedWaypoint = computed<DroneWaypoint | null>(() => {
  if (!sceneStore.selectedObjectId) return null
  return (
    projectStore.sortedWaypoints.find(
      (waypoint) => waypoint.id === sceneStore.selectedObjectId,
    ) ?? null
  )
})

const editingLocked = computed(
  () => simulationStore.status === 'RUNNING' || simulationStore.status === 'PAUSED',
)
const canSimulate = computed(() => projectStore.sortedWaypoints.length >= 2)

const updateProjectName = (name: string) => {
  projectStore.renameProject(name)
}

const selectTool = (tool: EditorTool) => {
  sceneStore.setTool(tool)
}

const addWaypoint = (point: Point2D) => {
  if (editingLocked.value) return
  projectStore.addWaypoint(point)
  const latest = projectStore.sortedWaypoints.at(-1)
  if (latest) sceneStore.selectObject(latest.id)
}

const updateWaypoint = (id: string, patch: Partial<DroneWaypoint>) => {
  if (editingLocked.value) return
  projectStore.updateWaypoint(id, patch)
}

const deleteWaypoint = (id: string) => {
  if (editingLocked.value) return
  projectStore.removeWaypoint(id)
  if (sceneStore.selectedObjectId === id) sceneStore.clearSelection()
}

const deleteSelected = () => {
  if (selectedWaypoint.value) deleteWaypoint(selectedWaypoint.value.id)
}

const startSimulation = () => {
  if (!canSimulate.value) {
    ElMessage.warning('至少需要两个航点才能开始仿真')
    return
  }
  simulation.start()
}

const pauseSimulation = () => simulation.pause()
const resumeSimulation = () => simulation.resume()
const resetSimulation = () => simulation.reset()

const createNewProject = async () => {
  if (projectStore.project.droneWaypoints.length > 0) {
    try {
      await ElMessageBox.confirm(
        '当前画布会被清空。请先确认已有任务是否已经保存。',
        '新建任务',
        {
          confirmButtonText: '新建任务',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
    } catch {
      return
    }
  }

  projectStore.createNewProject()
  simulation.reset()
  sceneStore.clearSelection()
  sceneStore.setTool('DRONE_WAYPOINT')
}

const saveProject = async () => {
  try {
    const result = storage.saveNow()
    if (result.ok) {
      ElMessage.success('项目已保存到本机')
    } else {
      ElMessage.error(result.error)
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目保存失败')
  }
}

const exportProject = () => {
  try {
    const json = serializeProject(projectStore.project, true)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const safeName = projectStore.project.name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-|-$/g, '')
    anchor.href = url
    anchor.download = `${safeName || 'rail-drone-mission'}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('任务 JSON 已导出')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导出失败')
  }
}

const requestImport = () => importInput.value?.click()

const importProject = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    await ElMessageBox.confirm(
      '导入会覆盖当前画布中的任务数据。建议先保存或导出当前项目。',
      '导入任务',
      {
        confirmButtonText: '继续导入',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )

    const result = await parseProjectFile(file)
    if (!result.ok) {
      const detail = result.details[0] ? `：${result.details[0]}` : ''
      ElMessage.error(`${result.error}${detail}`)
      return
    }

    projectStore.replaceProject(result.project)
    simulation.reset()
    sceneStore.clearSelection()
    sceneStore.setTool('SELECT')
    const saveResult = storage.saveNow()
    if (!saveResult.ok) {
      ElMessage.warning(`项目已导入，但本机保存失败：${saveResult.error}`)
    }
  } catch (error) {
    if (error instanceof Error) ElMessage.error(error.message)
  } finally {
    input.value = ''
  }
}

const handleGlobalKeydown = (event: KeyboardEvent) => {
  const target = event.target
  const isEditingText =
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable)
  if (isEditingText) return

  if (event.key === 'Escape') {
    sceneStore.setTool('SELECT')
    sceneStore.clearSelection()
  }

  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedWaypoint.value) {
    event.preventDefault()
    deleteSelected()
  }
}

onMounted(() => {
  storage.initializeStorage()
  simulationStore.resetSimulation(projectStore.sortedWaypoints[0])
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  simulation.dispose()
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <main
    class="mission-editor"
    tabindex="-1"
    data-workspace-root
    aria-label="任务编排工作区"
  >
    <WorkspaceNavigation />

    <TopToolbar
      :project-name="projectStore.project.name"
      :simulation-status="simulationStore.status"
      :has-waypoints="canSimulate"
      @update:project-name="updateProjectName"
      @new="createNewProject"
      @save="saveProject"
      @import="requestImport"
      @export="exportProject"
      @start="startSimulation"
      @pause="pauseSimulation"
      @resume="resumeSimulation"
      @reset="resetSimulation"
    />

    <input
      ref="importInput"
      class="sr-only"
      type="file"
      accept="application/json,.json"
      tabindex="-1"
      aria-hidden="true"
      @change="importProject"
    />

    <div class="editor-workspace">
      <LeftToolPanel
        class="tool-column"
        :active-tool="sceneStore.activeTool"
        :has-selection="Boolean(selectedWaypoint)"
        :editing-locked="editingLocked"
        @select-tool="selectTool"
        @delete-selected="deleteSelected"
      />

      <MissionCanvas
        class="canvas-column"
        :waypoints="projectStore.sortedWaypoints"
        :selected-id="sceneStore.selectedObjectId"
        :active-tool="sceneStore.activeTool"
        :current-segment-index="simulationStore.currentSegmentIndex"
        :telemetry="simulationStore.telemetry"
        :status="simulationStore.status"
        :show-grid="projectStore.project.settings.showGrid"
        :grid-size="projectStore.project.settings.gridSize"
        :pixels-per-meter="projectStore.project.settings.pixelsPerMeter"
        :editing-locked="editingLocked"
        @add-waypoint="addWaypoint"
        @select-waypoint="$event ? sceneStore.selectObject($event) : sceneStore.clearSelection()"
        @move-waypoint="(id, point) => updateWaypoint(id, { position: point })"
      />

      <PropertyPanel
        class="property-column"
        :project="projectStore.project"
        :selected-waypoint="selectedWaypoint"
        :simulation-status="simulationStore.status"
        :editing-locked="editingLocked"
        @update-waypoint="updateWaypoint"
        @delete-waypoint="deleteWaypoint"
      />
    </div>

    <BottomSimulationPanel
      :status="simulationStore.status"
      :telemetry="simulationStore.telemetry"
      :progress="simulationStore.progress"
      :elapsed-time="simulationStore.elapsedTime"
      :current-waypoint-index="simulationStore.currentWaypointIndex"
      :current-segment-index="simulationStore.currentSegmentIndex"
      :speed-multiplier="simulationStore.speedMultiplier"
      :logs="simulationStore.logs"
      :issues="simulationStore.issues"
      :waypoint-count="projectStore.sortedWaypoints.length"
      @start="startSimulation"
      @pause="pauseSimulation"
      @resume="resumeSimulation"
      @reset="resetSimulation"
      @set-speed="(speed: SimulationSpeed) => simulationStore.setSpeed(speed)"
    />
  </main>
</template>

<style scoped>
.mission-editor {
  display: grid;
  width: 100%;
  height: 100dvh;
  min-height: 42rem;
  grid-template-rows: auto auto minmax(0, 1fr) 15rem;
  overflow: hidden;
  background: var(--color-paper);
}

.editor-workspace {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-columns: 12.5rem minmax(0, 1fr) 19rem;
  overflow: hidden;
}

.tool-column,
.canvas-column,
.property-column {
  min-height: 0;
}

@media (max-width: 68rem) {
  .mission-editor {
    grid-template-rows: auto auto minmax(0, 1fr) 18rem;
  }

  .editor-workspace {
    grid-template-columns: 4.75rem minmax(34rem, 1fr) 16.5rem;
    overflow-x: auto;
  }
}

@media (max-width: 48rem) {
  .mission-editor {
    height: auto;
    min-height: 100dvh;
    grid-template-rows: auto auto auto auto;
    overflow: visible;
  }

  .editor-workspace {
    grid-template-columns: 4.25rem minmax(0, 1fr);
    grid-template-rows: minmax(32rem, 68dvh) auto;
    overflow: hidden;
  }

  .property-column {
    grid-column: 1 / -1;
    min-height: 24rem;
    border-top: var(--rule-thin) solid var(--color-rule);
    border-left: 0;
  }
}
</style>
