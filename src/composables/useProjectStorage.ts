import { getCurrentScope, onScopeDispose, ref, watch, type WatchStopHandle } from 'vue'

import {
  loadProjectFromStorage,
  removeStoredProject,
  saveProjectToStorage,
  type ProjectLoadResult,
  type StorageResult,
} from '@/services/projectStorage'
import { useProjectStore } from '@/stores/projectStore'
import { debounce } from '@/utils/debounce'

const AUTO_SAVE_DELAY_MILLISECONDS = 600

export function useProjectStorage() {
  const projectStore = useProjectStore()
  const initialized = ref(false)
  const lastSavedAt = ref<Date | null>(null)
  const storageError = ref<string | null>(null)
  let stopWatcher: WatchStopHandle | null = null
  let pageHideListening = false

  const saveDebounced = debounce(() => {
    if (projectStore.project.settings.autoSave) {
      performSave()
    }
  }, AUTO_SAVE_DELAY_MILLISECONDS)

  function performSave(): StorageResult {
    const result = saveProjectToStorage(projectStore.project)
    if (result.ok) {
      lastSavedAt.value = new Date()
      storageError.value = null
    } else {
      storageError.value = result.error
    }
    return result
  }

  const flushPendingAutoSave = (): void => {
    if (projectStore.project.settings.autoSave) {
      saveDebounced.flush()
    }
  }

  function initializeStorage(): ProjectLoadResult {
    if (initialized.value) {
      return { ok: true, project: null }
    }

    const loadResult = loadProjectFromStorage()
    if (loadResult.ok && loadResult.project) {
      projectStore.replaceProject(loadResult.project)
    } else if (!loadResult.ok) {
      storageError.value = loadResult.error
    }

    stopWatcher = watch(
      () => projectStore.project,
      () => saveDebounced(),
      { deep: true },
    )
    if (!pageHideListening) {
      window.addEventListener('pagehide', flushPendingAutoSave)
      pageHideListening = true
    }
    initialized.value = true
    return loadResult
  }

  function saveNow(): StorageResult {
    saveDebounced.cancel()
    return performSave()
  }

  function clearSavedProject(): StorageResult {
    saveDebounced.cancel()
    const result = removeStoredProject()
    if (!result.ok) {
      storageError.value = result.error
    }
    return result
  }

  function disposeStorage(): void {
    saveDebounced.flush()
    stopWatcher?.()
    stopWatcher = null
    if (pageHideListening) {
      window.removeEventListener('pagehide', flushPendingAutoSave)
      pageHideListening = false
    }
    initialized.value = false
  }

  if (getCurrentScope()) {
    onScopeDispose(disposeStorage)
  }

  return {
    initialized,
    lastSavedAt,
    storageError,
    initializeStorage,
    saveNow,
    clearSavedProject,
    disposeStorage,
  }
}
