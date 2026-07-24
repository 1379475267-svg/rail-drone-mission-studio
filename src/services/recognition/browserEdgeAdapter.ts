import type { RecognitionAdapter } from './recognitionAdapter'
import type {
  RecognitionFrameSample,
  RecognitionInference,
  RecognitionPoint,
} from '@/types/recognition'
import { createId } from '@/utils/id'

const TRANSITION_RADIUS = 4
const SMOOTHNESS_PENALTY = 7
const MAX_CONTROL_POINTS = 14
const MIN_HEURISTIC_SCORE = 0.12
const SCORE_NORMALIZATION = 96

interface PathResult {
  points: Array<{ x: number; y: number }>
  score: number
}

function abortIfRequested(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('识别任务已取消', 'AbortError')
}

function toGrayscale(imageData: ImageData): Float32Array {
  const grayscale = new Float32Array(imageData.width * imageData.height)
  for (let pixelIndex = 0, dataIndex = 0; pixelIndex < grayscale.length; pixelIndex += 1, dataIndex += 4) {
    const red = imageData.data[dataIndex] ?? 0
    const green = imageData.data[dataIndex + 1] ?? 0
    const blue = imageData.data[dataIndex + 2] ?? 0
    grayscale[pixelIndex] = red * 0.2126 + green * 0.7152 + blue * 0.0722
  }
  return grayscale
}

function buildEdgeMap(grayscale: Float32Array, width: number, height: number): Float32Array {
  const edgeMap = new Float32Array(width * height)

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x
      const horizontal = Math.abs((grayscale[index + 1] ?? 0) - (grayscale[index - 1] ?? 0))
      const vertical = Math.abs((grayscale[index + width] ?? 0) - (grayscale[index - width] ?? 0))
      edgeMap[index] = Math.min(255, horizontal * 0.35 + vertical)
    }
  }

  return edgeMap
}

function findContinuousLine(edgeMap: Float32Array, width: number, height: number): PathResult {
  const minY = Math.max(2, Math.floor(height * 0.08))
  const maxY = Math.min(height - 3, Math.ceil(height * 0.92))
  const rows = maxY - minY + 1
  let previous = new Float32Array(rows)
  const backPointers = new Int16Array(width * rows)

  for (let row = 0; row < rows; row += 1) {
    previous[row] = edgeMap[(row + minY) * width + 1] ?? 0
  }

  for (let x = 2; x < width - 1; x += 1) {
    const current = new Float32Array(rows)
    current.fill(Number.NEGATIVE_INFINITY)

    for (let row = 0; row < rows; row += 1) {
      let bestPrevious = Number.NEGATIVE_INFINITY
      let bestPreviousRow = row
      const from = Math.max(0, row - TRANSITION_RADIUS)
      const to = Math.min(rows - 1, row + TRANSITION_RADIUS)

      for (let previousRow = from; previousRow <= to; previousRow += 1) {
        const movement = Math.abs(previousRow - row)
        const candidate = (previous[previousRow] ?? 0) - movement * SMOOTHNESS_PENALTY
        if (candidate > bestPrevious) {
          bestPrevious = candidate
          bestPreviousRow = previousRow
        }
      }

      const edgeStrength = edgeMap[(row + minY) * width + x] ?? 0
      current[row] = bestPrevious + edgeStrength
      backPointers[x * rows + row] = bestPreviousRow
    }

    previous = current
  }

  let bestRow = 0
  for (let row = 1; row < rows; row += 1) {
    if ((previous[row] ?? Number.NEGATIVE_INFINITY) > (previous[bestRow] ?? Number.NEGATIVE_INFINITY)) {
      bestRow = row
    }
  }

  const densePath = new Array<{ x: number; y: number }>(Math.max(1, width - 2))
  let row = bestRow
  for (let x = width - 2; x >= 1; x -= 1) {
    densePath[x - 1] = { x, y: row + minY }
    row = backPointers[x * rows + row] ?? row
  }

  const usablePath = densePath.filter(
    (point) => point.x >= width * 0.08 && point.x <= width * 0.92,
  )
  const stride = Math.max(1, Math.floor(usablePath.length / (MAX_CONTROL_POINTS - 1)))
  const points = usablePath.filter((_, index) => index % stride === 0)
  const lastPoint = usablePath.at(-1)
  if (lastPoint && points.at(-1)?.x !== lastPoint.x) points.push(lastPoint)

  const meanEdge = densePath.reduce(
    (sum, point) => sum + (edgeMap[Math.round(point.y) * width + Math.round(point.x)] ?? 0),
    0,
  ) / Math.max(1, densePath.length)

  return { points, score: Math.max(0, Math.min(1, meanEdge / SCORE_NORMALIZATION)) }
}

function mapPoint(
  point: { x: number; y: number },
  frame: RecognitionFrameSample,
): RecognitionPoint {
  return {
    id: createId('wire-point'),
    x: Math.round(point.x * (frame.originalWidth / frame.imageData.width) * 10) / 10,
    y: Math.round(point.y * (frame.originalHeight / frame.imageData.height) * 10) / 10,
  }
}

/**
 * 轻量浏览器边缘基线：寻找跨越画面的连续高对比细线。
 * 它不是无人机飞行模型，也不是训练后的接触网分类器，只用于把前端闭环跑通。
 */
export class BrowserEdgeAdapter implements RecognitionAdapter {
  readonly id = 'browser-edge-v1'
  readonly label = '浏览器边缘基线 v1'
  readonly mode = 'HEURISTIC' as const
  readonly parameters = {
    transitionRadiusPx: TRANSITION_RADIUS,
    smoothnessPenalty: SMOOTHNESS_PENALTY,
    maxControlPoints: MAX_CONTROL_POINTS,
    minimumHeuristicScore: MIN_HEURISTIC_SCORE,
    scoreNormalization: SCORE_NORMALIZATION,
    horizontalScanMarginRatio: 0.08,
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    abortIfRequested(signal)
  }

  async recognize(
    frame: RecognitionFrameSample,
    signal?: AbortSignal,
  ): Promise<RecognitionInference> {
    abortIfRequested(signal)
    const startedAt = performance.now()
    const grayscale = toGrayscale(frame.imageData)
    abortIfRequested(signal)
    const edgeMap = buildEdgeMap(grayscale, frame.imageData.width, frame.imageData.height)
    const path = findContinuousLine(edgeMap, frame.imageData.width, frame.imageData.height)
    abortIfRequested(signal)

    // Give the browser one paint opportunity so the running state is perceptible.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    abortIfRequested(signal)

    return {
      processingMs: Math.max(0.1, performance.now() - startedAt),
      polylines: path.score < MIN_HEURISTIC_SCORE ? [] : [
        {
          id: createId('wire'),
          name: '候选接触线 1',
          label: 'CONTACT_WIRE',
          source: 'HEURISTIC',
          confidence: path.score,
          confidenceKind: 'HEURISTIC_SCORE',
          maskWidthPx: Math.max(8, frame.originalHeight * 0.018),
          reviewStatus: 'PENDING',
          manuallyModified: false,
          points: path.points.map((point) => mapPoint(point, frame)),
        },
      ],
    }
  }

  dispose(): void {}
}
