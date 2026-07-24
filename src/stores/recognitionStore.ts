import { defineStore } from 'pinia'
import type {
  RecognitionEditorMode,
  RecognitionFrameResult,
  RecognitionPoint,
  RecognitionReviewStatus,
  RecognitionRunStatus,
  RecognitionSelection,
} from '@/types/recognition'
import { cloneSerializable } from '@/utils/clone'
import { createId } from '@/utils/id'

interface RecognitionHistoryEntry {
  result: RecognitionFrameResult
  label: string
}

interface RecognitionState {
  runStatus: RecognitionRunStatus
  errorMessage: string | null
  result: RecognitionFrameResult | null
  selection: RecognitionSelection
  editorMode: RecognitionEditorMode
  showOverlay: boolean
  draftSegmentStart: RecognitionPoint | null
  history: RecognitionHistoryEntry[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export const useRecognitionStore = defineStore('recognition', {
  state: (): RecognitionState => ({
    runStatus: 'IDLE',
    errorMessage: null,
    result: null,
    selection: null,
    editorMode: 'SELECT',
    showOverlay: true,
    draftSegmentStart: null,
    history: [],
  }),

  getters: {
    selectedPolyline(state) {
      if (!state.result || !state.selection) return null
      return state.result.polylines.find(
        (line) => line.id === state.selection?.polylineId,
      ) ?? null
    },
    canDeleteSelection: (state) => Boolean(state.selection),
    canUndo: (state) => state.history.length > 0,
  },

  actions: {
    resetSession() {
      this.runStatus = 'IDLE'
      this.errorMessage = null
      this.result = null
      this.selection = null
      this.editorMode = 'SELECT'
      this.showOverlay = true
      this.draftSegmentStart = null
      this.history = []
    },
    setMediaReady() {
      this.runStatus = 'MEDIA_READY'
      this.errorMessage = null
      this.result = null
      this.selection = null
      this.draftSegmentStart = null
      this.history = []
    },
    setRunning() {
      this.runStatus = 'RUNNING'
      this.errorMessage = null
      this.selection = null
      this.draftSegmentStart = null
    },
    setError(message: string) {
      this.runStatus = 'ERROR'
      this.errorMessage = message
    },
    setResult(result: RecognitionFrameResult) {
      this.result = result
      this.runStatus = 'READY'
      this.errorMessage = null
      this.selection = result.polylines[0]
        ? { kind: 'POLYLINE', polylineId: result.polylines[0].id }
        : null
      this.editorMode = 'SELECT'
      this.draftSegmentStart = null
      this.history = []
    },
    setEditorMode(mode: RecognitionEditorMode) {
      this.editorMode = mode
      this.draftSegmentStart = null
    },
    setShowOverlay(value: boolean) {
      this.showOverlay = value
    },
    select(selection: RecognitionSelection) {
      this.selection = selection
    },
    remember(label: string) {
      if (!this.result) return
      this.history.push({ result: cloneSerializable(this.result), label })
      if (this.history.length > 20) this.history.shift()
    },
    undo() {
      const previous = this.history.pop()
      if (!previous) return null
      this.result = previous.result
      this.selection = null
      this.draftSegmentStart = null
      return previous.label
    },
    markLineEdited(polylineId: string) {
      const line = this.result?.polylines.find((item) => item.id === polylineId)
      if (!line) return
      line.manuallyModified = true
      line.reviewStatus = 'PENDING'
    },
    movePoint(polylineId: string, pointId: string, point: { x: number; y: number }) {
      const result = this.result
      const line = result?.polylines.find((item) => item.id === polylineId)
      const target = line?.points.find((item) => item.id === pointId)
      if (!result || !line || !target) return
      target.x = Math.round(clamp(point.x, 0, result.width) * 10) / 10
      target.y = Math.round(clamp(point.y, 0, result.height) * 10) / 10
      this.markLineEdited(polylineId)
    },
    beginPointMove() {
      this.remember('拖动控制点')
    },
    insertPoint(polylineId: string, segmentIndex: number, point: { x: number; y: number }) {
      const result = this.result
      const line = result?.polylines.find((item) => item.id === polylineId)
      if (!result || !line) return
      this.remember('插入控制点')
      line.points.splice(segmentIndex + 1, 0, {
        id: createId('wire-point'),
        x: Math.round(clamp(point.x, 0, result.width) * 10) / 10,
        y: Math.round(clamp(point.y, 0, result.height) * 10) / 10,
      })
      this.markLineEdited(polylineId)
      this.selection = { kind: 'POINT', polylineId, pointId: line.points[segmentIndex + 1]!.id }
    },
    handleSegmentDraftPoint(point: { x: number; y: number }, minimumDistance = 2) {
      const result = this.result
      if (!result) return
      const nextPoint: RecognitionPoint = {
        id: createId('wire-point'),
        x: Math.round(clamp(point.x, 0, result.width) * 10) / 10,
        y: Math.round(clamp(point.y, 0, result.height) * 10) / 10,
      }
      if (!this.draftSegmentStart) {
        this.draftSegmentStart = nextPoint
        return
      }

      if (Math.hypot(
        nextPoint.x - this.draftSegmentStart.x,
        nextPoint.y - this.draftSegmentStart.y,
      ) < Math.max(2, minimumDistance)) return

      this.remember('新建线段')
      const lineId = createId('wire')
      result.polylines.push({
        id: lineId,
        name: `人工线段 ${result.polylines.length + 1}`,
        label: 'CONTACT_WIRE',
        source: 'MANUAL',
        confidence: null,
        confidenceKind: 'NOT_APPLICABLE',
        maskWidthPx: Math.max(8, result.height * 0.018),
        reviewStatus: 'PENDING',
        manuallyModified: true,
        points: [this.draftSegmentStart, nextPoint],
      })
      this.draftSegmentStart = null
      this.selection = { kind: 'POLYLINE', polylineId: lineId }
      this.editorMode = 'SELECT'
    },
    deleteSelection() {
      const result = this.result
      const selection = this.selection
      if (!result || !selection) return
      this.remember('删除标注')
      const lineIndex = result.polylines.findIndex((line) => line.id === selection.polylineId)
      if (lineIndex < 0) return
      const line = result.polylines[lineIndex]!

      if (selection.kind === 'POLYLINE') {
        result.polylines.splice(lineIndex, 1)
      } else if (selection.kind === 'POINT') {
        line.points = line.points.filter((point) => point.id !== selection.pointId)
        if (line.points.length < 2) result.polylines.splice(lineIndex, 1)
        else this.markLineEdited(line.id)
      } else {
        const left = line.points.slice(0, selection.segmentIndex + 1)
        const right = line.points.slice(selection.segmentIndex + 1)
        const replacements = [left, right]
          .filter((points) => points.length >= 2)
          .map((points, index) => ({
            ...cloneSerializable(line),
            id: createId('wire'),
            name: `${line.name}-${index + 1}`,
            points,
            manuallyModified: true,
            reviewStatus: 'PENDING' as const,
          }))
        result.polylines.splice(lineIndex, 1, ...replacements)
      }
      this.selection = null
    },
    setReviewStatus(status: RecognitionReviewStatus) {
      const line = this.selectedPolyline
      if (!line) return
      this.remember(status === 'ACCEPTED' ? '接受识别线' : status === 'REJECTED' ? '驳回识别线' : '重置审核状态')
      line.reviewStatus = status
    },
  },
})
