<script setup lang="ts">
withDefaults(
  defineProps<{
    width?: number
    height?: number
    gridSize?: number
  }>(),
  {
    width: 1200,
    height: 720,
    gridSize: 40,
  },
)
</script>

<template>
  <g class="scene-grid" aria-hidden="true" pointer-events="none">
    <defs>
      <pattern
        id="minor-grid"
        :width="gridSize"
        :height="gridSize"
        patternUnits="userSpaceOnUse"
      >
        <path :d="`M ${gridSize} 0 L 0 0 0 ${gridSize}`" class="minor-line" />
      </pattern>
      <pattern
        id="major-grid"
        :width="gridSize * 5"
        :height="gridSize * 5"
        patternUnits="userSpaceOnUse"
      >
        <rect :width="gridSize * 5" :height="gridSize * 5" fill="url(#minor-grid)" />
        <path :d="`M ${gridSize * 5} 0 L 0 0 0 ${gridSize * 5}`" class="major-line" />
      </pattern>
    </defs>
    <rect :width="width" :height="height" fill="url(#major-grid)" />
  </g>
</template>

<style scoped>
.minor-line,
.major-line {
  fill: none;
  vector-effect: non-scaling-stroke;
}

.minor-line {
  stroke: var(--color-rule);
  stroke-width: var(--rule-thin);
  opacity: 0.55;
}

.major-line {
  stroke: var(--color-rule-strong);
  stroke-width: var(--rule-thin);
  opacity: 0.65;
}
</style>
