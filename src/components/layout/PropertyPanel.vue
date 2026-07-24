<script setup lang="ts">
import { InfoFilled, Operation, Position } from '@element-plus/icons-vue'
import type { MissionProject } from '@/types/project'
import type { DroneWaypoint } from '@/types/scene'
import type { SimulationStatus } from '@/types/simulation'
import WaypointProperties from '@/components/properties/WaypointProperties.vue'

const props = defineProps<{
  project: MissionProject
  selectedWaypoint: DroneWaypoint | null
  simulationStatus: SimulationStatus
  editingLocked: boolean
}>()

const emit = defineEmits<{
  (event: 'update-waypoint', id: string, patch: Partial<DroneWaypoint>): void
  (event: 'delete-waypoint', id: string): void
}>()

const statusLabels: Record<SimulationStatus, string> = {
  IDLE: '待命',
  RUNNING: '运行中',
  PAUSED: '已暂停',
  COMPLETED: '已完成',
  ERROR: '异常',
}
</script>

<template>
  <aside class="property-panel" aria-label="对象属性">
    <div class="panel-heading">
      <div>
        <h2>属性</h2>
        <p>{{ props.selectedWaypoint ? '编辑选中航点' : '任务概览' }}</p>
      </div>
    </div>

    <div class="property-content">
      <WaypointProperties
        v-if="props.selectedWaypoint"
        :waypoint="props.selectedWaypoint"
        :disabled="props.editingLocked"
        @update="emit('update-waypoint', props.selectedWaypoint.id, $event)"
        @delete="emit('delete-waypoint', props.selectedWaypoint.id)"
      />

      <template v-else>
        <section class="project-summary" aria-labelledby="project-summary-title">
          <span class="summary-icon"><Operation /></span>
          <h3 id="project-summary-title">{{ props.project.name }}</h3>
          <span class="status-chip" :data-status="props.simulationStatus">
            {{ statusLabels[props.simulationStatus] }}
          </span>
        </section>

        <dl class="summary-metrics">
          <div>
            <dt>无人机航点</dt>
            <dd>{{ props.project.droneWaypoints.length }}</dd>
          </div>
          <div>
            <dt>场景对象</dt>
            <dd>
              {{
                props.project.poles.length +
                props.project.contactLines.length +
                props.project.obstacles.length +
                props.project.inspectionPoints.length +
                props.project.droneWaypoints.length +
                props.project.noFlyZones.length
              }}
            </dd>
          </div>
          <div>
            <dt>任务节点</dt>
            <dd>{{ props.project.missionNodes.length }}</dd>
          </div>
          <div>
            <dt>项目版本</dt>
            <dd class="version">v{{ props.project.version }}</dd>
          </div>
        </dl>

        <section class="quick-guide">
          <div class="guide-heading">
            <InfoFilled />
            <h3>开始规划</h3>
          </div>
          <ol>
            <li><span>1</span>选择左侧“无人机航点”</li>
            <li><span>2</span>在画布上点击并连接航线</li>
            <li><span>3</span>选中航点后在这里调整参数</li>
          </ol>
        </section>

        <div v-if="props.editingLocked" class="editing-lock" role="status">
          <Position />
          <span>仿真运行时航线编辑已锁定</span>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.property-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--color-surface);
  border-left: var(--rule-thin) solid var(--color-rule);
}

.panel-heading {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-height: 4.25rem;
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

.property-content {
  display: grid;
  align-content: start;
  grid-auto-rows: max-content;
  gap: var(--space-md);
  padding: var(--space-md);
  overflow-y: auto;
}

.project-summary {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--color-paper-2);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-md);
}

.summary-icon {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  color: var(--color-accent);
  background: var(--color-accent-soft);
  border-radius: var(--radius-sm);
}

.summary-icon svg {
  width: 1.3rem;
}

.project-summary h3 {
  margin: 0;
}

.project-summary h3 {
  align-self: center;
  overflow: hidden;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-base);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-chip {
  padding: var(--space-2xs) var(--space-xs);
  color: var(--color-neutral);
  background: var(--color-surface-raised);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-lg);
  font-size: var(--text-xs);
}

.status-chip[data-status='RUNNING'],
.status-chip[data-status='COMPLETED'] {
  color: var(--color-success);
  background: var(--color-success-soft);
}

.status-chip[data-status='ERROR'] {
  color: var(--color-danger);
  background: var(--color-danger-soft);
}

.summary-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--rule-thin);
  padding: var(--rule-thin);
  margin: 0;
  overflow: hidden;
  background: var(--color-rule);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-md);
}

.summary-metrics div {
  display: flex;
  min-height: 5.5rem;
  flex-direction: column;
  justify-content: space-between;
  padding: var(--space-sm);
  background: var(--color-surface-raised);
}

.summary-metrics dt {
  color: var(--color-muted);
  font-size: var(--text-xs);
}

.summary-metrics dd {
  margin: 0;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
}

.summary-metrics .version {
  font-family: var(--font-mono);
  font-size: var(--text-base);
}

.quick-guide {
  padding: var(--space-md);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-md);
}

.guide-heading {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.guide-heading svg {
  width: 1rem;
  color: var(--color-accent);
}

.guide-heading h3 {
  margin: 0;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}

.quick-guide ol {
  display: grid;
  gap: var(--space-sm);
  padding: 0;
  margin: var(--space-md) 0 0;
  list-style: none;
}

.quick-guide li {
  display: grid;
  grid-template-columns: 1.5rem 1fr;
  align-items: center;
  gap: var(--space-xs);
  color: var(--color-neutral);
  font-size: var(--text-sm);
}

.quick-guide li span {
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  place-items: center;
  color: var(--color-accent);
  background: var(--color-accent-soft);
  border-radius: var(--radius-lg);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.editing-lock {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm);
  color: var(--color-warning);
  background: var(--color-warning-soft);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
}

.editing-lock svg {
  width: 1rem;
}
</style>
