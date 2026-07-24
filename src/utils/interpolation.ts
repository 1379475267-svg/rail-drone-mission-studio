import type { Point2D } from '@/types/scene'

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function lerp(start: number, end: number, progress: number): number {
  const safeProgress = clamp(progress, 0, 1)
  return start + (end - start) * safeProgress
}

export function interpolatePoint(start: Point2D, end: Point2D, progress: number): Point2D {
  return {
    x: lerp(start.x, end.x, progress),
    y: lerp(start.y, end.y, progress),
  }
}
