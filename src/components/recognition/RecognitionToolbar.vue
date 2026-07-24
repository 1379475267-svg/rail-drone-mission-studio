<script setup lang="ts">
import {
  Aim,
  DataLine,
  Download,
  PictureFilled,
} from '@element-plus/icons-vue'
import type { RecognitionRunStatus } from '@/types/recognition'

const props = defineProps<{
  runStatus: RecognitionRunStatus
  readyLabel: string
  canRecognize: boolean
  canExport: boolean
}>()

const emit = defineEmits<{
  (event: 'recognize'): void
  (event: 'export-json'): void
  (event: 'export-png'): void
}>()

const statusLabels: Record<RecognitionRunStatus, string> = {
  IDLE: '等待素材',
  MEDIA_READY: '素材已就绪',
  RUNNING: '正在识别',
  READY: '结果待复核',
  ERROR: '需要处理',
}

function handleExportCommand(command: string): void {
  if (command === 'png') emit('export-png')
  else emit('export-json')
}
</script>

<template>
  <header class="recognition-toolbar">
    <RouterLink class="brand-lockup" to="/" aria-label="返回 RailDrone Mission Studio 任务编排">
      <span class="brand-mark" aria-hidden="true"><DataLine /></span>
      <span class="brand-copy">
        <strong>RailDrone</strong>
        <span>Mission Studio</span>
      </span>
    </RouterLink>

    <nav class="workspace-switcher" aria-label="工作区切换">
      <RouterLink to="/">任务编排</RouterLink>
      <RouterLink to="/recognition" aria-current="page">接触线识别</RouterLink>
      <RouterLink to="/coordination">协同闭环</RouterLink>
    </nav>

    <div class="recognition-actions">
      <span class="run-status" :class="`is-${props.runStatus.toLowerCase()}`" role="status">
        <i aria-hidden="true" />
        {{ props.runStatus === 'READY' ? props.readyLabel : statusLabels[props.runStatus] }}
      </span>

      <el-button
        type="primary"
        :icon="Aim"
        :loading="props.runStatus === 'RUNNING'"
        :disabled="!props.canRecognize || props.runStatus === 'RUNNING'"
        @click="emit('recognize')"
      >
        识别当前帧
      </el-button>

      <el-dropdown :disabled="!props.canExport" trigger="click" @command="handleExportCommand">
        <el-button :icon="Download" :disabled="!props.canExport">
          导出结果
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="json" :icon="Download">识别 JSON</el-dropdown-item>
            <el-dropdown-item command="png" :icon="PictureFilled">标注 PNG</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div class="rail-datum" aria-hidden="true"><span /><span /></div>
  </header>
</template>

<style scoped>
.recognition-toolbar {
  position: relative;
  z-index: var(--z-sticky);
  display: grid;
  min-height: 4.75rem;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-sm) var(--space-md) calc(var(--space-sm) + var(--space-2xs));
  background: var(--color-surface-raised);
  border-bottom: var(--rule-thin) solid var(--color-rule);
  box-shadow: 0 var(--space-2xs) var(--space-sm) var(--color-shadow);
}

.brand-lockup,
.brand-copy,
.workspace-switcher,
.recognition-actions,
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
  font-size: var(--text-md);
  letter-spacing: -0.035em;
}

.brand-copy span {
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
  min-height: var(--control-height);
  padding: var(--space-xs) var(--space-sm);
  color: var(--color-muted);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
}

.workspace-switcher a[aria-current='page'],
.workspace-switcher a.router-link-active {
  color: var(--color-accent-hover);
  background: var(--color-surface-raised);
  box-shadow: 0 0 0 var(--rule-thin) var(--color-rule);
}

.recognition-actions {
  justify-content: flex-end;
  gap: var(--space-xs);
  min-width: 0;
}

.recognition-actions :deep(.el-button + .el-button) { margin-left: 0; }

.run-status {
  min-height: 2rem;
  gap: var(--space-xs);
  margin-inline-end: var(--space-xs);
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: nowrap;
}

.run-status i {
  width: 0.5rem;
  height: 0.5rem;
  background: var(--color-neutral);
  border-radius: 50%;
}

.run-status.is-running i { background: var(--color-accent); }
.run-status.is-ready i { background: var(--color-warning); }
.run-status.is-error i { background: var(--color-danger); }
.run-status.is-media_ready i { background: var(--color-success); }

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
  height: var(--rule-thin);
  background: var(--color-rule);
}

.rail-datum span:first-child {
  width: 44%;
  background: var(--color-accent);
}

@media (max-width: 72rem) {
  .recognition-toolbar { grid-template-columns: auto 1fr; }
  .workspace-switcher { order: 3; grid-column: 1 / -1; justify-self: start; }
}

@media (max-width: 44rem) {
  .recognition-toolbar { gap: var(--space-sm); }
  .brand-copy { display: none; }
  .run-status { display: none; }
  .recognition-actions :deep(.el-button span) { display: none; }
  .workspace-switcher { width: 100%; overflow-x: auto; }
  .workspace-switcher a { flex: 1 0 auto; text-align: center; }
}
</style>
