<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import CoordinationEventTimeline from '@/components/coordination/CoordinationEventTimeline.vue'
import CoordinationMap from '@/components/coordination/CoordinationMap.vue'
import CoordinationStatusPanel from '@/components/coordination/CoordinationStatusPanel.vue'
import CoordinationToolbar from '@/components/coordination/CoordinationToolbar.vue'
import FaultInjectionPanel from '@/components/coordination/FaultInjectionPanel.vue'
import PerceptionStage from '@/components/coordination/PerceptionStage.vue'
import { createLineGuidanceController } from '@/services/guidance/lineGuidanceController'
import { createVirtualDroneEngine } from '@/services/guidance/virtualDroneEngine'
import { BrowserEdgeAdapter } from '@/services/recognition/browserEdgeAdapter'
import { sampleMediaFrame } from '@/services/recognition/frameSampler'
import { createHeuristicTemporalTracker } from '@/services/tracking/heuristicTemporalTracker'
import {
  createVideoFrameLoop,
  type VideoFrameLoop,
  type VideoFrameTick,
} from '@/services/tracking/videoFrameLoop'
import { useCoordinationStore } from '@/stores/coordinationStore'
import type {
  CoordinationLogEntry,
  CoordinationMessageRecord,
  CoordinationPhase,
  LineTrackQuality,
  LineTrackingInput,
} from '@/types/coordination'
import type {
  GuidanceCommand,
  NormalizedPoint,
  VirtualDroneState,
  WireTrackCandidate,
  WireTrackFrame,
} from '@/types/tracking'

type CoordinationMode = 'VIRTUAL_CLOSED_LOOP' | 'VIDEO_SHADOW'
type TimelineSource = 'SYSTEM' | 'DRONE' | 'ROBOT' | 'TRACKER'
type TimelineLevel = 'INFO' | 'ACTION' | 'WARNING' | 'ERROR' | 'COMMUNICATION'

interface TimelineItem {
  id: string
  timestampMs: number
  source: TimelineSource
  level: TimelineLevel
  message: string
}

const VIDEO_SIZE_LIMIT = 500 * 1024 * 1024
const CAMERA_SPAN_METERS = 2.4
const SYNTHETIC_POINT_COUNT = 11
const RELEVANT_TRACKING_PHASES = new Set<CoordinationPhase>([
  'ACQUIRING_LINE',
  'FOLLOWING_LINE',
  'LINE_RECOVERY',
  'APPROACHING_NEXT_OBSTACLE',
])
const ACTIVE_GUIDANCE_PHASES = new Set<CoordinationPhase>([
  'ACQUIRING_LINE',
  'FOLLOWING_LINE',
  'LINE_RECOVERY',
  'APPROACHING_NEXT_OBSTACLE',
])

const store = useCoordinationStore()
store.setAutoLineTracking(false)

const tracker = createHeuristicTemporalTracker({
  confirmationFrames: store.scenario.timing.stableFramesRequired,
  holdAfterMissingMs: store.scenario.timing.lineLossHoldMs,
})
const guidanceController = createLineGuidanceController()
const virtualDroneEngine = createVirtualDroneEngine({}, {
  altitude: 4.8,
  y: 0.52,
  heading: 0.18,
})
const recognitionAdapter = new BrowserEdgeAdapter()

const mode = ref<CoordinationMode>('VIRTUAL_CLOSED_LOOP')
const track = ref<WireTrackFrame | null>(null)
const guidance = ref<GuidanceCommand | null>(null)
const virtualDrone = ref<VirtualDroneState>(virtualDroneEngine.getState())
const localEvents = ref<TimelineItem[]>([])
const videoInput = ref<HTMLInputElement | null>(null)
const videoElement = ref<HTMLVideoElement | null>(null)
const videoUrl = ref<string | null>(null)
const videoName = ref('')
const videoReady = ref(false)
const videoDurationSeconds = ref(0)
const videoCurrentSeconds = ref(0)
const videoDimensions = ref({ width: 0, height: 0 })
const droppedVideoFrames = ref(0)
const videoProcessingError = ref<string | null>(null)

let localEventSequence = 0
let perceptionFrameHandle: number | null = null
let lastProcessedClockMs = 0
let lastTrackSignature = ''
let videoFrameLoop: VideoFrameLoop | null = null

const currentObstacleLabel = computed(() => store.currentObstacle?.name ?? '无')
const nextObstacleLabel = computed(() => store.nextObstacle?.name ?? '任务终点')
const toolbarRunStatus = computed(() => store.phase === 'SAFE_HOLD'
  ? 'SAFE_HOLD'
  : store.lifecycle)
const canStart = computed(() => store.canStart
  && (mode.value === 'VIRTUAL_CLOSED_LOOP' || videoReady.value))
const canPause = computed(() => store.lifecycle === 'RUNNING')
const canStep = computed(() => ['IDLE', 'PAUSED'].includes(store.lifecycle)
  && (mode.value === 'VIRTUAL_CLOSED_LOOP' || videoReady.value))
const canExport = computed(() => store.logs.length > 0 || localEvents.value.length > 0)
const modeTitle = computed(() => mode.value === 'VIRTUAL_CLOSED_LOOP'
  ? '虚拟闭环验证'
  : '视频影子验证')
const modeDescription = computed(() => mode.value === 'VIRTUAL_CLOSED_LOOP'
  ? '无人机横向与航向状态会改变下一帧合成观测，控制建议回写虚拟动力学，构成软件闭环。'
  : '本地 MP4 连续生成跟踪与控制建议；建议不会改变已录制视频，也不会发送给真实飞控。')
const trackingPhase = computed(() => track.value?.phase ?? 'IDLE')
const trackConfidence = computed(() => track.value?.combinedConfidence ?? 0)
const lateralErrorMeters = computed(() => (track.value?.lateralError ?? 0) * CAMERA_SPAN_METERS)
const headingErrorDegrees = computed(() => (track.value?.headingError ?? 0) * 180 / Math.PI)
const displayedForwardSpeed = computed(() => mode.value === 'VIRTUAL_CLOSED_LOOP'
  ? virtualDrone.value.forwardVelocity
  : (guidance.value?.forward ?? 0))
const droneLateralOffset = computed(() => mode.value === 'VIRTUAL_CLOSED_LOOP'
  ? virtualDrone.value.y
  : 0)
const droneCarryingRobot = computed(() => store.phase === 'ASSIST_EXECUTING')
const robotState = computed(() => {
  if (store.faults.robotLinkDown) return 'LINK_LOST'
  if (store.phase === 'COMPLETED') return 'COMPLETED'
  if (store.phase === 'ASSIST_EXECUTING') return 'BEING_ASSISTED'
  if (store.phase === 'VERIFYING_ROBOT_CLEAR') return 'VERIFYING_CLEAR'
  if (store.phase === 'ASSIST_PREPARING') return 'ASSIST_READY'
  if (store.phase === 'ASSIST_REQUESTED') {
    return store.machine.ready.robot ? 'ASSIST_READY' : 'REQUESTING_ASSIST'
  }
  if (store.phase === 'SAFE_HOLD') return 'WAITING_FOR_DRONE'
  const currentCleared = store.currentObstacle
    ? store.robot.clearedObstacleIds.includes(store.currentObstacle.id)
    : false
  const pickup = (currentCleared ? store.nextObstacle : store.currentObstacle)?.pickup.routeProgress ?? 1
  return store.robot.routeProgress + 0.0001 >= pickup ? 'BLOCKED' : 'MOVING'
})
const assistAdapterState = computed(() => {
  if (store.faults.assistFailure) return '故障预置'
  if (store.phase === 'ASSIST_EXECUTING') return '执行中'
  if (store.phase === 'VERIFYING_ROBOT_CLEAR') return '待确认'
  return '模拟适配器就绪'
})
const videoDurationLabel = computed(() => formatDuration(videoDurationSeconds.value))
const videoTimeLabel = computed(() => formatDuration(videoCurrentSeconds.value))

const timelineEvents = computed<TimelineItem[]>(() => {
  const coreLogs = store.logs.map(mapLogToTimeline)
  const protocolMessages = store.messages.map(mapMessageToTimeline)
  return [...coreLogs, ...protocolMessages, ...localEvents.value]
    .sort((first, second) => first.timestampMs - second.timestampMs
      || first.id.localeCompare(second.id))
})

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`
}

function mapLogToTimeline(log: CoordinationLogEntry): TimelineItem {
  return {
    id: `log-${log.id}`,
    timestampMs: log.timestamp,
    source: log.source === 'COORDINATOR' ? 'SYSTEM' : log.source,
    level: log.level,
    message: log.message,
  }
}

function mapMessageToTimeline(record: CoordinationMessageRecord): TimelineItem {
  const direction = record.direction === 'INBOUND' ? '接收' : '发送'
  const result = record.accepted ? '已接受' : `已拒绝 · ${record.rejectionCode ?? 'UNKNOWN'}`
  return {
    id: `protocol-${record.id}`,
    timestampMs: record.timestamp,
    source: record.message.source === 'COORDINATOR' ? 'SYSTEM' : record.message.source,
    level: record.accepted ? 'COMMUNICATION' : 'WARNING',
    message: `${direction} ${record.message.type} · ${record.message.cycleId}/${record.message.obstacleId} · ${result}`,
  }
}

function pushLocalEvent(
  source: TimelineSource,
  level: TimelineLevel,
  message: string,
): void {
  localEventSequence += 1
  localEvents.value.push({
    id: `local-${localEventSequence}`,
    timestampMs: store.clockMs,
    source,
    level,
    message,
  })
  if (localEvents.value.length > 160) localEvents.value.shift()
}

function syntheticCandidate(state: VirtualDroneState, clockMs: number): WireTrackCandidate {
  const nearX = 0.5 - state.y / CAMERA_SPAN_METERS
  const headingVisualError = -state.heading
  const points: NormalizedPoint[] = []

  for (let index = 0; index < SYNTHETIC_POINT_COUNT; index += 1) {
    const progress = index / (SYNTHETIC_POINT_COUNT - 1)
    const y = 0.86 - progress * 0.72
    const lookAhead = progress * 0.72
    const deterministicTexture = Math.sin(clockMs / 700 + index * 0.72) * 0.0022
    const x = nearX + headingVisualError * lookAhead * 0.62
      + Math.sin(progress * Math.PI) * 0.012
      + deterministicTexture
    points.push({ x: clamp(x, 0.035, 0.965), y })
  }

  const errorPenalty = Math.min(0.16, Math.abs(state.y) * 0.035 + Math.abs(state.heading) * 0.08)
  return {
    candidateId: 'virtual-contact-line-l1',
    detectorConfidence: 0.95 - errorPenalty,
    points,
  }
}

function qualityFromTrack(frame: WireTrackFrame): LineTrackQuality {
  if (frame.status === 'LOST') return 'LOST'
  if (frame.status === 'AMBIGUOUS') return 'AMBIGUOUS'
  if (frame.status === 'PREDICTED' || frame.phase === 'DEGRADED') return 'WEAK'
  if (frame.status === 'DETECTED' && frame.phase === 'TRACKING') return 'STABLE'
  return 'ACQUIRING'
}

function mapTrackToCore(frame: WireTrackFrame): LineTrackingInput {
  return {
    quality: qualityFromTrack(frame),
    trackId: frame.trackId,
    confidence: frame.combinedConfidence,
    lateralErrorMeters: (frame.lateralError ?? 0) * CAMERA_SPAN_METERS,
    headingErrorDegrees: (frame.headingError ?? 0) * 180 / Math.PI,
    curvature: frame.curvature ?? 0,
    observedAtMs: store.clockMs,
  }
}

function recordTrackTransition(frame: WireTrackFrame): void {
  const signature = `${frame.phase}:${frame.status}:${frame.trackId ?? 'none'}`
  if (signature === lastTrackSignature) return
  lastTrackSignature = signature
  const level: TimelineLevel = ['HOLD', 'FAULT'].includes(frame.phase)
    || ['AMBIGUOUS', 'LOST'].includes(frame.status)
    ? 'WARNING'
    : frame.phase === 'TRACKING'
      ? 'ACTION'
      : 'INFO'
  pushLocalEvent(
    'TRACKER',
    level,
    `跟踪状态 ${frame.phase}/${frame.status} · ${frame.trackId ?? '无有效轨迹'} · 置信度 ${Math.round(frame.combinedConfidence * 100)}%`,
  )
}

function applyTrackFrame(
  frame: WireTrackFrame,
  guidanceClockMs: number,
  dynamicsDeltaSeconds: number,
  applyVirtualDynamics: boolean,
): void {
  track.value = frame
  recordTrackTransition(frame)

  if (RELEVANT_TRACKING_PHASES.has(store.phase)) {
    store.updateLineTracking(mapTrackToCore(frame))
  }

  const manualHold = !ACTIVE_GUIDANCE_PHASES.has(store.phase)
    || store.faults.lineLost
    || store.faults.robotLinkDown
    || store.faults.emergencyStop
  guidance.value = guidanceController.compute(frame, guidanceClockMs, manualHold)

  if (applyVirtualDynamics) {
    virtualDrone.value = virtualDroneEngine.step(
      guidance.value,
      Math.max(0, dynamicsDeltaSeconds),
      guidanceClockMs,
    )
  }
}

function processVirtualClock(clockMs: number, deltaMs: number): void {
  const candidate = store.faults.lineLost
    ? null
    : syntheticCandidate(virtualDrone.value, clockMs)
  const frame = tracker.update(candidate, clockMs, clockMs)
  applyTrackFrame(frame, clockMs, deltaMs / 1000, true)
}

function schedulePerceptionFrame(): void {
  if (perceptionFrameHandle !== null) return
  perceptionFrameHandle = requestAnimationFrame(handlePerceptionFrame)
}

function handlePerceptionFrame(): void {
  perceptionFrameHandle = null
  if (
    mode.value === 'VIRTUAL_CLOSED_LOOP'
    && store.lifecycle === 'RUNNING'
    && store.clockMs > lastProcessedClockMs
  ) {
    const deltaMs = Math.min(500, Math.max(1, store.clockMs - lastProcessedClockMs))
    lastProcessedClockMs = store.clockMs
    processVirtualClock(store.clockMs, deltaMs)
  }
  schedulePerceptionFrame()
}

function candidatesFromVideo(
  frameWidth: number,
  frameHeight: number,
  polylines: Awaited<ReturnType<BrowserEdgeAdapter['recognize']>>['polylines'],
): WireTrackCandidate[] {
  if (frameWidth <= 0 || frameHeight <= 0) return []
  return polylines
    .filter((polyline) => polyline.points.length >= 2)
    .map((polyline) => ({
      candidateId: polyline.id,
      detectorConfidence: polyline.confidence ?? 0,
      points: polyline.points.map((point) => ({
        x: clamp(point.x / frameWidth, 0, 1),
        y: clamp(point.y / frameHeight, 0, 1),
      })),
    }))
}

async function processVideoTick(tick: VideoFrameTick, signal: AbortSignal): Promise<void> {
  if (mode.value !== 'VIDEO_SHADOW' || store.lifecycle !== 'RUNNING') return
  const sample = sampleMediaFrame({
    element: tick.video,
    width: tick.width,
    height: tick.height,
    frameIndex: tick.sequence,
    timestampSeconds: tick.mediaTimeSeconds,
  })
  const inference = await recognitionAdapter.recognize(sample, signal)
  if (signal.aborted) return
  const candidates = candidatesFromVideo(sample.originalWidth, sample.originalHeight, inference.polylines)
  const outputAtMs = performance.now()
  const frame = tracker.update(candidates.length ? candidates : null, tick.capturedAtMs, outputAtMs)
  droppedVideoFrames.value = tick.droppedBeforeProcessing
  videoCurrentSeconds.value = tick.mediaTimeSeconds
  applyTrackFrame(frame, outputAtMs, 0, false)
}

async function processCurrentVideoFrame(): Promise<void> {
  const element = videoElement.value
  if (!element || !videoReady.value) return
  const controller = new AbortController()
  const capturedAtMs = performance.now()
  const sample = sampleMediaFrame({
    element,
    width: element.videoWidth,
    height: element.videoHeight,
    frameIndex: Math.max(1, Math.round(element.currentTime * 30)),
    timestampSeconds: element.currentTime,
  })
  const inference = await recognitionAdapter.recognize(sample, controller.signal)
  const candidates = candidatesFromVideo(sample.originalWidth, sample.originalHeight, inference.polylines)
  const outputAtMs = performance.now()
  const frame = tracker.update(candidates.length ? candidates : null, capturedAtMs, outputAtMs)
  applyTrackFrame(frame, outputAtMs, 0, false)
}

function resetPerception(): void {
  tracker.reset()
  guidanceController.reset()
  virtualDrone.value = virtualDroneEngine.reset({
    altitude: 4.8,
    y: 0.52,
    heading: 0.18,
  })
  track.value = null
  guidance.value = null
  lastProcessedClockMs = store.clockMs
  lastTrackSignature = ''
  droppedVideoFrames.value = 0
}

function pauseVideoProcessing(): void {
  videoFrameLoop?.pause()
  videoElement.value?.pause()
}

async function startVideoProcessing(): Promise<void> {
  const element = videoElement.value
  if (!element || !videoReady.value) return
  videoFrameLoop?.start()
  try {
    await element.play()
  } catch (error) {
    videoFrameLoop?.pause()
    const message = error instanceof Error ? error.message : '视频无法开始播放'
    videoProcessingError.value = message
    ElMessage.error(`视频播放失败：${message}`)
  }
}

function handleStart(): void {
  if (!canStart.value) return
  if (!store.start()) return
  lastProcessedClockMs = store.clockMs
  pushLocalEvent('SYSTEM', 'ACTION', `${modeTitle.value}已启动。`)
  if (mode.value === 'VIDEO_SHADOW') void startVideoProcessing()
}

function handlePause(): void {
  if (!store.pause()) return
  pauseVideoProcessing()
}

async function handleStep(): Promise<void> {
  if (!canStep.value) return
  const previousPhase = store.phase
  if (!store.step(100)) return
  if (store.phase === 'ACQUIRING_LINE' && previousPhase !== store.phase) resetPerception()
  if (mode.value === 'VIRTUAL_CLOSED_LOOP') {
    const deltaMs = Math.max(1, store.clockMs - lastProcessedClockMs)
    lastProcessedClockMs = store.clockMs
    processVirtualClock(store.clockMs, deltaMs)
  } else {
    try {
      await processCurrentVideoFrame()
    } catch (error) {
      handleVideoProcessingError(error)
    }
  }
}

function handleReset(announce = true): void {
  pauseVideoProcessing()
  store.reset()
  store.setAutoLineTracking(false)
  localEvents.value = []
  localEventSequence = 0
  resetPerception()
  if (announce) pushLocalEvent('SYSTEM', 'INFO', '协同任务与虚拟设备状态已重置。')
}

function handleEmergency(): void {
  if (store.faults.emergencyStop) return
  if (store.emergencyStop('人工紧急停止：任务已中止，需重置后重新开始。')) {
    pauseVideoProcessing()
    pushLocalEvent('SYSTEM', 'ERROR', '人工紧急停止已触发；所有自动动作终止。')
  }
}

function handleModeChange(nextMode: CoordinationMode): void {
  if (nextMode === mode.value) return
  handleReset(false)
  mode.value = nextMode
  pushLocalEvent(
    'SYSTEM',
    'INFO',
    nextMode === 'VIRTUAL_CLOSED_LOOP'
      ? '已切换为虚拟闭环；控制建议将反馈到虚拟无人机。'
      : '已切换为视频影子；控制建议不会回写录制画面。',
  )
}

function handleLineFault(): void {
  const enabled = !store.faults.lineLost
  store.injectFault('lineLost', enabled)
  if (!enabled) {
    tracker.reset()
    lastTrackSignature = ''
    if (store.phase === 'SAFE_HOLD') store.clearSafeHold()
  }
}

function handleCommunicationFault(): void {
  const enabled = !store.faults.robotLinkDown
  store.injectFault('robotLinkDown', enabled)
  if (!enabled && store.phase === 'SAFE_HOLD') store.clearSafeHold()
}

function handleAssistFailure(): void {
  const enabled = !store.faults.assistFailure
  store.injectFault('assistFailure', enabled)
  if (!enabled && store.phase === 'SAFE_HOLD') store.clearSafeHold()
}

function clearFaults(): void {
  if (store.faults.lineLost) store.injectFault('lineLost', false)
  if (store.faults.robotLinkDown) store.injectFault('robotLinkDown', false)
  if (store.faults.assistFailure) store.injectFault('assistFailure', false)
  if (store.faults.messageMismatch) store.injectFault('messageMismatch', false)
  tracker.reset()
  lastTrackSignature = ''
  if (store.phase === 'SAFE_HOLD') store.clearSafeHold()
}

function downloadRunSnapshot(): void {
  const payload = {
    ...store.exportSnapshot(),
    demoRuntime: {
      mode: mode.value,
      perception: track.value,
      guidance: guidance.value,
      virtualDrone: mode.value === 'VIRTUAL_CLOSED_LOOP' ? virtualDrone.value : null,
      video: mode.value === 'VIDEO_SHADOW'
        ? {
            fileName: videoName.value,
            width: videoDimensions.value.width,
            height: videoDimensions.value.height,
            durationSeconds: videoDurationSeconds.value,
            currentTimeSeconds: videoCurrentSeconds.value,
            droppedBeforeProcessing: droppedVideoFrames.value,
          }
        : null,
      timeline: timelineEvents.value,
      disclaimer: 'Demo 输出仅供软件流程验证，不是实机飞行记录或接触网安全检测结论。',
    },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `rail-coordination-${store.machine.missionId}-${store.machine.cycleId}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function chooseVideo(): void {
  videoInput.value?.click()
}

function releaseVideo(): void {
  pauseVideoProcessing()
  videoFrameLoop?.dispose()
  videoFrameLoop = null
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  videoUrl.value = null
  videoName.value = ''
  videoReady.value = false
  videoDurationSeconds.value = 0
  videoCurrentSeconds.value = 0
  videoDimensions.value = { width: 0, height: 0 }
  videoProcessingError.value = null
  droppedVideoFrames.value = 0
}

async function handleVideoSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const fileName = file.name.toLowerCase()
  if (!(file.type === 'video/mp4' || fileName.endsWith('.mp4'))) {
    ElMessage.error('请选择浏览器可解码的 MP4 视频（建议 H.264）')
    return
  }
  if (file.size <= 0 || file.size > VIDEO_SIZE_LIMIT) {
    ElMessage.error('视频必须是非空文件且不超过 500 MB')
    return
  }

  releaseVideo()
  videoName.value = file.name
  videoUrl.value = URL.createObjectURL(file)
  videoProcessingError.value = null
  await nextTick()
  videoElement.value?.load()
}

function handleVideoMetadata(): void {
  const element = videoElement.value
  if (!element || !element.videoWidth || !element.videoHeight) return
  videoReady.value = true
  videoDimensions.value = { width: element.videoWidth, height: element.videoHeight }
  videoDurationSeconds.value = Number.isFinite(element.duration) ? element.duration : 0
  videoCurrentSeconds.value = element.currentTime
  videoProcessingError.value = null
  videoFrameLoop?.dispose()
  videoFrameLoop = createVideoFrameLoop(element, processVideoTick, {
    fallbackFps: 10,
    onError: handleVideoProcessingError,
  })
  pushLocalEvent(
    'SYSTEM',
    'INFO',
    `已载入本地视频 ${videoName.value} · ${element.videoWidth}×${element.videoHeight}；文件不会上传。`,
  )
}

function handleVideoProcessingError(error: unknown): void {
  const message = error instanceof Error ? error.message : '视频帧处理失败'
  videoProcessingError.value = message
  pushLocalEvent('TRACKER', 'ERROR', `视频影子处理失败：${message}`)
}

function handleVideoDecodeError(): void {
  videoReady.value = false
  videoProcessingError.value = '浏览器无法解码该视频，请改用 H.264 MP4。'
  ElMessage.error(videoProcessingError.value)
}

watch(
  () => store.phase,
  (nextPhase, previousPhase) => {
    if (nextPhase === 'ACQUIRING_LINE' && previousPhase !== nextPhase) {
      tracker.reset()
      guidanceController.reset()
      track.value = null
      guidance.value = null
      lastTrackSignature = ''
      lastProcessedClockMs = store.clockMs
      pushLocalEvent('TRACKER', 'INFO', '进入重新捕获阶段：需要连续 3 帧稳定观测。')
    }
  },
)

watch(
  () => store.lifecycle,
  (lifecycle) => {
    if (lifecycle !== 'RUNNING') pauseVideoProcessing()
  },
)

onMounted(async () => {
  await recognitionAdapter.initialize()
  schedulePerceptionFrame()
})

onBeforeUnmount(() => {
  if (perceptionFrameHandle !== null) cancelAnimationFrame(perceptionFrameHandle)
  perceptionFrameHandle = null
  releaseVideo()
  void recognitionAdapter.dispose()
  store.dispose()
})
</script>

<template>
  <main class="coordination-workspace">
    <CoordinationToolbar
      :mode="mode"
      :run-status="toolbarRunStatus"
      :mission-state="store.phase"
      :can-start="canStart"
      :can-pause="canPause"
      :can-step="canStep"
      :can-export="canExport"
      :emergency-active="store.faults.emergencyStop"
      @update:mode="handleModeChange"
      @start="handleStart"
      @pause="handlePause"
      @step="handleStep"
      @reset="handleReset"
      @export="downloadRunSnapshot"
      @emergency="handleEmergency"
    />

    <section class="mission-brief" aria-labelledby="coordination-title">
      <div class="brief-copy">
        <p class="eyebrow">机器人越障 · 无人机接力</p>
        <h1 id="coordination-title">{{ modeTitle }}</h1>
        <p>{{ modeDescription }}</p>
      </div>

      <dl class="identity-strip">
        <div><dt>MISSION</dt><dd>{{ store.machine.missionId }}</dd></div>
        <div><dt>CYCLE</dt><dd>{{ store.machine.cycleId }}</dd></div>
        <div><dt>OBSTACLE</dt><dd>{{ store.machine.currentObstacleId }}</dd></div>
      </dl>

      <div class="interlock-strip" aria-label="协同互锁状态">
        <span :class="{ 'is-ready': store.machine.ready.robot }">
          <i aria-hidden="true" />机器人 Ready
        </span>
        <span :class="{ 'is-ready': store.machine.ready.drone }">
          <i aria-hidden="true" />无人机 Ready
        </span>
        <span :class="{ 'is-fault': store.faults.assistFailure }">
          <i aria-hidden="true" />AssistAdapter · {{ assistAdapterState }}
        </span>
      </div>
    </section>

    <section class="coordination-body">
      <div class="visual-column">
        <section v-if="mode === 'VIDEO_SHADOW'" class="video-source-panel" aria-labelledby="video-source-title">
          <header>
            <div>
              <p>只读媒体输入</p>
              <h2 id="video-source-title">本地视频源</h2>
            </div>
            <div class="video-actions">
              <input
                ref="videoInput"
                class="sr-only"
                type="file"
                aria-label="选择 MP4 文件"
                accept="video/mp4,.mp4"
                @change="handleVideoSelected"
              />
              <el-button @click="chooseVideo">选择 MP4</el-button>
              <el-button v-if="videoUrl" text @click="releaseVideo">移除</el-button>
            </div>
          </header>

          <div v-if="videoUrl" class="video-preview">
            <video
              ref="videoElement"
              :src="videoUrl"
              muted
              loop
              playsinline
              preload="metadata"
              @loadedmetadata="handleVideoMetadata"
              @timeupdate="videoCurrentSeconds = ($event.target as HTMLVideoElement).currentTime"
              @error="handleVideoDecodeError"
            />
            <div class="video-source-badge">LOCAL · READ ONLY</div>
          </div>
          <button v-else class="video-drop-target" type="button" @click="chooseVideo">
            <strong>选择一段前视 H.264 MP4</strong>
            <span>浏览器本地解码，不上传；最大 500 MB。</span>
          </button>

          <dl v-if="videoUrl" class="video-metadata tabular">
            <div><dt>文件</dt><dd>{{ videoName }}</dd></div>
            <div><dt>画面</dt><dd>{{ videoDimensions.width }}×{{ videoDimensions.height }}</dd></div>
            <div><dt>进度</dt><dd>{{ videoTimeLabel }} / {{ videoDurationLabel }}</dd></div>
            <div><dt>覆盖帧</dt><dd>{{ droppedVideoFrames }}</dd></div>
          </dl>
          <p v-if="videoProcessingError" class="video-error" role="alert">
            {{ videoProcessingError }}
          </p>
        </section>

        <PerceptionStage
          :track="track"
          :mission-state="store.phase"
          :guidance="guidance"
          :fault-line-lost="store.faults.lineLost"
          :mode="mode"
        />
      </div>

      <CoordinationMap
        :scenario="store.scenario"
        :drone-progress="store.drone.routeProgress"
        :drone-lateral-offset="droneLateralOffset"
        :robot-progress="store.robot.routeProgress"
        :current-obstacle-id="store.machine.currentObstacleId"
        :next-obstacle-id="store.machine.nextObstacleId"
        :mission-state="store.phase"
        :drone-carrying-robot="droneCarryingRobot"
      />

      <CoordinationStatusPanel
        :mission-state="store.phase"
        :resume-state="store.machine.phaseBeforeHold"
        :robot-state="robotState"
        :tracking-phase="trackingPhase"
        :elapsed-ms="store.elapsedMs"
        :drone-progress="store.drone.routeProgress"
        :robot-progress="store.robot.routeProgress"
        :current-obstacle-label="currentObstacleLabel"
        :next-obstacle-label="nextObstacleLabel"
        :track-confidence="trackConfidence"
        :lateral-error="lateralErrorMeters"
        :heading-error-deg="headingErrorDegrees"
        :forward-speed="displayedForwardSpeed"
      />
    </section>

    <FaultInjectionPanel
      :line-lost="store.faults.lineLost"
      :communication-lost="store.faults.robotLinkDown"
      :assist-failure-armed="store.faults.assistFailure"
      :safe-hold="store.phase === 'SAFE_HOLD'"
      @toggle-line-lost="handleLineFault"
      @toggle-communication-lost="handleCommunicationFault"
      @toggle-assist-failure="handleAssistFailure"
      @clear="clearFaults"
    />

    <CoordinationEventTimeline :events="timelineEvents" />
  </main>
</template>

<style scoped>
/* Hallmark · macrostructure: Map / Diagram · variant: synchronized-perception-coordination · genre: modern-minimal · theme: Cobalt · tone: technical-friendly · anchor hue: cobalt · signature: shared-clock forward perception + top-down map · nav: N1b · footer: Ft4 · pre-emit critique: P5 H5 E5 S5 R5 V5 · slop: pass (1–58) · contrast: pass (40–41) · honest: pass (46) · chrome: pass (47) · tokens: pass (48) · responsive: pass (49) · icons: pass (30) · mobile: pass (34, 49, 50–57) */
.coordination-workspace {
  min-width: 0;
  min-height: 100dvh;
  color: var(--color-ink-2);
  background: var(--color-paper);
}

.mission-brief {
  display: grid;
  grid-template-columns: minmax(18rem, 1.35fr) minmax(20rem, 1fr) minmax(18rem, 1fr);
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-lg);
  padding-block-end: var(--space-xl);
  background: var(--color-surface-raised);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.brief-copy,
.brief-copy h1,
.brief-copy p {
  margin: 0;
}

.brief-copy {
  min-width: 0;
}

.brief-copy h1 {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-style: normal;
  letter-spacing: -0.035em;
  line-height: 1.05;
}

.brief-copy > p:last-child {
  max-width: 64ch;
  margin-top: var(--space-xs);
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.eyebrow,
.identity-strip dt,
.video-source-panel header p {
  color: var(--color-accent-hover);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.identity-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2xs);
  min-width: 0;
  margin: 0;
}

.identity-strip > div {
  min-width: 0;
  padding: var(--space-xs) var(--space-sm);
  background: var(--color-paper-2);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-sm);
}

.identity-strip dt,
.identity-strip dd {
  margin: 0;
}

.identity-strip dd {
  margin-top: var(--space-2xs);
  overflow: hidden;
  color: var(--color-ink);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.interlock-strip {
  display: grid;
  gap: var(--space-xs);
}

.interlock-strip span {
  display: flex;
  min-height: 2.25rem;
  align-items: center;
  gap: var(--space-xs);
  padding-inline: var(--space-sm);
  color: var(--color-muted);
  background: var(--color-paper-2);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
}

.interlock-strip i {
  width: var(--space-xs);
  height: var(--space-xs);
  flex: 0 0 auto;
  background: var(--color-neutral);
  border-radius: 50%;
}

.interlock-strip span.is-ready {
  color: var(--color-success);
  border-color: var(--color-success);
}

.interlock-strip span.is-ready i { background: var(--color-success); }
.interlock-strip span.is-fault { color: var(--color-danger); border-color: var(--color-danger); }
.interlock-strip span.is-fault i { background: var(--color-danger); }

.coordination-body {
  display: grid;
  min-width: 0;
  align-items: start;
  grid-template-columns: minmax(24rem, 1.05fr) minmax(24rem, 0.95fr) minmax(18rem, 21rem);
  gap: var(--space-md);
  padding: var(--space-md);
}

.visual-column {
  display: grid;
  min-width: 0;
  gap: var(--space-md);
}

.video-source-panel {
  display: grid;
  min-width: 0;
  overflow: clip;
  background: var(--color-surface);
  border: var(--rule-thin) solid var(--color-rule);
  border-radius: var(--radius-md);
}

.video-source-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.video-source-panel header p,
.video-source-panel h2 {
  margin: 0;
}

.video-source-panel h2 {
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-style: normal;
}

.video-actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.video-actions :deep(.el-button + .el-button) { margin-left: 0; }

.video-preview {
  position: relative;
  display: grid;
  min-height: 10rem;
  max-height: 13rem;
  place-items: center;
  overflow: hidden;
  background: var(--color-media-stage);
}

.video-preview video {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 13rem;
  object-fit: contain;
}

.video-source-badge {
  position: absolute;
  inset-block-start: var(--space-sm);
  inset-inline-start: var(--space-sm);
  padding: var(--space-2xs) var(--space-xs);
  color: var(--color-log-ink);
  background: var(--color-media-overlay);
  border: var(--rule-thin) solid var(--color-media-rule);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
}

.video-drop-target {
  display: flex;
  min-height: 10rem;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-lg);
  color: var(--color-ink-2);
  background: var(--color-paper-2);
  border: 0;
  cursor: pointer;
}

.video-drop-target strong { color: var(--color-ink); }
.video-drop-target span { color: var(--color-muted); font-size: var(--text-sm); }
.video-drop-target:active { background: var(--color-paper-3); }
.video-drop-target:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.video-metadata {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  border-top: var(--rule-thin) solid var(--color-rule);
}

.video-metadata > div {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  border-bottom: var(--rule-thin) solid var(--color-rule);
}

.video-metadata dt { color: var(--color-muted); }
.video-metadata dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--color-ink);
  font-family: var(--font-mono);
  text-align: end;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-error {
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  color: var(--color-danger);
  background: var(--color-danger-soft);
  font-size: var(--text-sm);
}

.coordination-body > :deep(.status-panel) {
  max-height: 52rem;
}

.coordination-workspace > :deep(.event-timeline) {
  min-height: 13rem;
  max-height: 20rem;
}

@media (hover: hover) and (pointer: fine) {
  .video-drop-target:hover { background: var(--color-accent-soft); }
}

@media (max-width: 82rem) {
  .mission-brief {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  }

  .interlock-strip {
    grid-column: 1 / -1;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .coordination-body {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .coordination-body > :deep(.status-panel) {
    grid-column: 1 / -1;
    max-height: none;
  }
}

@media (max-width: 62rem) {
  .mission-brief,
  .coordination-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .identity-strip,
  .interlock-strip {
    grid-column: auto;
  }

  .coordination-body > :deep(.status-panel) { grid-column: auto; }
}

@media (max-width: 44rem) {
  .mission-brief,
  .coordination-body {
    gap: var(--space-sm);
    padding: var(--space-md);
  }

  .identity-strip,
  .interlock-strip,
  .video-metadata {
    grid-template-columns: minmax(0, 1fr);
  }

  .video-source-panel > header {
    align-items: stretch;
    flex-direction: column;
  }

  .video-actions :deep(.el-button:first-of-type) { flex: 1; }
}

@media (max-width: 24rem) {
  .mission-brief,
  .coordination-body { padding-inline: var(--space-sm); }
  .brief-copy h1 { font-size: var(--text-lg); }
}
</style>
