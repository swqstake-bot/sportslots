import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

const STORAGE_KEY = 'originalsStatsFloatPos'

type PanelPos = { x: number; y: number }

function loadPos(): PanelPos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PanelPos
    if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return parsed
  } catch {
    /* ignore */
  }
  return null
}

function savePos(pos: PanelPos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
  } catch {
    /* ignore */
  }
}

/** Drag handle for floating stats panel — persists position in localStorage. */
export function useDraggablePanel(enabled: boolean) {
  const panelRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(
    null
  )
  const [pos, setPos] = useState<PanelPos | null>(() => (enabled ? loadPos() : null))

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || e.button !== 0) return
      const panel = panelRef.current
      if (!panel) return
      e.preventDefault()
      const rect = panel.getBoundingClientRect()
      const origX = pos?.x ?? rect.left
      const origY = pos?.y ?? rect.top
      dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX, origY }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [enabled, pos]
  )

  useEffect(() => {
    if (!enabled) return

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || e.pointerId !== drag.pointerId) return
      const x = Math.max(8, Math.min(window.innerWidth - 120, drag.origX + (e.clientX - drag.startX)))
      const y = Math.max(8, Math.min(window.innerHeight - 80, drag.origY + (e.clientY - drag.startY)))
      setPos({ x, y })
    }

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || e.pointerId !== drag.pointerId) return
      dragRef.current = null
      setPos((current) => {
        if (current) savePos(current)
        return current
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [enabled])

  const panelStyle: CSSProperties | undefined =
    enabled && pos ? { left: pos.x, top: pos.y, right: 'auto' } : undefined

  return {
    panelRef,
    panelStyle,
    onHeaderPointerDown: onPointerDown,
  }
}
