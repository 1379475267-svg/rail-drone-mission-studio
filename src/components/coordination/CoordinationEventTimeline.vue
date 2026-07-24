<script setup lang="ts">
import { computed } from 'vue'

export interface CoordinationTimelineEvent {
  id: string
  timestampMs: number
  source: 'SYSTEM' | 'DRONE' | 'ROBOT' | 'TRACKER'
  level: 'INFO' | 'ACTION' | 'WARNING' | 'ERROR' | 'COMMUNICATION'
  message: string
}

const props = defineProps<{
  events: CoordinationTimelineEvent[]
}>()

const visibleEvents = computed(() => props.events.slice(-80).reverse())

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.max(0, milliseconds) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const tenths = Math.floor((totalSeconds % 1) * 10)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`
}

const sourceLabels: Record<CoordinationTimelineEvent['source'], string> = {
  SYSTEM: '系统',
  DRONE: '无人机',
  ROBOT: '机器人',
  TRACKER: '跟踪器',
}
</script>

<template>
  <footer class="event-timeline" aria-labelledby="event-title">
    <header>
      <div>
        <h2 id="event-title">协同事件</h2>
        <p>最新事件置顶，最多显示 80 条。</p>
      </div>
      <span class="event-count tabular">{{ props.events.length }} 条</span>
    </header>

    <ol v-if="visibleEvents.length" aria-live="polite">
      <li v-for="event in visibleEvents" :key="event.id" :class="`is-${event.level.toLowerCase()}`">
        <time :datetime="`PT${Math.floor(event.timestampMs / 1000)}S`">
          {{ formatTimestamp(event.timestampMs) }}
        </time>
        <span class="event-source">{{ sourceLabels[event.source] }}</span>
        <span class="event-level">{{ event.level }}</span>
        <p>{{ event.message }}</p>
      </li>
    </ol>

    <div v-else class="empty-log">
      <strong>还没有协同事件。</strong>
      <span>启动任务后，这里会记录机器人请求、线路状态和无人机动作。</span>
    </div>
  </footer>
</template>

<style scoped>
/* Hallmark · component: Ft4 dense event colophon · genre: modern-minimal · theme: Cobalt
 * states: empty · info · action · warning · error · communication
 * contrast: pending final browser verification
 */
.event-timeline {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-columns: 15rem minmax(0, 1fr);
  color: var(--color-log-ink);
  background: var(--color-log-paper);
  border-top: var(--rule-thin) solid var(--color-media-rule);
}

.event-timeline > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  border-inline-end: var(--rule-thin) solid var(--color-media-rule);
}

.event-timeline h2,
.event-timeline p { margin: 0; }

.event-timeline h2 {
  color: var(--color-log-ink);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-style: normal;
}

.event-timeline header p,
.event-count,
.empty-log span {
  color: var(--color-log-muted);
  font-size: var(--text-sm);
}

.event-count {
  font-family: var(--font-mono);
  white-space: nowrap;
}

.event-timeline ol {
  display: grid;
  align-content: start;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  list-style: none;
}

.event-timeline li {
  display: grid;
  min-width: 0;
  grid-template-columns: 4.75rem 4.5rem 7rem minmax(0, 1fr);
  align-items: baseline;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-md);
  border-bottom: var(--rule-thin) solid var(--color-media-rule);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.event-timeline time,
.event-source,
.event-level {
  color: var(--color-log-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.event-timeline li p {
  min-width: 0;
  color: var(--color-log-ink);
  overflow-wrap: anywhere;
}

.event-timeline li.is-action .event-level { color: var(--color-accent-line); }
.event-timeline li.is-warning .event-level { color: var(--color-warning-soft); }
.event-timeline li.is-error .event-level { color: var(--color-danger-soft); }
.event-timeline li.is-communication .event-level { color: var(--color-success-soft); }

.empty-log {
  display: flex;
  min-height: 7rem;
  align-items: flex-start;
  justify-content: center;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-lg);
}

.empty-log strong { color: var(--color-log-ink); }

@media (max-width: 62rem) {
  .event-timeline { grid-template-columns: minmax(0, 1fr); }
  .event-timeline > header { border-inline-end: 0; border-bottom: var(--rule-thin) solid var(--color-media-rule); }
}

@media (max-width: 48rem) {
  .event-timeline li {
    grid-template-columns: 4rem 4rem minmax(0, 1fr);
  }
  .event-level { display: none; }
}

@media (max-width: 40rem) {
  .event-timeline li {
    grid-template-columns: 4rem minmax(0, 1fr);
  }
  .event-source { display: none; }
  .event-timeline > header,
  .empty-log { padding-inline: var(--space-md); }
}
</style>
