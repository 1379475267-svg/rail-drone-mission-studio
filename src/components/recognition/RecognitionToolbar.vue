<script setup lang="ts">
import {
  Aim,
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
    <div class="workspace-context">
      <span>视觉复核台</span>
      <strong>接触线识别</strong>
    </div>

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
  grid-template-columns: minmax(12rem, 1fr) auto;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-sm) var(--space-md) calc(var(--space-sm) + var(--space-2xs));
  background: var(--color-surface-raised);
  border-bottom: var(--rule-thin) solid var(--color-rule);
  box-shadow: 0 var(--space-2xs) var(--space-sm) var(--color-shadow);
}

.workspace-context,
.recognition-actions,
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
  font-size: var(--text-md);
  letter-spacing: -0.035em;
}

.workspace-context span {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
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

@media (max-width: 44rem) {
  .recognition-toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-sm);
  }
  .workspace-context span { display: none; }
  .run-status { display: none; }
  .recognition-actions :deep(.el-button span) { display: none; }
}
</style>
