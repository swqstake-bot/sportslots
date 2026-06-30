/** Live signal shared between useOriginalsSession and profile runners. */
export type SessionSignal = {
  cancelled: boolean
  paused: boolean
  /** Armed from UI — runner stops on the next win. */
  stopOnNextWin?: boolean
}

export function createSignal(): SessionSignal {
  return { cancelled: false, paused: false, stopOnNextWin: false }
}

/** Block until unpaused or cancelled. Returns true if cancelled while waiting. */
export async function waitWhilePaused(signal: SessionSignal): Promise<boolean> {
  while (signal.paused && !signal.cancelled) {
    await new Promise((r) => setTimeout(r, 80))
  }
  return signal.cancelled
}
