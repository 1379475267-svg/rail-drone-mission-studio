export type VideoFrameLoopState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'DISPOSED'

export interface VideoFrameTick {
  sequence: number
  capturedAtMs: number
  expectedDisplayTimeMs: number
  mediaTimeSeconds: number
  presentedFrames: number | null
  width: number
  height: number
  /** 因处理器忙而被后续帧覆盖的累计帧数。 */
  droppedBeforeProcessing: number
  video: HTMLVideoElement
}

export type VideoFrameLoopHandler = (
  frame: VideoFrameTick,
  signal: AbortSignal,
) => void | Promise<void>

export interface VideoFrameLoopOptions {
  /** requestVideoFrameCallback 不可用时的轮询频率。 */
  fallbackFps: number
  onError?: (error: unknown) => void
}

interface VideoFrameMetadataLike {
  expectedDisplayTime?: number
  mediaTime?: number
  presentedFrames?: number
  width?: number
  height?: number
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameMetadataLike) => void,
  ) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

const DEFAULT_OPTIONS: VideoFrameLoopOptions = {
  fallbackFps: 10,
}

function monotonicNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * 解码帧消费循环。处理器忙时只保留最新一帧，不建立延迟队列。
 */
export class VideoFrameLoop {
  readonly options: VideoFrameLoopOptions

  private state: VideoFrameLoopState = 'IDLE'
  private sequence = 0
  private runToken = 0
  private videoFrameHandle: number | null = null
  private fallbackHandle: ReturnType<typeof setTimeout> | null = null
  private processing = false
  private pendingFrame: VideoFrameTick | null = null
  private abortController = new AbortController()
  private lastFallbackMediaTime: number | null = null
  private droppedFrames = 0

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly handler: VideoFrameLoopHandler,
    options: Partial<VideoFrameLoopOptions> = {},
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      fallbackFps: Math.max(1, Math.min(60, options.fallbackFps ?? DEFAULT_OPTIONS.fallbackFps)),
    }
  }

  getState(): VideoFrameLoopState {
    return this.state
  }

  start(): boolean {
    if (this.state === 'DISPOSED') return false
    if (this.state === 'RUNNING') return true

    this.runToken += 1
    this.abortController.abort()
    this.abortController = new AbortController()
    this.pendingFrame = null
    this.state = 'RUNNING'
    this.scheduleSource(this.runToken)
    return true
  }

  pause(): boolean {
    if (this.state !== 'RUNNING') return false
    this.state = 'PAUSED'
    this.runToken += 1
    this.cancelSource()
    this.abortController.abort()
    this.pendingFrame = null
    return true
  }

  stop(): void {
    if (this.state === 'DISPOSED') return
    this.state = 'STOPPED'
    this.runToken += 1
    this.cancelSource()
    this.abortController.abort()
    this.pendingFrame = null
    this.sequence = 0
    this.droppedFrames = 0
    this.lastFallbackMediaTime = null
  }

  dispose(): void {
    if (this.state === 'DISPOSED') return
    this.stop()
    this.state = 'DISPOSED'
  }

  private scheduleSource(token: number): void {
    if (this.state !== 'RUNNING' || token !== this.runToken) return
    const callbackVideo = this.video as VideoWithFrameCallback
    if (typeof callbackVideo.requestVideoFrameCallback === 'function') {
      this.videoFrameHandle = callbackVideo.requestVideoFrameCallback((now, metadata) => {
        this.videoFrameHandle = null
        if (this.state !== 'RUNNING' || token !== this.runToken) return
        // 先预约下一帧，才异步处理当前帧，才能及时覆盖落后帧。
        this.scheduleSource(token)
        this.enqueueFrame(this.createTick(now, metadata))
      })
      return
    }

    const intervalMs = 1000 / this.options.fallbackFps
    this.fallbackHandle = setTimeout(() => {
      this.fallbackHandle = null
      if (this.state !== 'RUNNING' || token !== this.runToken) return
      this.scheduleSource(token)
      if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

      // fallback 不重复处理同一个暂停帧。
      const mediaTime = this.video.currentTime
      if (this.lastFallbackMediaTime === mediaTime) return
      this.lastFallbackMediaTime = mediaTime
      const now = monotonicNow()
      this.enqueueFrame(this.createTick(now, {
        expectedDisplayTime: now,
        mediaTime,
        width: this.video.videoWidth,
        height: this.video.videoHeight,
      }))
    }, intervalMs)
  }

  private createTick(now: number, metadata: VideoFrameMetadataLike): VideoFrameTick {
    this.sequence += 1
    return {
      sequence: this.sequence,
      capturedAtMs: metadata.expectedDisplayTime ?? now,
      expectedDisplayTimeMs: metadata.expectedDisplayTime ?? now,
      mediaTimeSeconds: metadata.mediaTime ?? this.video.currentTime,
      presentedFrames: metadata.presentedFrames ?? null,
      width: metadata.width ?? this.video.videoWidth,
      height: metadata.height ?? this.video.videoHeight,
      droppedBeforeProcessing: this.droppedFrames,
      video: this.video,
    }
  }

  private enqueueFrame(frame: VideoFrameTick): void {
    if (this.state !== 'RUNNING') return
    if (this.processing) {
      if (this.pendingFrame) this.droppedFrames += 1
      this.pendingFrame = {
        ...frame,
        droppedBeforeProcessing: this.droppedFrames,
      }
      return
    }
    void this.processFrame(frame)
  }

  private async processFrame(frame: VideoFrameTick): Promise<void> {
    this.processing = true
    try {
      await this.handler(frame, this.abortController.signal)
    } catch (error) {
      if (!isAbortError(error)) this.options.onError?.(error)
    } finally {
      this.processing = false
      if (this.state !== 'RUNNING') return
      const nextFrame = this.pendingFrame
      this.pendingFrame = null
      // 如果 pause/start 发生在旧处理器结束之前，这里使用新一代 token
      // 接管最新待处理帧，避免它永久滞留在 pendingFrame。
      if (nextFrame) void this.processFrame(nextFrame)
    }
  }

  private cancelSource(): void {
    const callbackVideo = this.video as VideoWithFrameCallback
    if (
      this.videoFrameHandle !== null
      && typeof callbackVideo.cancelVideoFrameCallback === 'function'
    ) {
      callbackVideo.cancelVideoFrameCallback(this.videoFrameHandle)
    }
    this.videoFrameHandle = null

    if (this.fallbackHandle !== null) clearTimeout(this.fallbackHandle)
    this.fallbackHandle = null
  }
}

export function createVideoFrameLoop(
  video: HTMLVideoElement,
  handler: VideoFrameLoopHandler,
  options: Partial<VideoFrameLoopOptions> = {},
): VideoFrameLoop {
  return new VideoFrameLoop(video, handler, options)
}
