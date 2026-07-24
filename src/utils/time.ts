const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE

export function nowIso(): string {
  return new Date().toISOString()
}

/** 将秒数格式化为 HH:MM:SS；不足一小时则显示 MM:SS。 */
export function formatElapsedTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0
  const wholeSeconds = Math.floor(safeSeconds)
  const hours = Math.floor(wholeSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor((wholeSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = wholeSeconds % SECONDS_PER_MINUTE
  const paddedMinutes = String(minutes).padStart(2, '0')
  const paddedSeconds = String(seconds).padStart(2, '0')

  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`
}

export function toFileTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}
