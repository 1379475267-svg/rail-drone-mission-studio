<script setup lang="ts">
import {
  DataLine,
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
    <RouterLink class="brand-lockup" to="/" aria-label="返回任务编排">
      <span class="brand-mark" aria-hidden="true"><DataLine /></span>
      <span class="brand-copy">
        <strong>RailDrone</strong>
        <span>Mission Studio</span>
      </span>
    </RouterLink>

    <nav class="workspace-switcher" aria-label="工作区切换">
      <RouterLink to="/">任务编排</RouterLink>
      <RouterLink to="/recognition">接触线识别</RouterLink>
      <RouterLink to="/coordination" aria-current="page">协同闭环</RouterLink>
    </nav>

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
  grid-template-columns: auto auto minmax(12rem, 1fr) auto;
  align-items: center;
  gap: var(--space-lg);
  min-width: 0;
  min-height: 4.75rem;
  padding: var(--space-sm) var(--space-md);
  color: var(--color-ink-2);
  background: var(--color-surface-raised);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.brand-lockup,
.brand-copy,
.workspace-switcher,
.mode-switcher,
.run-actions,
.run-status {
  display: flex;
  align-items: center;
}

.brand-lockup {
  min-height: var(--control-height);
  gap: var(--space-sm);
  color: inherit;
  text-decoration: none;
}

.brand-mark {
  display: grid;
  width: var(--control-height);
  height: var(--control-height);
  place-items: center;
  color: var(--color-accent-ink);
  background: var(--color-accent);
  border-radius: var(--radius-md);
}

.brand-mark :deep(svg) { width: 1.35rem; }

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
.control-label {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-switcher {
  gap: var(--space-2xs);
  padding: var(--space-2xs);
  background: var(--color-paper-2);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-md);
}

.workspace-switcher a {
  display: inline-flex;
  min-height: var(--control-height);
  align-items: center;
  padding: var(--space-xs) var(--space-sm);
  color: var(--color-muted);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.workspace-switcher a[aria-current='page'],
.workspace-switcher a.router-link-active {
  color: var(--color-accent-hover);
  background: var(--color-surface-raised);
  box-shadow: 0 0 0 var(--rule-thin) var(--color-rule);
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

@media (hover: hover) and (pointer: fine) {
  .workspace-switcher a:hover { color: var(--color-ink); }
}

@media (max-width: 90rem) {
  .coordination-toolbar {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .mode-switcher {
    order: 4;
    grid-column: 1 / -1;
    justify-self: start;
  }

  .run-status { display: none; }
}

@media (max-width: 64rem) {
  .coordination-toolbar { grid-template-columns: auto minmax(0, 1fr); }
  .workspace-switcher { justify-self: end; }
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
  .brand-lockup {
    grid-column: 1;
    justify-self: start;
  }
  .brand-copy { display: none; }
  .workspace-switcher {
    order: 2;
    grid-column: 1;
    width: 100%;
    overflow: hidden;
  }
  .workspace-switcher a {
    min-width: 0;
    flex: 1 1 0;
    justify-content: center;
    padding-inline: var(--space-xs);
    font-size: var(--text-xs);
  }
  .mode-switcher {
    order: 3;
    grid-column: 1;
    width: 100%;
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .mode-switcher :deep(.el-radio-group) { display: grid; width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mode-switcher :deep(.el-radio-button__inner) { width: 100%; }
  .run-actions {
    order: 4;
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

@media (pointer: coarse) {
  .workspace-switcher a { min-height: 2.75rem; }
}
</style>
