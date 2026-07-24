<script setup lang="ts">
import {
  Aim,
  DataLine,
  Delete,
  Download,
  FolderAdd,
  FolderOpened,
  RefreshLeft,
  RefreshRight,
  Upload,
  VideoPause,
  VideoPlay,
} from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import type { SimulationStatus } from '@/types/simulation'

const router = useRouter()

const props = defineProps<{
  projectName: string
  simulationStatus: SimulationStatus
  hasWaypoints: boolean
}>()

const emit = defineEmits<{
  (event: 'update:projectName', value: string): void
  (event: 'new'): void
  (event: 'save'): void
  (event: 'import'): void
  (event: 'export'): void
  (event: 'start'): void
  (event: 'pause'): void
  (event: 'resume'): void
  (event: 'reset'): void
}>()

const updateName = (value: string) => {
  emit('update:projectName', value.trimStart())
}
</script>

<template>
  <header class="top-toolbar">
    <div class="brand-lockup" aria-label="RailDrone Mission Studio">
      <span class="brand-mark" aria-hidden="true">
        <DataLine />
      </span>
      <div class="brand-copy">
        <strong>RailDrone</strong>
        <span>Mission Studio</span>
      </div>
    </div>

    <div class="project-identity">
      <span class="project-kicker">当前任务</span>
      <el-input
        :model-value="props.projectName"
        aria-label="项目名称"
        maxlength="48"
        @update:model-value="updateName"
      />
    </div>

    <nav class="toolbar-actions" aria-label="项目操作">
      <el-tooltip content="新建项目" placement="bottom" :show-after="800">
        <el-button :icon="FolderAdd" aria-label="新建项目" @click="emit('new')" />
      </el-tooltip>
      <el-tooltip content="保存到本机" placement="bottom" :show-after="800">
        <el-button :icon="FolderOpened" aria-label="保存项目" @click="emit('save')" />
      </el-tooltip>
      <el-tooltip content="导入 JSON" placement="bottom" :show-after="800">
        <el-button :icon="Upload" aria-label="导入 JSON" @click="emit('import')" />
      </el-tooltip>
      <el-tooltip content="导出 JSON" placement="bottom" :show-after="800">
        <el-button :icon="Download" aria-label="导出 JSON" @click="emit('export')" />
      </el-tooltip>

      <el-tooltip content="打开接触线识别工作台" placement="bottom" :show-after="800">
        <el-button :icon="Aim" aria-label="接触线识别" @click="router.push('/recognition')">
          识别
        </el-button>
      </el-tooltip>

      <el-tooltip content="打开机器人与无人机协同闭环 Demo" placement="bottom" :show-after="800">
        <el-button :icon="DataLine" aria-label="协同闭环" @click="router.push('/coordination')">
          协同
        </el-button>
      </el-tooltip>

      <span class="toolbar-divider" aria-hidden="true" />

      <el-tooltip content="撤销将在后续阶段提供" placement="bottom" :show-after="800">
        <el-button :icon="RefreshLeft" aria-label="撤销，后续阶段" disabled />
      </el-tooltip>
      <el-tooltip content="重做将在后续阶段提供" placement="bottom" :show-after="800">
        <el-button :icon="RefreshRight" aria-label="重做，后续阶段" disabled />
      </el-tooltip>

      <span class="toolbar-divider" aria-hidden="true" />

      <el-button
        v-if="props.simulationStatus === 'PAUSED'"
        type="primary"
        :icon="VideoPlay"
        aria-label="继续"
        :disabled="!props.hasWaypoints"
        @click="emit('resume')"
      >
        继续
      </el-button>
      <el-button
        v-else
        type="primary"
        :icon="VideoPlay"
        aria-label="开始"
        :disabled="!props.hasWaypoints || props.simulationStatus === 'RUNNING'"
        @click="emit('start')"
      >
        开始
      </el-button>
      <el-button
        :icon="VideoPause"
        aria-label="暂停"
        :disabled="props.simulationStatus !== 'RUNNING'"
        @click="emit('pause')"
      >
        暂停
      </el-button>
      <el-button
        :icon="Delete"
        aria-label="重置"
        :disabled="props.simulationStatus === 'IDLE'"
        @click="emit('reset')"
      >
        重置
      </el-button>
    </nav>

    <div class="rail-datum" aria-hidden="true">
      <span />
      <span />
    </div>
  </header>
</template>

<style scoped>
.top-toolbar {
  position: relative;
  z-index: var(--z-sticky);
  display: grid;
  grid-template-columns: auto minmax(12rem, 20rem) 1fr;
  align-items: center;
  gap: var(--space-lg);
  min-height: 4.75rem;
  padding: var(--space-sm) var(--space-md) calc(var(--space-sm) + var(--space-2xs));
  background: var(--color-surface-raised);
  border-bottom: var(--rule-thin) solid var(--color-rule);
  box-shadow: 0 var(--space-2xs) var(--space-sm) var(--color-shadow);
}

.brand-lockup,
.brand-copy,
.project-identity,
.toolbar-actions {
  display: flex;
  align-items: center;
}

.brand-lockup {
  gap: var(--space-sm);
  min-width: max-content;
}

.brand-mark {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  color: var(--color-accent-ink);
  background: var(--color-accent);
  border-radius: var(--radius-md);
}

.brand-mark :deep(svg) {
  width: 1.35rem;
}

.brand-copy {
  align-items: flex-start;
  flex-direction: column;
  line-height: 1.05;
}

.brand-copy strong {
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-md);
  letter-spacing: -0.035em;
}

.brand-copy span,
.project-kicker {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.project-identity {
  gap: var(--space-sm);
  min-width: 0;
}

.project-kicker {
  flex: 0 0 auto;
}

.project-identity :deep(.el-input__wrapper) {
  background: var(--color-paper-2);
  box-shadow: 0 0 0 var(--rule-thin) var(--color-rule) inset;
}

.project-identity :deep(.el-input__inner) {
  color: var(--color-ink);
  font-weight: 600;
}

.toolbar-actions {
  justify-content: flex-end;
  gap: var(--space-xs);
  min-width: 0;
}

.toolbar-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.toolbar-divider {
  width: var(--rule-thin);
  height: 1.75rem;
  margin: 0 var(--space-2xs);
  background: var(--color-rule);
}

.rail-datum {
  position: absolute;
  right: var(--space-md);
  bottom: var(--space-2xs);
  left: var(--space-md);
  display: grid;
  gap: var(--space-3xs);
  pointer-events: none;
}

.rail-datum span {
  display: block;
  height: var(--rule-thin);
  background: var(--color-rule);
}

.rail-datum span:first-child {
  width: 32%;
  background: var(--color-accent);
}

@media (max-width: 78rem) {
  .top-toolbar {
    grid-template-columns: auto minmax(10rem, 16rem) 1fr;
    gap: var(--space-sm);
  }

  .toolbar-actions :deep(.el-button span) {
    display: none;
  }
}

@media (max-width: 54rem) {
  .top-toolbar {
    grid-template-columns: auto 1fr;
  }

  .project-identity {
    order: 3;
    grid-column: 1 / -1;
  }

  .toolbar-actions {
    overflow-x: auto;
  }
}
</style>
