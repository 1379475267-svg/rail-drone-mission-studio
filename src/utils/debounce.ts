export interface DebouncedFunction<Arguments extends unknown[]> {
  (...argumentsList: Arguments): void
  cancel: () => void
  flush: () => void
}

export function debounce<Arguments extends unknown[]>(
  callback: (...argumentsList: Arguments) => void,
  delayMilliseconds: number,
): DebouncedFunction<Arguments> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingArguments: Arguments | null = null

  const invoke = (): void => {
    if (!pendingArguments) {
      return
    }

    const argumentsToUse = pendingArguments
    pendingArguments = null
    timer = null
    callback(...argumentsToUse)
  }

  const debounced = (...argumentsList: Arguments): void => {
    pendingArguments = argumentsList
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(invoke, Math.max(0, delayMilliseconds))
  }

  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = null
    pendingArguments = null
  }

  debounced.flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      invoke()
    }
  }

  return debounced
}
