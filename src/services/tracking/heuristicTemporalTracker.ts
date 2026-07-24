import type {
  NormalizedPoint,
  TrackingPhase,
  WireTrackCandidate,
  WireTrackFrame,
  WireTrackingReasonCode,
} from '@/types/tracking'

export interface HeuristicTemporalTrackerOptions {
  /** 每条线统一重采样后的点数。 */
  resamplePointCount: number
  /** 新观测在 EMA 中的权重。 */
  smoothingAlpha: number
  /** 平均归一化点距超过此值时拒绝跳变。 */
  jumpGate: number
  /** 最低单帧检测置信度。 */
  minimumDetectorConfidence: number
  /** 连续多少帧后确认跟踪。 */
  confirmationFrames: number
  /** 可使用速度外推的最长时间。 */
  predictionWindowMs: number
  /** 从最后一次真实观测到强制 HOLD 的时间。 */
  holdAfterMissingMs: number
  /** 真实检测结果的最大时效。 */
  resultValidityMs: number
  /** 预测线上单个点的最大外推位移。 */
  maximumPredictionDisplacement: number
}

const DEFAULT_OPTIONS: HeuristicTemporalTrackerOptions = {
  resamplePointCount: 11,
  smoothingAlpha: 0.46,
  jumpGate: 0.16,
  minimumDetectorConfidence: 0.18,
  confirmationFrames: 3,
  predictionWindowMs: 360,
  holdAfterMissingMs: 500,
  resultValidityMs: 500,
  maximumPredictionDisplacement: 0.055,
}

const MINIMUM_POLYLINE_LENGTH = 0.012
const MINIMUM_TIME_STEP_MS = 1

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function monotonicNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function distance(a: NormalizedPoint, b: NormalizedPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clonePoints(points: readonly NormalizedPoint[]): NormalizedPoint[] {
  return points.map((point) => ({ ...point }))
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function validPoint(point: NormalizedPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function resamplePolyline(
  source: readonly NormalizedPoint[],
  sampleCount: number,
): NormalizedPoint[] | null {
  const points = source
    .filter(validPoint)
    .map((point) => ({ x: clamp01(point.x), y: clamp01(point.y) }))

  if (points.length < 2) return null

  const cumulativeDistances = [0]
  for (let index = 1; index < points.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] + distance(points[index - 1], points[index]),
    )
  }

  const totalLength = cumulativeDistances.at(-1) ?? 0
  if (totalLength < MINIMUM_POLYLINE_LENGTH) return null

  const result: NormalizedPoint[] = []
  let segmentIndex = 1
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const targetDistance = totalLength * sampleIndex / Math.max(1, sampleCount - 1)
    while (
      segmentIndex < cumulativeDistances.length - 1
      && cumulativeDistances[segmentIndex] < targetDistance
    ) {
      segmentIndex += 1
    }

    const segmentStartDistance = cumulativeDistances[segmentIndex - 1]
    const segmentEndDistance = cumulativeDistances[segmentIndex]
    const segmentLength = Math.max(Number.EPSILON, segmentEndDistance - segmentStartDistance)
    const progress = clamp01((targetDistance - segmentStartDistance) / segmentLength)
    const start = points[segmentIndex - 1]
    const end = points[segmentIndex]
    result.push({
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    })
  }

  // 跟踪线统一按靠近画面底部到远端的方向排列。
  if (result[0].y < result[result.length - 1].y) result.reverse()
  return result
}

function meanPointDistance(
  first: readonly NormalizedPoint[],
  second: readonly NormalizedPoint[],
): number {
  if (first.length === 0 || first.length !== second.length) return Number.POSITIVE_INFINITY
  return first.reduce((sum, point, index) => sum + distance(point, second[index]), 0) / first.length
}

function mixPoints(
  previous: readonly NormalizedPoint[],
  current: readonly NormalizedPoint[],
  alpha: number,
): NormalizedPoint[] {
  return current.map((point, index) => ({
    x: clamp01(previous[index].x * (1 - alpha) + point.x * alpha),
    y: clamp01(previous[index].y * (1 - alpha) + point.y * alpha),
  }))
}

interface TrackGeometry {
  near: NormalizedPoint | null
  far: NormalizedPoint | null
  heading: number | null
  curvature: number | null
  lateralError: number | null
  headingError: number | null
}

function calculateGeometry(points: readonly NormalizedPoint[]): TrackGeometry {
  if (points.length < 2) {
    return {
      near: null,
      far: null,
      heading: null,
      curvature: null,
      lateralError: null,
      headingError: null,
    }
  }

  const near = { ...points[0] }
  const far = { ...points[points.length - 1] }
  const deltaX = far.x - near.x
  const deltaY = far.y - near.y
  // 画面向上是相机前向，因此用 -deltaY 作为前向分量。
  const heading = Math.atan2(deltaX, -deltaY)

  let accumulatedTurn = 0
  let turnCount = 0
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = Math.atan2(
      points[index].x - points[index - 1].x,
      -(points[index].y - points[index - 1].y),
    )
    const after = Math.atan2(
      points[index + 1].x - points[index].x,
      -(points[index + 1].y - points[index].y),
    )
    accumulatedTurn += normalizeAngle(after - before)
    turnCount += 1
  }

  return {
    near,
    far,
    heading,
    curvature: turnCount > 0 ? clamp(accumulatedTurn / (turnCount * Math.PI), -1, 1) : 0,
    lateralError: near.x - 0.5,
    headingError: heading,
  }
}

function noGeometry(): TrackGeometry {
  return {
    near: null,
    far: null,
    heading: null,
    curvature: null,
    lateralError: null,
    headingError: null,
  }
}

/**
 * 用于 Demo 的可解释时序跟踪器。
 *
 * 它不是训练模型，也不产生任何真实飞控输出。调用方应在视频跳转后 reset，
 * 避免把时间轴跳变解释成视觉跳变。
 */
export class HeuristicTemporalTracker {
  readonly options: HeuristicTemporalTrackerOptions

  private sequence = 0
  private trackOrdinal = 0
  private trackId: string | null = null
  private phase: TrackingPhase = 'ACQUIRING'
  private points: NormalizedPoint[] | null = null
  private pointVelocity: NormalizedPoint[] = []
  private lastDetectionAtMs: number | null = null
  private lastInputAtMs: number | null = null
  private stableFrames = 0
  private established = false
  private requiresNewTrack = false
  private hasEverCreatedTrack = false
  private lastTemporalConfidence = 0
  private lastCombinedConfidence = 0

  constructor(options: Partial<HeuristicTemporalTrackerOptions> = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      resamplePointCount: Math.max(3, Math.round(options.resamplePointCount ?? DEFAULT_OPTIONS.resamplePointCount)),
      confirmationFrames: Math.max(1, Math.round(options.confirmationFrames ?? DEFAULT_OPTIONS.confirmationFrames)),
      smoothingAlpha: clamp01(options.smoothingAlpha ?? DEFAULT_OPTIONS.smoothingAlpha),
      jumpGate: Math.max(0.001, options.jumpGate ?? DEFAULT_OPTIONS.jumpGate),
      predictionWindowMs: Math.max(0, options.predictionWindowMs ?? DEFAULT_OPTIONS.predictionWindowMs),
      holdAfterMissingMs: Math.max(1, options.holdAfterMissingMs ?? DEFAULT_OPTIONS.holdAfterMissingMs),
      resultValidityMs: Math.max(1, options.resultValidityMs ?? DEFAULT_OPTIONS.resultValidityMs),
      maximumPredictionDisplacement: Math.max(
        0,
        options.maximumPredictionDisplacement ?? DEFAULT_OPTIONS.maximumPredictionDisplacement,
      ),
    }
    this.options.predictionWindowMs = Math.min(
      this.options.predictionWindowMs,
      this.options.holdAfterMissingMs,
    )
  }

  update(
    input: WireTrackCandidate | readonly WireTrackCandidate[] | null,
    capturedAtMs = monotonicNow(),
    outputAtMs = monotonicNow(),
  ): WireTrackFrame {
    const safeCapturedAtMs = Number.isFinite(capturedAtMs) ? capturedAtMs : monotonicNow()
    const safeOutputAtMs = Math.max(
      safeCapturedAtMs,
      Number.isFinite(outputAtMs) ? outputAtMs : monotonicNow(),
    )
    this.sequence += 1

    if (this.lastInputAtMs !== null && safeCapturedAtMs < this.lastInputAtMs) {
      this.clearTrackMemory()
      this.phase = 'FAULT'
      this.lastInputAtMs = safeCapturedAtMs
      return this.createFrame({
        capturedAtMs: safeCapturedAtMs,
        outputAtMs: safeOutputAtMs,
        status: 'LOST',
        phase: 'FAULT',
        points: [],
        detectorConfidence: 0,
        temporalConfidence: 0,
        combinedConfidence: 0,
        validUntilMs: safeCapturedAtMs,
        reasonCodes: ['NON_MONOTONIC_TIMESTAMP'],
      })
    }
    this.lastInputAtMs = safeCapturedAtMs

    const candidates = input === null ? [] : Array.isArray(input) ? input : [input]
    const prepared = candidates
      .map((candidate) => ({
        candidate,
        points: resamplePolyline(candidate.points, this.options.resamplePointCount),
      }))
      .filter((entry): entry is { candidate: WireTrackCandidate; points: NormalizedPoint[] } => (
        entry.points !== null
      ))

    if (prepared.length > 1) {
      return this.handleAmbiguity(safeCapturedAtMs, safeOutputAtMs)
    }

    const onlyCandidate = prepared[0]
    if (!onlyCandidate) {
      const reason: WireTrackingReasonCode | undefined = candidates.length > 0
        ? 'INVALID_CANDIDATE'
        : undefined
      return this.handleMissing(safeCapturedAtMs, safeOutputAtMs, reason)
    }

    const detectorConfidence = clamp01(onlyCandidate.candidate.detectorConfidence)
    if (detectorConfidence < this.options.minimumDetectorConfidence) {
      return this.handleMissing(
        safeCapturedAtMs,
        safeOutputAtMs,
        'LOW_DETECTOR_CONFIDENCE',
      )
    }

    return this.handleDetection(
      onlyCandidate.points,
      detectorConfidence,
      safeCapturedAtMs,
      safeOutputAtMs,
    )
  }

  reset(): void {
    this.sequence = 0
    this.trackOrdinal = 0
    this.lastInputAtMs = null
    this.hasEverCreatedTrack = false
    this.clearTrackMemory()
    this.phase = 'ACQUIRING'
  }

  private handleDetection(
    candidatePoints: NormalizedPoint[],
    detectorConfidence: number,
    capturedAtMs: number,
    outputAtMs: number,
  ): WireTrackFrame {
    const needsNewTrack = this.trackId === null || this.requiresNewTrack || this.points === null
    const reasonCodes: WireTrackingReasonCode[] = []
    let temporalConfidence = needsNewTrack ? 0.55 : 1

    if (!needsNewTrack && this.points && this.lastDetectionAtMs !== null) {
      const expectedPoints = this.predictPoints(capturedAtMs)
      const pointDistance = meanPointDistance(expectedPoints, candidatePoints)
      temporalConfidence = clamp01(1 - pointDistance / this.options.jumpGate)

      if (pointDistance > this.options.jumpGate) {
        return this.handleMissing(
          capturedAtMs,
          outputAtMs,
          'CANDIDATE_JUMP_REJECTED',
        )
      }
      if (temporalConfidence < 0.35) reasonCodes.push('LOW_TEMPORAL_CONFIDENCE')
    }

    if (needsNewTrack) {
      const renewing = this.hasEverCreatedTrack
      this.trackOrdinal += 1
      this.trackId = `wire-track-${this.trackOrdinal}`
      this.hasEverCreatedTrack = true
      this.points = clonePoints(candidatePoints)
      this.pointVelocity = candidatePoints.map(() => ({ x: 0, y: 0 }))
      this.stableFrames = 1
      this.established = false
      this.requiresNewTrack = false
      this.phase = renewing ? 'REACQUIRING' : 'ACQUIRING'
      if (renewing) reasonCodes.push('TRACK_ID_RENEWED')
    } else if (this.points) {
      const previousPoints = this.points
      const elapsedMs = Math.max(
        MINIMUM_TIME_STEP_MS,
        capturedAtMs - (this.lastDetectionAtMs ?? capturedAtMs),
      )
      const filteredPoints = mixPoints(previousPoints, candidatePoints, this.options.smoothingAlpha)
      const velocityAlpha = 0.35
      this.pointVelocity = filteredPoints.map((point, index) => {
        const measuredX = (point.x - previousPoints[index].x) / elapsedMs
        const measuredY = (point.y - previousPoints[index].y) / elapsedMs
        const previousVelocity = this.pointVelocity[index] ?? { x: 0, y: 0 }
        return {
          x: previousVelocity.x * (1 - velocityAlpha) + measuredX * velocityAlpha,
          y: previousVelocity.y * (1 - velocityAlpha) + measuredY * velocityAlpha,
        }
      })
      this.points = filteredPoints
      this.stableFrames += 1

      if (this.established) {
        this.phase = 'TRACKING'
      } else if (this.stableFrames >= this.options.confirmationFrames) {
        this.established = true
        this.phase = 'TRACKING'
        reasonCodes.push('TRACK_CONFIRMED')
      }
    }

    if (!this.established) {
      reasonCodes.push(this.phase === 'REACQUIRING'
        ? 'REACQUIRING_STABILITY'
        : 'ACQUIRING_STABILITY')
    }

    this.lastDetectionAtMs = capturedAtMs
    this.lastTemporalConfidence = temporalConfidence
    this.lastCombinedConfidence = clamp01(
      detectorConfidence * 0.62 + temporalConfidence * 0.38,
    )

    let validUntilMs = capturedAtMs + this.options.resultValidityMs
    if (outputAtMs > validUntilMs) {
      this.phase = 'HOLD'
      this.established = false
      this.requiresNewTrack = true
      reasonCodes.push('RESULT_EXPIRED')
      validUntilMs = capturedAtMs
    }

    return this.createFrame({
      capturedAtMs,
      outputAtMs,
      status: 'DETECTED',
      phase: this.phase,
      points: this.points ?? [],
      detectorConfidence,
      temporalConfidence,
      combinedConfidence: this.lastCombinedConfidence,
      validUntilMs,
      reasonCodes,
    })
  }

  private handleMissing(
    capturedAtMs: number,
    outputAtMs: number,
    additionalReason?: WireTrackingReasonCode,
  ): WireTrackFrame {
    const reasonCodes: WireTrackingReasonCode[] = []
    if (additionalReason) reasonCodes.push(additionalReason)

    if (!this.points || this.lastDetectionAtMs === null || !this.trackId) {
      this.stableFrames = 0
      this.established = false
      this.phase = this.phase === 'FAULT' ? 'FAULT' : 'ACQUIRING'
      reasonCodes.push('DETECTION_TIMEOUT')
      return this.createFrame({
        capturedAtMs,
        outputAtMs,
        status: 'LOST',
        phase: this.phase,
        points: [],
        detectorConfidence: 0,
        temporalConfidence: 0,
        combinedConfidence: 0,
        validUntilMs: capturedAtMs,
        reasonCodes,
      })
    }

    const missingForMs = Math.max(0, capturedAtMs - this.lastDetectionAtMs)
    if (this.established && missingForMs < this.options.holdAfterMissingMs) {
      const predictedPoints = this.predictPoints(capturedAtMs)
      const decay = clamp01(1 - missingForMs / this.options.holdAfterMissingMs)
      const temporalConfidence = this.lastTemporalConfidence * decay
      const combinedConfidence = this.lastCombinedConfidence * decay * 0.45
      this.phase = 'DEGRADED'
      reasonCodes.push('SHORT_OCCLUSION_PREDICTION')
      if (missingForMs > this.options.predictionWindowMs) {
        reasonCodes.push('LOW_TEMPORAL_CONFIDENCE')
      }
      return this.createFrame({
        capturedAtMs,
        outputAtMs,
        status: 'PREDICTED',
        phase: this.phase,
        points: predictedPoints,
        detectorConfidence: 0,
        temporalConfidence,
        combinedConfidence,
        validUntilMs: this.lastDetectionAtMs + this.options.holdAfterMissingMs,
        reasonCodes,
      })
    }

    this.phase = 'HOLD'
    this.stableFrames = 0
    this.established = false
    this.requiresNewTrack = true
    reasonCodes.push('DETECTION_TIMEOUT')
    return this.createFrame({
      capturedAtMs,
      outputAtMs,
      status: 'LOST',
      phase: this.phase,
      points: this.points,
      detectorConfidence: 0,
      temporalConfidence: 0,
      combinedConfidence: 0,
      validUntilMs: this.lastDetectionAtMs + this.options.holdAfterMissingMs,
      reasonCodes,
    })
  }

  private handleAmbiguity(capturedAtMs: number, outputAtMs: number): WireTrackFrame {
    this.phase = 'HOLD'
    this.stableFrames = 0
    this.established = false
    this.requiresNewTrack = true
    return this.createFrame({
      capturedAtMs,
      outputAtMs,
      status: 'AMBIGUOUS',
      phase: this.phase,
      points: this.points ?? [],
      detectorConfidence: 0,
      temporalConfidence: 0,
      combinedConfidence: 0,
      validUntilMs: capturedAtMs,
      reasonCodes: ['MULTIPLE_CANDIDATES'],
    })
  }

  private predictPoints(atMs: number): NormalizedPoint[] {
    if (!this.points || this.lastDetectionAtMs === null) return []
    const elapsedMs = clamp(
      atMs - this.lastDetectionAtMs,
      0,
      this.options.predictionWindowMs,
    )
    return this.points.map((point, index) => {
      const velocity = this.pointVelocity[index] ?? { x: 0, y: 0 }
      const rawDeltaX = velocity.x * elapsedMs
      const rawDeltaY = velocity.y * elapsedMs
      const deltaLength = Math.hypot(rawDeltaX, rawDeltaY)
      const displacementScale = deltaLength > this.options.maximumPredictionDisplacement
        ? this.options.maximumPredictionDisplacement / deltaLength
        : 1
      return {
        x: clamp01(point.x + rawDeltaX * displacementScale),
        y: clamp01(point.y + rawDeltaY * displacementScale),
      }
    })
  }

  private createFrame(input: {
    capturedAtMs: number
    outputAtMs: number
    status: WireTrackFrame['status']
    phase: TrackingPhase
    points: readonly NormalizedPoint[]
    detectorConfidence: number
    temporalConfidence: number
    combinedConfidence: number
    validUntilMs: number
    reasonCodes: WireTrackingReasonCode[]
  }): WireTrackFrame {
    const points = clonePoints(input.points)
    const geometry = points.length >= 2 ? calculateGeometry(points) : noGeometry()
    const sourceAgeMs = this.lastDetectionAtMs === null
      ? Math.max(0, input.outputAtMs - input.capturedAtMs)
      : Math.max(0, input.outputAtMs - this.lastDetectionAtMs)

    return {
      sequence: this.sequence,
      capturedAtMs: input.capturedAtMs,
      outputAtMs: input.outputAtMs,
      ageMs: sourceAgeMs,
      trackId: this.trackId,
      status: input.status,
      phase: input.phase,
      polyline: points,
      detectorConfidence: clamp01(input.detectorConfidence),
      temporalConfidence: clamp01(input.temporalConfidence),
      combinedConfidence: clamp01(input.combinedConfidence),
      ...geometry,
      validUntilMs: input.validUntilMs,
      reasonCodes: [...new Set(input.reasonCodes)],
    }
  }

  private clearTrackMemory(): void {
    this.trackId = null
    this.points = null
    this.pointVelocity = []
    this.lastDetectionAtMs = null
    this.stableFrames = 0
    this.established = false
    this.requiresNewTrack = false
    this.lastTemporalConfidence = 0
    this.lastCombinedConfidence = 0
  }
}

export function createHeuristicTemporalTracker(
  options: Partial<HeuristicTemporalTrackerOptions> = {},
): HeuristicTemporalTracker {
  return new HeuristicTemporalTracker(options)
}
