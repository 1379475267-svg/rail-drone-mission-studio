import { describe, expect, it } from 'vitest'

import { createDefaultCoordinationScenario } from '@/data/defaultCoordinationScenario'
import { CoordinationEngine } from '@/services/coordination/coordinationEngine'
import type { CoordinationRuntimeState } from '@/types/coordination'

function advanceUntil(
  engine: CoordinationEngine,
  predicate: (state: CoordinationRuntimeState) => boolean,
  maximumTicks = 800,
): CoordinationRuntimeState {
  for (let tick = 0; tick < maximumTicks; tick += 1) {
    const state = engine.getState()
    if (predicate(state)) return state
    engine.step(100)
  }
  const finalState = engine.getState()
  throw new Error(`未在 ${maximumTicks} 个步长内到达目标状态，当前为 ${finalState.phase}`)
}

describe('CoordinationEngine', () => {
  it('通过三个预设障碍并保持机器人里程单调不回退', () => {
    const scenario = createDefaultCoordinationScenario()
    const engine = new CoordinationEngine(scenario)
    expect(engine.start()).toBe(true)

    let previousRobotProgress = engine.getState().robot.routeProgress
    for (let tick = 0; tick < 800; tick += 1) {
      engine.step(100)
      const state = engine.getState()
      expect(state.robot.routeProgress).toBeGreaterThanOrEqual(previousRobotProgress - 1e-9)
      previousRobotProgress = state.robot.routeProgress
      if (state.lifecycle === 'COMPLETED') break
    }

    const state = engine.getState()
    expect(state.lifecycle).toBe('COMPLETED')
    expect(state.phase).toBe('COMPLETED')
    expect(state.robot.clearedObstacleIds).toEqual(['O1', 'O2', 'O3'])
    expect(state.cycleNumber).toBe(3)
    expect(engine.getMessages().some((record) => record.message.type === 'ASSIST_REQUEST')).toBe(true)
    expect(engine.getMessages().every((record) => record.message.missionId === scenario.missionId)).toBe(true)
  })

  it('失线 0.5 秒后安全悬停，恢复后重新连续捕获', () => {
    const engine = new CoordinationEngine(createDefaultCoordinationScenario())
    engine.start()
    advanceUntil(engine, (state) => state.phase === 'FOLLOWING_LINE')

    expect(engine.injectFault('lineLost', true)).toBe(true)
    expect(engine.getState().phase).toBe('LINE_RECOVERY')
    engine.step(600)
    expect(engine.getState().phase).toBe('SAFE_HOLD')
    expect(engine.getState().holdReason).toBe('LINE_LOST')

    expect(engine.injectFault('lineLost', false)).toBe(true)
    expect(engine.getState().phase).toBe('ACQUIRING_LINE')
    advanceUntil(engine, (state) => state.phase === 'FOLLOWING_LINE', 20)
    expect(engine.getState().tracking.stableFrameCount).toBeGreaterThanOrEqual(3)
  })

  it('沿线飞行中通信中断立即悬停，恢复后要求重新捕获', () => {
    const engine = new CoordinationEngine(createDefaultCoordinationScenario())
    engine.start()
    advanceUntil(engine, (state) => state.phase === 'FOLLOWING_LINE')

    expect(engine.injectFault('robotLinkDown', true)).toBe(true)
    expect(engine.getState().phase).toBe('SAFE_HOLD')
    expect(engine.getState().holdReason).toBe('ROBOT_LINK_LOST')

    expect(engine.injectFault('robotLinkDown', false)).toBe(true)
    expect(engine.getState().phase).toBe('ACQUIRING_LINE')
    advanceUntil(engine, (state) => state.phase === 'FOLLOWING_LINE', 20)
    expect(engine.getState().robot.connected).toBe(true)
  })

  it('低置信度或过大方向误差不能继续推进沿线里程', () => {
    const engine = new CoordinationEngine(createDefaultCoordinationScenario())
    engine.start()
    advanceUntil(engine, (state) => state.phase === 'FOLLOWING_LINE')
    engine.setAutoLineTracking(false)
    const progressBefore = engine.getState().drone.routeProgress

    engine.updateLineTracking({
      quality: 'WEAK',
      trackId: 'weak-track',
      confidence: 0.05,
      lateralErrorMeters: 0.2,
      headingErrorDegrees: 8,
      curvature: 0.05,
      observedAtMs: engine.getState().clockMs,
    })
    engine.step(100)
    expect(engine.getState().phase).toBe('LINE_RECOVERY')
    expect(engine.getState().drone.routeProgress).toBe(progressBefore)

    engine.reset()
    engine.setAutoLineTracking(true)
    engine.start()
    advanceUntil(engine, (state) => state.phase === 'FOLLOWING_LINE')
    engine.setAutoLineTracking(false)
    engine.updateLineTracking({
      quality: 'STABLE',
      trackId: 'bad-geometry',
      confidence: 0.92,
      lateralErrorMeters: 0.9,
      headingErrorDegrees: 55,
      curvature: 0.05,
      observedAtMs: engine.getState().clockMs,
    })
    engine.step(100)
    expect(engine.getState().phase).toBe('LINE_RECOVERY')
  })

  it('越障适配器失败时不越过互锁，清故障后重新握手', () => {
    const engine = new CoordinationEngine(createDefaultCoordinationScenario())
    engine.start()
    advanceUntil(engine, (state) => state.phase === 'ASSIST_PREPARING')
    expect(engine.getState().ready).toEqual({ robot: true, drone: true })

    engine.injectFault('assistFailure', true)
    advanceUntil(engine, (state) => state.phase === 'SAFE_HOLD', 40)
    expect(engine.getState().holdReason).toBe('ASSIST_FAILED')
    expect(engine.getState().robot.clearedObstacleIds).toEqual([])

    engine.injectFault('assistFailure', false)
    expect(engine.clearSafeHold()).toBe(true)
    expect(engine.getState().phase).toBe('ASSIST_REQUESTED')
    expect(engine.getState().ready).toEqual({ robot: false, drone: false })
  })

  it('拒绝障碍编号不匹配的协议消息并留下审计记录', () => {
    const engine = new CoordinationEngine(createDefaultCoordinationScenario())
    engine.start()
    const phaseBefore = engine.getState().phase

    expect(engine.injectFault('messageMismatch', true)).toBe(true)
    const rejected = engine.getMessages().filter((record) => !record.accepted)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.rejectionCode).toBe('OBSTACLE_MISMATCH')
    expect(engine.getState().phase).toBe(phaseBefore)
  })
})
