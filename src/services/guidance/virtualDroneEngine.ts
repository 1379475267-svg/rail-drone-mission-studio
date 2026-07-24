import type { GuidanceCommand, VirtualDroneState } from '@/types/tracking'

export interface VirtualDroneEngineOptions {
  velocityTimeConstantSeconds: number
  yawTimeConstantSeconds: number
  maxForward: number
  maxLateral: number
  maxVertical: number
  maxYawRate: number
  minimumAltitude: number
  maximumAltitude: number
  integrationStepSeconds: number
}

const DEFAULT_OPTIONS: VirtualDroneEngineOptions = {
  velocityTimeConstantSeconds: 0.42,
  yawTimeConstantSeconds: 0.3,
  maxForward: 1.5,
  maxLateral: 0.7,
  maxVertical: 0.4,
  maxYawRate: 0.9,
  minimumAltitude: 0,
  maximumAltitude: 30,
  integrationStepSeconds: 0.04,
}

const DEFAULT_STATE: VirtualDroneState = {
  sequence: 0,
  timestampMs: 0,
  x: 0,
  y: 0,
  altitude: 5,
  heading: 0,
  forwardVelocity: 0,
  lateralVelocity: 0,
  verticalVelocity: 0,
  yawRate: 0,
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function responseAlpha(deltaSeconds: number, timeConstantSeconds: number): number {
  if (timeConstantSeconds <= Number.EPSILON) return 1
  return 1 - Math.exp(-deltaSeconds / timeConstantSeconds)
}

function copyState(state: VirtualDroneState): VirtualDroneState {
  return { ...state }
}

/**
 * Demo 使用的二维一阶响应模型。
 * x 是沿线路方向的里程，y 是横向位移；它不模拟阵风、载荷摆动或 PX4 动力学。
 */
export class VirtualDroneEngine {
  readonly options: VirtualDroneEngineOptions
  private state: VirtualDroneState

  constructor(
    options: Partial<VirtualDroneEngineOptions> = {},
    initialState: Partial<VirtualDroneState> = {},
  ) {
    const minimumAltitude = finiteOr(options.minimumAltitude, DEFAULT_OPTIONS.minimumAltitude)
    const maximumAltitude = Math.max(
      minimumAltitude,
      finiteOr(options.maximumAltitude, DEFAULT_OPTIONS.maximumAltitude),
    )
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      velocityTimeConstantSeconds: Math.max(
        0,
        finiteOr(options.velocityTimeConstantSeconds, DEFAULT_OPTIONS.velocityTimeConstantSeconds),
      ),
      yawTimeConstantSeconds: Math.max(
        0,
        finiteOr(options.yawTimeConstantSeconds, DEFAULT_OPTIONS.yawTimeConstantSeconds),
      ),
      maxForward: Math.max(0, finiteOr(options.maxForward, DEFAULT_OPTIONS.maxForward)),
      maxLateral: Math.max(0, finiteOr(options.maxLateral, DEFAULT_OPTIONS.maxLateral)),
      maxVertical: Math.max(0, finiteOr(options.maxVertical, DEFAULT_OPTIONS.maxVertical)),
      maxYawRate: Math.max(0, finiteOr(options.maxYawRate, DEFAULT_OPTIONS.maxYawRate)),
      minimumAltitude,
      maximumAltitude,
      integrationStepSeconds: clamp(
        finiteOr(options.integrationStepSeconds, DEFAULT_OPTIONS.integrationStepSeconds),
        0.005,
        0.1,
      ),
    }
    this.state = this.sanitizeState({ ...DEFAULT_STATE, ...initialState })
  }

  getState(): VirtualDroneState {
    return copyState(this.state)
  }

  /**
   * 推进仿真。nowMs 应与 GuidanceCommand 使用同一个单调时钟。
   * 过期指令和 hold 指令都只会让速度一阶衰减到 0。
   */
  step(
    command: GuidanceCommand,
    deltaSeconds: number,
    nowMs = this.state.timestampMs + Math.max(0, deltaSeconds) * 1000,
  ): VirtualDroneState {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      this.state.timestampMs = Math.max(this.state.timestampMs, finiteOr(nowMs, this.state.timestampMs))
      return this.getState()
    }

    const safeNowMs = Math.max(this.state.timestampMs, finiteOr(nowMs, this.state.timestampMs))
    const commandActive = !command.hold && safeNowMs <= command.validUntilMs
    const targetForward = commandActive
      ? clamp(finiteOr(command.forward, 0), 0, this.options.maxForward)
      : 0
    const targetLateral = commandActive
      ? clamp(finiteOr(command.lateral, 0), -this.options.maxLateral, this.options.maxLateral)
      : 0
    const targetVertical = commandActive
      ? clamp(finiteOr(command.vertical, 0), -this.options.maxVertical, this.options.maxVertical)
      : 0
    const targetYawRate = commandActive
      ? clamp(finiteOr(command.yawRate, 0), -this.options.maxYawRate, this.options.maxYawRate)
      : 0

    let remainingSeconds = Math.min(deltaSeconds, 1)
    while (remainingSeconds > Number.EPSILON) {
      const stepSeconds = Math.min(remainingSeconds, this.options.integrationStepSeconds)
      remainingSeconds -= stepSeconds
      this.integrateStep(
        targetForward,
        targetLateral,
        targetVertical,
        targetYawRate,
        stepSeconds,
      )
    }

    this.state.sequence += 1
    this.state.timestampMs = safeNowMs
    return this.getState()
  }

  /** step 的语义化别名。 */
  update(
    command: GuidanceCommand,
    deltaSeconds: number,
    nowMs?: number,
  ): VirtualDroneState {
    return this.step(command, deltaSeconds, nowMs)
  }

  reset(initialState: Partial<VirtualDroneState> = {}): VirtualDroneState {
    this.state = this.sanitizeState({ ...DEFAULT_STATE, ...initialState })
    return this.getState()
  }

  private integrateStep(
    targetForward: number,
    targetLateral: number,
    targetVertical: number,
    targetYawRate: number,
    deltaSeconds: number,
  ): void {
    const velocityAlpha = responseAlpha(
      deltaSeconds,
      this.options.velocityTimeConstantSeconds,
    )
    const yawAlpha = responseAlpha(deltaSeconds, this.options.yawTimeConstantSeconds)
    this.state.forwardVelocity += (targetForward - this.state.forwardVelocity) * velocityAlpha
    this.state.lateralVelocity += (targetLateral - this.state.lateralVelocity) * velocityAlpha
    this.state.verticalVelocity += (targetVertical - this.state.verticalVelocity) * velocityAlpha
    this.state.yawRate += (targetYawRate - this.state.yawRate) * yawAlpha

    const cosHeading = Math.cos(this.state.heading)
    const sinHeading = Math.sin(this.state.heading)
    const alongVelocity = this.state.forwardVelocity * cosHeading
      - this.state.lateralVelocity * sinHeading
    const crossTrackVelocity = this.state.forwardVelocity * sinHeading
      + this.state.lateralVelocity * cosHeading

    this.state.x += alongVelocity * deltaSeconds
    this.state.y += crossTrackVelocity * deltaSeconds
    this.state.altitude = clamp(
      this.state.altitude + this.state.verticalVelocity * deltaSeconds,
      this.options.minimumAltitude,
      this.options.maximumAltitude,
    )
    this.state.heading = normalizeAngle(this.state.heading + this.state.yawRate * deltaSeconds)
  }

  private sanitizeState(state: VirtualDroneState): VirtualDroneState {
    return {
      sequence: Math.max(0, Math.round(finiteOr(state.sequence, 0))),
      timestampMs: Math.max(0, finiteOr(state.timestampMs, 0)),
      x: finiteOr(state.x, 0),
      y: finiteOr(state.y, 0),
      altitude: clamp(
        finiteOr(state.altitude, DEFAULT_STATE.altitude),
        this.options.minimumAltitude,
        this.options.maximumAltitude,
      ),
      heading: normalizeAngle(finiteOr(state.heading, 0)),
      forwardVelocity: clamp(
        finiteOr(state.forwardVelocity, 0),
        -this.options.maxForward,
        this.options.maxForward,
      ),
      lateralVelocity: clamp(
        finiteOr(state.lateralVelocity, 0),
        -this.options.maxLateral,
        this.options.maxLateral,
      ),
      verticalVelocity: clamp(
        finiteOr(state.verticalVelocity, 0),
        -this.options.maxVertical,
        this.options.maxVertical,
      ),
      yawRate: clamp(
        finiteOr(state.yawRate, 0),
        -this.options.maxYawRate,
        this.options.maxYawRate,
      ),
    }
  }
}

export function createVirtualDroneEngine(
  options: Partial<VirtualDroneEngineOptions> = {},
  initialState: Partial<VirtualDroneState> = {},
): VirtualDroneEngine {
  return new VirtualDroneEngine(options, initialState)
}
