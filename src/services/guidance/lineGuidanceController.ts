import type {
  GuidanceCommand,
  GuidanceReasonCode,
  WireTrackFrame,
} from '@/types/tracking'

export interface LineGuidanceControllerOptions {
  maxForward: number
  maxLateral: number
  maxVertical: number
  maxYawRate: number
  lateralGain: number
  headingGain: number
  minimumTrackingConfidence: number
  lateralSlowdownStart: number
  lateralStopAt: number
  headingSlowdownStart: number
  headingStopAt: number
  curvatureSlowdownStart: number
  curvatureStopAt: number
  predictedForwardScale: number
  commandValidityMs: number
}

const DEFAULT_OPTIONS: LineGuidanceControllerOptions = {
  maxForward: 1.1,
  maxLateral: 0.48,
  maxVertical: 0.3,
  maxYawRate: 0.7,
  lateralGain: 1.35,
  headingGain: 1.15,
  minimumTrackingConfidence: 0.18,
  lateralSlowdownStart: 0.07,
  lateralStopAt: 0.28,
  headingSlowdownStart: 0.12,
  headingStopAt: 0.78,
  curvatureSlowdownStart: 0.06,
  curvatureStopAt: 0.36,
  predictedForwardScale: 0.16,
  commandValidityMs: 180,
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function monotonicNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function slowdownFactor(value: number, start: number, stop: number): number {
  const magnitude = Math.abs(value)
  if (magnitude <= start) return 1
  if (magnitude >= stop) return 0
  return 1 - (magnitude - start) / Math.max(Number.EPSILON, stop - start)
}

/**
 * 把归一化画面误差转换成受限 Demo 速度指令。
 * 该控制器没有真实高度/安全间距感知，vertical 因此始终为 0。
 */
export class LineGuidanceController {
  readonly options: LineGuidanceControllerOptions
  private sequence = 0

  constructor(options: Partial<LineGuidanceControllerOptions> = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      maxForward: Math.max(0, options.maxForward ?? DEFAULT_OPTIONS.maxForward),
      maxLateral: Math.max(0, options.maxLateral ?? DEFAULT_OPTIONS.maxLateral),
      maxVertical: Math.max(0, options.maxVertical ?? DEFAULT_OPTIONS.maxVertical),
      maxYawRate: Math.max(0, options.maxYawRate ?? DEFAULT_OPTIONS.maxYawRate),
      minimumTrackingConfidence: clamp01(
        options.minimumTrackingConfidence ?? DEFAULT_OPTIONS.minimumTrackingConfidence,
      ),
      predictedForwardScale: clamp01(
        options.predictedForwardScale ?? DEFAULT_OPTIONS.predictedForwardScale,
      ),
      commandValidityMs: Math.max(1, options.commandValidityMs ?? DEFAULT_OPTIONS.commandValidityMs),
    }
  }

  compute(
    track: WireTrackFrame,
    nowMs = monotonicNow(),
    manualHold = false,
  ): GuidanceCommand {
    this.sequence += 1
    const reasons: GuidanceReasonCode[] = []

    if (manualHold) {
      reasons.push('MANUAL_HOLD')
      return this.holdCommand(track, nowMs, reasons)
    }
    if (nowMs >= track.validUntilMs) {
      reasons.push('RESULT_EXPIRED')
      return this.holdCommand(track, nowMs, reasons)
    }
    if (track.status === 'LOST') {
      reasons.push('TRACK_LOST')
      return this.holdCommand(track, nowMs, reasons)
    }
    if (track.status === 'AMBIGUOUS') {
      reasons.push('TRACK_AMBIGUOUS')
      return this.holdCommand(track, nowMs, reasons)
    }
    if (track.phase === 'FAULT') {
      reasons.push('TRACK_FAULT')
      return this.holdCommand(track, nowMs, reasons)
    }
    if (track.phase === 'HOLD') {
      reasons.push('TRACK_LOST')
      return this.holdCommand(track, nowMs, reasons)
    }
    if (track.phase === 'ACQUIRING') {
      reasons.push('ACQUIRING_TRACK')
      return this.holdCommand(track, nowMs, reasons)
    }
    if (track.phase === 'REACQUIRING') {
      reasons.push('REACQUIRING_TRACK')
      return this.holdCommand(track, nowMs, reasons)
    }
    if (
      track.lateralError === null
      || track.headingError === null
      || track.curvature === null
      || track.polyline.length < 2
    ) {
      reasons.push('NO_GEOMETRY')
      return this.holdCommand(track, nowMs, reasons)
    }
    if (track.combinedConfidence < this.options.minimumTrackingConfidence) {
      reasons.push('LOW_CONFIDENCE')
      return this.holdCommand(track, nowMs, reasons)
    }

    const confidenceFactor = clamp01(
      (track.combinedConfidence - this.options.minimumTrackingConfidence)
      / Math.max(Number.EPSILON, 1 - this.options.minimumTrackingConfidence),
    )
    const lateralFactor = slowdownFactor(
      track.lateralError,
      this.options.lateralSlowdownStart,
      this.options.lateralStopAt,
    )
    const headingFactor = slowdownFactor(
      track.headingError,
      this.options.headingSlowdownStart,
      this.options.headingStopAt,
    )
    const curvatureFactor = slowdownFactor(
      track.curvature,
      this.options.curvatureSlowdownStart,
      this.options.curvatureStopAt,
    )

    if (lateralFactor < 1) reasons.push('LARGE_LATERAL_ERROR')
    if (headingFactor < 1) reasons.push('LARGE_HEADING_ERROR')
    if (curvatureFactor < 1) reasons.push('HIGH_CURVATURE')
    if (track.phase === 'DEGRADED' || track.status === 'PREDICTED') {
      reasons.push('TRACK_DEGRADED')
    } else {
      reasons.push('TRACK_OK')
    }

    const observationScale = track.status === 'PREDICTED'
      ? this.options.predictedForwardScale
      : 1
    const forward = this.options.maxForward
      * confidenceFactor
      * Math.min(lateralFactor, headingFactor, curvatureFactor)
      * observationScale
    const unclampedLateral = track.lateralError * this.options.lateralGain
    const unclampedYawRate = track.headingError * this.options.headingGain
    const lateral = clamp(unclampedLateral, -this.options.maxLateral, this.options.maxLateral)
    const yawRate = clamp(unclampedYawRate, -this.options.maxYawRate, this.options.maxYawRate)
    if (lateral !== unclampedLateral || yawRate !== unclampedYawRate) {
      reasons.push('COMMAND_CLAMPED')
    }

    return {
      sequence: this.sequence,
      sourceTrackSequence: track.sequence,
      issuedAtMs: nowMs,
      validUntilMs: Math.min(track.validUntilMs, nowMs + this.options.commandValidityMs),
      forward: clamp(finiteOrZero(forward), 0, this.options.maxForward),
      lateral: finiteOrZero(lateral),
      vertical: 0,
      yawRate: finiteOrZero(yawRate),
      hold: false,
      reasons: [...new Set(reasons)],
    }
  }

  /** compute 的语义化别名，方便仿真引擎按 tick 调用。 */
  update(
    track: WireTrackFrame,
    nowMs = monotonicNow(),
    manualHold = false,
  ): GuidanceCommand {
    return this.compute(track, nowMs, manualHold)
  }

  reset(): void {
    this.sequence = 0
  }

  private holdCommand(
    track: WireTrackFrame,
    nowMs: number,
    reasons: GuidanceReasonCode[],
  ): GuidanceCommand {
    return {
      sequence: this.sequence,
      sourceTrackSequence: track.sequence,
      issuedAtMs: nowMs,
      validUntilMs: nowMs + this.options.commandValidityMs,
      forward: 0,
      lateral: 0,
      vertical: 0,
      yawRate: 0,
      hold: true,
      reasons: [...new Set(reasons)],
    }
  }
}

export function createLineGuidanceController(
  options: Partial<LineGuidanceControllerOptions> = {},
): LineGuidanceController {
  return new LineGuidanceController(options)
}
