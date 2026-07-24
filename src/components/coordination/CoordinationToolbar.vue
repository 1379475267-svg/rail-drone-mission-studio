<script setup lang="ts">
import {
  Download,
  Refresh,
  SwitchButton,
  VideoPause,
  VideoPlay,
} from '@element-plus/icons-vue'

type CoordinationMode = 'VIRTUAL_CLOSED_LOOP' | 'VIDEO_SHADOW'

const props = defineProps<{
  mode: CoordinationMode
  runStatus: string
  missionState: string
  canStart: boolean
  canPause: boolean
  canStep: boolean
  canExport: boolean
  emergencyActive: boolean
}>()

const emit = defineEmits<{
  (event: 'update:mode', value: CoordinationMode): void
  (event: 'start'): void
  (event: 'pause'): void
  (event: 'step'): void
  (event: 'reset'): void
  (event: 'export'): void
  (event: 'emergency'): void
}>()

const runStatusLabels: Record<string, string> = {
  IDLE: '等待启动',
  RUNNING: '任务运行中',
  PAUSED: '任务已暂停',
  COMPLETED: '任务已完成',
  SAFE_HOLD: '安全悬停',
  ABORTED: '任务已终止',
}
</script>

<template>
  <header class="coordination-toolbar">
    <div class="workspace-context">
      <span>协同运行台</span>
      <strong>机器人—无人机协同闭环</strong>
    </div>

    <div class="mode-switcher">
      <span class="control-label">运行模式</span>
      <el-radio-group
        :model-value="props.mode"
        aria-label="运行模式"
        @update:model-value="emit('update:mode', $event as CoordinationMode)"
      >
        <el-radio-button value="VIRTUAL_CLOSED_LOOP">虚拟闭环</el-radio-button>
        <el-radio-button value="VIDEO_SHADOW">视频影子</el-radio-button>
      </el-radio-group>
    </div>

    <div class="run-actions">
      <span
        class="run-status"
        :class="`is-${props.runStatus.toLowerCase()}`"
        role="status"
        aria-live="polite"
      >
        <i aria-hidden="true" />
        {{ runStatusLabels[props.runStatus] ?? props.missionState }}
      </span>

      <el-button
        type="primary"
        :icon="VideoPlay"
        :disabled="!props.canStart"
        @click="emit('start')"
      >
        {{ props.runStatus === 'PAUSED' ? '继续' : '启动' }}
      </el-button>
      <el-button :icon="VideoPause" :disabled="!props.canPause" @click="emit('pause')">
        暂停
      </el-button>
      <el-button :disabled="!props.canStep" @click="emit('step')">单步</el-button>
      <el-button :icon="Refresh" @click="emit('reset')">重置</el-button>
      <el-button :icon="Download" :disabled="!props.canExport" @click="emit('export')">
        导出
      </el-button>
      <el-button
        type="danger"
        :plain="!props.emergencyActive"
        :icon="SwitchButton"
        :disabled="props.emergencyActive"
        :aria-pressed="props.emergencyActive"
        @click="emit('emergency')"
      >
        {{ props.emergencyActive ? '急停已触发' : '紧急停止' }}
      </el-button>
    </div>
  </header>
</template>

<style scoped>
/* Hallmark · component: N1b application toolbar · genre: modern-minimal · theme: Cobalt
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pending final browser verification
 */
.coordination-toolbar {
  position: relative;
  z-index: var(--z-sticky);
  display: grid;
  grid-template-columns: minmax(13rem, 1fr) auto auto;
  align-items: center;
  gap: var(--space-lg);
  min-width: 0;
  min-height: 4.75rem;
  padding: var(--space-sm) var(--space-md);
  color: var(--color-ink-2);
  background: var(--color-surface-raised);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.workspace-context,
.mode-switcher,
.run-actions,
.run-status {
  display: flex;
  align-items: center;
}

.workspace-context {
  align-items: flex-start;
  flex-direction: column;
  gap: var(--space-3xs);
  line-height: 1.1;
}

.workspace-context strong {
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-md);
  letter-spacing: -0.035em;
}

.workspace-context span,
.control-label {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.mode-switcher {
  justify-self: end;
  gap: var(--space-sm);
  min-width: 0;
}

.mode-switcher :deep(.el-radio-button__inner) {
  padding-inline: var(--space-sm);
}

.run-actions {
  justify-content: flex-end;
  gap: var(--space-xs);
  min-width: 0;
}

.run-actions :deep(.el-button + .el-button) { margin-left: 0; }

.run-status {
  min-height: var(--control-height);
  gap: var(--space-xs);
  margin-inline-end: var(--space-2xs);
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: nowrap;
}

.run-status i {
  width: var(--space-xs);
  height: var(--space-xs);
  background: var(--color-neutral);
  border-radius: 50%;
}

.run-status.is-running i { background: var(--color-success); }
.run-status.is-paused i { background: var(--color-warning); }
.run-status.is-safe_hold i,
.run-status.is-aborted i { background: var(--color-danger); }
.run-status.is-completed i { background: var(--color-accent); }

@media (max-width: 90rem) {
  .coordination-toolbar {
    grid-template-columns: minmax(12rem, 1fr) auto;
  }

  .mode-switcher {
    order: 4;
    grid-column: 1 / -1;
    justify-self: start;
  }

  .run-status { display: none; }
}

@media (max-width: 64rem) {
  .coordination-toolbar { grid-template-columns: minmax(0, 1fr) auto; }
  .run-actions {
    order: 4;
    grid-column: 1 / -1;
    justify-content: flex-start;
    overflow-x: auto;
    padding-block-end: var(--space-2xs);
  }
}

@media (max-width: 44rem) {
  .coordination-toolbar {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-sm);
  }
  .workspace-context {
    grid-column: 1;
    justify-self: start;
  }
  .workspace-context span { display: none; }
  .mode-switcher {
    order: 2;
    grid-column: 1;
    width: 100%;
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .mode-switcher :deep(.el-radio-group) { display: grid; width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mode-switcher :deep(.el-radio-button__inner) { width: 100%; }
  .run-actions {
    order: 3;
    grid-column: 1;
    display: grid;
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: visible;
    padding-block-end: 0;
  }
  .run-actions :deep(.el-button) {
    width: 100%;
    min-width: 0;
    padding-inline: var(--space-xs);
  }
}

</style>
