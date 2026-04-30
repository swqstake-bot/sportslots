import { useState, useEffect } from 'react'
import clsx from 'clsx'
import {
  getApiLogs,
  clearLogs,
  exportLogsAsFile,
  getBonusLogsExport,
  clearBonusLogs,
  exportBonusLogsAsFile,
  isSaveBonusLogsEnabled,
  setSaveBonusLogsEnabled,
} from '../utils/apiLogger'
import { getSlotSpinSamples, clearSlotSpinSamples, exportSlotSpinSamplesAsFile } from '../utils/slotSpinSamples'
import { getRealtimeReconcileSnapshot, resetRealtimeAudit } from '../api/stakeRealtimeFacade'
import { clearBetHistoryAudit, getBetHistoryAudit } from '../utils/betHistoryDb'
import { getRealtimeBusRecentEvents } from '../../../services/realtimeBus'

export default function LogViewer({ refreshKey }) {
  const [logs, setLogs] = useState([])
  const [bonusLogs, setBonusLogs] = useState([])
  const [spinSamples, setSpinSamples] = useState({})
  const [saveBonus, setSaveBonus] = useState(isSaveBonusLogsEnabled())
  const [realtimeAudit, setRealtimeAudit] = useState(getRealtimeReconcileSnapshot())
  const [historyAudit, setHistoryAudit] = useState([])
  const [realtimeTimeline, setRealtimeTimeline] = useState([])

  useEffect(() => {
    setLogs(getApiLogs())
    setBonusLogs(getBonusLogsExport())
    getSlotSpinSamples().then(setSpinSamples)
    setRealtimeAudit(getRealtimeReconcileSnapshot())
    setHistoryAudit(getBetHistoryAudit())
    setRealtimeTimeline(getRealtimeBusRecentEvents(80))
  }, [refreshKey])

  function handleSaveBonusChange(checked) {
    setSaveBonus(checked)
    setSaveBonusLogsEnabled(checked)
  }

  function handleRefresh() {
    setLogs(getApiLogs())
    setRealtimeAudit(getRealtimeReconcileSnapshot())
    setHistoryAudit(getBetHistoryAudit())
    setRealtimeTimeline(getRealtimeBusRecentEvents(80))
  }

  function handleClear() {
    if (confirm('Delete all API logs?')) {
      clearLogs()
      setLogs([])
      clearBetHistoryAudit()
      setHistoryAudit([])
    }
  }

  function handleExport() {
    exportLogsAsFile()
  }

  function handleExportForensicBundle() {
    const forensic = {
      exportedAt: new Date().toISOString(),
      apiLogs: getApiLogs(),
      bonusLogs: getBonusLogsExport(),
      realtimeAudit: getRealtimeReconcileSnapshot(),
      betHistoryAudit: getBetHistoryAudit(),
      realtimeTimeline: getRealtimeBusRecentEvents(200),
    }
    const blob = new Blob([JSON.stringify(forensic, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `slotbot-forensic-bundle-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleBonusRefresh() {
    setBonusLogs(getBonusLogsExport())
  }

  function handleBonusClear() {
    if (confirm('Delete all bonus response logs?')) {
      clearBonusLogs()
      setBonusLogs([])
    }
  }

  async function handleSpinSamplesRefresh() {
    const data = await getSlotSpinSamples()
    setSpinSamples(data)
  }

  async function handleSpinSamplesClear() {
    if (confirm('Delete all slot spin samples?')) {
      await clearSlotSpinSamples()
      setSpinSamples({})
    }
  }

  const bonusSummary = (() => {
    const totals = { fsEnter: 0, mult: 0, activatorOnly: 0, byFeature: {}, byAction: {} }
    for (const entry of bonusLogs || []) {
      const resp = entry?.response ?? entry
      const events = resp?.round?.events || []
      let hasFs = false
      let hasMult = false
      let hasActivator = false
      for (const ev of events) {
        const etn = String(ev?.etn || '').toLowerCase()
        if (etn === 'feature_enter') hasFs = true
        if (etn === 'activator') hasActivator = true
        const actions = ev?.c?.actions || []
        for (const a of actions) {
          const at = String(a?.at || '').toLowerCase()
          totals.byAction[at] = (totals.byAction[at] || 0) + 1
          if (at === 'bonusfeaturewon') hasFs = true
          if (at === 'mult') hasMult = true
          if (at === 'activator') hasActivator = true
          const fid = a?.data?.bfw ?? a?.data?.bonusGameId ?? a?.data?.bonusId ?? a?.data?.featureId
          if (fid) {
            const key = String(fid).toLowerCase()
            totals.byFeature[key] = (totals.byFeature[key] || 0) + 1
          }
        }
        const fid2 = ev?.c?.bonusFeatureWon ?? ev?.c?.bonusFeaturewon
        if (fid2) {
          const key = String(fid2).toLowerCase()
          totals.byFeature[key] = (totals.byFeature[key] || 0) + 1
        }
      }
      if (hasFs) totals.fsEnter++
      if (hasMult) totals.mult++
      if (hasActivator && !hasFs && !hasMult) totals.activatorOnly++
    }
    const topFeatures = Object.entries(totals.byFeature).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const topActions = Object.entries(totals.byAction).sort((a, b) => b[1] - a[1]).slice(0, 5)
    return { ...totals, topFeatures, topActions }
  })()

  return (
    <div className="terminal-panel" style={{ marginTop: 0 }}>
      <label className="terminal-hero-label">
        <input
          type="checkbox"
          checked={saveBonus}
          onChange={(e) => handleSaveBonusChange(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
        />
        Save every bonus response (for later comparison)
      </label>
      <div className="terminal-panel__head terminal-panel__head--logs">
        <span className="terminal-panel__title" style={{ fontSize: '0.85rem' }}>
          API logs ({logs.length} entries)
        </span>
        <div className="terminal-toolbar">
          <button type="button" onClick={handleRefresh} className="terminal-btn">
            Refresh
          </button>
          <button type="button" onClick={handleExport} className="terminal-btn terminal-btn--primary">
            Export JSON
          </button>
          <button type="button" onClick={handleExportForensicBundle} className="terminal-btn" title="API + realtime + audit in one file">
            Forensic bundle
          </button>
          <button type="button" onClick={() => exportBonusLogsAsFile()} className="terminal-btn" title="Export bonus responses as JSON">
            Export bonus logs
          </button>
          <button type="button" onClick={handleClear} className="terminal-btn">
            Clear
          </button>
        </div>
      </div>

      <details style={{ marginTop: '0.75rem' }}>
        <summary className="terminal-summary">Realtime audit</summary>
        <div style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>
          <div>houseBets received: {realtimeAudit.houseBetsReceived}</div>
          <div>houseBets duplicates: {realtimeAudit.houseBetsDuplicate}</div>
          <div>balance events: {realtimeAudit.balanceReceived}</div>
          <div>last houseBet key: {realtimeAudit.lastHouseBetKey || '—'}</div>
          <div>last balance currency: {realtimeAudit.lastBalanceCurrency || '—'}</div>
          <div>bus published: {realtimeAudit.busPublished ?? 0}</div>
          <div>bus duplicates: {realtimeAudit.busDuplicates ?? 0}</div>
          <div>bus out-of-order: {realtimeAudit.busDroppedOutOfOrder ?? 0}</div>
          <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.45rem' }}>
            <button
              type="button"
              onClick={() => {
                resetRealtimeAudit()
                setRealtimeAudit(getRealtimeReconcileSnapshot())
              }}
              className="terminal-btn"
            >
              Reset realtime audit
            </button>
          </div>
          <div style={{ marginTop: '0.55rem', color: 'var(--text-muted)' }}>
            Bet history audit entries: {historyAudit.length}
          </div>
          <div className={clsx('terminal-log', 'terminal-log--h130')} style={{ marginTop: '0.35rem' }}>
            {historyAudit.length === 0 ? (
              <div className="terminal-muted-block">No bet history audit rows.</div>
            ) : (
              [...historyAudit].reverse().slice(0, 30).map((entry, i) => (
                <div key={i} className="terminal-log__line">
                  <span className="terminal-log__ts">{String(entry.ts || '').slice(11, 19)}</span>
                  <span className="terminal-log__type">{entry.event}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{entry.slotSlug || '-'}</span>
                </div>
              ))
            )}
          </div>
          <div style={{ marginTop: '0.55rem', color: 'var(--text-muted)' }}>
            Realtime timeline events: {realtimeTimeline.length}
          </div>
          <div className={clsx('terminal-log', 'terminal-log--h130')} style={{ marginTop: '0.35rem' }}>
            {realtimeTimeline.length === 0 ? (
              <div className="terminal-muted-block">No realtime timeline rows.</div>
            ) : (
              [...realtimeTimeline].reverse().slice(0, 40).map((entry, i) => (
                <div key={i} className="terminal-log__line">
                  <span className="terminal-log__ts">{String(entry?.emittedAt || '').slice(11, 19)}</span>
                  <span className="terminal-log__type">{entry?.eventSource || 'event'}</span>
                  <span style={{ color: 'var(--text-muted)' }}>corr={String(entry?.correlationId || '').slice(0, 18)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </details>

      <div className="terminal-log">
        {logs.length === 0 ? (
          <div className="terminal-muted-block" style={{ padding: '1rem' }}>
            No API logs yet. Start a session or spin to generate entries.
          </div>
        ) : (
          [...logs].reverse().map((entry, i) => (
            <div
              key={i}
              className={clsx('terminal-log__line', entry.error && 'terminal-log__line--error')}
            >
              <span className="terminal-log__ts">{entry.ts?.slice(11, 19)}</span>
              <span className="terminal-log__type">{entry.type}</span>
              {entry.durationMs != null && <span style={{ color: 'var(--text-muted)' }}>{entry.durationMs}ms</span>}
              {entry.error && <div className="terminal-log__err">{entry.error}</div>}
              {(entry.correlationId || entry.eventSource) && (
                <div className="terminal-log__meta">
                  {entry.eventSource ? `src=${entry.eventSource}` : ''}
                  {entry.eventSource && entry.correlationId ? ' · ' : ''}
                  {entry.correlationId ? `corr=${entry.correlationId}` : ''}
                </div>
              )}
              <details className="terminal-log__details">
                <summary>Request / response</summary>
                <pre className="terminal-pre">{JSON.stringify({ request: entry.request, response: entry.response }, null, 2)}</pre>
              </details>
            </div>
          ))
        )}
      </div>

      <details style={{ marginTop: '1rem' }} open>
        <summary className="terminal-summary">Bonus responses ({bonusLogs.length})</summary>
        <div style={{ marginTop: '0.5rem' }}>
          <div className="terminal-toolbar" style={{ marginBottom: '0.5rem' }}>
            <button type="button" onClick={handleBonusRefresh} className="terminal-btn">
              Refresh
            </button>
            <button type="button" onClick={() => exportBonusLogsAsFile()} className="terminal-btn terminal-btn--primary">
              Export bonus logs
            </button>
            <button type="button" onClick={handleBonusClear} className="terminal-btn">
              Clear
            </button>
          </div>
          {bonusLogs.length > 0 && (
            <div className="terminal-stat-grid">
              <div className="terminal-stat-box">
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Counts</div>
                <div>Free-spin entry: {bonusSummary.fsEnter}</div>
                <div>Multiplier seen: {bonusSummary.mult}</div>
                <div>Activator-only: {bonusSummary.activatorOnly}</div>
              </div>
              <div className="terminal-stat-box">
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Top features</div>
                {bonusSummary.topFeatures.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>—</div>
                ) : (
                  bonusSummary.topFeatures.map(([k, v]) => (
                    <div key={k}>
                      {k}: {v}
                    </div>
                  ))
                )}
              </div>
              <div className="terminal-stat-box" style={{ gridColumn: '1 / -1' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Top actions</div>
                {bonusSummary.topActions.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>—</div>
                ) : (
                  bonusSummary.topActions.map(([k, v]) => (
                    <span key={k} style={{ display: 'inline-block', marginRight: '0.5rem' }}>
                      {k}: {v}
                    </span>
                  ))
                )}
              </div>
            </div>
          )}
          <div className="terminal-log terminal-log--h200">
            {bonusLogs.length === 0 ? (
              <div className="terminal-muted-block" style={{ padding: '0.75rem' }}>
                No bonus responses. Enable the checkbox above and play.
              </div>
            ) : (
              [...bonusLogs].reverse().map((entry, i) => (
                <div key={i} className="terminal-log__line">
                  <span className="terminal-log__ts">{entry.ts?.slice(11, 19)}</span>
                  <span className="terminal-log__type">{entry.slotName || entry.slotSlug || '?'}</span>
                  {entry.parsed?.scatterCount != null && (
                    <span style={{ color: 'var(--accent)', marginLeft: '0.5rem' }}>{entry.parsed.scatterCount} scatter</span>
                  )}
                  {entry.parsed?.bonusFeatureId && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.25rem' }}>({entry.parsed.bonusFeatureId})</span>
                  )}
                  <details className="terminal-log__details">
                    <summary>Request / response</summary>
                    <pre className="terminal-pre">{JSON.stringify({ request: entry.request, response: entry.response }, null, 2)}</pre>
                  </details>
                </div>
              ))
            )}
          </div>
        </div>
      </details>

      <details style={{ marginTop: '1rem' }}>
        <summary className="terminal-summary">Slot spin samples ({Object.keys(spinSamples).length} slots)</summary>
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          One to two auto samples per slot; on bonus, up to 5 extra bonus samples (×) for Hacksaw / Pragmatic / Stake engine comparisons.
        </div>
        <div className="terminal-toolbar" style={{ marginBottom: '0.5rem' }}>
          <button type="button" onClick={handleSpinSamplesRefresh} className="terminal-btn">
            Refresh
          </button>
          <button type="button" onClick={() => exportSlotSpinSamplesAsFile()} className="terminal-btn terminal-btn--primary">
            Export JSON
          </button>
          <button type="button" onClick={handleSpinSamplesClear} className="terminal-btn">
            Clear
          </button>
        </div>
        <div className="terminal-log terminal-log--h240">
          {Object.keys(spinSamples).length === 0 ? (
            <div className="terminal-muted-block" style={{ padding: '0.75rem' }}>
              No samples. Play a slot — 1–2 spins per game are stored automatically.
            </div>
          ) : (
            Object.entries(spinSamples).map(([slug, entries]) => {
              const isBonus = slug.endsWith('-bonus')
              const baseName = entries?.[0]?.slotName || slug.replace(/-bonus$/, '')
              return (
                <div key={slug} className="terminal-log__line">
                  <span className="terminal-log__type" style={{ fontWeight: 600 }}>
                    {baseName}
                  </span>
                  {isBonus && (
                    <span
                      style={{
                        background: 'var(--accent)',
                        color: 'var(--bg-deep)',
                        padding: '0.1rem 0.35rem',
                        borderRadius: 4,
                        fontSize: '0.65rem',
                        marginLeft: '0.35rem',
                      }}
                    >
                      Bonus
                    </span>
                  )}
                  <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>· {entries?.length || 0} sample(s)</span>
                  {(entries || []).map((entry, j) => (
                    <details key={j} className="terminal-log__details" style={{ marginTop: '0.35rem' }}>
                      <summary>
                        {entry.ts?.slice(11, 19)} — sample {j + 1}
                      </summary>
                      <pre className="terminal-pre">
                        {JSON.stringify({ request: entry.request, response: entry.response }, null, 2)}
                      </pre>
                    </details>
                  ))}
                </div>
              )
            })
          )}
        </div>
      </details>
    </div>
  )
}
