<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  DocumentAdd,
  FolderOpened,
  Picture,
  VideoCamera,
} from '@element-plus/icons-vue'
import type { RecognitionMediaInfo, RecognitionRunStatus } from '@/types/recognition'

const props = defineProps<{
  media: RecognitionMediaInfo | null
  runStatus: RecognitionRunStatus
  errorMessage: string | null
  adapterLabel: string
}>()

const emit = defineEmits<{
  (event: 'select-file', file: File): void
  (event: 'load-sample'): void
  (event: 'clear-media'): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const sizeLabel = computed(() => {
  if (!props.media) return '—'
  if (props.media.sizeBytes >= 1024 * 1024) return `${(props.media.sizeBytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(props.media.sizeBytes / 1024))} KB`
})

const durationLabel = computed(() => {
  const duration = props.media?.durationSeconds
  if (duration === null || duration === undefined) return null
  const minutes = Math.floor(duration / 60)
  const seconds = Math.floor(duration % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
})

function openPicker(): void {
  fileInput.value?.click()
}

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('select-file', file)
  input.value = ''
}
</script>

<template>
  <aside class="source-panel" aria-labelledby="source-panel-title">
    <header>
      <div>
        <h2 id="source-panel-title">素材源</h2>
        <p>本机解码，不上传</p>
      </div>
      <component :is="props.media?.kind === 'VIDEO' ? VideoCamera : Picture" aria-hidden="true" />
    </header>

    <section class="source-actions" aria-label="载入素材">
      <input
        ref="fileInput"
        class="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp,video/mp4,.png,.jpg,.jpeg,.webp,.mp4"
        @change="handleFileChange"
      />
      <el-button type="primary" :icon="FolderOpened" @click="openPicker">选择图片或 MP4</el-button>
      <el-button :icon="DocumentAdd" @click="emit('load-sample')">载入示例</el-button>
    </section>

    <section v-if="props.media" class="media-record" aria-label="当前素材信息">
      <div class="media-record-title">
        <component :is="props.media.kind === 'VIDEO' ? VideoCamera : Picture" aria-hidden="true" />
        <strong :title="props.media.fileName">{{ props.media.fileName }}</strong>
      </div>
      <dl>
        <div><dt>类型</dt><dd>{{ props.media.kind === 'VIDEO' ? 'MP4 视频' : '静态图片' }}</dd></div>
        <div><dt>分辨率</dt><dd class="tabular">{{ props.media.width }} × {{ props.media.height }}</dd></div>
        <div><dt>文件大小</dt><dd class="tabular">{{ sizeLabel }}</dd></div>
        <div v-if="durationLabel"><dt>时长</dt><dd class="tabular">{{ durationLabel }}</dd></div>
      </dl>
      <button class="replace-action" type="button" @click="openPicker">替换素材</button>
      <button class="clear-action" type="button" @click="emit('clear-media')">移除素材</button>
    </section>

    <section v-else class="source-empty">
      <Picture aria-hidden="true" />
      <strong>还没有素材</strong>
      <p>支持 PNG、JPEG、WebP 与 H.264 MP4；图片上限 40 MB，视频上限 500 MB。</p>
    </section>

    <section class="adapter-record" aria-labelledby="adapter-title">
      <h3 id="adapter-title">当前适配器</h3>
      <strong>{{ props.adapterLabel }}</strong>
      <p>连续边缘搜索基线，只验证前端闭环。线索分不等同于模型置信度，不得用于飞行控制。</p>
      <ul>
        <li><span>浏览器基线</span><b>已接入</b></li>
        <li><span>Python / ONNX</span><em>适配位</em></li>
        <li><span>ROS / rosbridge</span><em>适配位</em></li>
      </ul>
    </section>

    <p v-if="props.errorMessage" class="source-error" role="alert">
      {{ props.errorMessage }}
    </p>
  </aside>
</template>

<style scoped>
.source-panel {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--color-surface);
}

.source-panel > header {
  display: flex;
  min-height: 4.25rem;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.source-panel h2,
.source-panel h3,
.source-panel p,
.source-panel dl,
.source-panel ul {
  margin: 0;
}

.source-panel h2 { color: var(--color-ink); font-size: var(--text-base); }
.source-panel header p { margin-top: var(--space-2xs); color: var(--color-muted); font-size: var(--text-xs); }
.source-panel header > svg { width: 1.25rem; color: var(--color-accent); }

.source-actions,
.media-record,
.source-empty,
.adapter-record {
  display: grid;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.source-actions :deep(.el-button) { width: 100%; margin: 0; }

.media-record-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-xs);
}

.media-record-title svg { flex: 0 0 auto; width: 1.1rem; color: var(--color-accent); }
.media-record-title strong { overflow: hidden; color: var(--color-ink); font-size: var(--text-sm); text-overflow: ellipsis; white-space: nowrap; }

.media-record dl { display: grid; gap: var(--space-xs); }
.media-record dl div { display: flex; justify-content: space-between; gap: var(--space-sm); }
.media-record dt { color: var(--color-muted); font-size: var(--text-xs); }
.media-record dd { color: var(--color-ink-2); font-family: var(--font-mono); font-size: var(--text-xs); }

.replace-action,
.clear-action {
  min-height: 2.75rem;
  padding: 0;
  color: var(--color-accent-hover);
  background: transparent;
  border: 0;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.clear-action { color: var(--color-danger); }
.replace-action:active { color: var(--color-accent); }
.clear-action:active { color: var(--color-danger); background: var(--color-danger-soft); }
.replace-action:focus-visible,
.clear-action:focus-visible { border-radius: var(--radius-xs); }

.source-empty {
  justify-items: start;
  color: var(--color-muted);
}

.source-empty svg { width: 1.6rem; color: var(--color-accent); }
.source-empty strong { color: var(--color-ink-2); }
.source-empty p,
.adapter-record p { font-size: var(--text-sm); line-height: 1.6; }

.adapter-record h3 {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.adapter-record strong { color: var(--color-ink); font-size: var(--text-sm); }
.adapter-record ul { display: grid; gap: var(--space-xs); padding: 0; list-style: none; }
.adapter-record li { display: flex; justify-content: space-between; gap: var(--space-xs); color: var(--color-muted); font-size: var(--text-xs); }
.adapter-record b { color: var(--color-success); }
.adapter-record em { color: var(--color-neutral); font-style: normal; }

.source-error {
  margin: var(--space-md) !important;
  padding: var(--space-sm);
  color: var(--color-danger);
  background: var(--color-danger-soft);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  line-height: 1.5;
}

@media (max-width: 40rem) {
  .source-panel { overflow: visible; }
  .source-actions { grid-template-columns: 1fr 1fr; }
}
</style>
