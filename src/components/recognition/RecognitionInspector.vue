<script setup lang="ts">
import { computed } from 'vue'
import {
  Check,
  Delete,
  EditPen,
  Plus,
  RefreshLeft,
  Select,
  View,
} from '@element-plus/icons-vue'
import type {
  RecognitionEditorMode,
  RecognitionFrameResult,
  RecognitionSelection,
} from '@/types/recognition'

const props = defineProps<{
  result: RecognitionFrameResult | null
  selection: RecognitionSelection
  editorMode: RecognitionEditorMode
  showOverlay: boolean
  canUndo: boolean
}>()

const emit = defineEmits<{
  (event: 'select', selection: RecognitionSelection): void
  (event: 'update:editor-mode', mode: RecognitionEditorMode): void
  (event: 'update:show-overlay', value: boolean): void
  (event: 'delete-selection'): void
  (event: 'undo'): void
  (event: 'accept'): void
  (event: 'reject'): void
}>()

const selectedLine = computed(() => {
  if (!props.result || !props.selection) return null
  return props.result.polylines.find((line) => line.id === props.selection?.polylineId) ?? null
})

const selectionLabel = computed(() => {
  if (!props.selection) return '未选择'
  if (props.selection.kind === 'POINT') return '控制点'
  if (props.selection.kind === 'SEGMENT') return `第 ${props.selection.segmentIndex + 1} 段`
  return '整条折线'
})

const confidenceLabel = computed(() => {
  const confidence = selectedLine.value?.confidence
  return confidence === null || confidence === undefined ? '人工创建' : `${Math.round(confidence * 100)}%`
})

const statusLabels = {
  PENDING: '待复核',
  ACCEPTED: '已接受',
  REJECTED: '已驳回',
} as const
</script>

<template>
  <aside class="recognition-inspector" aria-labelledby="inspector-title">
    <header>
      <div>
        <h2 id="inspector-title">结果检查</h2>
        <p>{{ props.result ? `${props.result.polylines.length} 条候选线` : '等待识别结果' }}</p>
      </div>
      <EditPen aria-hidden="true" />
    </header>

    <section class="view-controls" aria-labelledby="view-controls-title">
      <h3 id="view-controls-title">显示</h3>
      <el-radio-group
        :model-value="props.showOverlay ? 'OVERLAY' : 'ORIGINAL'"
        aria-label="原图与识别叠加切换"
        @update:model-value="(value: string | number | boolean | undefined) => emit('update:show-overlay', value === 'OVERLAY')"
      >
        <el-radio-button value="ORIGINAL">原图</el-radio-button>
        <el-radio-button value="OVERLAY"><View />识别</el-radio-button>
      </el-radio-group>
    </section>

    <section class="edit-controls" aria-labelledby="edit-controls-title">
      <h3 id="edit-controls-title">校正工具</h3>
      <div class="tool-grid">
        <button
          type="button"
          :class="{ 'is-active': props.editorMode === 'SELECT' }"
          @click="emit('update:editor-mode', 'SELECT')"
        ><Select /><span>选择</span></button>
        <button
          type="button"
          :class="{ 'is-active': props.editorMode === 'ADD_POINT' }"
          :disabled="!props.result?.polylines.length"
          @click="emit('update:editor-mode', 'ADD_POINT')"
        ><Plus /><span>插点</span></button>
        <button
          type="button"
          :class="{ 'is-active': props.editorMode === 'ADD_SEGMENT' }"
          :disabled="!props.result"
          @click="emit('update:editor-mode', 'ADD_SEGMENT')"
        ><EditPen /><span>新建线段</span></button>
      </div>
      <div class="secondary-actions">
        <el-button :icon="RefreshLeft" :disabled="!props.canUndo" @click="emit('undo')">撤销</el-button>
        <el-button :icon="Delete" :disabled="!props.selection" @click="emit('delete-selection')">删除所选</el-button>
      </div>
      <p>插点：选中折线后点击目标位置。新建线段：依次点击起点与终点。Delete 可删除所选点、线段或整条线。</p>
    </section>

    <section v-if="props.result" class="line-list" aria-labelledby="line-list-title">
      <h3 id="line-list-title">候选线</h3>
      <button
        v-for="(line, index) in props.result.polylines"
        :key="line.id"
        type="button"
        :class="{ 'is-active': props.selection?.polylineId === line.id }"
        @click="emit('select', { kind: 'POLYLINE', polylineId: line.id })"
      >
        <span class="line-index tabular">{{ String(index + 1).padStart(2, '0') }}</span>
        <span><strong>{{ line.name }}</strong><small>{{ line.points.length }} 点 · {{ statusLabels[line.reviewStatus] }}</small></span>
        <i :class="`is-${line.reviewStatus.toLowerCase()}`" aria-hidden="true" />
      </button>
      <p v-if="props.result.polylines.length === 0" class="line-empty">当前帧没有候选线，可用“新建线段”手工补画。</p>
    </section>

    <section v-if="selectedLine" class="selection-record" aria-labelledby="selection-record-title">
      <h3 id="selection-record-title">当前选择</h3>
      <dl>
        <div><dt>对象</dt><dd>{{ selectionLabel }}</dd></div>
        <div><dt>线索分</dt><dd class="tabular">{{ confidenceLabel }}</dd></div>
        <div><dt>来源</dt><dd>{{ selectedLine.source === 'MANUAL' ? '人工创建' : '边缘基线' }}</dd></div>
        <div><dt>人工修改</dt><dd>{{ selectedLine.manuallyModified ? '是' : '否' }}</dd></div>
      </dl>
      <p v-if="selectedLine.confidence !== null">线索分只表示当前帧的边缘连续性，不代表接触线分类概率。</p>
      <div class="review-actions">
        <el-button type="success" :icon="Check" @click="emit('accept')">接受此线</el-button>
        <el-button type="danger" plain @click="emit('reject')">驳回此线</el-button>
      </div>
    </section>

    <section v-else class="inspector-empty">
      <strong>选择一条候选线</strong>
      <p>点选折线可查看分数与状态，点选控制点后可拖动或用方向键微调。</p>
    </section>
  </aside>
</template>

<style scoped>
.recognition-inspector {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--color-surface);
}

.recognition-inspector > header {
  display: flex;
  min-height: 4.25rem;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.recognition-inspector h2,
.recognition-inspector h3,
.recognition-inspector p,
.recognition-inspector dl { margin: 0; }
.recognition-inspector h2 { color: var(--color-ink); font-size: var(--text-base); }
.recognition-inspector header p { margin-top: var(--space-2xs); color: var(--color-muted); font-size: var(--text-xs); }
.recognition-inspector header > svg { width: 1.25rem; color: var(--color-accent); }

.view-controls,
.edit-controls,
.line-list,
.selection-record,
.inspector-empty {
  display: grid;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.recognition-inspector h3 {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.view-controls :deep(.el-radio-group) { width: 100%; }
.view-controls :deep(.el-radio-button) { flex: 1; }
.view-controls :deep(.el-radio-button__inner) { width: 100%; justify-content: center; gap: var(--space-xs); }
.view-controls :deep(svg) { width: 1rem; }

.tool-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-xs); }
.tool-grid button {
  display: grid;
  min-width: 0;
  min-height: 4.5rem;
  place-items: center;
  gap: var(--space-2xs);
  padding: var(--space-xs);
  color: var(--color-muted);
  background: var(--color-paper-2);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.tool-grid button svg { width: 1.1rem; }
.tool-grid button span { font-size: var(--text-xs); white-space: nowrap; }
.tool-grid button.is-active { color: var(--color-accent-hover); background: var(--color-accent-soft); border-color: var(--color-accent); }
.tool-grid button:disabled { cursor: not-allowed; opacity: 0.55; }
.tool-grid button:focus-visible { outline-offset: var(--space-2xs); }
.tool-grid button:not(:disabled):active,
.line-list > button:active { background: var(--color-accent-soft); border-color: var(--color-accent); }

.secondary-actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-xs); }
.secondary-actions :deep(.el-button) { margin: 0; }
.edit-controls > p,
.selection-record > p,
.inspector-empty p { color: var(--color-muted); font-size: var(--text-sm); line-height: 1.55; }

.line-list > button {
  display: grid;
  min-height: 3.5rem;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  color: var(--color-ink-2);
  background: transparent;
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-sm);
  text-align: left;
  cursor: pointer;
}
.line-list > button.is-active { background: var(--color-accent-soft); border-color: var(--color-accent); }
.line-index { color: var(--color-muted); font-family: var(--font-mono); font-size: var(--text-xs); }
.line-list button > span:nth-child(2) { display: grid; min-width: 0; gap: var(--space-2xs); }
.line-list strong { overflow: hidden; color: var(--color-ink); font-size: var(--text-sm); text-overflow: ellipsis; white-space: nowrap; }
.line-list small { color: var(--color-muted); font-size: var(--text-xs); }
.line-list i { width: 0.55rem; height: 0.55rem; background: var(--color-warning); border-radius: 50%; }
.line-list i.is-accepted { background: var(--color-success); }
.line-list i.is-rejected { background: var(--color-danger); }
.line-empty { color: var(--color-muted); font-size: var(--text-sm); line-height: 1.5; }

.selection-record dl { display: grid; gap: var(--space-xs); }
.selection-record dl div { display: flex; justify-content: space-between; gap: var(--space-sm); }
.selection-record dt { color: var(--color-muted); font-size: var(--text-xs); }
.selection-record dd { color: var(--color-ink-2); font-size: var(--text-xs); font-weight: 600; }
.review-actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-xs); }
.review-actions :deep(.el-button) { margin: 0; }

.inspector-empty strong { color: var(--color-ink-2); }

@media (hover: hover) and (pointer: fine) {
  .tool-grid button:not(:disabled):hover,
  .line-list > button:hover { background: var(--color-paper-2); }
}

@media (max-width: 40rem) {
  .recognition-inspector { overflow: visible; }
}
</style>
