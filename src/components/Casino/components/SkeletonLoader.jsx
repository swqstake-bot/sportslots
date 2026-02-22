/**
 * Skeleton-Loader Komponente für bessere Lade-Animationen
 */
import { useEffect, useState } from 'react'

const STYLES = {
  skeleton: {
    background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-card) 50%, var(--bg-elevated) 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton-loading 1.5s infinite',
    borderRadius: 'var(--radius-md)',
  },
  text: {
    height: '1rem',
    marginBottom: '0.5rem',
  },
  card: {
    padding: '1rem',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    marginBottom: '1rem',
  },
  grid: {
    display: 'grid',
    gap: '0.5rem',
  },
  flex: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
  },
  button: {
    height: '2.5rem',
    borderRadius: 'var(--radius-md)',
  },
}

// CSS-Animation für das Shimmer-Effekt
const skeletonAnimation = `
  @keyframes skeleton-loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`

export function SkeletonLoader({ type = 'text', count = 1, width, height, className = '' }) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) return null

  const elements = []
  for (let i = 0; i < count; i++) {
    elements.push(
      <div
        key={i}
        className={`skeleton ${className}`}
        style={{
          ...STYLES.skeleton,
          ...(type === 'text' && STYLES.text),
          ...(type === 'button' && STYLES.button),
          ...(type === 'avatar' && STYLES.avatar),
          width: width || (type === 'text' ? '100%' : width),
          height: height || (type === 'text' ? '1rem' : height),
        }}
      />
    )
  }

  return (
    <>
      <style>{skeletonAnimation}</style>
      {elements}
    </>
  )
}

export function SkeletonWallet() {
  return (
    <div style={STYLES.card}>
      <SkeletonLoader type="text" width="60px" />
      <div style={{ marginTop: '1rem' }}>
        <SkeletonLoader type="text" count={3} />
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
          <SkeletonLoader type="text" width="80px" />
          <SkeletonLoader type="text" width="60px" />
        </div>
      </div>
      <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
        <SkeletonLoader type="text" width="100px" />
      </div>
    </div>
  )
}

export function SkeletonChallenges() {
  return (
    <div>
      <SkeletonLoader type="text" width="120px" style={{ marginBottom: '1rem' }} />
      <div style={{ ...STYLES.grid, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={STYLES.card}>
            <div style={STYLES.flex}>
              <SkeletonLoader type="avatar" />
              <div style={{ flex: 1 }}>
                <SkeletonLoader type="text" />
                <SkeletonLoader type="text" width="60%" />
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <SkeletonLoader type="text" count={2} />
            </div>
            <div style={{ marginTop: '1rem' }}>
              <SkeletonLoader type="button" width="100%" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonSlots() {
  return (
    <div>
      <SkeletonLoader type="text" width="100px" style={{ marginBottom: '1rem' }} />
      <div style={{ ...STYLES.grid, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {[...Array(12)].map((_, i) => (
          <div key={i} style={{ ...STYLES.card, padding: '0.75rem' }}>
            <SkeletonLoader type="text" />
            <SkeletonLoader type="text" width="70%" />
          </div>
        ))}
      </div>
    </div>
  )
}