import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useUiStore } from '../store/uiStore'
import { accentCssVarsFromHex } from '../utils/accentTheme'

/** When set, overrides `[data-app-mode]` accent tokens (must be applied on same subtree as `data-app-mode`). */
export function useAccentInlineStyle(): CSSProperties | undefined {
  const hex = useUiStore((s) => s.accentCustomHex)
  const strength = useUiStore((s) => s.accentStrength)
  const brightness = useUiStore((s) => s.accentBrightness)
  return useMemo(() => {
    if (!hex) return undefined
    return accentCssVarsFromHex(hex, strength, brightness) as CSSProperties
  }, [hex, strength, brightness])
}
