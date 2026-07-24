import type {
  CoopMessage,
  CoopMessageType,
  CoopPayloadByType,
  CoordinationRuntimeState,
  CoordinationScenario,
} from '@/types/coordination'
import { COOP_PROTOCOL } from '@/types/coordination'

/**
 * 确定性的机器人通信模拟器。它只根据状态生成协议消息，不使用真实时间。
 */
export class MockRobotLink {
  private sequence = 0
  private connected = true

  reset(): void {
    this.sequence = 0
    this.connected = true
  }

  setConnected(connected: boolean): void {
    this.connected = connected
  }

  observeSequence(sequence: number): void {
    if (Number.isSafeInteger(sequence)) this.sequence = Math.max(this.sequence, sequence)
  }

  poll(
    state: CoordinationRuntimeState,
    scenario: CoordinationScenario,
  ): CoopMessage[] {
    if (!this.connected || state.faults.robotLinkDown) return []
    const obstacle = scenario.obstacles[state.currentObstacleIndex]
    if (!obstacle) return []

    if (
      state.phase === 'WAITING_FOR_ROBOT'
      && state.robot.routeProgress + 0.0001 >= obstacle.pickup.routeProgress
    ) {
      return [this.createMessage(state, 'ASSIST_REQUEST', {
        reason: 'OBSTACLE_BLOCKED',
        robotRouteProgress: state.robot.routeProgress,
      })]
    }

    if (state.phase === 'ASSIST_REQUESTED' && !state.ready.robot) {
      return [this.createMessage(state, 'READY', {
        ready: true,
        checks: ['robot_stopped', 'pickup_pose_locked', 'link_healthy'],
      })]
    }

    if (
      state.phase === 'VERIFYING_ROBOT_CLEAR'
      && state.phaseElapsedMs >= scenario.timing.robotClearVerificationMs
    ) {
      return [this.createMessage(state, 'ROBOT_CLEAR', {
        clear: true,
        robotRouteProgress: obstacle.release.routeProgress,
      })]
    }

    return []
  }

  createHeartbeat(state: CoordinationRuntimeState): CoopMessage<'HEARTBEAT'> {
    return this.createMessage(state, 'HEARTBEAT', { health: 'OK' })
  }

  createMismatchedMessage(
    state: CoordinationRuntimeState,
  ): CoopMessage<'HEARTBEAT'> {
    const message = this.createMessage(state, 'HEARTBEAT', { health: 'OK' })
    return {
      ...message,
      obstacleId: `${state.currentObstacleId}-MISMATCH`,
    }
  }

  private createMessage<T extends CoopMessageType>(
    state: CoordinationRuntimeState,
    type: T,
    payload: CoopPayloadByType[T],
  ): CoopMessage<T> {
    this.sequence = Math.max(this.sequence, state.lastAcceptedSeq.ROBOT) + 1
    return {
      protocol: COOP_PROTOCOL,
      missionId: state.missionId,
      cycleId: state.cycleId,
      obstacleId: state.currentObstacleId,
      seq: this.sequence,
      sentAt: state.clockMs,
      source: 'ROBOT',
      type,
      payload,
    }
  }
}

export function createMockRobotLink(): MockRobotLink {
  return new MockRobotLink()
}
