<script setup lang="ts">
import { computed } from 'vue'
import type { DroneWaypoint } from '@/types/scene'
import type { SimulationStatus } from '@/types/simulation'

interface RouteSegment {
  id: string
  index: number
  start: DroneWaypoint
  end: DroneWaypoint
  state: 'completed' | 'current' | 'pending'
}

const props = defineProps<{
  waypoints: DroneWaypoint[]
  currentSegmentIndex: number
  status: SimulationStatus
}>()

const segments = computed<RouteSegment[]>(() =>
  props.waypoints.slice(0, -1).map((waypoint, index) => {
    let state: RouteSegment['state'] = 'pending'
    if (props.status === 'COMPLETED' || index < props.currentSegmentIndex) state = 'completed'
    if (
      (props.status === 'RUNNING' || props.status === 'PAUSED') &&
      index === props.currentSegmentIndex
    ) {
      state = 'current'
    }
    return {
      id: `${waypoint.id}-${props.waypoints[index + 1]?.id ?? index}`,
      index,
      start: waypoint,
      end: props.waypoints[index + 1]!,
      state,
    }
  }),
)
</script>

<template>
  <g class="drone-route-layer" aria-label="无人机航线">
    <defs>
      <marker
        id="route-arrow-pending"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" class="arrow-pending" />
      </marker>
      <marker
        id="route-arrow-current"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" class="arrow-current" />
      </marker>
      <marker
        id="route-arrow-completed"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" class="arrow-completed" />
      </marker>
    </defs>

    <line
      v-for="segment in segments"
      :key="segment.id"
      :x1="segment.start.position.x"
      :y1="segment.start.position.y"
      :x2="segment.end.position.x"
      :y2="segment.end.position.y"
      class="route-segment"
      :class="`is-${segment.state}`"
      :marker-end="`url(#route-arrow-${segment.state})`"
      vector-effect="non-scaling-stroke"
    />
  </g>
</template>

<style scoped>
.route-segment {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition:
    stroke var(--dur-short) var(--ease-out),
    stroke-width var(--dur-short) var(--ease-out),
    opacity var(--dur-short) var(--ease-out);
}

.route-segment.is-pending {
  stroke: var(--color-rule-strong);
  stroke-width: 2.5px;
}

.route-segment.is-completed {
  stroke: var(--color-success);
  stroke-width: 3px;
  opacity: 0.72;
}

.route-segment.is-current {
  stroke: var(--color-accent);
  stroke-width: 6px;
}

.arrow-pending {
  fill: var(--color-rule-strong);
}

.arrow-current {
  fill: var(--color-accent);
}

.arrow-completed {
  fill: var(--color-success);
}
</style>
