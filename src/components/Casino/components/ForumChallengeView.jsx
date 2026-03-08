/**
 * Forum-Challenge zum Prüfen/Verifizieren – Forum-Thread-URL eingeben, Bets laden (wie SSP).
 */
import { useState, useCallback, useMemo } from 'react'
import { scrapeForumBets } from '../api/forumScraper'

const STYLES = {
  container: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minHeight: 0 },
  title: { fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-2)' },
  help: { color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)', lineHeight: 1.5 },
  form: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    alignItems: 'flex-end',
    padding: 'var(--space-4)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
  },
  label: { display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' },
  input: {
    padding: '0.5rem 0.75rem',
    background: 'var(--bg-deep)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text)',
    minWidth: 180,
  },
  btn: {
    padding: '0.5rem 1rem',
    background: 'var(--accent)',
    color: 'var(--bg-deep)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  btnSecondary: {
    padding: '0.5rem 1rem',
    background: 'var(--bg-elevated)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    fontWeight: 500,
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  betList: {
    maxHeight: 400,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  betCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) var(--space-3)',
    background: 'var(--bg-deep)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
  },
  toggle: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--text-sm)' },
  leaderboardCard: {
    padding: 'var(--space-3)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-3)',
  },
  leaderboardTitle: { fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  leaderboardRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' },
  rankBadge: { minWidth: 24, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 },
}

export default function ForumChallengeView({ accessToken = '', webSlots = [], onSelectChallenge }) {
  const [forumUrl, setForumUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' })
  const [error, setError] = useState('')
  const [bets, setBets] = useState([])
  const [totalScraped, setTotalScraped] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [manualOpen, setManualOpen] = useState(false)
  const [forumSlug, setForumSlug] = useState('')
  const [forumCurrency, setForumCurrency] = useState('usdc')
  const [forumMinBet, setForumMinBet] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')

  const handleScrape = useCallback(async () => {
    const url = (forumUrl || '').trim()
    if (!url) {
      setError('Bitte Forum-Thread-URL eingeben.')
      return
    }
    if (!url.includes('stakecommunity.com/topic/')) {
      setError('URL muss von stakecommunity.com/topic/... sein.')
      return
    }
    if (!accessToken) {
      setError('Nicht eingeloggt. Bitte Stake-Token setzen.')
      return
    }
    setError('')
    setLoading(true)
    setProgress({ done: 0, total: 0, label: '' })
    try {
      const result = await scrapeForumBets(url, accessToken, {
        onProgress: (done, total, label) => setProgress({ done, total, label: label || '' }),
      })
      setBets(result.bets)
      setTotalScraped(result.totalScraped)
      setTotalPages(result.totalPages || 0)
    } catch (e) {
      setError(e?.message || 'Fehler beim Laden')
      setBets([])
    } finally {
      setLoading(false)
      setProgress({ done: 0, total: 0, label: '' })
    }
  }, [forumUrl, accessToken])

  const challengeGame = useMemo(() => {
    if (bets.length === 0) return null
    const counts = {}
    for (const bet of bets) {
      const n = bet.gameName || 'Unknown'
      counts[n] = (counts[n] || 0) + 1
    }
    let max = 0, name = null
    for (const [n, c] of Object.entries(counts)) {
      if (c > max) { max = c; name = n }
    }
    if (max >= bets.length * 0.9) {
      return { name, count: max, pct: (max / bets.length * 100).toFixed(0) }
    }
    return null
  }, [bets])

  /** Nach Multiplikator sortiert (höchster zuerst) – für Leaderboard + Bet-Liste */
  const sortedBets = useMemo(() => {
    return [...bets].sort((a, b) => (Number(b.payoutMultiplier) || 0) - (Number(a.payoutMultiplier) || 0))
  }, [bets])

  /** Höchster Multi im Thread – wer führt aktuell */
  const topMulti = useMemo(() => {
    if (sortedBets.length === 0) return null
    const best = sortedBets[0]
    return {
      userName: best.userName,
      payoutMultiplier: Number(best.payoutMultiplier) || 0,
      gameName: best.gameName,
      currency: best.currency,
      amount: best.amount,
      payout: best.payout,
    }
  }, [sortedBets])

  const handleApplyFromBet = useCallback(() => {
    if (!challengeGame || !onSelectChallenge) return
    const first = bets.find((b) => b.gameName === challengeGame.name)
    if (!first?.gameSlug) return
    const slot = webSlots.find((s) => s.slug === first.gameSlug)
    onSelectChallenge({
      gameSlug: first.gameSlug,
      gameName: first.gameName,
      currency: first.currency || 'usdc',
    })
  }, [challengeGame, bets, webSlots, onSelectChallenge])

  const handleCopyIid = useCallback((iid) => {
    navigator.clipboard?.writeText(iid).then(() => {
      setCopyFeedback('IID kopiert')
      setTimeout(() => setCopyFeedback(''), 1500)
    })
  }, [])

  const handleApplyManual = () => {
    const slug = (forumSlug || '').trim().toLowerCase()
    const slot = webSlots.find((s) => s.slug === slug)
    if (!slug) return
    const parsed = parseFloat(forumMinBet)
    const minBetUsd = !Number.isNaN(parsed) && parsed > 0 ? parsed : null
    const cur = (forumCurrency || 'usdc').toLowerCase()
    onSelectChallenge({
      gameSlug: slug,
      gameName: slot?.name || slug,
      currency: cur,
      minBetUsd: minBetUsd ?? undefined,
    })
  }

  return (
    <div style={STYLES.container}>
      <h2 style={STYLES.title}>Forum-Challenge (Prüfen)</h2>
      <p style={STYLES.help}>
        Forum-Thread-URL einfügen, um alle Casino-Bets aus dem Thread zu laden und zu prüfen. Die Bets werden über die Stake-API abgefragt.
      </p>

      <div style={STYLES.form}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <label style={STYLES.label}>Forum-Thread-URL</label>
          <input
            type="text"
            placeholder="https://stakecommunity.com/topic/..."
            value={forumUrl}
            onChange={(e) => { setForumUrl(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleScrape()}
            disabled={loading}
            style={{ ...STYLES.input, width: '100%' }}
          />
        </div>
        <button
          type="button"
          onClick={handleScrape}
          disabled={loading || !forumUrl.trim()}
          style={{ ...STYLES.btn, ...(loading || !forumUrl.trim() ? STYLES.btnDisabled : {}) }}
        >
          {loading ? (progress.label || (progress.total ? `${progress.done}/${progress.total}` : 'Lädt…')) : 'Laden'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 'var(--space-2)', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: 'var(--text-sm)' }}>
          {error}
        </div>
      )}

      {bets.length > 0 && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          {/* Leaderboard: Höchster Multi */}
          {topMulti && (
            <div style={STYLES.leaderboardCard}>
              <div style={STYLES.leaderboardTitle}>🏆 Höchster Multi im Thread</div>
              <div style={{ ...STYLES.leaderboardRow, fontSize: '1.1rem', marginBottom: 0 }}>
                <span style={{ ...STYLES.rankBadge, background: 'var(--accent)', color: 'var(--bg-deep)' }}>1</span>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{topMulti.userName}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{topMulti.payoutMultiplier.toFixed(2)}x</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  {topMulti.gameName} · {topMulti.currency?.toUpperCase()} {Number(topMulti.amount).toFixed(2)} → {Number(topMulti.payout).toFixed(2)}
                </span>
              </div>
              {sortedBets.length > 1 && (
                <div style={{ marginTop: 'var(--space-2)', maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  {sortedBets.slice(1, 31).map((bet, i) => (
                    <div key={`rank-${bet.iid}-${i}`} style={{ ...STYLES.leaderboardRow, marginBottom: 0, fontSize: 'var(--text-sm)' }}>
                      <span style={{ ...STYLES.rankBadge, background: 'var(--bg-deep)', color: 'var(--text-muted)' }}>{i + 2}</span>
                      <span style={{ color: 'var(--text)' }}>{bet.userName}</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{Number(bet.payoutMultiplier).toFixed(2)}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {bets.length} Bets{totalScraped > bets.length ? ` (von ${totalScraped} gefunden)` : ''}{totalPages > 1 ? ` · ${totalPages} Seiten` : ''} · sortiert nach Multi
            </span>
            {challengeGame && (
              <>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>
                  {challengeGame.name} ({challengeGame.pct}%)
                </span>
                {onSelectChallenge && (
                  <button type="button" onClick={handleApplyFromBet} style={STYLES.btnSecondary}>
                    Übernehmen & Spielen
                  </button>
                )}
              </>
            )}
          </div>
          <div style={STYLES.betList}>
            {sortedBets.map((bet, i) => (
              <div key={`${bet.iid}-${i}`} style={STYLES.betCard}>
                <div>
                  {!challengeGame && <span style={{ fontWeight: 600, marginRight: 'var(--space-2)' }}>{bet.gameName}</span>}
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{Number(bet.payoutMultiplier).toFixed(2)}x</span>
                  <span style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                    {bet.userName} · {bet.currency?.toUpperCase()} {Number(bet.amount).toFixed(2)} → {Number(bet.payout).toFixed(2)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyIid(bet.iid)}
                  title="Bet-IID kopieren"
                  style={STYLES.btnSecondary}
                >
                  {copyFeedback ? '✓ Kopiert' : 'IID kopieren'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 'var(--space-4)' }}>
        <button type="button" onClick={() => setManualOpen(!manualOpen)} style={STYLES.toggle}>
          {manualOpen ? '▼' : '▶'} Oder manuell eingeben (Spiel, Währung, Min. Einsatz)
        </button>
        {manualOpen && (
          <div style={{ ...STYLES.form, marginTop: 'var(--space-2)' }}>
            <div>
              <label style={STYLES.label}>Spiel (Slug)</label>
              <select value={forumSlug} onChange={(e) => setForumSlug(e.target.value)} style={STYLES.input}>
                <option value="">— wählen —</option>
                {webSlots.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={STYLES.label}>Währung</label>
              <select value={forumCurrency} onChange={(e) => setForumCurrency(e.target.value)} style={STYLES.input}>
                <option value="usdc">USDC</option>
                <option value="eur">EUR</option>
                <option value="usd">USD</option>
                <option value="btc">BTC</option>
              </select>
            </div>
            <div>
              <label style={STYLES.label}>Min. Einsatz (USD)</label>
              <input
                type="text"
                placeholder="z.B. 0.20"
                value={forumMinBet}
                onChange={(e) => setForumMinBet(e.target.value)}
                style={{ ...STYLES.input, width: 90 }}
              />
            </div>
            <button
              type="button"
              onClick={handleApplyManual}
              disabled={!forumSlug}
              style={{ ...STYLES.btn, ...(!forumSlug ? STYLES.btnDisabled : {}) }}
            >
              Übernehmen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
