<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  missionState: string
  resumeState?: string | null
  robotState: string
  trackingPhase: string
  elapsedMs: number
  droneProgress: number
  robotProgress: number
  currentObstacleLabel: string
  nextObstacleLabel: string
  trackConfidence: number
  lateralError: number
  headingErrorDeg: number
  forwardSpeed: number
}>()

const stateLabels: Record<string, string> = {
  INITIALIZING: '初始化',
  STANDBY: '待命',
  WAITING_FOR_ROBOT: '等待机器人',
  ASSIST_REQUESTED: '确认越障请求',
  RENDEZVOUS: '会合定位',
  ASSIST_PREPARING: '越障准备',
  ASSIST_EXECUTING: '越障执行',
  VERIFYING_ROBOT_CLEAR: '确认机器人恢复',
  ACQUIRING_LINE: '捕获接触线',
  FOLLOWING_LINE: '沿接触线飞行',
  LINE_RECOVERY: '重新捕获线路',
  APPROACHING_NEXT_OBSTACLE: '接近下一障碍',
  SAFE_HOLD: '安全悬停',
  COMPLETED: '任务完成',
  ABORTED: '任务终止',
}

const trackingLabels: Record<string, string> = {
  IDLE: '未启动',
  ACQUIRING: '捕获中',
  TRACKING: '稳定跟踪',
  DEGRADED: '弱跟踪',
  HOLD: '停止前进',
  REACQUIRING: '重新捕获',
  FAULT: '跟踪故障',
}

const robotLabels: Record<string, string> = {
  MOVING: '沿线巡检',
  BLOCKED: '障碍前停车',
  REQUESTING_ASSIST: '请求越障',
  ASSIST_READY: '等待协助',
  BEING_ASSISTED: '越障中',
  VERIFYING_CLEAR: '确认恢复',
  WAITING_FOR_DRONE: '等待无人机',
  COMPLETED: '巡检完成',
  LINK_LOST: '通信中断',
}

const stages = [
  { key: 'WAITING_FOR_ROBOT', label: '机器人到达' },
  { key: 'ASSIST_REQUESTED', label: '请求与互锁' },
  { key: 'ASSIST_EXECUTING', label: '协助越障' },
  { key: 'VERIFYING_ROBOT_CLEAR', label: '确认恢复' },
  { key: 'ACQUIRING_LINE', label: '捕获线路' },
  { key: 'FOLLOWING_LINE', label: '沿线前飞' },
  { key: 'APPROACHING_NEXT_OBSTACLE', label: '到点等待' },
] as const

const effectiveStageState = computed(() => props.missionState === 'SAFE_HOLD'
  ? (props.resumeState ?? props.missionState)
  : props.missionState)

const stageIndex = computed(() => {
  const state = effectiveStageState.value
  const direct = stages.findIndex((stage) => stage.key === state)
  if (direct >= 0) return direct
  if (['ASSIST_PREPARING', 'RENDEZVOUS'].includes(state)) return 1
  if (state === 'LINE_RECOVERY') return 5
  if (state === 'COMPLETED') return stages.length
  return -1
})

const elapsedLabel = computed(() => {
  const totalSeconds = Math.floor(props.elapsedMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

function percent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`
}
</script>

<template>
  <aside class="status-panel" aria-label="协同任务状态">
    <header>
      <div>
        <p>当前任务状态</p>
        <h2>{{ stateLabels[props.missionState] ?? props.missionState }}</h2>
      </div>
      <time class="mission-clock" :datetime="`PT${Math.floor(props.elapsedMs / 1000)}S`">
        {{ elapsedLabel }}
      </time>
    </header>

    <ol class="mission-stages" aria-label="任务阶段">
      <li
        v-for="(stage, index) in stages"
        :key="stage.key"
        :class="{
          'is-complete': index < stageIndex,
          'is-current': index === stageIndex,
        }"
      >
        <span class="stage-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <span>{{ stage.label }}</span>
        <b>{{ index < stageIndex
          ? '已完成'
          : index === stageIndex
            ? props.missionState === 'SAFE_HOLD' ? '已中断' : '进行中'
            : '待执行' }}</b>
      </li>
    </ol>

    <section class="telemetry-section">
      <h3>运行数据</h3>
      <dl class="telemetry-grid tabular">
        <div><dt>机器人</dt><dd>{{ robotLabels[props.robotState] ?? props.robotState }}</dd></div>
        <div><dt>线路跟踪</dt><dd>{{ trackingLabels[props.trackingPhase] ?? props.trackingPhase }}</dd></div>
        <div><dt>当前障碍</dt><dd>{{ props.currentObstacleLabel }}</dd></div>
        <div><dt>下一障碍</dt><dd>{{ props.nextObstacleLabel }}</dd></div>
        <div><dt>无人机进度</dt><dd>{{ percent(props.droneProgress) }}</dd></div>
        <div><dt>机器人进度</dt><dd>{{ percent(props.robotProgress) }}</dd></div>
        <div><dt>跟踪一致性</dt><dd>{{ percent(props.trackConfidence) }}</dd></div>
        <div><dt>横向误差</dt><dd>{{ props.lateralError.toFixed(3) }} m</dd></div>
        <div><dt>航向误差</dt><dd>{{ props.headingErrorDeg.toFixed(1) }}°</dd></div>
        <div><dt>前向建议</dt><dd>{{ props.forwardSpeed.toFixed(2) }} m/s</dd></div>
      </dl>
    </section>
  </aside>
</template>

<style scoped>
/* Hallmark · component: F4 sequence + F3 spec sheet · genre: modern-minimal · theme: Cobalt
 * states: default · current · complete · hold · fault
 * contrast: pending final browser verification
 */
.status-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  color: var(--color-ink-2);
  background: var(--color-surface);
  border-inline-start: var(--rule-thin) solid var(--color-rule);
  overflow-y: auto;
}

.status-panel > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-lg);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.status-panel p,
.telemetry-section h3 {
  margin: 0;
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-panel h2 {
  margin: var(--space-2xs) 0 0;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-style: normal;
  line-height: 1.15;
}

.mission-clock {
  color: var(--color-accent-hover);
  font-family: var(--font-mono);
  font-size: var(--text-md);
  font-variant-numeric: tabular-nums;
}

.mission-stages {
  display: grid;
  gap: 0;
  padding: 0;
  margin: 0;
  list-style: none;
}

.mission-stages li {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-sm);
  min-height: var(--control-height);
  padding: var(--space-xs) var(--space-lg);
  color: var(--color-muted);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.mission-stages li.is-current {
  color: var(--color-ink);
  background: var(--color-accent-soft);
  box-shadow: inset var(--rule-strong) 0 0 var(--color-accent);
}

.mission-stages li.is-complete { color: var(--color-success); }

.stage-index,
.mission-stages b {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.mission-stages b { font-weight: 500; white-space: nowrap; }

.telemetry-section {
  display: grid;
  gap: var(--space-sm);
  padding: var(--space-lg);
}

.telemetry-grid {
  display: grid;
  gap: 0;
  margin: 0;
}

.telemetry-grid > div {
  display: grid;
  grid-template-columns: minmax(7rem, 1fr) minmax(0, 1.15fr);
  gap: var(--space-sm);
  padding-block: var(--space-xs);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.telemetry-grid dt { color: var(--color-muted); }
.telemetry-grid dd {
  min-width: 0;
  margin: 0;
  color: var(--color-ink);
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}

@media (max-width: 70rem) {
  .status-panel {
    border-block-start: var(--rule-thin) solid var(--color-rule);
    border-inline-start: 0;
  }

  .mission-stages { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .telemetry-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--space-lg); }
}

@media (max-width: 40rem) {
  .mission-stages,
  .telemetry-grid { grid-template-columns: minmax(0, 1fr); }
  .mission-stages li { padding-inline: var(--space-md); }
  .status-panel > header,
  .telemetry-section { padding: var(--space-md); }
}
</style>
