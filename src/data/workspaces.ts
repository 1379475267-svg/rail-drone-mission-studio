export type WorkspaceId = 'mission' | 'recognition' | 'coordination'

export interface WorkspaceDefinition {
  id: WorkspaceId
  route: string
  code: string
  title: string
  shortTitle: string
  description: string
  capabilities: readonly string[]
  actionLabel: string
}

export const workspaces: readonly WorkspaceDefinition[] = [
  {
    id: 'mission',
    route: '/mission',
    code: 'MISSION',
    title: '任务编排',
    shortTitle: '任务编排',
    description: '规划无人机航点与路线，在浏览器中检查任务数据并运行基础仿真。',
    capabilities: ['航点编辑', '任务 JSON', '路线仿真'],
    actionLabel: '进入任务编排',
  },
  {
    id: 'recognition',
    route: '/recognition',
    code: 'VISION',
    title: '接触线识别',
    shortTitle: '接触线识别',
    description: '导入本地图片或 MP4，提取接触线候选并完成人工复核与结果导出。',
    capabilities: ['本地媒体', '候选线复核', '标注导出'],
    actionLabel: '进入识别工作区',
  },
  {
    id: 'coordination',
    route: '/coordination',
    code: 'HANDOFF',
    title: '协同闭环',
    shortTitle: '协同闭环',
    description: '演练机器人请求越障、无人机接力、沿线前飞和下一障碍点等待。',
    capabilities: ['双端互锁', '接力越障', '安全状态机'],
    actionLabel: '进入协同闭环',
  },
]

export function getWorkspaceByRoute(route: string): WorkspaceDefinition | undefined {
  return workspaces.find((workspace) => workspace.route === route)
}
