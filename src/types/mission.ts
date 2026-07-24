export type MissionActionType =
  | 'TAKEOFF'
  | 'FLY_TO'
  | 'HOVER'
  | 'DEPLOY_ROBOT'
  | 'WAIT_ROBOT'
  | 'FOLLOW_ROBOT'
  | 'PICKUP_ROBOT'
  | 'CROSS_OBSTACLE'
  | 'RELEASE_ROBOT'
  | 'INSPECT_POINT'
  | 'RETURN_HOME'
  | 'LAND'

export interface MissionNode {
  id: string
  name: string
  action: MissionActionType
  waypointId?: string
  targetObjectId?: string
  duration?: number
  maxWaitTime?: number
  speed?: number
  order: number
  parameters?: Record<string, unknown>
}

export const missionActionOptions: Array<{
  label: string
  value: MissionActionType
}> = [
  { label: '起飞', value: 'TAKEOFF' },
  { label: '飞向航点', value: 'FLY_TO' },
  { label: '悬停', value: 'HOVER' },
  { label: '投放机器人', value: 'DEPLOY_ROBOT' },
  { label: '等待机器人', value: 'WAIT_ROBOT' },
  { label: '跟随机器人', value: 'FOLLOW_ROBOT' },
  { label: '抓取机器人', value: 'PICKUP_ROBOT' },
  { label: '跨越障碍', value: 'CROSS_OBSTACLE' },
  { label: '释放机器人', value: 'RELEASE_ROBOT' },
  { label: '检查点停留', value: 'INSPECT_POINT' },
  { label: '返航', value: 'RETURN_HOME' },
  { label: '降落', value: 'LAND' },
]
