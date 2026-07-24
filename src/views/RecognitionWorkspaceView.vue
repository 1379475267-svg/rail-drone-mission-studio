<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import RecognitionInspector from '@/components/recognition/RecognitionInspector.vue'
import RecognitionMediaStage from '@/components/recognition/RecognitionMediaStage.vue'
import RecognitionSourcePanel from '@/components/recognition/RecognitionSourcePanel.vue'
import RecognitionTimeline from '@/components/recognition/RecognitionTimeline.vue'
import RecognitionToolbar from '@/components/recognition/RecognitionToolbar.vue'
import { BrowserEdgeAdapter } from '@/services/recognition/browserEdgeAdapter'
import { sampleMediaFrame, type FrameSource } from '@/services/recognition/frameSampler'
import {
  exportAnnotatedPng,
  exportRecognitionJson,
} from '@/services/recognition/recognitionExporter'
import { useRecognitionStore } from '@/stores/recognitionStore'
import type {
  RecognitionFrameResult,
  RecognitionMediaInfo,
  RecognitionMediaKind,
} from '@/types/recognition'
import { createId } from '@/utils/id'

interface RecognitionMediaStageExpose {
  getFrameSource(frameIndex: number): FrameSource
  waitForFrameReady(): Promise<void>
  seekTo(seconds: number): Promise<void>
  togglePlayback(): void
  pausePlayback(): void
}

const IMAGE_SIZE_LIMIT = 40 * 1024 * 1024
const VIDEO_SIZE_LIMIT = 500 * 1024 * 1024
const MEDIA_PIXEL_LIMIT = 40_000_000
const CURRENT_FRAME_TOLERANCE_SECONDS = 0.04

const store = useRecognitionStore()
const adapter = new BrowserEdgeAdapter()
const stageRef = ref<RecognitionMediaStageExpose | null>(null)
const mediaUrl = ref<string | null>(null)
const mediaInfo = ref<RecognitionMediaInfo | null>(null)
const currentTime = ref(0)
const isPlaying = ref(false)
const frameReady = ref(false)
const isSeeking = ref(false)
const frameSequence = ref(0)
let sessionRevision = 0
let mediaLoadRevision = 0
let seekRevision = 0
let recognitionController: AbortController | null = null

const currentResult = computed(() => store.result)
const resultMatchesCurrentFrame = computed(() => {
  if (!store.result || !mediaInfo.value) return false
  if (mediaInfo.value.kind === 'IMAGE') return true
  return Math.abs(store.result.timestampSeconds - currentTime.value) <= CURRENT_FRAME_TOLERANCE_SECONDS
})
const visiblePolylines = computed(() =>
  resultMatchesCurrentFrame.value ? (store.result?.polylines ?? []) : [],
)
const canRecognize = computed(() => Boolean(
  mediaInfo.value
  && mediaUrl.value
  && frameReady.value
  && !isSeeking.value,
))
const canExport = computed(() => Boolean(
  mediaInfo.value
  && store.result
  && resultMatchesCurrentFrame.value
  && frameReady.value
  && !isSeeking.value
  && store.runStatus === 'READY',
))
const readyStatusLabel = computed(() => {
  const lines = store.result?.polylines ?? []
  if (!lines.length) return '未识别到接触线'
  if (lines.every((line) => line.reviewStatus === 'ACCEPTED')) return '结果已接受'
  if (lines.every((line) => line.reviewStatus === 'REJECTED')) return '结果已驳回'
  if (lines.every((line) => line.reviewStatus !== 'PENDING')) return '复核已完成'
  return '结果待复核'
})

function inferMediaKind(file: File, allowInternalSvg = false): RecognitionMediaKind | null {
  const fileName = file.name.toLowerCase()
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    || /\.(png|jpe?g|webp)$/.test(fileName)) return 'IMAGE'
  if (allowInternalSvg && (file.type === 'image/svg+xml' || fileName.endsWith('.svg'))) return 'IMAGE'
  if (file.type === 'video/mp4' || fileName.endsWith('.mp4')) return 'VIDEO'
  return null
}

function validateFile(file: File, allowInternalSvg = false): RecognitionMediaKind {
  if (file.size <= 0) throw new Error('素材是空文件，请重新导出后再试')
  const kind = inferMediaKind(file, allowInternalSvg)
  if (!kind) throw new Error('文件类型不受支持。请选择 PNG、JPEG、WebP 或 MP4')
  const limit = kind === 'IMAGE' ? IMAGE_SIZE_LIMIT : VIDEO_SIZE_LIMIT
  if (file.size > limit) {
    throw new Error(kind === 'IMAGE' ? '图片超过 40 MB，请压缩后重试' : '视频超过 500 MB，请截取短片后重试')
  }
  return kind
}

function readMetadata(url: string, kind: RecognitionMediaKind): Promise<{
  width: number
  height: number
  durationSeconds: number | null
}> {
  return new Promise((resolve, reject) => {
    if (kind === 'IMAGE') {
      const image = new Image()
      image.decoding = 'async'
      image.onload = () => resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        durationSeconds: null,
      })
      image.onerror = () => reject(new Error('图片无法解码。请确认文件未损坏，并改用 PNG、JPEG 或 WebP'))
      image.src = url
      return
    }

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => {
      const metadata = {
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
      }
      video.removeAttribute('src')
      video.load()
      resolve(metadata)
    }
    video.onerror = () => {
      video.removeAttribute('src')
      video.load()
      reject(new Error('视频无法解码。请改用浏览器支持的 H.264 MP4'))
    }
    video.src = url
  })
}

function hasReviewWork(): boolean {
  return Boolean(store.result?.polylines.some(
    (line) => line.manuallyModified || line.reviewStatus !== 'PENDING',
  ))
}

async function confirmDiscardReview(): Promise<boolean> {
  if (!hasReviewWork()) return true
  try {
    await ElMessageBox.confirm(
      '当前帧已有人工校正或审核状态。继续会清空这次识别会话，请先导出需要保留的结果。',
      '替换当前识别会话',
      {
        confirmButtonText: '继续清空',
        cancelButtonText: '保留当前结果',
        type: 'warning',
      },
    )
    return true
  } catch {
    return false
  }
}

function releaseMedia(invalidatePendingLoads = true): void {
  if (invalidatePendingLoads) mediaLoadRevision += 1
  seekRevision += 1
  recognitionController?.abort()
  recognitionController = null
  stageRef.value?.pausePlayback()
  if (mediaUrl.value) URL.revokeObjectURL(mediaUrl.value)
  mediaUrl.value = null
  mediaInfo.value = null
  currentTime.value = 0
  isPlaying.value = false
  frameReady.value = false
  isSeeking.value = false
  frameSequence.value = 0
  sessionRevision += 1
}

async function loadFile(file: File, allowInternalSvg = false): Promise<void> {
  const kind = validateFile(file, allowInternalSvg)
  if (!(await confirmDiscardReview())) return
  const activeLoadRevision = ++mediaLoadRevision
  const nextUrl = URL.createObjectURL(file)

  try {
    const metadata = await readMetadata(nextUrl, kind)
    if (activeLoadRevision !== mediaLoadRevision) {
      URL.revokeObjectURL(nextUrl)
      return
    }
    if (!metadata.width || !metadata.height) throw new Error('素材没有可用的宽高信息')
    if (metadata.width * metadata.height > MEDIA_PIXEL_LIMIT) {
      throw new Error('素材超过 4000 万像素，请先缩小或裁剪后再试')
    }
    releaseMedia(false)
    mediaUrl.value = nextUrl
    mediaInfo.value = {
      fileName: file.name,
      mimeType: file.type || (kind === 'VIDEO' ? 'video/mp4' : 'image/unknown'),
      kind,
      width: metadata.width,
      height: metadata.height,
      sizeBytes: file.size,
      durationSeconds: metadata.durationSeconds,
    }
    store.setMediaReady()
  } catch (error) {
    URL.revokeObjectURL(nextUrl)
    if (activeLoadRevision !== mediaLoadRevision) return
    throw error
  }
}

async function handleSelectedFile(file: File): Promise<void> {
  try {
    await loadFile(file)
  } catch (error) {
    const message = error instanceof Error ? error.message : '素材载入失败'
    store.setError(message)
    ElMessage.error(message)
  }
}

async function loadSample(): Promise<void> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}examples/contact-line-demo.svg`)
    if (!response.ok) throw new Error('示例素材读取失败')
    const blob = await response.blob()
    const file = new File([blob], 'contact-line-demo.svg', { type: 'image/svg+xml' })
    await loadFile(file, true)
  } catch (error) {
    const message = error instanceof Error ? error.message : '示例素材载入失败'
    store.setError(message)
    ElMessage.error(message)
  }
}

async function clearMedia(): Promise<void> {
  if (!(await confirmDiscardReview())) return
  releaseMedia()
  store.resetSession()
}

function handleMediaReady(payload: { width: number; height: number; durationSeconds: number | null }): void {
  if (!mediaInfo.value) return
  mediaInfo.value = { ...mediaInfo.value, ...payload }
}

function handleFrameReady(): void {
  if (!isSeeking.value) frameReady.value = true
}

function handleStageError(message: string): void {
  frameReady.value = false
  store.setError(message)
  ElMessage.error(message)
}

function handleDraftSegmentPoint(
  point: { x: number; y: number },
  minimumDistance: number,
): void {
  store.handleSegmentDraftPoint(point, minimumDistance)
}

async function recognizeCurrentFrame(): Promise<void> {
  const media = mediaInfo.value
  const stage = stageRef.value
  if (!media || !stage) return
  if (!(await confirmDiscardReview())) return

  recognitionController?.abort()
  const controller = new AbortController()
  recognitionController = controller
  const activeRevision = ++sessionRevision
  stage.pausePlayback()
  store.setMediaReady()
  store.setRunning()

  try {
    await stage.waitForFrameReady()
    frameSequence.value += 1
    const frameSource = stage.getFrameSource(frameSequence.value)
    const sample = sampleMediaFrame(frameSource)
    await adapter.initialize(controller.signal)
    const inference = await adapter.recognize(sample, controller.signal)
    if (controller.signal.aborted || activeRevision !== sessionRevision) return

    const result: RecognitionFrameResult = {
      id: createId('recognition-frame'),
      adapterId: adapter.id,
      adapterLabel: adapter.label,
      adapterMode: adapter.mode,
      adapterParameters: adapter.parameters,
      coordinateSpace: 'IMAGE_PIXEL',
      frameIndex: sample.frameIndex,
      timestampSeconds: sample.timestampSeconds,
      processingMs: inference.processingMs,
      processingFps: 1000 / Math.max(0.1, inference.processingMs),
      width: sample.originalWidth,
      height: sample.originalHeight,
      sampleWidth: sample.imageData.width,
      sampleHeight: sample.imageData.height,
      createdAt: new Date().toISOString(),
      polylines: inference.polylines,
    }
    currentTime.value = sample.timestampSeconds
    store.setResult(result)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    const message = error instanceof Error ? error.message : '当前帧识别失败'
    store.setError(message)
    ElMessage.error(message)
  } finally {
    if (recognitionController === controller) recognitionController = null
  }
}

function exportJson(): void {
  if (!mediaInfo.value || !store.result || !resultMatchesCurrentFrame.value) return
  exportRecognitionJson(mediaInfo.value, store.result)
  ElMessage.success('识别 JSON 已下载')
}

async function exportPng(): Promise<void> {
  if (!mediaInfo.value || !store.result || !resultMatchesCurrentFrame.value || !stageRef.value) return
  try {
    stageRef.value.pausePlayback()
    await stageRef.value.waitForFrameReady()
    const frame = stageRef.value.getFrameSource(store.result.frameIndex)
    if (mediaInfo.value.kind === 'VIDEO'
      && Math.abs(frame.timestampSeconds - store.result.timestampSeconds) > CURRENT_FRAME_TOLERANCE_SECONDS) {
      throw new Error('视频画面已变化，请重新识别当前帧后再导出')
    }
    await exportAnnotatedPng(frame, mediaInfo.value, store.result)
    ElMessage.success('标注 PNG 已下载')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '标注图导出失败')
  }
}

function undoEdit(): void {
  store.undo()
}

async function discardResultForFrameChange(): Promise<boolean> {
  if (store.result && !(await confirmDiscardReview())) return false
  recognitionController?.abort()
  recognitionController = null
  sessionRevision += 1
  store.setMediaReady()
  return true
}

async function seekVideo(seconds: number): Promise<void> {
  if (!(await discardResultForFrameChange())) return
  const stage = stageRef.value
  if (!stage) return
  const activeSeekRevision = ++seekRevision
  isSeeking.value = true
  frameReady.value = false
  stage.pausePlayback()
  try {
    await stage.seekTo(seconds)
    if (activeSeekRevision !== seekRevision) return
    currentTime.value = stage.getFrameSource(0).timestampSeconds
    frameReady.value = true
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    const message = error instanceof Error ? error.message : '视频定位失败'
    store.setError(message)
    ElMessage.error(message)
  } finally {
    if (activeSeekRevision === seekRevision) isSeeking.value = false
  }
}

async function togglePlayback(): Promise<void> {
  if (!isPlaying.value && !(await discardResultForFrameChange())) return
  const stage = stageRef.value
  if (!stage) return
  if (!isPlaying.value) {
    try {
      await stage.waitForFrameReady()
      frameReady.value = true
    } catch (error) {
      handleStageError(error instanceof Error ? error.message : '视频帧尚未准备好')
      return
    }
  }
  stage.togglePlayback()
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  const target = event.target
  const editingText = target instanceof HTMLElement
    && (target.matches('input, textarea, select') || target.isContentEditable)
  if (editingText) return

  if (event.key === 'Escape') {
    store.setEditorMode('SELECT')
    store.select(null)
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && store.selection) {
    event.preventDefault()
    store.deleteSelection()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && store.canUndo) {
    event.preventDefault()
    store.undo()
  }
}

onMounted(() => window.addEventListener('keydown', handleGlobalKeydown))

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  recognitionController?.abort()
  void adapter.dispose()
  releaseMedia()
  store.resetSession()
})
</script>

<template>
  <main class="recognition-workspace">
    <RecognitionToolbar
      :run-status="store.runStatus"
      :ready-label="readyStatusLabel"
      :can-recognize="canRecognize"
      :can-export="canExport"
      @recognize="recognizeCurrentFrame"
      @export-json="exportJson"
      @export-png="exportPng"
    />

    <div class="recognition-grid">
      <RecognitionSourcePanel
        class="source-column"
        :media="mediaInfo"
        :run-status="store.runStatus"
        :error-message="store.errorMessage"
        :adapter-label="adapter.label"
        @select-file="handleSelectedFile"
        @load-sample="loadSample"
        @clear-media="clearMedia"
      />

      <RecognitionMediaStage
        ref="stageRef"
        class="stage-column"
        :media-url="mediaUrl"
        :media-kind="mediaInfo?.kind ?? null"
        :media-width="mediaInfo?.width ?? 0"
        :media-height="mediaInfo?.height ?? 0"
        :polylines="visiblePolylines"
        :selection="store.selection"
        :editor-mode="store.editorMode"
        :show-overlay="store.showOverlay"
        :draft-segment-start="store.draftSegmentStart"
        :busy="store.runStatus === 'RUNNING'"
        @media-ready="handleMediaReady"
        @frame-ready="handleFrameReady"
        @media-error="handleStageError"
        @time-update="currentTime = $event"
        @playback-change="isPlaying = $event"
        @select="store.select"
        @point-drag-start="store.beginPointMove"
        @move-point="store.movePoint"
        @insert-point="store.insertPoint"
        @draft-segment-point="handleDraftSegmentPoint"
      />

      <RecognitionInspector
        class="inspector-column"
        :result="currentResult"
        :selection="store.selection"
        :editor-mode="store.editorMode"
        :show-overlay="store.showOverlay"
        :can-undo="store.canUndo"
        @select="store.select"
        @update:editor-mode="store.setEditorMode"
        @update:show-overlay="store.setShowOverlay"
        @delete-selection="store.deleteSelection"
        @undo="undoEdit"
        @accept="store.setReviewStatus('ACCEPTED')"
        @reject="store.setReviewStatus('REJECTED')"
      />
    </div>

    <RecognitionTimeline
      :media-kind="mediaInfo?.kind ?? null"
      :current-time="currentTime"
      :duration="mediaInfo?.durationSeconds ?? null"
      :is-playing="isPlaying"
      :result="currentResult"
      :run-status="store.runStatus"
      :is-seeking="isSeeking"
      @seek="seekVideo"
      @toggle-playback="togglePlayback"
    />
  </main>
</template>

<style scoped>
.recognition-workspace {
  display: grid;
  width: 100%;
  height: 100dvh;
  min-height: 44rem;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  background: var(--color-paper);
}

.recognition-grid {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-columns: 17rem minmax(0, 1fr) 20rem;
  overflow: hidden;
}

.source-column,
.stage-column,
.inspector-column { min-height: 0; }

@media (max-width: 76rem) {
  .recognition-workspace { height: auto; min-height: 100dvh; overflow: visible; }
  .recognition-grid {
    grid-template-columns: 16rem minmax(0, 1fr);
    grid-template-areas:
      'source stage'
      'inspector inspector';
    overflow: visible;
  }
  .source-column { grid-area: source; }
  .stage-column { grid-area: stage; min-height: 38rem; }
  .inspector-column { grid-area: inspector; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .inspector-column :deep(> header) { grid-column: 1 / -1; }
}

@media (max-width: 48rem) {
  .recognition-grid {
    display: flex;
    flex-direction: column;
  }
  .source-column { order: 1; }
  .stage-column { order: 2; min-height: 0; }
  .inspector-column { order: 3; display: block; }
}
</style>
