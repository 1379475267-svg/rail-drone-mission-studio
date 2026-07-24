let fallbackSequence = 0

function normalizePrefix(prefix: string): string {
  const normalized = prefix.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  return normalized || 'item'
}

/**
 * 创建适合保存在项目 JSON 中的唯一标识符。
 * 浏览器支持 randomUUID 时优先使用；否则使用时间戳、序号和随机片段兜底。
 */
export function createId(prefix = 'item'): string {
  const safePrefix = normalizePrefix(prefix)

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${safePrefix}-${crypto.randomUUID()}`
  }

  fallbackSequence += 1
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `${safePrefix}-${Date.now().toString(36)}-${fallbackSequence.toString(36)}-${randomPart}`
}

export function isNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
