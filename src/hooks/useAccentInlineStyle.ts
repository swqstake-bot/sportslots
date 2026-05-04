import { useLayoutEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useUiStore } from '../store/uiStore'
import { ACCENT_THEME_VAR_KEYS, accentCssVarsFromHex } from '../utils/accentTheme'

/**
 * Applies custom accent + optional UI brightness to the app shell (inline) and to
 * `document.documentElement` so `body`, portals, and `[data-app-mode]` surfaces stay in sync.
 */
export function useAccentInlineStyle(): CSSProperties | undefined {
  const hex = useUiStore((s) => s.accentCustomHex)
  const strength = useUiStore((s) => s.accentStrength)
  const brightness = useUiStore((s) => s.accentBrightness)
  const mode = useUiStore((s) => s.currentView)

  const vars = useMemo(() => {
    if (!hex) return null
    return accentCssVarsFromHex(hex, strength, brightness, mode)
  }, [hex, strength, brightness, mode])

  useLayoutEffect(() => {
    const root = document.documentElement
    for (const key of ACCENT_THEME_VAR_KEYS) {
      root.style.removeProperty(key)
    }
    if (!vars) return
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value)
    }
    return () => {
      for (const key of ACCENT_THEME_VAR_KEYS) {
        root.style.removeProperty(key)
      }
    }
  }, [vars])

  return vars ? (vars as CSSProperties) : undefined
}
