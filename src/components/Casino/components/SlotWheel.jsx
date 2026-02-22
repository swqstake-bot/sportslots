/**
 * Mini Slot-Wheel – zufälligen Slot aus der Auswahl drehen (WheelOfNames-Style).
 */
import { useState, useCallback } from 'react'

const WHEEL_COLORS = [
  '#00e676', '#f59e0b', '#6366f1', '#ec4899', '#14b8a6', '#f97316',
  '#8b5cf6', '#06b6d4', '#84cc16', '#ef4444',
]
const WHEEL_COLOR_OPENED = '#9ca3af'

const STYLES = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
  },
  wheelWrap: {
    position: 'relative',
    width: 140,
    height: 140,
  },
  wheel: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    transition: 'transform 0.1s linear',
  },
  pointer: {
    position: 'absolute',
    top: -4,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '8px solid transparent',
    borderRight: '8px solid transparent',
    borderTop: '14px solid var(--accent)',
    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
    zIndex: 2,
  },
  centerDot: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: 'var(--bg-deep)',
    border: '2px solid var(--border)',
    zIndex: 1,
  },
  btn: {
    padding: '0.35rem 0.75rem',
    background: 'var(--accent)',
    color: 'var(--bg-deep)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontWeight: 600,
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  result: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--accent)',
    textAlign: 'center',
    minHeight: '1.2rem',
  },
}

export default function SlotWheel({ slots = [], disabled, openedSlugs = [], onWinner }) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState(null)

  const openedSet = Array.isArray(openedSlugs) ? new Set(openedSlugs) : openedSlugs instanceof Set ? openedSlugs : new Set()
  const availableCount = slots.filter((s) => !openedSet.has(s?.slug)).length

  const spin = useCallback(() => {
    const available = slots.filter((s) => !openedSet.has(s?.slug))
    if (availableCount < 1 || disabled || spinning) return
    setSpinning(true)
    setWinner(null)
    const n = slots.length
    const segmentAngle = 360 / n
    const randomIndex = Math.floor(Math.random() * available.length)
    const winningSlot = available[randomIndex]
    const indexInSlots = slots.findIndex((s) => s?.slug === winningSlot?.slug)
    const target = indexInSlots >= 0 ? indexInSlots * segmentAngle + segmentAngle / 2 : 0
    const current = ((rotation % 360) + 360) % 360
    let diff = (target - current + 360) % 360
    if (diff < 1) diff = 360
    const add = 360 * 6 + diff
    setRotation((r) => r + add)
    setTimeout(() => {
      setSpinning(false)
      setWinner(winningSlot?.name || winningSlot?.slug || '')
      onWinner?.(winningSlot)
    }, 4200)
  }, [slots, disabled, spinning, rotation, openedSet, onWinner, availableCount])

  if (slots.length < 2) return null

  const segmentAngle = 360 / slots.length
  const conicStops = slots
    .map((slot, i) => {
      const start = i * segmentAngle
      const end = (i + 1) * segmentAngle
      const isOpened = openedSet.has(slot?.slug)
      const color = isOpened ? WHEEL_COLOR_OPENED : WHEEL_COLORS[i % WHEEL_COLORS.length]
      return `${color} ${start}deg ${end}deg`
    })
    .join(', ')
  const gradient = `conic-gradient(${conicStops})`
  const radius = 38

  return (
    <div style={STYLES.container}>
      <div style={STYLES.wheelWrap}>
        <div style={STYLES.pointer} />
        <div style={STYLES.centerDot} />
        <div
          style={{
            ...STYLES.wheel,
            position: 'relative',
            background: gradient,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'transform 0.2s ease-out',
            boxShadow: 'inset 0 0 0 3px var(--border)',
          }}
        >
          {slots.map((slot, i) => {
            const angle = i * segmentAngle + segmentAngle / 2
            const maxLen = segmentAngle < 36 ? 6 : segmentAngle < 60 ? 8 : 10
            const name = (slot.name || slot.slug || '').slice(0, maxLen)
            const isOpened = openedSet.has(slot?.slug)
            const segColor = isOpened ? WHEEL_COLOR_OPENED : WHEEL_COLORS[i % WHEEL_COLORS.length]
            return (
              <div
                key={slot.slug || i}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: segmentAngle < 25 ? 26 : 34,
                  transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px)`,
                  transformOrigin: 'center center',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: segmentAngle < 30 ? '0.55rem' : '0.6rem',
                    fontWeight: 700,
                    color: isOpened ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.85)',
                    textShadow: isOpened ? 'none' : `0 0 1px ${segColor}, 0 1px 3px ${segColor}, 0 0 2px #fff`,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {name}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={spin}
        disabled={disabled || spinning || slots.length < 2 || availableCount < 1}
        style={{
          ...STYLES.btn,
          opacity: disabled || spinning || slots.length < 2 || availableCount < 1 ? 0.6 : 1,
        }}
      >
        {spinning ? 'Dreht…' : availableCount < 1 ? 'Alle geöffnet' : '🎡 Drehen'}
      </button>
      {winner && <div style={STYLES.result}>→ {winner}</div>}
    </div>
  )
}
