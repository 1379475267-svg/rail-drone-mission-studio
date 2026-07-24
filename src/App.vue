<script setup lang="ts">
import { nextTick, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()

watch(
  () => [route.fullPath, route.meta.title],
  async () => {
    const pageTitle = typeof route.meta.title === 'string' ? route.meta.title : '工作区'
    document.title = `${pageTitle} · RailDrone Mission Studio`
    await nextTick()
    document.querySelector<HTMLElement>('[data-workspace-root]')?.focus({ preventScroll: true })
  },
  { immediate: true },
)
</script>

<template>
  <RouterView />
</template>
