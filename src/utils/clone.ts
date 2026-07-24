export function cloneSerializable<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      // Vue/Pinia 的响应式 Proxy 不能被 structuredClone 复制，退回 JSON 路径。
    }
  }

  return JSON.parse(JSON.stringify(value)) as T
}
