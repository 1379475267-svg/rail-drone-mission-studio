import { describe, expect, it } from 'vitest'

import { createLineGuidanceController } from '@/services/guidance/lineGuidanceController'
import { createVirtualDroneEngine } from '@/services/guidance/virtualDroneEngine'
import { createHeuristicTemporalTracker } from '@/services/tracking/heuristicTemporalTracker'
import type { VirtualDroneState, WireTrackCandidate } from '@/types/tracking'

const CAMERA_SPAN_METERS = 2.4

function candidateFromState(state: VirtualDroneState): WireTrackCandidate {
  const nearX = 0.5 - state.y / CAMERA_SPAN_METERS
  return {
    detectorConfidence: 0.94,
    points: Array.from({ length: 11 }, (_, index) => {
      const progress = index / 10
      return {
        x: Math.max(0.03, Math.min(0.97, nearX - state.heading * progress * 0.62)),
        y: 0.86 - progress * 0.72,
      }
    }),
  }
}

describe('时序跟踪与虚拟引导', () => {
  it('连续三帧才确认，同一短遮挡预测，0.5 秒后 HOLD', () => {
    const tracker = createHeuristicTemporalTracker()
    const candidate = candidateFromState({
      sequence: 0,
      timestampMs: 0,
      x: 0,
      y: 0.2,
      altitude: 5,
      heading: 0.06,
      forwardVelocity: 0,
      lateralVelocity: 0,
      verticalVelocity: 0,
      yawRate: 0,
    })

    const first = tracker.update(candidate, 0, 0)
    const second = tracker.update(candidate, 100, 100)
    const third = tracker.update(candidate, 200, 200)
    expect(first.phase).toBe('ACQUIRING')
    expect(second.phase).toBe('ACQUIRING')
    expect(third.phase).toBe('TRACKING')
    expect(third.trackId).toBe(first.trackId)

    const predicted = tracker.update(null, 420, 420)
    expect(predicted.status).toBe('PREDICTED')
    expect(predicted.phase).toBe('DEGRADED')

    const lost = tracker.update(null, 710, 710)
    expect(lost.status).toBe('LOST')
    expect(lost.phase).toBe('HOLD')
    const command = createLineGuidanceController().compute(lost, 710)
    expect(command.hold).toBe(true)
    expect(command.forward).toBe(0)
  })

  it('多候选立即判为歧义并禁止前进', () => {
    const tracker = createHeuristicTemporalTracker()
    const engine = createVirtualDroneEngine({}, { y: 0.1 })
    const candidate = candidateFromState(engine.getState())
    const frame = tracker.update([candidate, { ...candidate, candidateId: 'second' }], 100, 100)
    const command = createLineGuidanceController().compute(frame, 100)

    expect(frame.status).toBe('AMBIGUOUS')
    expect(frame.phase).toBe('HOLD')
    expect(command.hold).toBe(true)
  })

  it('虚拟闭环把初始横向与航向偏差收敛到线路附近', () => {
    const tracker = createHeuristicTemporalTracker()
    const controller = createLineGuidanceController()
    const engine = createVirtualDroneEngine({}, { y: 0.6, heading: 0.16, altitude: 5 })
    let state = engine.getState()

    for (let step = 1; step <= 160; step += 1) {
      const nowMs = step * 100
      const frame = tracker.update(candidateFromState(state), nowMs, nowMs)
      const command = controller.compute(frame, nowMs)
      state = engine.step(command, 0.1, nowMs)
    }

    expect(Math.abs(state.y)).toBeLessThan(0.08)
    expect(Math.abs(state.heading)).toBeLessThan(0.02)
    expect(state.x).toBeGreaterThan(5)
  })
})
