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
  const meta = getGameMeta(game.slug)
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
        ) : (
          <span className="originals-game-tile-badge originals-game-tile-badge--ready">Live</span>
        )}
      </div>
      <div className="originals-game-tile-body">
        <span className="originals-game-tile-name">{game.name}</span>
        <span className="originals-game-tile-tagline">{meta.tagline}</span>
        {!disabled && (
          <div className="originals-game-tile-pills">
            {game.supportsCombo && <span className="originals-pill originals-pill--combo">Combo</span>}
            {game.supportsManual && <span className="originals-pill">Manual</span>}
            {game.supportsAsync && <span className="originals-pill">Async</span>}
          </div>
        )}
      </div>
    </button>
  )
}

export default function OriginalsGameDashboard({ selectedSlug, onSelect }: OriginalsGameDashboardProps) {
  const [query, setQuery] = useState('')
  const playable = getPlayableGames()
  const blocked = ORIGINALS_REGISTRY.filter((g) => !g.apiReady || !g.uiReady)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ORIGINALS_REGISTRY
    return ORIGINALS_REGISTRY.filter(
      (g) => g.name.toLowerCase().includes(q) || g.slug.includes(q) || getGameMeta(g.slug).tagline.toLowerCase().includes(q)
    )
  }, [query])

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
      <header className="originals-dashboard-hero casino-card">
        <div className="originals-dashboard-hero-text">
          <h2 className="originals-dashboard-title">Originals Workbench</h2>
          <p className="originals-dashboard-subtitle">
            {playable.length} games ready · automatic, manual, and profile strategies
          </p>
        </div>
        <div className="originals-dashboard-hero-stats">
          <div className="originals-hero-stat">
            <span className="originals-hero-stat-value">{playable.length}</span>
            <span className="originals-hero-stat-label">Playable</span>
          </div>
          <div className="originals-hero-stat">
            <span className="originals-hero-stat-value">{blocked.length}</span>
            <span className="originals-hero-stat-label">Pending API</span>
          </div>
          <div className="originals-hero-stat">
            <span className="originals-hero-stat-value">{ORIGINALS_REGISTRY.length}</span>
            <span className="originals-hero-stat-label">Total</span>
          </div>
        </div>
      </header>

      <div className="originals-dashboard-toolbar">
        <label className="originals-dashboard-search">
          <span className="originals-dashboard-search-label">Search games</span>
          <input
            type="search"
            placeholder="Search games…"
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
