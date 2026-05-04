/** Stats payloads pushed from challenge hunters into the hub KPI bar. */
export interface HubStatsPayload {
  source: 'casino' | 'telegram' | string
  queued: number
  running: number
  completed: number
  bestMulti: number
  ts: number
}
