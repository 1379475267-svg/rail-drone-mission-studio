<script setup lang="ts">
const props = defineProps<{
  lineLost: boolean
  communicationLost: boolean
  assistFailureArmed: boolean
  safeHold?: boolean
}>()

const emit = defineEmits<{
  (event: 'toggle-line-lost'): void
  (event: 'toggle-communication-lost'): void
  (event: 'toggle-assist-failure'): void
  (event: 'clear'): void
}>()
</script>

<template>
  <section class="fault-panel" aria-labelledby="fault-panel-title">
    <header>
      <div>
        <h2 id="fault-panel-title">故障注入</h2>
        <p>只改变浏览器仿真，不连接真实设备。</p>
      </div>
      <el-button
        text
        :disabled="!props.safeHold && !props.lineLost && !props.communicationLost && !props.assistFailureArmed"
        @click="emit('clear')"
      >
        {{ props.safeHold ? '清故障并重新捕获' : '清除故障' }}
      </el-button>
    </header>

    <div class="fault-actions">
      <el-button
        :type="props.lineLost ? 'danger' : 'default'"
        :plain="!props.lineLost"
        :aria-pressed="props.lineLost"
        @click="emit('toggle-line-lost')"
      >
        {{ props.lineLost ? '恢复接触线' : '模拟线路丢失' }}
      </el-button>
      <el-button
        :type="props.communicationLost ? 'danger' : 'default'"
        :plain="!props.communicationLost"
        :aria-pressed="props.communicationLost"
        @click="emit('toggle-communication-lost')"
      >
        {{ props.communicationLost ? '恢复机器人通信' : '中断机器人通信' }}
      </el-button>
      <el-button
        :type="props.assistFailureArmed ? 'danger' : 'default'"
        :plain="!props.assistFailureArmed"
        :aria-pressed="props.assistFailureArmed"
        @click="emit('toggle-assist-failure')"
      >
        {{ props.assistFailureArmed ? '取消越障失败' : '预置越障失败' }}
      </el-button>
    </div>
  </section>
</template>

<style scoped>
/* Hallmark · component: safety fault controls · genre: modern-minimal · theme: Cobalt
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pending final browser verification
 */
.fault-panel {
  display: grid;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  color: var(--color-ink-2);
  background: var(--color-warning-soft);
  border-top: var(--rule-thin) solid var(--color-rule);
}

.fault-panel header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.fault-panel h2,
.fault-panel p { margin: 0; }

.fault-panel h2 {
  color: var(--color-ink);
  font-size: var(--text-base);
  font-style: normal;
}

.fault-panel p {
  max-width: 48ch;
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.fault-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-xs);
}

.fault-actions :deep(.el-button) { width: 100%; margin: 0; }

@media (max-width: 52rem) {
  .fault-actions { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 40rem) {
  .fault-panel { padding-inline: var(--space-md); }
}
</style>
