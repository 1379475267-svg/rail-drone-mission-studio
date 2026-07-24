<script setup lang="ts">
import { computed, ref } from 'vue'
import DroneRouteLayer from './DroneRouteLayer.vue'
import SceneGrid from './SceneGrid.vue'
import VehicleLayer from './VehicleLayer.vue'
import type { DroneWaypoint, EditorTool, Point2D } from '@/types/scene'
import type { DroneTelemetry, SimulationStatus } from '@/types/simulation'

interface DragState {
  pointerId: number
  waypointId: string
}

const props = defineProps<{
  waypoints: DroneWaypoint[]
  selectedId: string | null
  activeTool: EditorTool
  currentSegmentIndex: number
  telemetry: DroneTelemetry
  status: SimulationStatus
  showGrid?: boolean
  gridSize?: number
  pixelsPerMeter?: number
  editingLocked?: boolean
}>()

const emit = defineEmits<{
  (event: 'add-waypoint', point: Point2D): void
  (event: 'select-waypoint', id: string | null): void
  (event: 'move-waypoint', id: string, point: Point2D): void
}>()

const canvasWidth = 1200
const canvasHeight = 720
const scaleWidth = 120
const svgRef = ref<SVGSVGElement | null>(null)
const dragState = ref<DragState | null>(null)

const modeLabel = computed(() => {
  if (props.editingLocked) return '仿真锁定'
  return props.activeTool === 'DRONE_WAYPOINT' ? '放置航点' : '选择 / 拖动'
})

const safePixelsPerMeter = computed(() =>
  props.pixelsPerMeter && props.pixelsPerMeter > 0 ? props.pixelsPerMeter : 40,
)
const gridMetersLabel = computed(() => {
  const meters = (props.gridSize ?? 40) / safePixelsPerMeter.value
  return Number.isInteger(meters) ? String(meters) : meters.toFixed(1)
})
const scaleMetersLabel = computed(() => {
  const meters = scaleWidth / safePixelsPerMeter.value
  return Number.isInteger(meters) ? String(meters) : meters.toFixed(1)
})

const toCanvasPoint = (event: PointerEvent): Point2D => {
  const svg = svgRef.value
  if (!svg) return { x: 0, y: 0 }
  const matrix = svg.getScreenCTM()
  if (!matrix) return { x: 0, y: 0 }
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return {
    x: Math.round(Math.max(0, Math.min(canvasWidth, point.x)) * 10) / 10,
    y: Math.round(Math.max(0, Math.min(canvasHeight, point.y)) * 10) / 10,
  }
}

const handleBlankPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return
  if (!props.editingLocked && props.activeTool === 'DRONE_WAYPOINT') {
    emit('add-waypoint', toCanvasPoint(event))
    return
  }
  emit('select-waypoint', null)
}

const resolveOverlappingWaypoint = (clickedWaypoint: DroneWaypoint): DroneWaypoint => {
  const overlappingWaypoints = props.waypoints.filter(
    (waypoint) =>
      Math.abs(waypoint.position.x - clickedWaypoint.position.x) < 0.1 &&
      Math.abs(waypoint.position.y - clickedWaypoint.position.y) < 0.1,
  )
  if (overlappingWaypoints.length < 2) return clickedWaypoint

  const selectedIndex = overlappingWaypoints.findIndex(
    (waypoint) => waypoint.id === props.selectedId,
  )
  return selectedIndex >= 0
    ? overlappingWaypoints[(selectedIndex + 1) % overlappingWaypoints.length]!
    : clickedWaypoint
}

const handleWaypointPointerDown = (event: PointerEvent, waypoint: DroneWaypoint) => {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  const targetWaypoint = resolveOverlappingWaypoint(waypoint)
  emit('select-waypoint', targetWaypoint.id)
  if (props.editingLocked || props.activeTool !== 'SELECT') return
  dragState.value = { pointerId: event.pointerId, waypointId: targetWaypoint.id }
  svgRef.value?.setPointerCapture(event.pointerId)
}

const handlePointerMove = (event: PointerEvent) => {
  const drag = dragState.value
  if (!drag || drag.pointerId !== event.pointerId || props.editingLocked) return
  emit('move-waypoint', drag.waypointId, toCanvasPoint(event))
}

const endDrag = (event: PointerEvent) => {
  const drag = dragState.value
  if (!drag || drag.pointerId !== event.pointerId) return
  if (svgRef.value?.hasPointerCapture(event.pointerId)) {
    svgRef.value.releasePointerCapture(event.pointerId)
  }
  dragState.value = null
}

const handleWaypointKeydown = (event: KeyboardEvent, waypoint: DroneWaypoint) => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  emit('select-waypoint', waypoint.id)
}
</script>

<template>
  <section class="canvas-shell" aria-labelledby="canvas-title">
    <div class="canvas-heading">
      <div>
        <h2 id="canvas-title">任务航线</h2>
      </div>
      <div class="canvas-mode" :class="{ 'is-locked': props.editingLocked }" role="status">
        <span aria-hidden="true" />
        {{ modeLabel }}
      </div>
    </div>

    <div class="canvas-stage">
      <svg
        ref="svgRef"
        class="mission-canvas"
        :class="{
          'is-adding': props.activeTool === 'DRONE_WAYPOINT' && !props.editingLocked,
          'is-dragging': dragState,
        }"
        viewBox="0 0 1200 720"
        role="img"
        aria-labelledby="mission-canvas-title mission-canvas-description"
        preserveAspectRatio="xMidYMid meet"
        @pointermove="handlePointerMove"
        @pointerup="endDrag"
        @pointercancel="endDrag"
      >
        <title id="mission-canvas-title">无人机任务航线编辑画布</title>
        <desc id="mission-canvas-description">
          包含坐标网格、按顺序连接的无人机航点、方向箭头和仿真无人机位置。
        </desc>

        <rect
          class="canvas-background"
          width="1200"
          height="720"
          @pointerdown="handleBlankPointerDown"
        />
        <SceneGrid
          v-if="props.showGrid !== false"
          :width="canvasWidth"
          :height="canvasHeight"
          :grid-size="props.gridSize ?? 40"
        />

        <g class="axis-labels" aria-hidden="true" pointer-events="none">
          <text v-for="x in [0, 200, 400, 600, 800, 1000, 1200]" :key="`x-${x}`" :x="x + 8" y="22">
            {{ x }}
          </text>
          <text v-for="y in [200, 400, 600]" :key="`y-${y}`" x="8" :y="y - 8">{{ y }}</text>
        </g>

        <DroneRouteLayer
          :waypoints="props.waypoints"
          :current-segment-index="props.currentSegmentIndex"
          :status="props.status"
        />

        <g class="waypoint-layer" aria-label="无人机航点">
          <g
            v-for="waypoint in props.waypoints"
            :key="waypoint.id"
            class="waypoint"
            :class="{
              'is-selected': props.selectedId === waypoint.id,
              'is-target': props.telemetry.targetWaypointId === waypoint.id && props.status !== 'IDLE',
              'is-critical': waypoint.critical,
            }"
            :transform="`translate(${waypoint.position.x} ${waypoint.position.y})`"
            role="button"
            tabindex="0"
            :aria-label="`${waypoint.name}，序号 ${waypoint.order}，坐标 ${waypoint.position.x}, ${waypoint.position.y}`"
            @pointerdown="handleWaypointPointerDown($event, waypoint)"
            @keydown="handleWaypointKeydown($event, waypoint)"
          >
            <circle class="waypoint-hit-area" r="22" />
            <circle class="waypoint-selection-ring" r="17" />
            <circle class="waypoint-node" r="11" />
            <circle v-if="waypoint.critical" class="critical-dot" cx="10" cy="-10" r="4" />
            <text class="waypoint-order" text-anchor="middle" dominant-baseline="central">
              {{ waypoint.order }}
            </text>
            <g class="waypoint-label" transform="translate(18 -23)">
              <rect x="0" y="0" width="88" height="27" rx="5" />
              <text x="9" y="18">{{ waypoint.name }}</text>
            </g>
          </g>
        </g>

        <VehicleLayer :telemetry="props.telemetry" :visible="props.waypoints.length > 0" />

        <g
          class="scale-mark"
          transform="translate(1010 675)"
          :aria-label="`比例尺 ${scaleMetersLabel} 米`"
        >
          <line x1="0" y1="0" :x2="scaleWidth" y2="0" />
          <line x1="0" y1="-5" x2="0" y2="5" />
          <line :x1="scaleWidth" y1="-5" :x2="scaleWidth" y2="5" />
          <text :x="scaleWidth / 2" y="-10" text-anchor="middle">{{ scaleMetersLabel }} m</text>
        </g>
      </svg>

      <div v-if="props.waypoints.length === 0" class="empty-canvas" aria-hidden="true">
        <span class="empty-route"><i /><i /><i /></span>
        <strong>从第一个航点开始</strong>
        <p>选择左侧“无人机航点”，然后点击画布</p>
      </div>

      <div class="coordinate-readout" aria-hidden="true">
        <span>LOCAL ENU</span>
        <span>1 GRID = {{ gridMetersLabel }} m</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.canvas-shell {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto 1fr;
  background: var(--color-paper-2);
}

.canvas-heading {
  display: flex;
  min-height: 4.25rem;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-surface);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.canvas-heading > div:first-child {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
}

.canvas-heading h2 {
  margin: 0;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-base);
}

.canvas-mode {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-2xs) var(--space-sm);
  color: var(--color-accent-hover);
  background: var(--color-accent-soft);
  border-radius: var(--radius-lg);
  font-size: var(--text-xs);
  font-weight: 600;
}

.canvas-mode span {
  width: 0.45rem;
  height: 0.45rem;
  background: var(--color-accent);
  border-radius: 50%;
}

.canvas-mode.is-locked {
  color: var(--color-warning);
  background: var(--color-warning-soft);
}

.canvas-mode.is-locked span {
  background: var(--color-warning);
}

.canvas-stage {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 0;
  place-items: stretch;
  padding: var(--space-md);
  overflow: hidden;
}

.mission-canvas {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: visible;
  background: var(--color-surface-raised);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-md);
  box-shadow: 0 var(--space-xs) var(--space-lg) var(--color-shadow);
  touch-action: none;
}

.mission-canvas.is-adding {
  cursor: crosshair;
}

.mission-canvas.is-dragging {
  cursor: grabbing;
}

.canvas-background {
  fill: var(--color-surface-raised);
}

.axis-labels text,
.scale-mark text {
  fill: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.waypoint {
  cursor: grab;
  outline: none;
}

.waypoint:focus-visible .waypoint-selection-ring {
  stroke: var(--color-focus);
  stroke-width: 4px;
  opacity: 1;
}

.waypoint-hit-area {
  fill: var(--color-surface-raised);
  opacity: 0;
}

.waypoint-selection-ring {
  fill: var(--color-accent-soft);
  stroke: var(--color-accent);
  stroke-width: 2px;
  opacity: 0;
  transition: opacity var(--dur-short) var(--ease-out);
}

.waypoint-node {
  fill: var(--color-surface-raised);
  stroke: var(--color-accent);
  stroke-width: 3px;
  vector-effect: non-scaling-stroke;
  transition:
    fill var(--dur-short) var(--ease-out),
    stroke-width var(--dur-short) var(--ease-out);
}

.waypoint-order {
  fill: var(--color-accent-hover);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 700;
  pointer-events: none;
}

.waypoint-label {
  pointer-events: all;
}

.waypoint-label rect {
  fill: var(--color-surface-raised);
  stroke: var(--color-rule);
  stroke-width: var(--rule-thin);
  vector-effect: non-scaling-stroke;
}

.waypoint-label text {
  fill: var(--color-ink-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
}

.waypoint.is-selected .waypoint-selection-ring,
.waypoint.is-target .waypoint-selection-ring {
  opacity: 1;
}

.waypoint.is-selected .waypoint-node,
.waypoint.is-target .waypoint-node {
  fill: var(--color-accent);
  stroke-width: 4px;
}

.waypoint.is-selected .waypoint-order,
.waypoint.is-target .waypoint-order {
  fill: var(--color-accent-ink);
}

.critical-dot {
  fill: var(--color-warning);
  stroke: var(--color-surface-raised);
  stroke-width: 2px;
}

.scale-mark line {
  stroke: var(--color-neutral);
  stroke-width: 2px;
  vector-effect: non-scaling-stroke;
}

.empty-canvas {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  justify-items: center;
  transform: translate(-50%, -50%);
  color: var(--color-muted);
  pointer-events: none;
  text-align: center;
}

.empty-canvas strong {
  margin-top: var(--space-md);
  color: var(--color-ink-2);
  font-family: var(--font-display);
  font-size: var(--text-md);
}

.empty-canvas p {
  margin: var(--space-xs) 0 0;
  font-size: var(--text-sm);
}

.empty-route {
  position: relative;
  display: flex;
  width: 8rem;
  align-items: center;
  justify-content: space-between;
}

.empty-route::before {
  position: absolute;
  right: var(--space-xs);
  left: var(--space-xs);
  height: var(--rule-strong);
  background: var(--color-rule-strong);
  content: '';
}

.empty-route i {
  z-index: var(--z-base);
  width: 1rem;
  height: 1rem;
  background: var(--color-surface-raised);
  border: var(--rule-strong) solid var(--color-accent);
  border-radius: 50%;
}

.coordinate-readout {
  position: absolute;
  right: calc(var(--space-md) + var(--space-sm));
  bottom: calc(var(--space-md) + var(--space-sm));
  display: flex;
  gap: var(--space-sm);
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  pointer-events: none;
}

@media (hover: hover) and (pointer: fine) {
  .waypoint:hover .waypoint-selection-ring {
    opacity: 0.68;
  }
}

@media (max-width: 54rem) {
  .canvas-stage {
    padding: var(--space-sm);
  }

  .coordinate-readout {
    right: calc(var(--space-sm) * 2);
    bottom: calc(var(--space-sm) * 2);
  }
}
</style>
