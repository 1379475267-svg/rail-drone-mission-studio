<script setup lang="ts">
import type { DroneTelemetry } from '@/types/simulation'

defineProps<{
  telemetry: DroneTelemetry
  visible: boolean
}>()
</script>

<template>
  <g v-if="visible" class="vehicle-layer" aria-label="仿真无人机">
    <g
      class="drone-shadow"
      :style="{
        transform: `translate(${telemetry.position.x}px, ${telemetry.position.y + 11}px)`,
      }"
      aria-hidden="true"
    >
      <ellipse rx="22" ry="8" />
    </g>
    <g
      class="drone"
      :style="{ transform: `translate(${telemetry.position.x}px, ${telemetry.position.y}px)` }"
    >
      <circle class="drone-halo" r="24" />
      <path d="M -17 -13 L 17 13 M 17 -13 L -17 13" class="drone-arm" />
      <circle cx="-18" cy="-14" r="5" class="drone-rotor" />
      <circle cx="18" cy="-14" r="5" class="drone-rotor" />
      <circle cx="-18" cy="14" r="5" class="drone-rotor" />
      <circle cx="18" cy="14" r="5" class="drone-rotor" />
      <path d="M 0 -9 L 9 8 L 0 5 L -9 8 z" class="drone-body" />
      <circle cy="1" r="3" class="drone-sensor" />
    </g>
  </g>
</template>

<style scoped>
.drone,
.drone-shadow {
  pointer-events: none;
  transform-box: fill-box;
  transform-origin: center;
  transition: transform var(--dur-micro) linear;
}

.drone-shadow ellipse {
  fill: var(--color-shadow);
}

.drone-halo {
  fill: var(--color-accent-soft);
  stroke: var(--color-accent);
  stroke-width: var(--rule-thin);
  opacity: 0.82;
}

.drone-arm {
  fill: none;
  stroke: var(--color-ink);
  stroke-width: 4px;
  stroke-linecap: round;
}

.drone-rotor {
  fill: var(--color-surface-raised);
  stroke: var(--color-ink);
  stroke-width: 2px;
}

.drone-body {
  fill: var(--color-accent);
  stroke: var(--color-accent-ink);
  stroke-width: var(--rule-thin);
}

.drone-sensor {
  fill: var(--color-accent-ink);
}
</style>
