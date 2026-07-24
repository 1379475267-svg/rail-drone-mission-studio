<script setup lang="ts">
import { computed, useId } from 'vue'
import type {
  CoordinationObstacle,
  CoordinationPoint,
  CoordinationScenario,
  RouteStation,
} from '@/types/coordination'

const props = defineProps<{
  scenario: CoordinationScenario
  droneProgress: number
  droneLateralOffset: number
  robotProgress: number
  currentObstacleId: string | null
  nextObstacleId: string | null
  missionState: string
  droneCarryingRobot: boolean
}>()

interface RoutePose extends CoordinationPoint {
  heading: number
}

interface ZoneCallout {
  key: string
  kind: 'PICKUP' | 'RELEASE' | 'WAIT'
  shortLabel: string
  label: string
  anchor: CoordinationPoint
  callout: CoordinationPoint
}

const titleId = useId()
const descriptionId = useId()

const clamp01 = (value: number): number => Number.isFinite(value)
  ? Math.max(0, Math.min(1, value))
  : 0
const clampMapX = (value: number): number => Math.max(42, Math.min(958, value))
const clampMapY = (value: number): number => Math.max(54, Math.min(374, value))

function routePoseAt(
  path: readonly CoordinationPoint[],
  progress: number,
  lateralOffset = 0,
): RoutePose {
  if (path.length === 0) return { x: 50, y: 320, heading: 0 }
  if (path.length === 1) return { ...path[0]!, heading: 0 }

  const segments = path.slice(0, -1).map((start, index) => {
    const end = path[index + 1]!
    const dx = end.x - start.x
    const dy = end.y - start.y
    return { start, end, dx, dy, length: Math.hypot(dx, dy) }
  })
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0)
  let remaining = clamp01(progress) * totalLength
  let selected = segments.at(-1)!

  for (const segment of segments) {
    selected = segment
    if (remaining <= segment.length) break
    remaining -= segment.length
  }

  const ratio = selected.length > 0 ? Math.min(1, remaining / selected.length) : 0
  const normalX = selected.length > 0 ? -selected.dy / selected.length : 0
  const normalY = selected.length > 0 ? selected.dx / selected.length : 0
  return {
    x: selected.start.x + selected.dx * ratio + normalX * lateralOffset,
    y: selected.start.y + selected.dy * ratio + normalY * lateralOffset,
    heading: Math.atan2(selected.dy, selected.dx) * (180 / Math.PI),
  }
}

function stationAnchor(station: RouteStation): CoordinationPoint {
  const position = station.position
  if (Number.isFinite(position.x) && Number.isFinite(position.y)) return position
  return routePoseAt(props.scenario.contactLine.path, station.routeProgress)
}

const pathPoints = computed(() => props.scenario.contactLine.path
  .map((point) => `${point.x},${point.y}`)
  .join(' '))

const dronePose = computed(() => routePoseAt(
  props.scenario.contactLine.path,
  props.droneProgress,
  Math.max(-1.5, Math.min(1.5, props.droneLateralOffset)) * 28,
))

const robotPose = computed(() => routePoseAt(
  props.scenario.contactLine.path,
  props.robotProgress,
))

const completedDashArray = computed(() => {
  const completed = clamp01(props.droneProgress)
  return `${completed} ${Math.max(0.001, 1 - completed)}`
})

const missionStateLabels: Record<string, string> = {
  WAITING_FOR_ROBOT: '等待机器人',
  ASSIST_REQUESTED: '收到越障请求',
  ASSIST_PREPARING: '越障前准备',
  ASSIST_EXECUTING: '执行越障辅助',
  VERIFYING_ROBOT_CLEAR: '确认机器人通过',
  ACQUIRING_LINE: '重新捕获接触线',
  FOLLOWING_LINE: '沿接触线飞行',
  LINE_RECOVERY: '接触线恢复',
  APPROACHING_NEXT_OBSTACLE: '接近下一障碍点',
  SAFE_HOLD: '安全悬停',
  COMPLETED: '任务完成',
  ABORTED: '任务中止',
}

const missionStateLabel = computed(() => missionStateLabels[props.missionState]
  ?? props.missionState.replaceAll('_', ' '))

function buildCallout(
  obstacle: CoordinationObstacle,
  station: RouteStation,
  kind: ZoneCallout['kind'],
  shortLabel: string,
  label: string,
): ZoneCallout {
  const anchor = stationAnchor(station)
  const offsets: Record<ZoneCallout['kind'], CoordinationPoint> = {
    WAIT: { x: -28, y: -154 },
    PICKUP: { x: 0, y: -102 },
    RELEASE: { x: 28, y: -50 },
  }
  const offset = offsets[kind]
  return {
    key: `${obstacle.id}-${kind}`,
    kind,
    shortLabel,
    label,
    anchor,
    callout: {
      x: clampMapX(anchor.x + offset.x),
      y: clampMapY(anchor.y + offset.y),
    },
  }
}

const zoneCallouts = computed<ZoneCallout[]>(() => props.scenario.obstacles.flatMap((obstacle) => [
  buildCallout(obstacle, obstacle.wait, 'WAIT', '等', '等待区'),
  buildCallout(obstacle, obstacle.pickup, 'PICKUP', '取', '拾取区'),
  buildCallout(obstacle, obstacle.release, 'RELEASE', '放', '释放区'),
]))

const obstacleEntries = computed(() => props.scenario.obstacles.map((obstacle, index) => ({
  ...obstacle,
  displayId: obstacle.id || `O${index + 1}`,
  pose: routePoseAt(props.scenario.contactLine.path, obstacle.routeProgress),
  isCurrent: obstacle.id === props.currentObstacleId,
  isNext: obstacle.id === props.nextObstacleId,
  isPassed: props.robotProgress > obstacle.routeProgress + 0.005,
})))

const sceneDescription = computed(() => {
  const current = props.currentObstacleId ?? '无'
  const next = props.nextObstacleId ?? '无'
  return `无人机与机器人沿指定接触线协同运行。当前障碍 ${current}，下一障碍 ${next}，任务状态 ${missionStateLabel.value}。`
})
</script>

<template>
  <section class="coordination-map-shell">
    <header class="map-heading">
      <div>
        <h2>线路协同态势</h2>
        <p>{{ scenario.name }} · {{ scenario.contactLine.name }}</p>
      </div>
      <span class="mission-state" role="status">
        <i aria-hidden="true" />
        {{ missionStateLabel }}
      </span>
    </header>

    <div class="map-legend" aria-label="图例">
      <span><i class="legend-line is-complete" aria-hidden="true" />已飞路径</span>
      <span><i class="legend-line is-pending" aria-hidden="true" />待飞路径</span>
      <span><i class="legend-drone" aria-hidden="true" />无人机</span>
      <span><i class="legend-robot" aria-hidden="true" />机器人</span>
    </div>

    <div class="map-stage">
      <svg
        viewBox="0 0 1000 420"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        :aria-labelledby="`${titleId} ${descriptionId}`"
      >
        <title :id="titleId">接触线协同任务地图</title>
        <desc :id="descriptionId">{{ sceneDescription }}</desc>

        <rect class="map-ground" width="1000" height="420" />

        <g class="map-grid" aria-hidden="true">
          <line v-for="x in [100, 200, 300, 400, 500, 600, 700, 800, 900]" :key="`gx-${x}`" :x1="x" y1="24" :x2="x" y2="396" />
          <line v-for="y in [70, 140, 210, 280, 350]" :key="`gy-${y}`" x1="24" :y1="y" x2="976" :y2="y" />
        </g>

        <polyline class="corridor-boundary" :points="pathPoints" />
        <polyline class="safety-corridor" :points="pathPoints" />
        <polyline class="route-pending" :points="pathPoints" />
        <polyline
          class="route-complete"
          :points="pathPoints"
          pathLength="1"
          :stroke-dasharray="completedDashArray"
        />
        <polyline class="contact-wire" :points="pathPoints" />

        <g class="zones-layer">
          <g
            v-for="zone in zoneCallouts"
            :key="zone.key"
            class="zone-callout"
            :class="`is-${zone.kind.toLowerCase()}`"
          >
            <line
              class="zone-leader"
              :x1="zone.anchor.x"
              :y1="zone.anchor.y"
              :x2="zone.callout.x"
              :y2="zone.callout.y"
            />
            <circle class="station-pin" :cx="zone.anchor.x" :cy="zone.anchor.y" r="6" />
            <g :transform="`translate(${zone.callout.x} ${zone.callout.y})`">
              <circle v-if="zone.kind === 'PICKUP'" class="zone-shape" r="20" />
              <rect v-else-if="zone.kind === 'RELEASE'" class="zone-shape" x="-18" y="-18" width="36" height="36" rx="5" />
              <path v-else class="zone-shape" d="M 0 -21 L 18 -10 L 18 10 L 0 21 L -18 10 L -18 -10 Z" />
              <text class="zone-short-label" y="7" text-anchor="middle">{{ zone.shortLabel }}</text>
              <text class="zone-label" x="28" y="7">{{ zone.label }}</text>
            </g>
          </g>
        </g>

        <g class="obstacles-layer">
          <g
            v-for="obstacle in obstacleEntries"
            :key="obstacle.id"
            class="obstacle"
            :class="{
              'is-current': obstacle.isCurrent,
              'is-next': obstacle.isNext,
              'is-passed': obstacle.isPassed,
            }"
            :transform="`translate(${obstacle.pose.x} ${obstacle.pose.y}) rotate(${obstacle.pose.heading})`"
          >
            <line class="barrier-line" x1="0" y1="-25" x2="0" y2="25" />
            <line class="barrier-cap" x1="-14" y1="-18" x2="14" y2="-18" />
            <line class="barrier-cap" x1="-14" y1="18" x2="14" y2="18" />
            <path class="obstacle-node" d="M 0 -12 L 12 0 L 0 12 L -12 0 Z" />
            <g class="obstacle-label" :transform="`rotate(${-obstacle.pose.heading}) translate(0 52)`">
              <text text-anchor="middle">{{ obstacle.displayId }}</text>
              <text v-if="obstacle.isCurrent" class="obstacle-role" y="22" text-anchor="middle">当前</text>
              <text v-else-if="obstacle.isNext" class="obstacle-role" y="22" text-anchor="middle">下一处</text>
              <text v-else-if="obstacle.isPassed" class="obstacle-role" y="22" text-anchor="middle">已通过</text>
            </g>
          </g>
        </g>

        <g
          v-if="!droneCarryingRobot"
          class="robot vehicle-motion"
          :style="{
            transform: `translate(${robotPose.x}px, ${robotPose.y}px) rotate(${robotPose.heading}deg)`,
          }"
        >
          <rect class="robot-body" x="-22" y="-13" width="44" height="26" rx="5" />
          <line class="robot-clamp" x1="-18" y1="0" x2="18" y2="0" />
          <circle class="robot-wheel" cx="-13" cy="15" r="7" />
          <circle class="robot-wheel" cx="13" cy="15" r="7" />
          <g class="vehicle-label" :transform="`rotate(${-robotPose.heading}) translate(0 48)`">
            <rect x="-38" y="-14" width="76" height="28" rx="5" />
            <text y="7" text-anchor="middle">ROBOT</text>
          </g>
        </g>

        <g
          class="drone vehicle-motion"
          :class="{ 'is-carrying': droneCarryingRobot }"
          :style="{
            transform: `translate(${dronePose.x}px, ${dronePose.y}px) rotate(${dronePose.heading}deg)`,
          }"
        >
          <line class="drone-arm" x1="-22" y1="-22" x2="22" y2="22" />
          <line class="drone-arm" x1="22" y1="-22" x2="-22" y2="22" />
          <circle class="drone-rotor" cx="-25" cy="-25" r="9" />
          <circle class="drone-rotor" cx="25" cy="-25" r="9" />
          <circle class="drone-rotor" cx="-25" cy="25" r="9" />
          <circle class="drone-rotor" cx="25" cy="25" r="9" />
          <path class="drone-body" d="M 0 -13 L 15 0 L 0 13 L -15 0 Z" />
          <path class="drone-heading" d="M 18 -7 L 34 0 L 18 7 Z" />
          <g v-if="droneCarryingRobot" class="carried-robot" transform="translate(0 34)">
            <line x1="-8" y1="-18" x2="-8" y2="-8" />
            <line x1="8" y1="-18" x2="8" y2="-8" />
            <rect x="-17" y="-8" width="34" height="18" rx="4" />
          </g>
          <g class="vehicle-label" :transform="`rotate(${-dronePose.heading}) translate(0 -52)`">
            <rect x="-35" y="-14" width="70" height="28" rx="5" />
            <text y="7" text-anchor="middle">DRONE</text>
          </g>
        </g>

        <g class="map-readout" aria-hidden="true">
          <text x="36" y="42">MISSION {{ scenario.missionId }}</text>
          <text x="964" y="42" text-anchor="end">ROUTE 0.00 → 1.00</text>
        </g>
      </svg>
    </div>
  </section>
</template>

<style scoped>
/* Hallmark · component: coordination map · genre: modern-minimal · theme: Cobalt
 * states: display-only · current · next · passed · carrying · empty
 * contrast: token-locked · pre-emit critique: P5 H5 E5 S5 R5 V5
 */
.coordination-map-shell {
  display: grid;
  min-width: 0;
  overflow: clip;
  background: var(--color-surface);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-md);
}

.map-heading {
  display: flex;
  min-width: 0;
  align-items: stretch;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.map-heading > div {
  min-width: 0;
}

.map-heading h2,
.map-heading p {
  margin: 0;
}

.map-heading h2 {
  overflow-wrap: anywhere;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-style: normal;
  letter-spacing: -0.01em;
}

.map-heading p {
  margin-top: var(--space-2xs);
  overflow: hidden;
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-state {
  display: inline-flex;
  min-height: var(--control-height);
  max-width: 100%;
  align-items: center;
  gap: var(--space-xs);
  padding-inline: var(--space-sm);
  flex: 0 0 auto;
  overflow: hidden;
  color: var(--color-accent-hover);
  background: var(--color-accent-soft);
  border: var(--rule-thin) solid var(--color-accent);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-state i {
  width: 0.55rem;
  height: 0.55rem;
  flex: 0 0 auto;
  background: var(--color-accent);
  border: var(--rule-thin) solid var(--color-surface);
  transform: rotate(45deg);
}

.map-legend {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-xs) var(--space-md);
  padding: var(--space-xs) var(--space-md);
  color: var(--color-muted);
  background: var(--color-paper-2);
  border-bottom: var(--rule-thin) solid var(--color-rule);
  font-size: var(--text-xs);
}

.map-legend span {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-xs);
  white-space: nowrap;
}

.legend-line {
  width: 1.75rem;
  height: 0;
  flex: 0 0 auto;
  border-top: var(--rule-strong) solid var(--color-accent);
}

.legend-line.is-pending {
  border-top-color: var(--color-rule-strong);
  border-top-style: dashed;
}

.legend-drone,
.legend-robot {
  width: 0.85rem;
  height: 0.85rem;
  flex: 0 0 auto;
  border: var(--rule-strong) solid var(--color-accent);
}

.legend-drone {
  background: var(--color-accent-soft);
  transform: rotate(45deg);
}

.legend-robot {
  background: var(--color-surface-raised);
  border-color: var(--color-ink-2);
  border-radius: var(--radius-xs);
}

.map-stage {
  min-width: 0;
  overflow: clip;
  background: var(--color-paper-2);
}

.map-stage svg {
  display: block;
  width: 100%;
  height: auto;
  min-height: 13rem;
}

.map-ground {
  fill: var(--color-surface-raised);
}

.map-grid line {
  stroke: var(--color-rule);
  stroke-width: var(--rule-thin);
  vector-effect: non-scaling-stroke;
}

.safety-corridor,
.corridor-boundary,
.route-pending,
.route-complete,
.contact-wire {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.safety-corridor {
  stroke: var(--color-paper-3);
  stroke-width: 76;
}

.corridor-boundary {
  stroke: var(--color-rule-strong);
  stroke-width: 78;
  opacity: 0.46;
}

.route-pending {
  stroke: var(--color-rule-strong);
  stroke-width: 15;
  stroke-dasharray: 14 10;
}

.route-complete {
  stroke: var(--color-accent);
  stroke-width: 15;
}

.contact-wire {
  stroke: var(--color-ink-2);
  stroke-width: 4;
}

.zone-leader,
.station-pin,
.zone-shape,
.barrier-line,
.barrier-cap,
.obstacle-node,
.robot-body,
.robot-clamp,
.robot-wheel,
.drone-arm,
.drone-rotor,
.drone-body,
.drone-heading,
.carried-robot line,
.carried-robot rect {
  vector-effect: non-scaling-stroke;
}

.zone-leader {
  stroke: var(--color-rule-strong);
  stroke-width: var(--rule-thin);
  stroke-dasharray: 5 5;
}

.station-pin {
  fill: var(--color-surface-raised);
  stroke: var(--color-neutral);
  stroke-width: var(--rule-strong);
}

.zone-shape {
  fill: var(--color-surface-raised);
  stroke: var(--color-accent);
  stroke-width: var(--rule-strong);
}

.zone-callout.is-release .zone-shape,
.zone-callout.is-release .station-pin {
  stroke: var(--color-success);
}

.zone-callout.is-wait .zone-shape,
.zone-callout.is-wait .station-pin {
  stroke: var(--color-warning);
}

.zone-short-label,
.zone-label,
.obstacle-label text,
.vehicle-label text,
.map-readout text {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.zone-short-label {
  fill: var(--color-ink);
  font-size: 21px;
  font-weight: 700;
}

.zone-label {
  fill: var(--color-muted);
  font-size: 20px;
}

.barrier-line,
.barrier-cap {
  stroke: var(--color-danger);
  stroke-width: 4;
}

.barrier-cap {
  stroke-width: var(--rule-strong);
}

.obstacle-node {
  fill: var(--color-surface-raised);
  stroke: var(--color-danger);
  stroke-width: 3;
}

.obstacle-label text:first-child {
  fill: var(--color-ink);
  font-size: 24px;
  font-weight: 700;
}

.obstacle-role {
  fill: var(--color-muted);
  font-size: 18px;
}

.obstacle.is-current .obstacle-node {
  fill: var(--color-warning-soft);
  stroke: var(--color-warning);
  stroke-width: 5;
}

.obstacle.is-current .obstacle-role {
  fill: var(--color-warning);
  font-weight: 700;
}

.obstacle.is-next .obstacle-node {
  fill: var(--color-accent-soft);
  stroke: var(--color-accent);
}

.obstacle.is-next .barrier-line,
.obstacle.is-next .barrier-cap {
  stroke: var(--color-accent);
}

.obstacle.is-next .obstacle-role {
  fill: var(--color-accent-hover);
  font-weight: 700;
}

.obstacle.is-passed .obstacle-node {
  fill: var(--color-success-soft);
  stroke: var(--color-success);
}

.obstacle.is-passed .barrier-line,
.obstacle.is-passed .barrier-cap {
  stroke: var(--color-success);
}

.vehicle-motion {
  transform-box: view-box;
  transform-origin: 0 0;
  transition: transform var(--dur-short) var(--ease-out);
}

.robot-body {
  fill: var(--color-surface-raised);
  stroke: var(--color-ink-2);
  stroke-width: 3;
}

.robot-clamp {
  stroke: var(--color-accent);
  stroke-width: 3;
}

.robot-wheel {
  fill: var(--color-ink-2);
  stroke: var(--color-surface-raised);
  stroke-width: var(--rule-strong);
}

.drone-arm {
  stroke: var(--color-accent-hover);
  stroke-width: 4;
}

.drone-rotor {
  fill: var(--color-accent-soft);
  stroke: var(--color-accent);
  stroke-width: 3;
}

.drone-body,
.drone-heading {
  fill: var(--color-accent);
  stroke: var(--color-surface-raised);
  stroke-width: var(--rule-strong);
}

.carried-robot line,
.carried-robot rect {
  stroke: var(--color-warning);
  stroke-width: var(--rule-strong);
}

.carried-robot rect {
  fill: var(--color-warning-soft);
}

.vehicle-label rect {
  fill: var(--color-log-paper);
  stroke: var(--color-media-rule);
  stroke-width: var(--rule-thin);
  vector-effect: non-scaling-stroke;
}

.vehicle-label text {
  fill: var(--color-log-ink);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.drone.is-carrying .vehicle-label rect {
  stroke: var(--color-warning);
}

.map-readout text {
  fill: var(--color-muted);
  font-size: 18px;
  letter-spacing: 0.04em;
}

@media (min-width: 30rem) {
  .map-heading {
    align-items: center;
    flex-direction: row;
  }

  .mission-state {
    max-width: 48%;
  }
}

@media (min-width: 40rem) {
  .map-legend {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .map-stage svg {
    min-height: 18rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .vehicle-motion {
    transition: none;
  }
}
</style>
