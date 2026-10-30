/**
 * B7 / SEC-009: disciplined message polling.
 *
 * Replaces a fixed `setInterval` with a self-scheduling loop that:
 *  - backs off exponentially up to a ceiling, so an idle conversation does not
 *    hammer the API at a constant rate;
 *  - pauses entirely while the tab is hidden (`document.visibilityState`) and
 *    resumes immediately when it becomes visible again.
 *
 * Returns a `stop()` function to be called from `onBeforeUnmount`.
 *
 * @param {() => Promise<void> | void} task   the work to run on each tick
 * @param {object} [options]
 * @param {number} [options.baseDelay=3000]   first delay, in milliseconds
 * @param {number} [options.maxDelay=30000]   backoff ceiling
 * @param {number} [options.factor=2]         backoff multiplier
 */
export function startPolling(task, options = {}) {
  const {
    baseDelay = 3000,
    maxDelay = 30000,
    factor = 2,
  } = options

  let delay = baseDelay
  let timer = null
  let stopped = false

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const schedule = (ms) => {
    clear()
    if (stopped) return
    timer = setTimeout(run, ms)
  }

  const run = async () => {
    if (stopped) return

    // A backgrounded tab must issue no requests.
    if (typeof document !== 'undefined' && document.hidden) {
      // Re-check when the tab becomes visible (see the listener below).
      return
    }

    try {
      await task()
      // Success: fall back toward the base interval.
      delay = baseDelay
    } catch {
      // Failure: back off, capped.
      delay = Math.min(delay * factor, maxDelay)
    }

    schedule(delay)
  }

  const onVisibilityChange = () => {
    if (stopped) return

    if (typeof document !== 'undefined' && !document.hidden) {
      // Returning to the tab: refresh immediately, resetting the backoff.
      delay = baseDelay
      clear()
      run()
    } else {
      // Leaving the tab: cancel any pending tick.
      clear()
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  // Kick off after the base delay (the component fetches once on mount).
  schedule(baseDelay)

  return function stop() {
    stopped = true
    clear()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }
}
