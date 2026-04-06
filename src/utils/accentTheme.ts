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

/** Slider range: value is a linear gain on RGB (1 = base color from hex). */
export const ACCENT_BRIGHTNESS = {
  min: 0.5,
  max: 1.25,
} as const

/**
 * Linear gain on accent RGB (no white-blend): avoids desaturation that read as “darker” on dark UI,
 * and matches user expectation that the right side of the slider is brighter.
 */
export function accentRgbWithBrightness(
  r: number,
  g: number,
  b: number,
  brightness: number
): { r: number; g: number; b: number } {
  const br = Math.min(ACCENT_BRIGHTNESS.max, Math.max(ACCENT_BRIGHTNESS.min, brightness))
  return {
    r: clamp255(r * br),
    g: clamp255(g * br),
    b: clamp255(b * br),
  }
}

/** Matches `index.css` per `data-app-mode` (sports/logger share root surfaces). */
export type AppViewMode = 'sports' | 'casino' | 'logger'

const MODE_SURFACES: Record<
  AppViewMode,
  { bgDeep: string; bgCard: string; bgElevated: string; text: string; textMuted: string }
> = {
  sports: {
    bgDeep: '#0A0A0F',
    bgCard: 'rgba(15, 15, 25, 0.85)',
    bgElevated: 'rgba(25, 25, 40, 0.9)',
    text: '#e8ecf4',
    textMuted: '#8890a8',
  },
  casino: {
    bgDeep: '#09070a',
    bgCard: 'rgba(14, 14, 18, 0.9)',
    bgElevated: 'rgba(19, 18, 24, 0.92)',
    text: '#e8ecf4',
    textMuted: '#8890a8',
  },
  logger: {
    bgDeep: '#0A0A0F',
    bgCard: 'rgba(15, 15, 25, 0.85)',
    bgElevated: 'rgba(25, 25, 40, 0.9)',
    text: '#e8ecf4',
    textMuted: '#8890a8',
  },
}

const UI_BR_EPS = 0.008

function parseCssColor(input: string): { r: number; g: number; b: number; a: number } | null {
  const s = String(input || '').trim()
  const nhex = normalizeHex(s)
  if (nhex) {
    const rgb = hexToRgb(nhex)
    if (rgb) return { ...rgb, a: 1 }
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i)
  if (!m) return null
  const a = m[4] !== undefined ? Number(m[4]) : 1
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: Number.isFinite(a) ? a : 1 }
}

function formatCssColor(r: number, g: number, b: number, a: number): string {
  if (a < 0.999) return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${a})`
  const h = (n: number) => clamp255(n).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Lifts or dims the whole chrome (backgrounds + text), not only accent. */
function adjustCssColorForUiBrightness(value: string, brightness: number): string {
  const br = Math.min(ACCENT_BRIGHTNESS.max, Math.max(ACCENT_BRIGHTNESS.min, brightness))
  if (Math.abs(br - 1) < UI_BR_EPS) return value
  const parsed = parseCssColor(value)
  if (!parsed) return value
  const { r, g, b, a } = parsed
  let nr = r
  let ng = g
  let nb = b
  if (br < 1) {
    const k = ((1 - br) / (1 - ACCENT_BRIGHTNESS.min)) * 0.44
    const f = 1 - k
    nr = r * f
    ng = g * f
    nb = b * f
  } else {
    const k = ((br - 1) / (ACCENT_BRIGHTNESS.max - 1)) * 0.22
    nr = r + (255 - r) * k
    ng = g + (255 - g) * k
    nb = b + (255 - b) * k
  }
  return formatCssColor(nr, ng, nb, a)
}

function surfaceCssVarsForBrightness(mode: AppViewMode, brightness: number): Record<string, string> {
  const br = Math.min(ACCENT_BRIGHTNESS.max, Math.max(ACCENT_BRIGHTNESS.min, brightness))
  if (Math.abs(br - 1) < UI_BR_EPS) return {}
  const base = MODE_SURFACES[mode]
  return {
    '--app-bg-deep': adjustCssColorForUiBrightness(base.bgDeep, brightness),
    '--app-bg-card': adjustCssColorForUiBrightness(base.bgCard, brightness),
    '--app-bg-elevated': adjustCssColorForUiBrightness(base.bgElevated, brightness),
    '--app-text': adjustCssColorForUiBrightness(base.text, brightness),
    '--app-text-muted': adjustCssColorForUiBrightness(base.textMuted, brightness),
  }
}

/** strength scales border/glow visibility (0.4–1.2). */
export function accentCssVarsFromHex(
  hex: string,
  strength: number,
  brightness: number,
  mode: AppViewMode
): Record<string, string> {
  const rgb = hexToRgb(hex)
  if (!rgb) return {}
  const { r, g, b } = accentRgbWithBrightness(rgb.r, rgb.g, rgb.b, brightness)
  const s = Math.min(1.2, Math.max(0.4, strength))
  const accent: Record<string, string> = {
    // Match solid fills / accent-color to the same RGB as --app-accent-rgb (hex alone stayed neon while fades used adjusted RGB).
    '--app-accent': `rgb(${r}, ${g}, ${b})`,
    '--app-accent-rgb': `${r}, ${g}, ${b}`,
    '--app-accent-glow': `rgba(${r}, ${g}, ${b}, ${(0.25 * s).toFixed(3)})`,
    '--app-border': `rgba(${r}, ${g}, ${b}, ${(0.24 * s).toFixed(3)})`,
    '--app-border-subtle': `rgba(${r}, ${g}, ${b}, ${(0.11 * s).toFixed(3)})`,
  }
  return { ...accent, ...surfaceCssVarsForBrightness(mode, brightness) }
}

/** All custom properties set when a user accent is active (for clearing `document.documentElement`). */
export const ACCENT_THEME_VAR_KEYS = [
  '--app-accent',
  '--app-accent-rgb',
  '--app-accent-glow',
  '--app-border',
  '--app-border-subtle',
  '--app-bg-deep',
  '--app-bg-card',
  '--app-bg-elevated',
  '--app-text',
  '--app-text-muted',
] as const

/** Quick presets aligned with built-in modes (for one-click pick). */
export const ACCENT_PRESETS: { label: string; hex: string }[] = [
  { label: 'Sports', hex: '#00ff88' },
  { label: 'Casino', hex: '#b61f34' },
  { label: 'Logger', hex: '#ff7a1a' },
  { label: 'Cyan', hex: '#00f0ff' },
]
