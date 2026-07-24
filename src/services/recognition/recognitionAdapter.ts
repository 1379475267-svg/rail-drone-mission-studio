import type {
  RecognitionFrameSample,
  RecognitionInference,
} from '@/types/recognition'

export type RecognitionAdapterMode = 'HEURISTIC' | 'MOCK' | 'ONNX' | 'ROS'

export interface RecognitionAdapter {
  readonly id: string
  readonly label: string
  readonly mode: RecognitionAdapterMode
  readonly parameters: Record<string, string | number | boolean>
  initialize(signal?: AbortSignal): Promise<void>
  recognize(
    frame: RecognitionFrameSample,
    signal?: AbortSignal,
  ): Promise<RecognitionInference>
  dispose(): void | Promise<void>
}
