import type {
  RecognitionExportDocument,
  RecognitionFrameResult,
  RecognitionMediaInfo,
} from '@/types/recognition'
import type { FrameSource } from '@/services/recognition/frameSampler'

const MAX_EXPORT_PIXELS = 24_000_000

function safeFileStem(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-|-$/g, '') || 'contact-line'
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function exportRecognitionJson(
  media: RecognitionMediaInfo,
  result: RecognitionFrameResult,
): void {
  const document: RecognitionExportDocument = {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    media,
    result,
    reviewSummary: {
      accepted: result.polylines.filter((line) => line.reviewStatus === 'ACCEPTED').length,
      rejected: result.polylines.filter((line) => line.reviewStatus === 'REJECTED').length,
      pending: result.polylines.filter((line) => line.reviewStatus === 'PENDING').length,
      manuallyModified: result.polylines.filter((line) => line.manuallyModified).length,
    },
    caveat: 'HEURISTIC_SCORE 是浏览器边缘线索分，不是训练模型概率，也不可用于真实飞行控制。',
  }

  downloadBlob(
    new Blob([JSON.stringify(document, null, 2)], { type: 'application/json;charset=utf-8' }),
    `${safeFileStem(media.fileName)}-recognition.json`,
  )
}

function cssToken(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!value) throw new Error(`缺少导出颜色令牌：${name}`)
  return value
}

export async function exportAnnotatedPng(
  frame: FrameSource,
  media: RecognitionMediaInfo,
  result: RecognitionFrameResult,
): Promise<void> {
  const pixelCount = frame.width * frame.height
  if (!Number.isSafeInteger(pixelCount) || pixelCount <= 0 || pixelCount > MAX_EXPORT_PIXELS) {
    throw new Error('标注 PNG 最多支持 2400 万像素，请先缩小或裁剪素材')
  }
  const canvas = document.createElement('canvas')
  canvas.width = frame.width
  canvas.height = frame.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器未能创建导出画布')

  context.drawImage(frame.element, 0, 0, frame.width, frame.height)
  const scaleX = frame.width / result.width
  const scaleY = frame.height / result.height
  const scale = (scaleX + scaleY) / 2
  const accent = cssToken('--color-accent')
  const accepted = cssToken('--color-success')
  const rejected = cssToken('--color-danger')

  for (const line of result.polylines) {
    if (line.points.length < 2) continue
    const stroke = line.reviewStatus === 'ACCEPTED'
      ? accepted
      : line.reviewStatus === 'REJECTED'
        ? rejected
        : accent

    context.beginPath()
    line.points.forEach((point, index) => {
      const x = point.x * scaleX
      const y = point.y * scaleY
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.globalAlpha = 0.2
    context.strokeStyle = stroke
    context.lineWidth = Math.max(5, line.maskWidthPx * scale)
    context.stroke()

    context.globalAlpha = 1
    context.lineWidth = Math.max(2, 3 * scale)
    context.stroke()
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value)
      else reject(new Error('标注图编码失败，请尝试较小的图片'))
    }, 'image/png')
  })

  downloadBlob(blob, `${safeFileStem(media.fileName)}-annotated.png`)
}
