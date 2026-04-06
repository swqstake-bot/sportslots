import { useCallback, useEffect, useRef, useState } from 'react'
import { useUiStore } from '../../store/uiStore'
import {
  ACCENT_BRIGHTNESS,
  ACCENT_PRESETS,
  accentRgbWithBrightness,
  hexToRgb,
  normalizeHex,
} from '../../utils/accentTheme'

export function ThemeAccentButton() {
  const accentCustomHex = useUiStore((s) => s.accentCustomHex)
  const accentStrength = useUiStore((s) => s.accentStrength)
  const accentBrightness = useUiStore((s) => s.accentBrightness)
  const setAccentCustomHex = useUiStore((s) => s.setAccentCustomHex)
  const setAccentStrength = useUiStore((s) => s.setAccentStrength)
  const setAccentBrightness = useUiStore((s) => s.setAccentBrightness)
  const resetAccentTheme = useUiStore((s) => s.resetAccentTheme)

  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const displayHex = accentCustomHex ?? ACCENT_PRESETS[0].hex
  const colorInputValue = normalizeHex(displayHex) ?? '#00ff88'
  const swatchBg =
    accentCustomHex != null
      ? (() => {
          const rgb = hexToRgb(accentCustomHex)
          if (!rgb) return colorInputValue
          const a = accentRgbWithBrightness(rgb.r, rgb.g, rgb.b, accentBrightness)
          return `rgb(${a.r}, ${a.g}, ${a.b})`
        })()
      : colorInputValue

  const onPickColor = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = normalizeHex(e.target.value)
      if (v) setAccentCustomHex(v)
    },
    [setAccentCustomHex]
  )

  return (
    <div className="theme-accent-wrap" ref={wrapRef}>
      <button
        type="button"
        className="theme-accent-trigger"
        onClick={() => setOpen((o) => !o)}
        title="Accent color"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="theme-accent-swatch" style={{ background: swatchBg }} aria-hidden />
        <span className="theme-accent-label">Color</span>
      </button>

      {open && (
        <div className="theme-accent-popover" role="dialog" aria-label="Accent color settings">
          <div className="theme-accent-popover-title">Accent</div>
          <p className="theme-accent-popover-hint">
            Overrides the tab accent until reset. Brightness also lifts or dims backgrounds, cards, and text — not only the accent.
          </p>

          <div className="theme-accent-row">
            <label className="theme-accent-label-inline" htmlFor="accent-color-input">
              Pick
            </label>
            <input
              id="accent-color-input"
              type="color"
              className="theme-accent-color-input"
              value={colorInputValue}
              onChange={onPickColor}
            />
          </div>

          <div className="theme-accent-row theme-accent-row-slider">
            <label className="theme-accent-label-inline" htmlFor="accent-brightness">
              Helligkeit
            </label>
            <input
              id="accent-brightness"
              type="range"
              min={ACCENT_BRIGHTNESS.min}
              max={ACCENT_BRIGHTNESS.max}
              step={0.05}
              value={accentBrightness}
              onChange={(e) => setAccentBrightness(Number(e.target.value))}
            />
          </div>

          <div className="theme-accent-row theme-accent-row-slider">
            <label className="theme-accent-label-inline" htmlFor="accent-strength">
              Border / glow
            </label>
            <input
              id="accent-strength"
              type="range"
              min={0.4}
              max={1.2}
              step={0.05}
              value={accentStrength}
              onChange={(e) => setAccentStrength(Number(e.target.value))}
            />
          </div>

          <div className="theme-accent-presets">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="theme-accent-preset"
                onClick={() => setAccentCustomHex(p.hex)}
                title={p.label}
              >
                <span className="theme-accent-preset-swatch" style={{ background: p.hex }} />
                {p.label}
              </button>
            ))}
          </div>

          <div className="theme-accent-actions">
            <button type="button" className="theme-accent-reset" onClick={() => resetAccentTheme()}>
              Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
