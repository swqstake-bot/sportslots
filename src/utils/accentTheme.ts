/**
 * Builds inline CSS custom properties for a user-chosen accent (overrides mode defaults).
 */
export function normalizeHex(input: string): string | null {
  let h = String(input || '').trim().replace(/^#/, '')
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return `#${h.toLowerCase()}`
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex)
  if (!n) return null
  const h = n.slice(1)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some((x) => Number.isNaN(x))) return null
  return { r, g, b }
}

function clamp255(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)))
}

/**
 * Adjusts accent RGB brightness: 1 = unchanged, below 1 darker, above 1 lighter (toward white).
 * Range ~0.5–1.45.
 */
export function accentRgbWithBrightness(
  r: number,
  g: number,
  b: number,
  brightness: number
): { r: number; g: number; b: number } {
  const br = Math.min(1.45, Math.max(0.5, brightness))
  if (br <= 1) {
    const k = br
    return { r: clamp255(r * k), g: clamp255(g * k), b: clamp255(b * k) }
  }
  const t = (br - 1) / 0.45
  const lift = (c: number) => clamp255(c + (255 - c) * t)
  return { r: lift(r), g: lift(g), b: lift(b) }
}

/** strength scales border/glow visibility (0.4–1.2). */
export function accentCssVarsFromHex(
  hex: string,
  strength: number,
  brightness: number
): Record<string, string> {
  const rgb = hexToRgb(hex)
  if (!rgb) return {}
  const { r, g, b } = accentRgbWithBrightness(rgb.r, rgb.g, rgb.b, brightness)
  const s = Math.min(1.2, Math.max(0.4, strength))
  const norm = normalizeHex(hex) || hex
  return {
    '--app-accent': norm,
    '--app-accent-rgb': `${r}, ${g}, ${b}`,
    '--app-accent-glow': `rgba(${r}, ${g}, ${b}, ${(0.25 * s).toFixed(3)})`,
    '--app-border': `rgba(${r}, ${g}, ${b}, ${(0.24 * s).toFixed(3)})`,
    '--app-border-subtle': `rgba(${r}, ${g}, ${b}, ${(0.11 * s).toFixed(3)})`,
  }
}

/** Quick presets aligned with built-in modes (for one-click pick). */
export const ACCENT_PRESETS: { label: string; hex: string }[] = [
  { label: 'Sports', hex: '#00ff88' },
  { label: 'Casino', hex: '#b61f34' },
  { label: 'Logger', hex: '#ff7a1a' },
  { label: 'Cyan', hex: '#00f0ff' },
]
