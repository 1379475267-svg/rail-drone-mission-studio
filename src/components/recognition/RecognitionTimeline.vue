<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { VideoPause, VideoPlay } from '@element-plus/icons-vue'
import type {
  RecognitionFrameResult,
  RecognitionMediaKind,
  RecognitionRunStatus,
} from '@/types/recognition'

const props = defineProps<{
  mediaKind: RecognitionMediaKind | null
  currentTime: number
  duration: number | null
  isPlaying: boolean
  result: RecognitionFrameResult | null
  runStatus: RecognitionRunStatus
  isSeeking: boolean
}>()

const emit = defineEmits<{
  (event: 'seek', seconds: number): void
  (event: 'toggle-playback'): void
}>()

const sliderTime = ref(props.currentTime)

watch(
  () => props.currentTime,
  (value) => { sliderTime.value = value },
)

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00.000'
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = (seconds % 60).toFixed(3).padStart(6, '0')
  return `${minutes}:${remainder}`
}

const maxTime = computed(() => Math.max(0.01, props.duration ?? 0.01))
const processingFps = computed(() => props.result ? props.result.processingFps.toFixed(1) : '—')
const processingMs = computed(() => props.result ? props.result.processingMs.toFixed(1) : '—')

function updateTime(value: number | number[]): void {
  if (typeof value !== 'number') return
  sliderTime.value = value
  emit('seek', value)
}

function previewTime(value: number | number[]): void {
  if (typeof value === 'number') sliderTime.value = value
}
</script>

<template>
  <footer class="recognition-timeline" aria-label="帧与处理信息">
    <div class="playback-block">
      <el-button
        v-if="props.mediaKind === 'VIDEO'"
        circle
        :icon="props.isPlaying ? VideoPause : VideoPlay"
        :aria-label="props.isPlaying ? '暂停视频' : '播放视频'"
        :disabled="props.runStatus === 'RUNNING' || props.isSeeking"
        @click="emit('toggle-playback')"
      />
      <div class="timeline-copy">
        <strong>{{ props.mediaKind === 'VIDEO' ? '视频时间轴' : '静态帧' }}</strong>
        <span class="tabular">{{ formatTime(props.mediaKind === 'VIDEO' ? sliderTime : props.currentTime) }}<template v-if="props.duration !== null"> / {{ formatTime(props.duration) }}</template></span>
      </div>
    </div>

    <el-slider
      v-if="props.mediaKind === 'VIDEO'"
      class="time-slider"
      :model-value="sliderTime"
      :min="0"
      :max="maxTime"
      :step="0.001"
      :show-tooltip="false"
      :disabled="props.runStatus === 'RUNNING' || props.isSeeking"
      aria-label="视频时间位置"
      @update:model-value="previewTime"
      @change="updateTime"
    />
    <div v-else class="frame-rule" aria-hidden="true"><span :class="{ 'is-ready': props.result }" /></div>

    <dl class="frame-metrics">
      <div><dt>处理帧</dt><dd class="tabular">{{ props.result ? `#${props.result.frameIndex}` : '—' }}</dd></div>
      <div><dt>处理 FPS</dt><dd class="tabular">{{ processingFps }}</dd></div>
      <div><dt>耗时</dt><dd class="tabular">{{ processingMs }}<small v-if="props.result"> ms</small></dd></div>
      <div><dt>适配器</dt><dd>{{ props.result?.adapterLabel ?? '未运行' }}</dd></div>
    </dl>
  </footer>
</template>

<style scoped>
.recognition-timeline {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(8rem, 1fr) auto;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-surface-raised);
  border-top: var(--rule-thin) solid var(--color-rule);
}

.playback-block,
.timeline-copy,
.frame-metrics,
.frame-metrics div {
  display: flex;
  align-items: center;
}

.playback-block { gap: var(--space-sm); }
.timeline-copy { align-items: flex-start; flex-direction: column; gap: var(--space-2xs); }
.timeline-copy strong { color: var(--color-ink); font-size: var(--text-sm); }
.timeline-copy span { color: var(--color-muted); font-family: var(--font-mono); font-size: var(--text-xs); }

.time-slider { min-width: 8rem; }
.frame-rule { height: var(--rule-strong); background: var(--color-rule); }
.frame-rule span { display: block; width: 0; height: 100%; background: var(--color-accent); transition: transform var(--dur-short) var(--ease-out); transform: scaleX(0); transform-origin: left; }
.frame-rule span.is-ready { width: 100%; transform: scaleX(1); }

.frame-metrics { gap: var(--space-lg); margin: 0; }
.frame-metrics div { align-items: flex-start; flex-direction: column; gap: var(--space-2xs); }
.frame-metrics dt { color: var(--color-muted); font-size: var(--text-xs); }
.frame-metrics dd { max-width: 12rem; margin: 0; overflow: hidden; color: var(--color-ink-2); font-family: var(--font-mono); font-size: var(--text-xs); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.frame-metrics small { font-size: inherit; font-weight: 400; }

@media (max-width: 64rem) {
  .recognition-timeline { grid-template-columns: 1fr; gap: var(--space-sm); }
  .frame-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-sm); }
}

@media (max-width: 40rem) {
  .frame-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
