import type { MissionProject } from '@/types/project'
import { parseProject, serializeProject, type ProjectParseFailure } from './projectSerializer'

export const PROJECT_STORAGE_KEY = 'raildrone-mission-studio:project:v1'

export interface StorageSuccess {
  ok: true
}

export interface StorageFailure {
  ok: false
  error: string
}

export type StorageResult = StorageSuccess | StorageFailure

export type ProjectLoadResult =
  | { ok: true; project: MissionProject | null }
  | ProjectParseFailure

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function saveProjectToStorage(project: MissionProject): StorageResult {
  const storage = getLocalStorage()
  if (!storage) {
    return { ok: false, error: '当前环境无法使用 localStorage' }
  }

  try {
    storage.setItem(PROJECT_STORAGE_KEY, serializeProject(project, false))
    return { ok: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '保存失败'
    return { ok: false, error: `保存项目失败：${message}` }
  }
}

export function loadProjectFromStorage(): ProjectLoadResult {
  const storage = getLocalStorage()
  if (!storage) {
    return { ok: true, project: null }
  }

  try {
    const serializedProject = storage.getItem(PROJECT_STORAGE_KEY)
    if (!serializedProject) {
      return { ok: true, project: null }
    }
    return parseProject(serializedProject)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '读取失败'
    return { ok: false, error: `读取已保存项目失败：${message}`, details: [message] }
  }
}

export function removeStoredProject(): StorageResult {
  const storage = getLocalStorage()
  if (!storage) {
    return { ok: false, error: '当前环境无法使用 localStorage' }
  }

  try {
    storage.removeItem(PROJECT_STORAGE_KEY)
    return { ok: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '清除失败'
    return { ok: false, error: `清除已保存项目失败：${message}` }
  }
}
