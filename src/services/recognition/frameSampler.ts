import type { RecognitionFrameSample } from '@/types/recognition'

const MAX_SAMPLE_EDGE = 960

export interface FrameSource {
  element: HTMLImageElement | HTMLVideoElement
  width: number
  height: number
  frameIndex: number
  timestampSeconds: number
}

export function sampleMediaFrame(source: FrameSource): RecognitionFrameSample {
  const longestEdge = Math.max(source.width, source.height)
  const scale = Math.min(1, MAX_SAMPLE_EDGE / Math.max(1, longestEdge))
  const width = Math.max(8, Math.round(source.width * scale))
  const height = Math.max(8, Math.round(source.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) throw new Error('浏览器未能创建帧采样画布，请刷新后重试')

  context.drawImage(source.element, 0, 0, width, height)

  return {
    imageData: context.getImageData(0, 0, width, height),
    originalWidth: source.width,
    originalHeight: source.height,
    frameIndex: source.frameIndex,
    timestampSeconds: source.timestampSeconds,
  }
}
