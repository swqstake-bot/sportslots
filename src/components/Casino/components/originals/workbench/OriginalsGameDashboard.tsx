import { useMemo, useState } from 'react'
import './originals-workbench.css'
import {
  ORIGINALS_REGISTRY,
  getPlayableGames,
  type OriginalsGameEntry,
} from '../registry/originalsRegistry'
import { CATEGORY_LABELS, getGameMeta, type OriginalsGameCategory } from '../registry/gameMeta'

interface OriginalsGameDashboardProps {
  selectedSlug: string
  onSelect: (game: OriginalsGameEntry) => void
}

const CATEGORY_ORDER: OriginalsGameCategory[] = ['core', 'action', 'slots', 'table']

function GameTile({
  game,
  selected,
  onSelect,
}: {
  game: OriginalsGameEntry
  selected: boolean
  onSelect: (g: OriginalsGameEntry) => void
}) {
  const disabled = !game.apiReady || !game.uiReady
  const title = disabled ? `${game.name} — ${game.blockedReason ?? 'Coming soon'}` : game.name

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onSelect(game)}
      className={`originals-game-tile${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
      title={title}
    >
      <div className="originals-game-tile-media">
        <img src={game.thumbnailUrl} alt="" className="originals-game-tile-img" loading="lazy" />
        {disabled ? (
          <span className="originals-game-tile-badge">Soon</span>
        ) : null}
      </div>
      <div className="originals-game-tile-body">
        <span className="originals-game-tile-name">{game.name}</span>
      </div>
    </button>
  )
}

export default function OriginalsGameDashboard({ selectedSlug, onSelect }: OriginalsGameDashboardProps) {
  const [query, setQuery] = useState('')
  const playable = getPlayableGames()
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q ? ORIGINALS_REGISTRY : playable
    if (!q) return pool
    return pool.filter(
      (g) => g.name.toLowerCase().includes(q) || g.slug.includes(q) || getGameMeta(g.slug).tagline.toLowerCase().includes(q)
    )
  }, [query, playable])

  const byCategory = useMemo(() => {
    const map = new Map<OriginalsGameCategory, OriginalsGameEntry[]>()
    for (const cat of CATEGORY_ORDER) map.set(cat, [])
    for (const g of filtered) {
      const cat = getGameMeta(g.slug).category
      map.get(cat)?.push(g)
    }
    return map
  }, [filtered])

  const recent = ORIGINALS_REGISTRY.find((g) => g.slug === selectedSlug && g.uiReady)

  return (
    <div className="originals-dashboard">
      <div className="originals-dashboard-toolbar">
        <label className="originals-dashboard-search">
          <span className="originals-dashboard-search-label">Search games</span>
          <input
            type="search"
            placeholder={`${playable.length} games — search…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="originals-dashboard-search-input"
          />
        </label>
        {recent && (
          <button type="button" className="originals-dashboard-recent" onClick={() => onSelect(recent)}>
            Continue <strong>{recent.name}</strong>
          </button>
        )}
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const games = byCategory.get(cat) ?? []
        if (games.length === 0) return null
        return (
          <section key={cat} className="originals-dashboard-section">
            <div className="originals-dashboard-section-head">
              <h3 className="originals-dashboard-section-title">{CATEGORY_LABELS[cat]}</h3>
              <span className="originals-dashboard-section-count">{games.length}</span>
            </div>
            <div className="originals-dashboard-grid">
              {games.map((game) => (
                <GameTile key={game.slug} game={game} selected={game.slug === selectedSlug} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )
      })}

      {filtered.length === 0 && (
        <p className="originals-empty-hint originals-dashboard-empty">No games match your search.</p>
      )}
    </div>
  )
}
