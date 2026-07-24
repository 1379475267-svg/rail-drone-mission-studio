<script setup lang="ts">
import { computed } from 'vue'
import { RefreshRight, VideoPause, VideoPlay } from '@element-plus/icons-vue'
import MissionLogPanel from '@/components/mission/MissionLogPanel.vue'
import type {
  DroneTelemetry,
  MissionLog,
  SimulationSpeed,
  SimulationStatus,
  ValidationIssue,
} from '@/types/simulation'

const props = defineProps<{
  status: SimulationStatus
  telemetry: DroneTelemetry
  progress: number
  elapsedTime: number
  currentWaypointIndex: number
  currentSegmentIndex: number
  speedMultiplier: SimulationSpeed
  logs: MissionLog[]
  issues: ValidationIssue[]
  waypointCount: number
}>()

const emit = defineEmits<{
  (event: 'start'): void
  (event: 'pause'): void
  (event: 'resume'): void
  (event: 'reset'): void
  (event: 'set-speed', speed: SimulationSpeed): void
}>()

const statusLabels: Record<SimulationStatus, string> = {
  IDLE: '待命',
  RUNNING: '运行中',
  PAUSED: '已暂停',
  COMPLETED: '已完成',
  ERROR: '异常',
}

const safeProgress = computed(() => Math.max(0, Math.min(100, props.progress)))
const currentNodeLabel = computed(() => {
  if (props.waypointCount === 0) return '尚未规划航点'
  const waypointNumber = Math.min(
    Math.max(props.currentWaypointIndex, 0) + 1,
    props.waypointCount,
  )
  if (props.status === 'COMPLETED') return `P${waypointNumber} · 任务完成`
  if (props.status === 'IDLE') return `P${waypointNumber} · 等待启动`
  const segmentNumber = Math.min(
    Math.max(props.currentSegmentIndex, 0) + 1,
    Math.max(props.waypointCount - 1, 1),
  )
  return `P${waypointNumber} · 航段 ${segmentNumber} / ${Math.max(props.waypointCount - 1, 1)}`
})

const formattedTime = computed(() => {
  const totalSeconds = Math.max(0, Math.floor(props.elapsedTime / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

const speedOptions: SimulationSpeed[] = [0.5, 1, 2, 4]
</script>

<template>
  <section class="simulation-panel" aria-label="仿真状态和日志">
    <div class="simulation-overview">
      <div class="overview-heading">
        <div>
          <h2>任务仿真</h2>
          <span class="status-label" :data-status="props.status">
            <i aria-hidden="true" />
            {{ statusLabels[props.status] }}
          </span>
        </div>

        <div class="simulation-controls">
          <el-button
            v-if="props.status === 'PAUSED'"
            type="primary"
            :icon="VideoPlay"
            :disabled="props.waypointCount < 2"
            @click="emit('resume')"
          >
            继续
          </el-button>
          <el-button
            v-else
            type="primary"
            :icon="VideoPlay"
            :disabled="props.waypointCount < 2 || props.status === 'RUNNING'"
            @click="emit('start')"
          >
            开始
          </el-button>
          <el-button
            :icon="VideoPause"
            :disabled="props.status !== 'RUNNING'"
            @click="emit('pause')"
          >
            暂停
          </el-button>
          <el-button :icon="RefreshRight" :disabled="props.status === 'IDLE'" @click="emit('reset')">
            重置
          </el-button>
        </div>
      </div>

      <div class="mission-readout">
        <div class="readout-cell node-cell">
          <span>当前航点 / 航段</span>
          <strong>{{ currentNodeLabel }}</strong>
        </div>
        <div class="readout-cell">
          <span>无人机</span>
          <strong>{{ props.status === 'RUNNING' ? '执行航线' : statusLabels[props.status] }}</strong>
        </div>
        <div class="readout-cell">
          <span>机器人</span>
          <strong>待部署</strong>
        </div>
        <div class="readout-cell">
          <span>高度</span>
          <strong class="tabular">{{ props.telemetry.altitude.toFixed(1) }} m</strong>
        </div>
        <div class="readout-cell">
          <span>飞行速度</span>
          <strong class="tabular">{{ props.telemetry.speed.toFixed(1) }} m/s</strong>
        </div>
        <div class="readout-cell time-cell">
          <span>已运行</span>
          <strong class="tabular">{{ formattedTime }}</strong>
        </div>
      </div>

      <div class="progress-row">
        <div class="progress-copy">
          <span>任务进度</span>
          <strong class="tabular">{{ safeProgress.toFixed(0) }}%</strong>
        </div>
        <el-progress :percentage="safeProgress" :show-text="false" :stroke-width="8" />
        <div class="speed-control" aria-label="仿真速度">
          <span>仿真速度</span>
          <el-radio-group
            :model-value="props.speedMultiplier"
            size="small"
            @update:model-value="(value: SimulationSpeed) => emit('set-speed', value)"
          >
            <el-radio-button v-for="speed in speedOptions" :key="speed" :value="speed">
              {{ speed }}×
            </el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </div>

    <MissionLogPanel :logs="props.logs" :issues="props.issues" />
  </section>
</template>

<style scoped>
.simulation-panel {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-columns: minmax(34rem, 1.35fr) minmax(24rem, 1fr);
  gap: var(--space-sm);
  padding: var(--space-sm);
  background: var(--color-paper-3);
  border-top: var(--rule-thin) solid var(--color-rule-strong);
}

.simulation-overview {
  display: grid;
  min-width: 0;
  grid-template-rows: auto 1fr auto;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  overflow: hidden;
  background: var(--color-surface-raised);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-md);
}

.overview-heading,
.overview-heading > div,
.simulation-controls,
.progress-row,
.progress-copy,
.speed-control {
  display: flex;
  align-items: center;
}

.overview-heading {
  justify-content: space-between;
  gap: var(--space-md);
}

.overview-heading > div,
.simulation-controls,
.speed-control {
  gap: var(--space-xs);
}

.overview-heading h2 {
  margin: 0 var(--space-xs) 0 0;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-base);
}

.status-label {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  color: var(--color-neutral);
  font-size: var(--text-xs);
}

.status-label i {
  width: 0.5rem;
  height: 0.5rem;
  background: var(--color-neutral);
  border-radius: 50%;
}

.status-label[data-status='RUNNING'],
.status-label[data-status='COMPLETED'] {
  color: var(--color-success);
}

.status-label[data-status='RUNNING'] i,
.status-label[data-status='COMPLETED'] i {
  background: var(--color-success);
}

.status-label[data-status='PAUSED'] {
  color: var(--color-warning);
}

.status-label[data-status='PAUSED'] i {
  background: var(--color-warning);
}

.status-label[data-status='ERROR'] {
  color: var(--color-danger);
}

.status-label[data-status='ERROR'] i {
  background: var(--color-danger);
}

.simulation-controls :deep(.el-button + .el-button) {
  margin-left: 0;
}

.mission-readout {
  display: grid;
  grid-template-columns: 1.45fr repeat(5, minmax(5.2rem, 1fr));
  border-block: var(--rule-thin) solid var(--color-rule);
}

.readout-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-2xs);
  padding: var(--space-xs) var(--space-sm);
  border-right: var(--rule-thin) solid var(--color-rule);
}

.readout-cell:last-child {
  border-right: 0;
}

.readout-cell span,
.speed-control > span,
.progress-copy span {
  color: var(--color-muted);
  font-size: var(--text-xs);
}

.readout-cell strong {
  overflow: hidden;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-cell strong {
  color: var(--color-accent-hover);
  font-family: var(--font-mono);
  font-size: var(--text-base);
}

.progress-row {
  display: grid;
  grid-template-columns: 5.5rem minmax(8rem, 1fr) auto;
  gap: var(--space-sm);
}

.progress-copy {
  justify-content: space-between;
  gap: var(--space-xs);
}

.progress-copy strong {
  color: var(--color-accent-hover);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.speed-control {
  padding-left: var(--space-sm);
  border-left: var(--rule-thin) solid var(--color-rule);
}

@media (max-width: 68rem) {
  .simulation-panel {
    grid-template-columns: minmax(30rem, 1.2fr) minmax(21rem, 1fr);
  }

  .mission-readout {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .readout-cell:nth-child(3) {
    border-right: 0;
  }

  .readout-cell:nth-child(-n + 3) {
    border-bottom: var(--rule-thin) solid var(--color-rule);
  }

  .progress-row {
    grid-template-columns: 1fr;
  }

  .speed-control {
    padding-left: 0;
    border-left: 0;
  }
}

@media (max-width: 48rem) {
  .simulation-panel {
    grid-template-columns: 1fr;
  }
}
</style>
