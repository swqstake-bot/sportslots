const PERF_LOG = '[StakeSports:perf]';

function isPerfEnabled(): boolean {
  if (import.meta.env.VITE_PERF_INSTRUMENTATION === '1') return true;
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ss:perf') === '1') {
      return true;
    }
    if (typeof window !== 'undefined' && typeof location !== 'undefined') {
      const q = new URLSearchParams(location.search).get('perf');
      if (q === '1' || q === 'true') {
        sessionStorage.setItem('ss:perf', '1');
        return true;
      }
    }
  } catch {
    // private mode / blocked storage
  }
  return false;
}

function startFpsReporter(): void {
  let frames = 0;
  let last = performance.now();
  const windowMs = 5000;

  const tick = (now: number) => {
    frames += 1;
    if (now - last >= windowMs) {
      const fps = (frames * 1000) / (now - last);
      console.info(`${PERF_LOG} fps≈${fps.toFixed(1)} (${windowMs}ms window)`);
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function observeLongTasks(): void {
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        console.warn(`${PERF_LOG} longtask ${e.duration.toFixed(0)}ms`, e.name || '(main-thread)');
      }
    });
    obs.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
  } catch {
    // Long Task API not available
  }
}

function observeSlowEvents(): void {
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const ev = e as PerformanceEventTiming;
        if (ev.duration > 64) {
          console.info(
            `${PERF_LOG} slow interaction ${ev.name ?? 'event'} ${ev.duration.toFixed(0)}ms (processingStart delta check in DevTools)`,
          );
        }
      }
    });
    obs.observe({ type: 'event', durationThreshold: 64, buffered: true } as PerformanceObserverInit);
  } catch {
    // Event Timing not available
  }
}

/**
 * Opt-in only: VITE_PERF_INSTRUMENTATION=1, or ?perf=1 / sessionStorage ss:perf=1.
 * No-op when disabled (default).
 */
export function initPerfInstrumentation(): void {
  if (!isPerfEnabled()) return;
  console.info(`${PERF_LOG} enabled (FPS sample, long tasks, slow events where supported)`);
  startFpsReporter();
  observeLongTasks();
  observeSlowEvents();
}
