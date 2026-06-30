import { isScriptDisplayableBetShareId } from '../scriptEngine/scriptHouseBetIdBridge'

export function formatBetUsd(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n !== 0 && Math.abs(n) < 0.1) return n.toFixed(4)
  return n.toFixed(2)
}

export function shortenBetId(id: string, max = 14): string {
  if (id.length <= max) return id
  return `${id.slice(0, max)}…`
}

export function displayBetId(id: string | null | undefined): string | null {
  if (!id || !isScriptDisplayableBetShareId(id)) return null
  return id
}

export async function copyBetIdToClipboard(id: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(id)
    return true
  } catch {
    return false
  }
}
