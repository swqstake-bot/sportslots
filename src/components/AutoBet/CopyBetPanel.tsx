import { useCopyBetStore, type CopyBetFeed, type CopyStakeMode } from '../../store/copyBetStore'
import { useUserStore } from '../../store/userStore'

const FEEDS: { id: CopyBetFeed; label: string }[] = [
  { id: 'highroller', label: 'Highroller' },
  { id: 'all', label: 'All Bets' },
  { id: 'both', label: 'Both' },
]

type CopyBetPanelProps = {
  sports: { name: string; slug: string }[]
  onSportChange: (slug: string) => void
}

export function CopyBetPanel({ sports, onSportChange }: CopyBetPanelProps) {
  const { settings, logs, lastFeed, copiedCount, scannedCount, investedUsd, updateSettings, clearLogs } =
    useCopyBetStore()
  const { availableCurrencies } = useUserStore()

  return (
    <div className="copy-feed">
      <div className="copy-feed-pane copy-feed-pane--setup">
        <section className="copy-feed-block">
          <h3 className="copy-feed-kicker">Source</h3>
          <div className="copy-feed-seg" role="tablist" aria-label="Feed source">
            {FEEDS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={settings.feed === f.id}
                className={`copy-feed-seg-btn ${settings.feed === f.id ? 'is-on' : ''}`}
                onClick={() => updateSettings({ feed: f.id })}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="copy-feed-fields copy-feed-fields--3">
            <label className="copy-feed-field">
              <span>Currency</span>
              <select value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })}>
                {(availableCurrencies.length ? availableCurrencies : [settings.currency]).map((c) => (
                  <option key={c} value={c}>
                    {c.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="copy-feed-field">
              <span>Poll ms</span>
              <input
                type="number"
                min={1200}
                step={100}
                value={settings.pollMs}
                onChange={(e) => updateSettings({ pollMs: Number(e.target.value) || 2500 })}
              />
            </label>
            <label className="copy-feed-field">
              <span>Sport</span>
              <select value={settings.sportSlug} onChange={(e) => onSportChange(e.target.value)}>
                <option value="all">All sports</option>
                {settings.sportSlug &&
                  settings.sportSlug !== 'all' &&
                  !sports.some((s) => s.slug === settings.sportSlug) && (
                    <option value={settings.sportSlug}>{settings.sportSlug}</option>
                  )}
                {sports.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="copy-feed-block">
          <h3 className="copy-feed-kicker">Filters</h3>
          <div className="copy-feed-fields copy-feed-fields--4">
            <label className="copy-feed-field">
              <span>Min odds</span>
              <input type="number" step="0.01" value={settings.minOdds} onChange={(e) => updateSettings({ minOdds: Number(e.target.value) })} />
            </label>
            <label className="copy-feed-field">
              <span>Max odds</span>
              <input type="number" step="0.01" value={settings.maxOdds} onChange={(e) => updateSettings({ maxOdds: Number(e.target.value) })} />
            </label>
            <label className="copy-feed-field">
              <span>Min stake $</span>
              <input type="number" step="1" value={settings.minStakeUsd} onChange={(e) => updateSettings({ minStakeUsd: Number(e.target.value) })} />
            </label>
            <label className="copy-feed-field">
              <span>Max stake $</span>
              <input type="number" step="1" value={settings.maxStakeUsd} onChange={(e) => updateSettings({ maxStakeUsd: Number(e.target.value) })} />
            </label>
            <label className="copy-feed-field">
              <span>Min legs</span>
              <input type="number" min={1} value={settings.minLegs} onChange={(e) => updateSettings({ minLegs: Number(e.target.value) })} />
            </label>
            <label className="copy-feed-field">
              <span>Max legs</span>
              <input type="number" min={1} value={settings.maxLegs} onChange={(e) => updateSettings({ maxLegs: Number(e.target.value) })} />
            </label>
            <label className="copy-feed-field copy-feed-field--span2">
              <span>Event keywords</span>
              <input
                type="text"
                value={settings.eventFilter}
                onChange={(e) => updateSettings({ eventFilter: e.target.value })}
                placeholder="Barcelona, UFC, NBA"
              />
            </label>
            <label className="copy-feed-field">
              <span>Users include</span>
              <input
                type="text"
                value={settings.userInclude}
                onChange={(e) => updateSettings({ userInclude: e.target.value })}
                placeholder="names"
              />
            </label>
            <label className="copy-feed-field">
              <span>Users exclude</span>
              <input
                type="text"
                value={settings.userExclude}
                onChange={(e) => updateSettings({ userExclude: e.target.value })}
                placeholder="names"
              />
            </label>
          </div>
          <div className="copy-feed-chips">
            <Chip on={settings.skipHiddenUsers} onClick={() => updateSettings({ skipHiddenUsers: !settings.skipHiddenUsers })}>
              Skip hidden
            </Chip>
            <Chip on={settings.skipCustomBet} onClick={() => updateSettings({ skipCustomBet: !settings.skipCustomBet })}>
              Skip SGM
            </Chip>
            <Chip on={settings.skipOwnBets} onClick={() => updateSettings({ skipOwnBets: !settings.skipOwnBets })}>
              Skip own
            </Chip>
            <Chip on={settings.ignoreExistingOnStart} onClick={() => updateSettings({ ignoreExistingOnStart: !settings.ignoreExistingOnStart })}>
              New only
            </Chip>
            <Chip on={settings.scanOnly} onClick={() => updateSettings({ scanOnly: !settings.scanOnly })}>
              Scan only
            </Chip>
          </div>
        </section>

        <section className="copy-feed-block">
          <h3 className="copy-feed-kicker">Stake</h3>
          <div className="copy-feed-fields copy-feed-fields--3">
            <label className="copy-feed-field">
              <span>Mode</span>
              <select
                value={settings.stakeMode}
                onChange={(e) => updateSettings({ stakeMode: e.target.value as CopyStakeMode })}
              >
                <option value="fixed">Fixed USD</option>
                <option value="percent">% of original</option>
                <option value="cap">Copy, max USD</option>
              </select>
            </label>
            {settings.stakeMode === 'fixed' && (
              <label className="copy-feed-field">
                <span>Copy USD</span>
                <input
                  type="number"
                  step="0.1"
                  value={settings.copyStakeUsd}
                  onChange={(e) => updateSettings({ copyStakeUsd: Number(e.target.value) })}
                />
              </label>
            )}
            {settings.stakeMode === 'percent' && (
              <label className="copy-feed-field">
                <span>Percent</span>
                <input
                  type="number"
                  step="1"
                  value={settings.copyPercent}
                  onChange={(e) => updateSettings({ copyPercent: Number(e.target.value) })}
                />
              </label>
            )}
            {settings.stakeMode !== 'fixed' && (
              <label className="copy-feed-field">
                <span>Max USD</span>
                <input
                  type="number"
                  step="0.1"
                  value={settings.copyMaxUsd}
                  onChange={(e) => updateSettings({ copyMaxUsd: Number(e.target.value) })}
                />
              </label>
            )}
            <label className="copy-feed-field">
              <span>Odds change</span>
              <select
                value={settings.oddsChange}
                onChange={(e) => updateSettings({ oddsChange: e.target.value as 'any' | 'none' })}
              >
                <option value="any">Accept any move</option>
                <option value="none">Unchanged only</option>
              </select>
            </label>
            <label className="copy-feed-field">
              <span>Max invest $</span>
              <input
                type="number"
                min={0}
                step="1"
                value={settings.maxInvestUsd}
                onChange={(e) => updateSettings({ maxInvestUsd: Number(e.target.value) || 0 })}
                placeholder="0 = off"
              />
            </label>
          </div>
        </section>
      </div>

      <div className="copy-feed-pane copy-feed-pane--live">
        <div className="copy-feed-kpi">
          <div>
            <span className="copy-feed-kpi-label">Scanned</span>
            <strong>{scannedCount}</strong>
          </div>
          <div>
            <span className="copy-feed-kpi-label">Copied</span>
            <strong>{copiedCount}</strong>
          </div>
          <div>
            <span className="copy-feed-kpi-label">Invested</span>
            <strong>
              ${investedUsd.toFixed(0)}
              {settings.maxInvestUsd > 0 ? ` / ${settings.maxInvestUsd}` : ''}
            </strong>
          </div>
          <div className="copy-feed-kpi-hint">Last poll · {lastFeed.length} rows</div>
        </div>

        <div className="copy-feed-table-wrap">
          <table className="copy-feed-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Odds</th>
                <th>USD</th>
                <th>Legs</th>
                <th>Event</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lastFeed.length === 0 ? (
                <tr>
                  <td colSpan={6} className="copy-feed-empty">
                    Start copy feed to stream incoming slips.
                  </td>
                </tr>
              ) : (
                lastFeed.map((row, idx) => (
                  <tr
                    key={`${row.iid || row.id || idx}-${idx}`}
                    className={row.copied ? 'is-copied' : row.matched ? 'is-match' : 'is-skip'}
                  >
                    <td>{row.user}</td>
                    <td>{row.odds.toFixed(2)}</td>
                    <td>${row.stakeUsd.toFixed(0)}</td>
                    <td>{row.legs}</td>
                    <td title={row.event}>{row.event}</td>
                    <td>{row.copied ? 'copied' : row.matched ? 'ok' : row.skipReason || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="copy-feed-log">
          <div className="copy-feed-log-head">
            <h3 className="copy-feed-kicker">Activity</h3>
            <button type="button" className="copy-feed-text-btn" onClick={clearLogs}>
              Clear
            </button>
          </div>
          <div className="copy-feed-log-body">
            {logs.length === 0 ? (
              <div className="copy-feed-empty">No copy activity yet.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={`copy-feed-log-line copy-feed-log-line--${log.type}`}>
                  <time>
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </time>
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={`copy-feed-chip ${on ? 'is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      {children}
    </button>
  )
}
