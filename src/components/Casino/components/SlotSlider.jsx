/**
 * Horizontaler "Slot-Slider" statt Rad.
 * Wählt zufälligen Slot aus der Liste.
 */
import { useState, useCallback, useEffect, useMemo } from 'react'

const ITEM_WIDTH = 120
const ITEM_GAP = 10
const VISIBLE_ITEMS = 5 // Ungerade Zahl bevorzugt, damit einer in der Mitte steht
const TOTAL_ITEM_WIDTH = ITEM_WIDTH + ITEM_GAP
const TARGET_STRIP_ITEMS = 320

const STYLES = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    padding: '1rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    width: '100%',
    maxWidth: 700,
    margin: '0 auto',
  },
  viewport: {
    position: 'relative',
    width: `min(100%, ${TOTAL_ITEM_WIDTH * VISIBLE_ITEMS - ITEM_GAP}px)`,
    height: 100,
    overflow: 'hidden',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-deep)',
    boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
    border: '2px solid var(--accent)',
  },
  strip: {
    display: 'flex',
    gap: ITEM_GAP,
    height: '100%',
    alignItems: 'center',
    paddingLeft: `calc(50% - ${ITEM_WIDTH / 2}px)`,
    transition: 'transform 4s cubic-bezier(0.15, 0.9, 0.3, 1)',
    willChange: 'transform',
  },
  item: {
    flexShrink: 0,
    width: ITEM_WIDTH,
    height: 80,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    fontSize: '0.8rem',
    fontWeight: 600,
    padding: '0.5rem',
    color: 'var(--text)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    position: 'relative',
    overflow: 'hidden',
  },
  itemOpened: {
    opacity: 0.5,
    filter: 'grayscale(1)',
    background: 'var(--bg-elevated)',
  },
  openedBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    background: 'var(--surface-3)',
    color: 'var(--text-muted)',
    fontSize: '0.6rem',
    padding: '2px 4px',
    borderBottomLeftRadius: 4,
  },
  centerLine: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 4,
    background: 'var(--accent)',
    transform: 'translateX(-50%)',
    zIndex: 10,
    boxShadow: '0 0 10px var(--accent)',
    opacity: 0.8,
    pointerEvents: 'none',
  },
  btn: {
    padding: '0.75rem 2rem',
    background: 'var(--accent)',
    color: 'var(--bg-deep)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: '1rem',
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    transition: 'transform 0.1s',
  },
  winnerDisplay: {
    fontSize: '1.2rem',
    fontWeight: 700,
    color: 'var(--accent)',
    minHeight: '1.8rem',
    textShadow: '0 0 10px rgba(var(--accent-rgb), 0.3)',
  },
}

export default function SlotSlider({ slots = [], disabled, openedSlugs = [], onWinner, bonusSlots = [] }) {
  const [offset, setOffset] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [winnerName, setWinnerName] = useState('')
  const openedSet = useMemo(() => new Set(openedSlugs), [openedSlugs])
  
  // Filter only slots that have bonus for the strip
  const bonusOnlySlots = useMemo(() => {
    if (bonusSlots.length === 0) return slots
    return slots.filter(slot => bonusSlots.some(bonusSlot => bonusSlot.slug === slot.slug))
  }, [slots, bonusSlots])

  // Filter only available slots for winning, but show all in strip? 
  // No, better to show only bonus slots in strip.
  const availableSlots = useMemo(() => bonusOnlySlots.filter(s => !openedSet.has(s.slug)), [bonusOnlySlots, openedSet])
  
  // Create a strip that repeats slots enough times to scroll
  // We need a deterministic strip for rendering, but the stop position depends on the winner.
  // Strategy: 
  // 1. Generate a long list of items (randomized order)
  // 2. Pick a winner from availableSlots
  // 3. Find that winner deep in the list (e.g., at index 50+)
  // 4. Scroll to that position.
  
  const [stripItems, setStripItems] = useState([])
  
  useEffect(() => {
    const source = bonusOnlySlots.length > 0 ? bonusOnlySlots : slots
    if (source.length === 0) {
      setStripItems([])
      return
    }
    // Dynamische Länge: genug für smooth scrolling, aber deutlich weniger DOM als vorher.
    const repeatCount = Math.max(20, Math.ceil(TARGET_STRIP_ITEMS / source.length))
    const longStrip = []
    for (let i = 0; i < repeatCount; i++) longStrip.push(...source)
    setStripItems(longStrip)
  }, [slots, bonusOnlySlots])

  const spin = useCallback(() => {
    if (spinning || availableSlots.length === 0 || disabled) return
    if (!stripItems.length) return
    
    setSpinning(true)
    setWinnerName('')
    
    // Gewinner auswählen
    const winner = availableSlots[Math.floor(Math.random() * availableSlots.length)]
    
    // Position des Gewinners im aktuellen Strip finden
    const currentWinnerPositions = []
    for (let i = 0; i < stripItems.length; i++) {
      if (stripItems[i].slug === winner.slug) {
        currentWinnerPositions.push(i)
      }
    }
    
    if (currentWinnerPositions.length === 0) {
      // Falls der Gewinner nicht im aktuellen Strip ist, füge ihn hinzu
      const insertPosition = Math.floor(stripItems.length / 2) + Math.floor(Math.random() * 20)
      const newStrip = [...stripItems]
      newStrip.splice(insertPosition, 0, winner)
      setStripItems(newStrip)
      
      // Animation zu dieser Position
      setTimeout(() => {
        const targetPx = insertPosition * TOTAL_ITEM_WIDTH
        setOffset(-targetPx)
        
        setTimeout(() => {
          setSpinning(false)
          setWinnerName(winner.name)
          onWinner?.(winner)
        }, 4000)
      }, 50)
    } else {
      // Animation zu einer zufälligen Position des Gewinners
      const targetPosition = currentWinnerPositions[Math.floor(Math.random() * currentWinnerPositions.length)]
      const targetPx = targetPosition * TOTAL_ITEM_WIDTH
      
      // Sofortige Positionierung ohne Animation, dann Animation zum Ziel
      setOffset(0)
      setTimeout(() => {
        setOffset(-targetPx)
        
        setTimeout(() => {
          setSpinning(false)
          setWinnerName(winner.name)
          onWinner?.(winner)
        }, 4000)
      }, 50)
    }
  }, [spinning, availableSlots, disabled, stripItems, onWinner])

  if (bonusOnlySlots.length === 0) return null

  return (
    <div style={STYLES.container}>
      <div style={STYLES.winnerDisplay}>
        {winnerName || (spinning ? 'Good luck!' : 'Ready to open')}
      </div>
      
      <div style={STYLES.viewport}>
        <div style={STYLES.centerLine} />
        <div 
          style={{
            ...STYLES.strip,
            transform: `translateX(${offset}px)`,
            transition: spinning ? 'transform 4s cubic-bezier(0.15, 0.9, 0.3, 1)' : 'none'
          }}
        >
          {stripItems.map((slot, i) => {
            const isOpened = openedSet.has(slot.slug)
            return (
              <div 
                key={i} 
                style={{
                  ...STYLES.item,
                  ...(isOpened ? STYLES.itemOpened : {})
                }}
              >
                {slot.name}
                {isOpened && <div style={STYLES.openedBadge}>OPEN</div>}
              </div>
            )
          })}
        </div>
      </div>

      <button
        onClick={spin}
        disabled={disabled || spinning || availableSlots.length === 0}
        style={{
          ...STYLES.btn,
          opacity: disabled || spinning || availableSlots.length === 0 ? 0.5 : 1,
          transform: spinning ? 'scale(0.95)' : 'scale(1)'
        }}
      >
        {spinning ? 'Running...' : availableSlots.length === 0 ? 'All opened!' : 'START SLIDE'}
      </button>
    </div>
  )
}