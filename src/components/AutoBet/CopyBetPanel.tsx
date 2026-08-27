import { useEffect, useState } from 'react'
import { AccordionSection } from '../ui/AccordionSection'
import { useCopyBetStore, type CopyBetFeed, type CopyStakeMode } from '../../store/copyBetStore'
import { useUserStore } from '../../store/userStore'
import { StakeApi } from '../../api/client'
import { Queries } from '../../api/queries'

export function CopyBetPanel() {
  const { settings, logs, isRunning, lastFeed, copiedCount, scannedCount, updateSettings, start, stop, clearLogs } =
    useCopyBetStore()
  const { availableCurrencies } = useUserStore()
  const [sports, setSports] = useState<{ name: string; slug: string }[]>([])
  const labelClass = 'autobet-field-label'
  const selectClass = 'autobet-control w-full px-3 py-2.5 text-sm font-medium appearance-none cursor-pointer'
  const inputClass = 'autobet-control w-full px-3 py-2.5 text-sm font-mono'

  useEffect(() => {
    void (async () => {
      try {
        const response = await StakeApi.query<any>(Queries.SportListMenu, {
          type: 'upcoming',
          limit: 100,
          offset: 0,
          liveRank: false,
          sportType: 'sport',
        })
        if (Array.isArray(response.data?.sportList)) setSports(response.data.sportList)
      } catch {
        // Sport dropdown stays on slug text if list fetch fails.
      }
    })()
  }, [])

  return (
    <div className="space-y-2.5">
      <AccordionSection title="Copy feed" subtitle="All Bets / Highroller → auto-copy" icon={<span>📡</span>} defaultOpen collapsible={false} variant="glass">
        <div className="autobet-field-row">
          <div className="autobet-field">
            <label className={labelClass}>Source</label>
            <select
              value={settings.feed}
              onChange={(e) => updateSettings({ feed: e.target.value as CopyBetFeed })}
              className={selectClass}
            >
              <option value="highroller">Highroller</option>
              <option value="all">All Bets</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div className="autobet-field">
            <label className={labelClass}>Poll (ms)</label>
            <input
              type="number"
              min={1200}
              step={100}
              value={settings.pollMs}
              onChange={(e) => updateSettings({ pollMs: Number(e.target.value) || 2500 })}
              className={inputClass}
            />
          </div>
          <div className="autobet-field">
            <label className={labelClass}>Currency</label>
            <select
              value={settings.currency}
              onChange={(e) => updateSettings({ currency: e.target.value })}
              className={selectClass}
            >
              {(availableCurrencies.length ? availableCurrencies : [settings.currency]).map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-4 text-xs mt-3" style={{ color: 'var(--app-text-muted)' }}>
          <span>Scanned {scannedCount}</span>
          <span>Copied {copiedCount}</span>
        </div>
      </AccordionSection>

      <AccordionSection title="Filters" subtitle="Odds · event · stake · legs" icon={<span>🎛️</span>} defaultOpen collapsible={false} variant="glass">
        <div className="autobet-field-row">
          <div className="autobet-field">
            <label className={labelClass}>Min odds</label>
            <input type="number" step="0.01" value={settings.minOdds} onChange={(e) => updateSettings({ minOdds: Number(e.target.value) })} className={inputClass} />
          </div>
          <div className="autobet-field">
            <label className={labelClass}>Max odds</label>
            <input type="number" step="0.01" value={settings.maxOdds} onChange={(e) => updateSettings({ maxOdds: Number(e.target.value) })} className={inputClass} />
          </div>
        </div>
        <div className="autobet-field-row">
          <div className="autobet-field">
            <label className={labelClass}>Min stake USD</label>
            <input type="number" step="1" value={settings.minStakeUsd} onChange={(e) => updateSettings({ minStakeUsd: Number(e.target.value) })} className={inputClass} />
          </div>
          <div className="autobet-field">
            <label className={labelClass}>Max stake USD</label>
            <input type="number" step="1" value={settings.maxStakeUsd} onChange={(e) => updateSettings({ maxStakeUsd: Number(e.target.value) })} className={inputClass} />
          </div>
        </div>
        <div className="autobet-field-row">
          <div className="autobet-field">
            <label className={labelClass}>Min legs</label>
            <input type="number" min={1} value={settings.minLegs} onChange={(e) => updateSettings({ minLegs: Number(e.target.value) })} className={inputClass} />
          </div>
          <div className="autobet-field">
            <label className={labelClass}>Max legs</label>
            <input type="number" min={1} value={settings.maxLegs} onChange={(e) => updateSettings({ maxLegs: Number(e.target.value) })} className={inputClass} />
          </div>
          <div className="autobet-field">
            <label className={labelClass}>Sport</label>
            <select
              value={settings.sportSlug}
              onChange={(e) => updateSettings({ sportSlug: e.target.value })}
              className={selectClass}
            >
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
          </div>
        </div>
        <div className="autobet-field">
          <label className={labelClass}>Event keywords</label>
          <input
            type="text"
            value={settings.eventFilter}
            onChange={(e) => updateSettings({ eventFilter: e.target.value })}
            className={inputClass}
            placeholder="Barcelona, UFC, NBA"
          />
          <p className="autobet-field-hint mt-1">Comma-separated. Empty = all events. Match against fixture names.</p>
        </div>
        <div className="autobet-field-row">
          <div className="autobet-field">
            <label className={labelClass}>Users include</label>
            <input type="text" value={settings.userInclude} onChange={(e) => updateSettings({ userInclude: e.target.value })} className={inputClass} placeholder="optional names" />
          </div>
          <div className="autobet-field">
            <label className={labelClass}>Users exclude</label>
            <input type="text" value={settings.userExclude} onChange={(e) => updateSettings({ userExclude: e.target.value })} className={inputClass} placeholder="optional names" />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-2 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.skipHiddenUsers} onChange={(e) => updateSettings({ skipHiddenUsers: e.target.checked })} />
            Skip hidden
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.skipCustomBet} onChange={(e) => updateSettings({ skipCustomBet: e.target.checked })} />
            Skip SGM / custom
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.skipOwnBets} onChange={(e) => updateSettings({ skipOwnBets: e.target.checked })} />
            Skip own
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.ignoreExistingOnStart} onChange={(e) => updateSettings({ ignoreExistingOnStart: e.target.checked })} />
            Only new after start
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.scanOnly} onChange={(e) => updateSettings({ scanOnly: e.target.checked })} />
            Scan only (no place)
          </label>
        </div>
      </AccordionSection>

      <AccordionSection title="Your stake" subtitle="Fixed / % of original / cap" icon={<span>💵</span>} defaultOpen collapsible={false} variant="glass">
        <div className="autobet-field">
          <label className={labelClass}>Mode</label>
          <select
            value={settings.stakeMode}
            onChange={(e) => updateSettings({ stakeMode: e.target.value as CopyStakeMode })}
            className={selectClass}
          >
            <option value="fixed">Fixed USD</option>
            <option value="percent">% of their stake (capped)</option>
            <option value="cap">Copy their stake, max USD</option>
          </select>
        </div>
        {settings.stakeMode === 'fixed' && (
          <div className="autobet-field mt-2">
            <label className={labelClass}>Copy stake USD</label>
            <input type="number" step="0.1" value={settings.copyStakeUsd} onChange={(e) => updateSettings({ copyStakeUsd: Number(e.target.value) })} className={inputClass} />
          </div>
        )}
        {settings.stakeMode === 'percent' && (
          <div className="autobet-field-row mt-2">
            <div className="autobet-field">
              <label className={labelClass}>Percent</label>
              <input type="number" step="1" value={settings.copyPercent} onChange={(e) => updateSettings({ copyPercent: Number(e.target.value) })} className={inputClass} />
            </div>
            <div className="autobet-field">
              <label className={labelClass}>Max USD</label>
              <input type="number" step="0.1" value={settings.copyMaxUsd} onChange={(e) => updateSettings({ copyMaxUsd: Number(e.target.value) })} className={inputClass} />
            </div>
          </div>
        )}
        {settings.stakeMode === 'cap' && (
          <div className="autobet-field mt-2">
            <label className={labelClass}>Max USD</label>
            <input type="number" step="0.1" value={settings.copyMaxUsd} onChange={(e) => updateSettings({ copyMaxUsd: Number(e.target.value) })} className={inputClass} />
          </div>
        )}
        <div className="autobet-field mt-2">
          <label className={labelClass}>Odds change</label>
          <select
            value={settings.oddsChange}
            onChange={(e) => updateSettings({ oddsChange: e.target.value as 'any' | 'none' })}
            className={selectClass}
          >
            <option value="any">Accept any odds move</option>
            <option value="none">Only if odds unchanged</option>
          </select>
        </div>
        <div className="autobet-field-row mt-2">
          <div className="autobet-field">
            <label className={labelClass}>Max copies / min</label>
            <input
              type="number"
              min={1}
              value={settings.maxCopiesPerMinute}
              onChange={(e) => updateSettings({ maxCopiesPerMinute: Number(e.target.value) || 8 })}
              className={inputClass}
            />
          </div>
          <div className="autobet-field">
            <label className={labelClass}>Delay after copy (ms)</label>
            <input
              type="number"
              min={400}
              step={100}
              value={settings.copyDelayMs}
              onChange={(e) => updateSettings({ copyDelayMs: Number(e.target.value) || 1200 })}
              className={inputClass}
            />
          </div>
        </div>
      </AccordionSection>

      <button
        type="button"
        onClick={() => (isRunning ? stop() : start())}
        className="autobet-start-btn autobet-start-btn--wide transition-all shadow-lg"
        style={
          isRunning
            ? { background: 'var(--app-error)', color: 'white', border: '2px solid rgba(255,51,102,0.5)' }
            : { background: 'var(--app-accent)', color: 'var(--app-bg-deep)', border: '2px solid rgba(var(--app-accent-rgb), 0.5)' }
        }
      >
        {isRunning ? 'Stop copy feed' : 'Start copy feed'}
      </button>

      <AccordionSection title="Live board" subtitle="Last poll" icon={<span>📋</span>} defaultOpen collapsible={false} variant="glass">
        <div className="overflow-auto max-h-56 text-xs font-mono">
          {lastFeed.length === 0 ? (
            <div className="opacity-60 py-6 text-center">Start copy feed to see incoming bets.</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="opacity-60">
                  <th className="py-1 pr-2">User</th>
                  <th className="py-1 pr-2">Odds</th>
                  <th className="py-1 pr-2">USD</th>
                  <th className="py-1 pr-2">Legs</th>
                  <th className="py-1 pr-2">Event</th>
                  <th className="py-1">Filter</th>
                </tr>
              </thead>
              <tbody>
                {lastFeed.map((row, idx) => (
                  <tr key={`${row.iid || row.id || idx}-${idx}`} className={row.copied ? 'text-emerald-400' : row.matched ? '' : 'opacity-50'}>
                    <td className="py-0.5 pr-2 whitespace-nowrap">{row.user}</td>
                    <td className="py-0.5 pr-2">{row.odds.toFixed(2)}</td>
                    <td className="py-0.5 pr-2">${row.stakeUsd.toFixed(0)}</td>
                    <td className="py-0.5 pr-2">{row.legs}</td>
                    <td className="py-0.5 pr-2 truncate max-w-[220px]" title={row.event}>
                      {row.event}
                    </td>
                    <td className="py-0.5">{row.copied ? 'copied' : row.matched ? 'ok' : row.skipReason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </AccordionSection>

      <AccordionSection title="Copy log" defaultOpen collapsible={false} variant="glass">
        <div className="flex justify-end mb-2">
          <button type="button" onClick={clearLogs} className="autobet-log-clear">
            Clear
          </button>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1 text-xs">
          {logs.length === 0 ? (
            <div className="opacity-60">No copy activity yet.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={`autobet-log-entry autobet-log-entry--${log.type}`}>
                <span className="font-mono opacity-70 mr-2">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                {log.message}
              </div>
            ))
          )}
        </div>
      </AccordionSection>
    </div>
  )
}
