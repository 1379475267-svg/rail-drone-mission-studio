<script setup lang="ts">
import { computed } from 'vue'
import { Bell, CircleCloseFilled, InfoFilled, WarningFilled } from '@element-plus/icons-vue'
import type { MissionLog, ValidationIssue } from '@/types/simulation'

const props = defineProps<{
  logs: MissionLog[]
  issues: ValidationIssue[]
}>()

const recentLogs = computed(() => props.logs.slice(-80).reverse())

const formatTimestamp = (timestamp: number) => {
  const totalSeconds = Math.max(0, Math.floor(timestamp / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
</script>

<template>
  <section class="mission-log-panel" aria-labelledby="mission-log-title">
    <div class="log-heading">
      <div>
        <Bell />
        <h3 id="mission-log-title">任务日志</h3>
      </div>
      <span>{{ props.logs.length }} 条记录</span>
    </div>

    <div class="log-stream" aria-live="polite">
      <div v-for="issue in props.issues" :key="issue.id" class="issue-row" :data-level="issue.level">
        <WarningFilled v-if="issue.level === 'WARNING'" />
        <CircleCloseFilled v-else />
        <strong>{{ issue.level === 'WARNING' ? '提醒' : '错误' }}</strong>
        <span>{{ issue.message }}</span>
      </div>

      <div v-for="log in recentLogs" :key="log.id" class="log-row" :data-level="log.level">
        <time>{{ formatTimestamp(log.timestamp) }}</time>
        <span class="log-source">{{ log.source }}</span>
        <span class="log-message">{{ log.message }}</span>
      </div>

      <div v-if="props.logs.length === 0 && props.issues.length === 0" class="log-empty">
        <InfoFilled />
        <span>启动仿真后，任务事件会显示在这里</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mission-log-panel {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  background: var(--color-log-paper);
  border-radius: var(--radius-md);
}

.log-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  color: var(--color-log-ink);
  background: var(--color-log-paper-2);
  border-bottom: var(--rule-thin) solid var(--color-neutral);
}

.log-heading div {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.log-heading svg {
  width: 1rem;
  color: var(--color-accent-soft);
}

.log-heading h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-sm);
}

.log-heading > span {
  color: var(--color-log-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.log-stream {
  min-height: 0;
  padding: var(--space-xs) 0;
  overflow-y: auto;
  scrollbar-color: var(--color-neutral) var(--color-log-paper);
}

.log-row {
  display: grid;
  grid-template-columns: 4.5rem 4rem 1fr;
  gap: var(--space-xs);
  align-items: baseline;
  padding: var(--space-2xs) var(--space-md);
  color: var(--color-log-ink);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.55;
}

.log-row time,
.log-source {
  color: var(--color-log-muted);
}

.log-row[data-level='WARNING'] .log-message {
  color: var(--color-warning);
}

.log-row[data-level='ERROR'] .log-message {
  color: var(--color-danger);
}

.log-row[data-level='ACTION'] .log-message,
.log-row[data-level='DEVICE'] .log-message {
  color: var(--color-accent-soft);
}

.log-message {
  overflow-wrap: anywhere;
}

.issue-row {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  margin: 0 var(--space-xs) var(--space-xs);
  color: var(--color-warning);
  background: var(--color-log-paper-2);
  border-left: var(--rule-strong) solid var(--color-warning);
  border-radius: var(--radius-xs);
  font-size: var(--text-xs);
}

.issue-row[data-level='ERROR'] {
  color: var(--color-danger);
  border-left-color: var(--color-danger);
}

.issue-row svg {
  width: 0.9rem;
}

.issue-row span {
  color: var(--color-log-ink);
}

.log-empty {
  display: flex;
  min-height: 6rem;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-md);
  color: var(--color-log-muted);
  font-size: var(--text-xs);
  text-align: center;
}

.log-empty svg {
  width: 1rem;
}
</style>
