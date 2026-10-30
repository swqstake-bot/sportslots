/** Stats payloads pushed from challenge hunters into the hub KPI bar. */
export interface HubStatsPayload {
  source: 'casino' | 'telegram' | string
  queued: number
  running: number
  completed: number
  /** Runs that failed before completion; display only. */
  failed?: number
  bestMulti: number
  ts: number
  /** Session P/L USD (resource mode / lite KPI). */
  profitUsd?: number
  /** Session average bets per second. */
  betsPerSec?: number
}
