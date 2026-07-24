import { describe, expect, it } from 'vitest'
import { getWorkspaceByRoute, workspaces } from '@/data/workspaces'

describe('workspace navigation model', () => {
  it('exposes exactly the three primary workspaces', () => {
    expect(workspaces.map((workspace) => workspace.id)).toEqual([
      'mission',
      'recognition',
      'coordination',
    ])
  })

  it('uses unique hash-compatible application routes', () => {
    const routes = workspaces.map((workspace) => workspace.route)

    expect(new Set(routes).size).toBe(routes.length)
    expect(routes).toEqual(['/mission', '/recognition', '/coordination'])
    expect(routes.every((route) => route.startsWith('/') && !route.includes('#'))).toBe(true)
  })

  it('keeps visible navigation labels and actions complete', () => {
    for (const workspace of workspaces) {
      expect(workspace.title).toBeTruthy()
      expect(workspace.shortTitle).toBeTruthy()
      expect(workspace.description.length).toBeGreaterThan(12)
      expect(workspace.capabilities).toHaveLength(3)
      expect(workspace.actionLabel.startsWith('进入')).toBe(true)
      expect(getWorkspaceByRoute(workspace.route)?.id).toBe(workspace.id)
    }
  })
})
