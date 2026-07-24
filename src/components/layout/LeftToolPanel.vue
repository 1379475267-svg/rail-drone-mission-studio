<script setup lang="ts">
import {
  Aim,
  CloseBold,
  Crop,
  Flag,
  Location,
  MapLocation,
  MostlyCloudy,
  Orange,
  Pointer,
  Position,
  SetUp,
  Warning,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'
import type { EditorTool } from '@/types/scene'

interface ToolItem {
  id: EditorTool
  label: string
  hint: string
  icon: Component
  enabled: boolean
}

const props = defineProps<{
  activeTool: EditorTool
  hasSelection: boolean
  editingLocked: boolean
}>()

const emit = defineEmits<{
  (event: 'select-tool', tool: EditorTool): void
  (event: 'delete-selected'): void
}>()

const tools: ToolItem[] = [
  { id: 'SELECT', label: '选择', hint: '选择和拖动航点', icon: Pointer, enabled: true },
  { id: 'DRONE_WAYPOINT', label: '无人机航点', hint: '在画布上连续添加航点', icon: Position, enabled: true },
  { id: 'CONTACT_LINE', label: '接触线', hint: '后续阶段', icon: SetUp, enabled: false },
  { id: 'POLE', label: '支柱', hint: '后续阶段', icon: Orange, enabled: false },
  { id: 'OBSTACLE', label: '障碍物', hint: '后续阶段', icon: Warning, enabled: false },
  { id: 'INSPECTION_POINT', label: '检查点', hint: '后续阶段', icon: Aim, enabled: false },
  { id: 'ROBOT_START', label: '机器人起点', hint: '后续阶段', icon: Flag, enabled: false },
  { id: 'ROBOT_END', label: '机器人终点', hint: '后续阶段', icon: MapLocation, enabled: false },
  { id: 'NO_FLY_ZONE', label: '禁飞区', hint: '后续阶段', icon: Crop, enabled: false },
]

const selectTool = (tool: ToolItem) => {
  if (!tool.enabled || props.editingLocked) return
  emit('select-tool', tool.id)
}
</script>

<template>
  <aside class="tool-panel" aria-label="场景工具">
    <div class="panel-heading">
      <div>
        <h2>场景工具</h2>
        <p>编辑对象</p>
      </div>
    </div>

    <div class="tool-list">
      <el-tooltip
        v-for="tool in tools"
        :key="tool.id"
        :content="tool.enabled ? tool.hint : `${tool.label} · 后续阶段`"
        placement="right"
        :show-after="800"
      >
        <button
          class="tool-button"
          :class="{
            'is-active': props.activeTool === tool.id,
            'is-disabled': !tool.enabled || props.editingLocked,
          }"
          type="button"
          :aria-pressed="props.activeTool === tool.id"
          :aria-label="tool.enabled ? tool.label : `${tool.label}，后续阶段`"
          :disabled="!tool.enabled || props.editingLocked"
          @click="selectTool(tool)"
        >
          <el-icon><component :is="tool.icon" /></el-icon>
          <span class="tool-copy">
            <strong>{{ tool.label }}</strong>
            <small>{{ tool.hint }}</small>
          </span>
          <span v-if="!tool.enabled" class="phase-badge">P2</span>
        </button>
      </el-tooltip>
    </div>

    <div class="tool-panel-footer">
      <button
        class="delete-button"
        type="button"
        aria-label="删除选中对象"
        :disabled="!props.hasSelection || props.editingLocked"
        @click="emit('delete-selected')"
      >
        <el-icon><CloseBold /></el-icon>
        <span>删除对象</span>
        <kbd>Del</kbd>
      </button>
      <div class="canvas-key">
        <MostlyCloudy />
        <span>Esc 返回选择</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.tool-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--color-surface);
  border-right: var(--rule-thin) solid var(--color-rule);
}

.panel-heading {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.panel-heading h2,
.panel-heading p {
  margin: 0;
}

.panel-heading h2 {
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-base);
}

.panel-heading p {
  color: var(--color-muted);
  font-size: var(--text-xs);
}

.tool-list {
  display: grid;
  align-content: start;
  gap: var(--space-2xs);
  padding: var(--space-sm);
  overflow-y: auto;
}

.tool-button,
.delete-button {
  display: grid;
  width: 100%;
  align-items: center;
  border: var(--rule-thin) solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
}

.tool-button {
  grid-template-columns: 1.6rem 1fr auto;
  gap: var(--space-xs);
  min-height: 3.25rem;
  padding: var(--space-xs);
  color: var(--color-ink-2);
  background: transparent;
  transition:
    background-color var(--dur-short) var(--ease-out),
    border-color var(--dur-short) var(--ease-out),
    color var(--dur-short) var(--ease-out);
}

.tool-button .el-icon {
  font-size: var(--text-md);
}

.tool-button.is-active {
  color: var(--color-accent-hover);
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
}

.tool-button.is-disabled {
  color: var(--color-muted);
  cursor: not-allowed;
  opacity: 0.58;
}

.tool-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.tool-copy strong {
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-copy small {
  overflow: hidden;
  color: var(--color-muted);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.phase-badge {
  padding: var(--space-3xs) var(--space-2xs);
  color: var(--color-neutral);
  background: var(--color-paper-3);
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.tool-panel-footer {
  display: grid;
  gap: var(--space-sm);
  padding: var(--space-sm);
  margin-top: auto;
  border-top: var(--rule-thin) solid var(--color-rule);
}

.delete-button {
  grid-template-columns: auto 1fr auto;
  gap: var(--space-xs);
  min-height: var(--control-height);
  padding: var(--space-xs) var(--space-sm);
  color: var(--color-danger);
  background: var(--color-danger-soft);
  border-color: var(--color-danger-soft);
}

.delete-button:disabled {
  color: var(--color-muted);
  background: var(--color-paper-2);
  cursor: not-allowed;
}

.tool-button:not(:disabled):active,
.delete-button:not(:disabled):active {
  transform: translateY(var(--rule-thin));
}

kbd {
  padding: var(--space-3xs) var(--space-2xs);
  color: var(--color-neutral);
  background: var(--color-surface-raised);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.canvas-key {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--color-muted);
  font-size: var(--text-xs);
}

.canvas-key svg {
  width: 1rem;
}

@media (hover: hover) and (pointer: fine) {
  .tool-button:not(.is-disabled):hover {
    color: var(--color-accent-hover);
    background: var(--color-paper-2);
  }
}

@media (max-width: 68rem) {
  .panel-heading {
    justify-content: center;
    padding-inline: var(--space-xs);
  }

  .panel-heading > div,
  .tool-copy,
  .phase-badge,
  .delete-button span,
  .delete-button kbd,
  .canvas-key span {
    display: none;
  }

  .tool-button {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .delete-button {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .canvas-key {
    justify-content: center;
  }
}
</style>
