import { ref } from 'vue'
import { defineStore } from 'pinia'

import type { EditorTool } from '@/types/scene'

export const useSceneStore = defineStore('scene', () => {
  const activeTool = ref<EditorTool>('SELECT')
  const selectedObjectId = ref<string | null>(null)

  function setTool(tool: EditorTool): void {
    activeTool.value = tool
  }

  function selectObject(objectId: string | null): void {
    selectedObjectId.value = objectId
  }

  function clearSelection(): void {
    selectedObjectId.value = null
  }

  function resetEditorState(): void {
    activeTool.value = 'SELECT'
    selectedObjectId.value = null
  }

  return {
    activeTool,
    selectedObjectId,
    setTool,
    selectObject,
    clearSelection,
    resetEditorState,
  }
})
