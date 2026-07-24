export type RecognitionMediaKind = 'IMAGE' | 'VIDEO'

export type RecognitionRunStatus =
  | 'IDLE'
  | 'MEDIA_READY'
  | 'RUNNING'
  | 'READY'
  | 'ERROR'

export type RecognitionReviewStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED'

export type RecognitionEditorMode = 'SELECT' | 'ADD_POINT' | 'ADD_SEGMENT'

export type RecognitionSource = 'HEURISTIC' | 'MANUAL'

export interface RecognitionMediaInfo {
  fileName: string
  mimeType: string
  kind: RecognitionMediaKind
  width: number
  height: number
  sizeBytes: number
  durationSeconds: number | null
}

export interface RecognitionPoint {
  id: string
  x: number
  y: number
}

export interface RecognitionPolyline {
  id: string
  name: string
  label: 'CONTACT_WIRE'
  source: RecognitionSource
  confidence: number | null
  confidenceKind: 'HEURISTIC_SCORE' | 'NOT_APPLICABLE'
  maskWidthPx: number
  reviewStatus: RecognitionReviewStatus
  manuallyModified: boolean
  points: RecognitionPoint[]
}

export interface RecognitionFrameResult {
  id: string
  adapterId: string
  adapterLabel: string
  adapterMode: 'HEURISTIC' | 'MOCK' | 'ONNX' | 'ROS'
  adapterParameters: Record<string, string | number | boolean>
  coordinateSpace: 'IMAGE_PIXEL'
  frameIndex: number
  timestampSeconds: number
  processingMs: number
  processingFps: number
  width: number
  height: number
  sampleWidth: number
  sampleHeight: number
  createdAt: string
  polylines: RecognitionPolyline[]
}

export interface RecognitionFrameSample {
  imageData: ImageData
  originalWidth: number
  originalHeight: number
  frameIndex: number
  timestampSeconds: number
}

export interface RecognitionInference {
  processingMs: number
  polylines: RecognitionPolyline[]
}

export type RecognitionSelection =
  | { kind: 'POLYLINE'; polylineId: string }
  | { kind: 'POINT'; polylineId: string; pointId: string }
  | { kind: 'SEGMENT'; polylineId: string; segmentIndex: number }
  | null

export interface RecognitionExportDocument {
  schemaVersion: '1.0'
  exportedAt: string
  media: RecognitionMediaInfo
  result: RecognitionFrameResult
  reviewSummary: {
    accepted: number
    rejected: number
    pending: number
    manuallyModified: number
  }
  caveat: string
}
