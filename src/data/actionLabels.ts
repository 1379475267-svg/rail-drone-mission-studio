import type { MissionActionType } from '@/types/mission'
import type { DroneState, RobotState, SimulationStatus } from '@/types/simulation'

export const missionActionLabels: Record<MissionActionType, string> = {
  TAKEOFF: '起飞',
  FLY_TO: '飞向航点',
  HOVER: '悬停',
  DEPLOY_ROBOT: '投放机器人',
  WAIT_ROBOT: '等待机器人',
  FOLLOW_ROBOT: '跟随机器人',
  PICKUP_ROBOT: '抓取机器人',
  CROSS_OBSTACLE: '跨越障碍',
  RELEASE_ROBOT: '释放机器人',
  INSPECT_POINT: '检查点停留',
  RETURN_HOME: '返航',
  LAND: '降落',
}

export const droneStateLabels: Record<DroneState, string> = {
  IDLE: '待机',
  TAKING_OFF: '起飞中',
  FLYING: '飞行中',
  HOVERING: '悬停中',
  FOLLOWING_ROBOT: '跟随机器人',
  APPROACHING_ROBOT: '接近机器人',
  PICKING_UP_ROBOT: '抓取机器人',
  CARRYING_ROBOT: '携带机器人',
  RELEASING_ROBOT: '释放机器人',
  RETURNING_HOME: '返航中',
  LANDING: '降落中',
  LANDED: '已降落',
  ERROR: '异常',
}

export const robotStateLabels: Record<RobotState, string> = {
  NOT_DEPLOYED: '未投放',
  DEPLOYING: '投放中',
  INSPECTING: '巡检中',
  WAITING_FOR_DRONE: '等待无人机',
  BEING_PICKED_UP: '回收中',
  BEING_TRANSPORTED: '转运中',
  REDEPLOYING: '重新投放中',
  MISSION_COMPLETED: '任务完成',
  ERROR: '异常',
}

export const simulationStatusLabels: Record<SimulationStatus, string> = {
  IDLE: '未开始',
  RUNNING: '运行中',
  PAUSED: '已暂停',
  COMPLETED: '已完成',
  ERROR: '异常',
}
