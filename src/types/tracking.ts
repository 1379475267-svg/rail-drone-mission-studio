/** 归一化相机画面坐标：左上角为 (0, 0)，右下角为 (1, 1)。 */
export interface NormalizedPoint {
  x: number
  y: number
}

/** 单帧检测器交给时序跟踪器的接触线候选。 */
export interface WireTrackCandidate {
  points: readonly NormalizedPoint[]
  detectorConfidence: number
  candidateId?: string
}

export type WireTrackStatus = 'DETECTED' | 'PREDICTED' | 'AMBIGUOUS' | 'LOST'

export type TrackingPhase =
  | 'ACQUIRING'
  | 'TRACKING'
  | 'DEGRADED'
  | 'HOLD'
  | 'REACQUIRING'
  | 'FAULT'

export type WireTrackingReasonCode =
  | 'ACQUIRING_STABILITY'
  | 'REACQUIRING_STABILITY'
  | 'LOW_DETECTOR_CONFIDENCE'
  | 'LOW_TEMPORAL_CONFIDENCE'
  | 'CANDIDATE_JUMP_REJECTED'
  | 'MULTIPLE_CANDIDATES'
  | 'SHORT_OCCLUSION_PREDICTION'
  | 'DETECTION_TIMEOUT'
  | 'RESULT_EXPIRED'
  | 'INVALID_CANDIDATE'
  | 'TRACK_CONFIRMED'
  | 'TRACK_ID_RENEWED'
  | 'NON_MONOTONIC_TIMESTAMP'

/**
 * 连续跟踪结果。polyline 始终按“近端 -> 远端”排列，坐标均为 0..1。
 * heading 与 headingError 都是相对画面向上方向的弧度；向右偏为正。
 */
export interface WireTrackFrame {
  sequence: number
  capturedAtMs: number
  outputAtMs: number
  ageMs: number
  trackId: string | null
  status: WireTrackStatus
  phase: TrackingPhase
  polyline: NormalizedPoint[]
  detectorConfidence: number
  temporalConfidence: number
  combinedConfidence: number
  near: NormalizedPoint | null
  far: NormalizedPoint | null
  heading: number | null
  curvature: number | null
  lateralError: number | null
  headingError: number | null
  validUntilMs: number
  reasonCodes: WireTrackingReasonCode[]
}

export type GuidanceReasonCode =
  | 'TRACK_OK'
  | 'ACQUIRING_TRACK'
  | 'REACQUIRING_TRACK'
  | 'TRACK_DEGRADED'
  | 'TRACK_LOST'
  | 'TRACK_AMBIGUOUS'
  | 'TRACK_FAULT'
  | 'RESULT_EXPIRED'
  | 'NO_GEOMETRY'
  | 'LOW_CONFIDENCE'
  | 'LARGE_LATERAL_ERROR'
  | 'LARGE_HEADING_ERROR'
  | 'HIGH_CURVATURE'
  | 'COMMAND_CLAMPED'
  | 'MANUAL_HOLD'

/** 只用于 Demo 仿真的速度指令，不是真实飞控指令。 */
export interface GuidanceCommand {
  sequence: number
  sourceTrackSequence: number
  issuedAtMs: number
  validUntilMs: number
  /** 机体前向速度，m/s。 */
  forward: number
  /** 机体右向速度，m/s。 */
  lateral: number
  /** 向上速度，m/s。 */
  vertical: number
  /** 向右偏航角速度，rad/s。 */
  yawRate: number
  hold: boolean
  reasons: GuidanceReasonCode[]
}

/** 二维虚拟无人机状态：x 沿线路向前，y 在线路右侧为正。 */
export interface VirtualDroneState {
  sequence: number
  timestampMs: number
  x: number
  y: number
  altitude: number
  heading: number
  forwardVelocity: number
  lateralVelocity: number
  verticalVelocity: number
  yawRate: number
}
