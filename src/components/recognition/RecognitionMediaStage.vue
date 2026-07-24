<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  RecognitionEditorMode,
  RecognitionMediaKind,
  RecognitionPoint,
  RecognitionPolyline,
  RecognitionSelection,
} from '@/types/recognition'
import type { FrameSource } from '@/services/recognition/frameSampler'

interface MediaReadyPayload {
  width: number
  height: number
  durationSeconds: number | null
}

interface PointPayload {
  x: number
  y: number
}

interface DragState {
  pointerId: number
  polylineId: string
  pointId: string
}

const props = defineProps<{
  mediaUrl: string | null
  mediaKind: RecognitionMediaKind | null
  mediaWidth: number
  mediaHeight: number
  polylines: RecognitionPolyline[]
  selection: RecognitionSelection
  editorMode: RecognitionEditorMode
  showOverlay: boolean
  draftSegmentStart: RecognitionPoint | null
  busy: boolean
}>()

const emit = defineEmits<{
  (event: 'media-ready', payload: MediaReadyPayload): void
  (event: 'frame-ready'): void
  (event: 'media-error', message: string): void
  (event: 'time-update', seconds: number): void
  (event: 'playback-change', playing: boolean): void
  (event: 'select', selection: RecognitionSelection): void
  (event: 'point-drag-start'): void
  (event: 'move-point', polylineId: string, pointId: string, point: PointPayload): void
  (event: 'insert-point', polylineId: string, segmentIndex: number, point: PointPayload): void
  (event: 'draft-segment-point', point: PointPayload, minimumDistance: number): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const surfaceWidth = ref(0)
const surfaceHeight = ref(0)
const dragState = ref<DragState | null>(null)
let resizeObserver: ResizeObserver | null = null
let seekRevision = 0

const viewBox = computed(() => `0 0 ${Math.max(1, props.mediaWidth)} ${Math.max(1, props.mediaHeight)}`)
const selectedPolylineId = computed(() => props.selection?.polylineId ?? null)
const cursorLabel = computed(() => {
  if (props.busy) return '正在处理'
  if (props.editorMode === 'ADD_POINT') return '在线段中插点'
  if (props.editorMode === 'ADD_SEGMENT') {
    return props.draftSegmentStart ? '选择线段终点' : '选择线段起点'
  }
  return '选择 / 拖动'
})

const surfaceStyle = computed(() => ({
  width: `${surfaceWidth.value}px`,
  height: `${surfaceHeight.value}px`,
}))
const sourceUnitsPerCssPixel = computed(() => Math.max(
  props.mediaWidth / Math.max(1, surfaceWidth.value),
  props.mediaHeight / Math.max(1, surfaceHeight.value),
))
const pointHitRadius = computed(() => 22 * sourceUnitsPerCssPixel.value)
const pointRingRadius = computed(() => 7 * sourceUnitsPerCssPixel.value)
const pointCoreRadius = computed(() => 3.5 * sourceUnitsPerCssPixel.value)

function updateSurfaceSize(): void {
  const container = containerRef.value
  if (!container || props.mediaWidth <= 0 || props.mediaHeight <= 0) return
  const bounds = container.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) return
  const scale = Math.min(bounds.width / props.mediaWidth, bounds.height / props.mediaHeight)
  surfaceWidth.value = Math.max(1, Math.floor(props.mediaWidth * scale))
  surfaceHeight.value = Math.max(1, Math.floor(props.mediaHeight * scale))
}

watch(
  () => [props.mediaWidth, props.mediaHeight, props.mediaUrl],
  () => {
    seekRevision += 1
    nextTick(updateSurfaceSize)
  },
)

function handleImageReady(): void {
  const image = imageRef.value
  if (!image?.naturalWidth || !image.naturalHeight) return
  emit('media-ready', {
    width: image.naturalWidth,
    height: image.naturalHeight,
    durationSeconds: null,
  })
  emit('frame-ready')
  nextTick(updateSurfaceSize)
}

function handleVideoReady(): void {
  const video = videoRef.value
  if (!video?.videoWidth || !video.videoHeight) return
  emit('media-ready', {
    width: video.videoWidth,
    height: video.videoHeight,
    durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
  })
  emit('time-update', video.currentTime)
  nextTick(updateSurfaceSize)
}

function handleVideoFrameReady(): void {
  const video = videoRef.value
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
  emit('frame-ready')
}

function handleMediaError(): void {
  emit(
    'media-error',
    props.mediaKind === 'VIDEO'
      ? '视频无法解码。MP4 只是容器，请改用浏览器支持的 H.264/AAC 编码。'
      : '图片无法解码。请确认文件未损坏，并改用 PNG、JPEG 或 WebP。',
  )
}

function toMediaPoint(event: PointerEvent): PointPayload | null {
  const svg = svgRef.value
  const matrix = svg?.getScreenCTM()
  if (!svg || !matrix) return null
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return {
    x: Math.round(Math.max(0, Math.min(props.mediaWidth, point.x)) * 10) / 10,
    y: Math.round(Math.max(0, Math.min(props.mediaHeight, point.y)) * 10) / 10,
  }
}

function distanceToSegment(point: PointPayload, start: RecognitionPoint, end: RecognitionPoint): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy))
}

function findNearestSegment(point: PointPayload): { polylineId: string; segmentIndex: number } | null {
  const preferred = props.polylines.find((line) => line.id === selectedPolylineId.value)
  const candidates = preferred ? [preferred] : props.polylines
  let best: { polylineId: string; segmentIndex: number; distance: number } | null = null

  for (const line of candidates) {
    for (let index = 0; index < line.points.length - 1; index += 1) {
      const start = line.points[index]
      const end = line.points[index + 1]
      if (!start || !end) continue
      const distance = distanceToSegment(point, start, end)
      if (!best || distance < best.distance) {
        best = { polylineId: line.id, segmentIndex: index, distance }
      }
    }
  }
  return best
}

function handleCanvasPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || props.busy || !props.mediaUrl) return
  const point = toMediaPoint(event)
  if (!point) return

  if (props.editorMode === 'ADD_SEGMENT') {
    emit('draft-segment-point', point, 8 * sourceUnitsPerCssPixel.value)
    return
  }
  if (props.editorMode === 'ADD_POINT') {
    const segment = findNearestSegment(point)
    if (segment) emit('insert-point', segment.polylineId, segment.segmentIndex, point)
    return
  }
  emit('select', null)
}

function handleLinePointerDown(event: PointerEvent, polylineId: string): void {
  if (event.button !== 0 || props.busy) return
  event.stopPropagation()
  if (props.editorMode === 'SELECT') emit('select', { kind: 'POLYLINE', polylineId })
}

function handleSegmentPointerDown(
  event: PointerEvent,
  polylineId: string,
  segmentIndex: number,
): void {
  if (event.button !== 0 || props.busy) return
  event.stopPropagation()
  const point = toMediaPoint(event)
  if (props.editorMode === 'ADD_POINT' && point) {
    emit('insert-point', polylineId, segmentIndex, point)
    return
  }
  if (props.editorMode === 'SELECT') {
    emit('select', { kind: 'SEGMENT', polylineId, segmentIndex })
  }
}

function handlePointPointerDown(
  event: PointerEvent,
  polylineId: string,
  pointId: string,
): void {
  if (event.button !== 0 || props.busy || props.editorMode !== 'SELECT') return
  event.preventDefault()
  event.stopPropagation()
  emit('select', { kind: 'POINT', polylineId, pointId })
  emit('point-drag-start')
  dragState.value = { pointerId: event.pointerId, polylineId, pointId }
  svgRef.value?.setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent): void {
  const drag = dragState.value
  if (!drag || drag.pointerId !== event.pointerId || props.busy) return
  const point = toMediaPoint(event)
  if (point) emit('move-point', drag.polylineId, drag.pointId, point)
}

function finishDrag(event: PointerEvent): void {
  const drag = dragState.value
  if (!drag || drag.pointerId !== event.pointerId) return
  if (svgRef.value?.hasPointerCapture(event.pointerId)) {
    svgRef.value.releasePointerCapture(event.pointerId)
  }
  dragState.value = null
}

function nudgePoint(event: KeyboardEvent, line: RecognitionPolyline, point: RecognitionPoint): void {
  const direction: Record<string, PointPayload> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  }
  const delta = direction[event.key]
  if (!delta) return
  event.preventDefault()
  emit('point-drag-start')
  emit('move-point', line.id, point.id, { x: point.x + delta.x, y: point.y + delta.y })
}

function linePoints(line: RecognitionPolyline): string {
  return line.points.map((point) => `${point.x},${point.y}`).join(' ')
}

function isSegmentSelected(polylineId: string, segmentIndex: number): boolean {
  return props.selection?.kind === 'SEGMENT'
    && props.selection.polylineId === polylineId
    && props.selection.segmentIndex === segmentIndex
}

function getFrameSource(frameIndex: number): FrameSource {
  const element = props.mediaKind === 'VIDEO' ? videoRef.value : imageRef.value
  if (!element || props.mediaWidth <= 0 || props.mediaHeight <= 0) {
    throw new Error('媒体尚未准备好，请等待预览加载完成')
  }
  if (element instanceof HTMLImageElement && (!element.complete || !element.naturalWidth)) {
    throw new Error('图片帧尚未解码完成，请稍后重试')
  }
  if (element instanceof HTMLVideoElement && element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error('视频当前帧尚未解码完成，请稍后重试')
  }
  return {
    element,
    width: props.mediaWidth,
    height: props.mediaHeight,
    frameIndex,
    timestampSeconds: props.mediaKind === 'VIDEO' ? (videoRef.value?.currentTime ?? 0) : 0,
  }
}

function waitForFrameReady(): Promise<void> {
  const element = props.mediaKind === 'VIDEO' ? videoRef.value : imageRef.value
  if (!element) return Promise.reject(new Error('媒体预览尚未挂载'))

  const isReady = element instanceof HTMLImageElement
    ? element.complete && element.naturalWidth > 0
    : element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && element.videoWidth > 0
  if (isReady) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const readyEvent = element instanceof HTMLImageElement ? 'load' : 'loadeddata'
    const timer = window.setTimeout(() => finish(new Error('等待媒体帧解码超时，请重新载入素材')), 15_000)
    const cleanup = () => {
      window.clearTimeout(timer)
      element.removeEventListener(readyEvent, onReady)
      element.removeEventListener('error', onError)
    }
    const finish = (error?: Error) => {
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const onReady = () => finish()
    const onError = () => finish(new Error('媒体当前帧无法解码'))
    element.addEventListener(readyEvent, onReady, { once: true })
    element.addEventListener('error', onError, { once: true })
  })
}

function waitForVideoPaint(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    const timeout = window.setTimeout(finish, 160)
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(() => {
        window.clearTimeout(timeout)
        finish()
      })
      return
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.clearTimeout(timeout)
      finish()
    }))
  })
}

async function seekTo(seconds: number): Promise<void> {
  const video = videoRef.value
  if (!video || !Number.isFinite(seconds)) throw new Error('视频时间轴尚未准备好')
  await waitForFrameReady()
  const target = Math.max(0, Math.min(video.duration || 0, seconds))
  const activeRevision = ++seekRevision

  if (Math.abs(video.currentTime - target) > 0.0005) {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
      }
      const onSeeked = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('视频定位失败，请重新载入素材'))
      }
      video.addEventListener('seeked', onSeeked, { once: true })
      video.addEventListener('error', onError, { once: true })
      video.currentTime = target
    })
  }

  if (activeRevision !== seekRevision) throw new DOMException('视频定位已被更新', 'AbortError')
  await waitForVideoPaint(video)
  if (activeRevision !== seekRevision) throw new DOMException('视频定位已被更新', 'AbortError')
  emit('time-update', video.currentTime)
  emit('frame-ready')
}

function togglePlayback(): void {
  const video = videoRef.value
  if (!video) return
  if (video.paused) void video.play()
  else video.pause()
}

function pausePlayback(): void {
  videoRef.value?.pause()
}

defineExpose({ getFrameSource, waitForFrameReady, seekTo, togglePlayback, pausePlayback })

onMounted(() => {
  resizeObserver = new ResizeObserver(updateSurfaceSize)
  if (containerRef.value) resizeObserver.observe(containerRef.value)
  nextTick(updateSurfaceSize)
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <section class="recognition-stage-shell" aria-labelledby="recognition-stage-title">
    <header class="stage-heading">
      <div>
        <h2 id="recognition-stage-title">媒体标注台</h2>
        <p>图像像素坐标 · 左上角为 0,0</p>
      </div>
      <span class="stage-mode" :class="`is-${props.editorMode.toLowerCase()}`" role="status">
        <i aria-hidden="true" />
        {{ cursorLabel }}
      </span>
    </header>

    <div ref="containerRef" class="media-viewport">
      <div
        v-if="props.mediaUrl && props.mediaWidth > 0 && props.mediaHeight > 0"
        class="media-surface"
        :style="surfaceStyle"
      >
        <img
          v-if="props.mediaKind === 'IMAGE'"
          ref="imageRef"
          :src="props.mediaUrl"
          alt="待识别接触线素材"
          draggable="false"
          @load="handleImageReady"
          @error="handleMediaError"
        />
        <video
          v-else
          ref="videoRef"
          :src="props.mediaUrl"
          playsinline
          preload="auto"
          aria-label="待识别接触线视频"
          @loadedmetadata="handleVideoReady"
          @loadeddata="handleVideoFrameReady"
          @durationchange="handleVideoReady"
          @timeupdate="emit('time-update', videoRef?.currentTime ?? 0)"
          @play="emit('playback-change', true)"
          @pause="emit('playback-change', false)"
          @error="handleMediaError"
        />

        <svg
          ref="svgRef"
          class="annotation-layer"
          :class="{
            'is-hidden': !props.showOverlay,
            'is-crosshair': props.editorMode !== 'SELECT',
            'is-dragging': dragState,
          }"
          :viewBox="viewBox"
          preserveAspectRatio="none"
          aria-label="接触线识别与人工校正图层"
          @pointerdown="handleCanvasPointerDown"
          @pointermove="handlePointerMove"
          @pointerup="finishDrag"
          @pointercancel="finishDrag"
        >
          <g v-for="line in props.polylines" :key="line.id" class="wire-group">
            <polyline
              class="wire-mask"
              :class="[`is-${line.reviewStatus.toLowerCase()}`, { 'is-selected': selectedPolylineId === line.id }]"
              :points="linePoints(line)"
              :stroke-width="line.maskWidthPx"
              @pointerdown="handleLinePointerDown($event, line.id)"
            />
            <polyline
              class="wire-line"
              :class="[`is-${line.reviewStatus.toLowerCase()}`, { 'is-selected': selectedPolylineId === line.id }]"
              :points="linePoints(line)"
              @pointerdown="handleLinePointerDown($event, line.id)"
            />

            <g class="segment-layer">
              <line
                v-for="(point, segmentIndex) in line.points.slice(0, -1)"
                :key="`${line.id}-segment-${segmentIndex}`"
                class="segment-hit"
                :class="{ 'is-selected': isSegmentSelected(line.id, segmentIndex) }"
                :x1="point.x"
                :y1="point.y"
                :x2="line.points[segmentIndex + 1]?.x"
                :y2="line.points[segmentIndex + 1]?.y"
                :tabindex="props.busy ? -1 : 0"
                role="button"
                :aria-disabled="props.busy"
                :aria-label="`${line.name} 的第 ${segmentIndex + 1} 段`"
                @pointerdown="handleSegmentPointerDown($event, line.id, segmentIndex)"
                @keydown.enter="emit('select', { kind: 'SEGMENT', polylineId: line.id, segmentIndex })"
                @keydown.space.prevent="emit('select', { kind: 'SEGMENT', polylineId: line.id, segmentIndex })"
              />
            </g>

            <g v-if="selectedPolylineId === line.id && props.showOverlay" class="point-layer">
              <g
                v-for="(point, pointIndex) in line.points"
                :key="point.id"
                class="control-point"
                :class="{ 'is-selected': props.selection?.kind === 'POINT' && props.selection.pointId === point.id }"
                :transform="`translate(${point.x} ${point.y})`"
                :tabindex="props.busy ? -1 : 0"
                role="button"
                :aria-disabled="props.busy"
                :aria-label="`${line.name} 控制点 ${pointIndex + 1}，坐标 ${point.x}, ${point.y}`"
                @pointerdown="handlePointPointerDown($event, line.id, point.id)"
                @keydown="nudgePoint($event, line, point)"
                @focus="emit('select', { kind: 'POINT', polylineId: line.id, pointId: point.id })"
              >
                <circle class="point-hit" :r="pointHitRadius" />
                <circle class="point-ring" :r="pointRingRadius" />
                <circle class="point-core" :r="pointCoreRadius" />
              </g>
            </g>
          </g>

          <g v-if="props.draftSegmentStart && props.showOverlay" class="draft-point" aria-hidden="true">
            <circle :cx="props.draftSegmentStart.x" :cy="props.draftSegmentStart.y" r="10" />
            <line :x1="props.draftSegmentStart.x - 16" :x2="props.draftSegmentStart.x + 16" :y1="props.draftSegmentStart.y" :y2="props.draftSegmentStart.y" />
            <line :x1="props.draftSegmentStart.x" :x2="props.draftSegmentStart.x" :y1="props.draftSegmentStart.y - 16" :y2="props.draftSegmentStart.y + 16" />
          </g>
        </svg>

        <div v-if="props.busy" class="processing-scrim" role="status" aria-live="polite">
          <span class="processing-spinner" aria-hidden="true" />
          <strong>正在分析当前帧</strong>
          <span>最长边缩放至 960 px，不上传媒体</span>
        </div>
      </div>

      <div v-else class="stage-empty">
        <svg viewBox="0 0 160 86" aria-hidden="true">
          <path d="M12 65 C40 50, 62 51, 88 38 S130 26, 149 19" />
          <path d="M12 73 L149 28" />
          <circle cx="12" cy="65" r="4" />
          <circle cx="88" cy="38" r="4" />
          <circle cx="149" cy="19" r="4" />
        </svg>
        <strong>载入一张图片或一段 MP4</strong>
        <p>识别结果会在同一像素坐标系内叠加，拖点后可直接导出。</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.recognition-stage-shell {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto minmax(24rem, 1fr);
  background: var(--color-paper-2);
  border-inline: var(--rule-thin) solid var(--color-rule);
}

.stage-heading {
  display: flex;
  min-height: 4.25rem;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-surface);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.stage-heading h2,
.stage-heading p {
  margin: 0;
}

.stage-heading h2 {
  color: var(--color-ink);
  font-size: var(--text-base);
}

.stage-heading p {
  margin-top: var(--space-2xs);
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.stage-mode {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  gap: var(--space-xs);
  padding-inline: var(--space-sm);
  color: var(--color-accent-hover);
  background: var(--color-accent-soft);
  border-radius: var(--radius-lg);
  font-size: var(--text-xs);
  font-weight: 700;
  white-space: nowrap;
}

.stage-mode i {
  width: 0.45rem;
  height: 0.45rem;
  background: var(--color-accent);
  border-radius: 50%;
}

.media-viewport {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 0;
  place-items: center;
  overflow: hidden;
  background: var(--color-media-stage);
}

.media-surface {
  position: relative;
  min-width: 1px;
  min-height: 1px;
  overflow: hidden;
  background: var(--color-log-paper);
  box-shadow: 0 0 0 var(--rule-thin) var(--color-media-rule);
}

.media-surface img,
.media-surface video,
.annotation-layer {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.media-surface img,
.media-surface video {
  object-fit: fill;
  user-select: none;
}

.annotation-layer {
  z-index: var(--z-raised);
  overflow: visible;
  touch-action: none;
}

.annotation-layer.is-crosshair {
  cursor: crosshair;
}

.annotation-layer.is-dragging {
  cursor: grabbing;
}

.annotation-layer.is-hidden .wire-group,
.annotation-layer.is-hidden .draft-point {
  visibility: hidden;
}

.wire-line,
.segment-hit {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.wire-mask {
  fill: none;
  stroke: var(--color-accent);
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.16;
}

.wire-line {
  stroke: var(--color-accent-line);
  stroke-width: 2.5;
  pointer-events: stroke;
}

.wire-mask.is-accepted,
.wire-line.is-accepted {
  stroke: var(--color-success);
}

.wire-mask.is-rejected,
.wire-line.is-rejected {
  stroke: var(--color-danger);
}

.wire-line.is-rejected {
  stroke-dasharray: 7 5;
}

.wire-line.is-selected {
  stroke-width: 4;
}

.segment-hit {
  stroke: var(--color-surface-raised);
  stroke-width: 18;
  opacity: 0;
  pointer-events: stroke;
  cursor: pointer;
}

.segment-hit.is-selected {
  stroke: var(--color-warning);
  stroke-width: 6;
  opacity: 0.92;
}

.segment-hit:active {
  stroke: var(--color-focus);
  opacity: 1;
}

.segment-hit[aria-disabled='true'] { pointer-events: none; }

.segment-hit:focus-visible {
  outline: none;
  stroke: var(--color-focus);
  stroke-width: 7;
  opacity: 1;
}

.control-point {
  cursor: grab;
  outline: none;
}

.point-hit {
  fill: var(--color-surface-raised);
  opacity: 0;
}

.point-ring {
  fill: var(--color-surface-raised);
  stroke: var(--color-accent);
  stroke-width: 2.5;
  vector-effect: non-scaling-stroke;
}

.point-core {
  fill: var(--color-accent);
}

.control-point.is-selected .point-ring,
.control-point:focus-visible .point-ring {
  stroke: var(--color-focus);
  stroke-width: 4;
}

.control-point:active .point-ring { fill: var(--color-accent-soft); }
.control-point[aria-disabled='true'] { cursor: not-allowed; opacity: 0.55; }

.draft-point circle,
.draft-point line {
  fill: var(--color-surface-raised);
  stroke: var(--color-warning);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.processing-scrim {
  position: absolute;
  z-index: var(--z-dropdown);
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-xs);
  color: var(--color-log-ink);
  background: var(--color-media-overlay);
  text-align: center;
}

.processing-scrim strong {
  font-size: var(--text-base);
}

.processing-scrim span:last-child {
  color: var(--color-log-muted);
  font-size: var(--text-sm);
}

.processing-spinner {
  width: 2rem;
  height: 2rem;
  border: var(--rule-strong) solid var(--color-media-rule);
  border-top-color: var(--color-accent-line);
  border-radius: 50%;
  animation: recognition-spin 900ms linear infinite;
}

@media (pointer: coarse) {
  .segment-hit { stroke-width: var(--control-height); }
}

.stage-empty {
  display: grid;
  max-width: 28rem;
  justify-items: center;
  gap: var(--space-sm);
  padding: var(--space-xl);
  color: var(--color-log-muted);
  text-align: center;
}

.stage-empty svg {
  width: min(12rem, 60%);
}

.stage-empty path,
.stage-empty circle {
  fill: none;
  stroke: var(--color-accent-line);
  stroke-width: 2;
}

.stage-empty path:first-child {
  stroke-dasharray: 4 4;
}

.stage-empty circle {
  fill: var(--color-media-stage);
}

.stage-empty strong {
  color: var(--color-log-ink);
  font-size: var(--text-md);
}

.stage-empty p {
  max-width: 42ch;
  margin: 0;
  line-height: 1.6;
}

@keyframes recognition-spin {
  to { transform: rotate(360deg); }
}

@media (pointer: coarse) {
  .segment-hit {
    stroke-width: 28;
  }
}

@media (max-width: 40rem) {
  .stage-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .recognition-stage-shell {
    grid-template-rows: auto minmax(22rem, 62dvh);
    border-inline: 0;
  }
}
</style>
