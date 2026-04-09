import { useState, useEffect } from 'react'
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

const STYLES = {
  card: {
    marginTop: '1rem',
    padding: '1rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  title: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
  },
  btnRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  btn: {
    padding: '0.4rem 0.75rem',
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  btnPrimary: {
    background: 'var(--accent)',
    color: 'var(--bg-deep)',
    border: 'none',
    fontWeight: 600,
  },
  logList: {
    maxHeight: 280,
    overflow: 'auto',
    fontSize: '0.75rem',
    fontFamily: '"JetBrains Mono", monospace',
  },
  logEntry: {
    padding: '0.5rem',
    borderBottom: '1px solid var(--border)',
  },
  logEntryError: {
    background: 'rgba(255, 82, 82, 0.05)',
  },
  logTs: { color: 'var(--text-muted)', marginRight: '0.5rem' },
  logType: { color: 'var(--accent)', marginRight: '0.5rem' },
  logError: { color: 'var(--error)', fontSize: '0.7rem', marginTop: '0.25rem' },
  logDetails: {
    marginTop: '0.35rem',
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    maxHeight: 80,
    overflow: 'auto',
  },
  metaLine: {
    marginTop: '0.3rem',
    fontSize: '0.68rem',
    color: 'var(--text-muted)',
    wordBreak: 'break-all',
  },
}

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
    if (confirm('Alle Logs löschen?')) {
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
    if (confirm('Alle Bonus-Logs löschen?')) {
      clearBonusLogs()
      setBonusLogs([])
    }
  }

  async function handleSpinSamplesRefresh() {
    const data = await getSlotSpinSamples()
    setSpinSamples(data)
  }

  async function handleSpinSamplesClear() {
    if (confirm('Alle Slot Spin Samples löschen?')) {
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
    <div style={STYLES.card}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>
        <input
          type="checkbox"
          checked={saveBonus}
          onChange={(e) => handleSaveBonusChange(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
        />
        Speichere jede Response mit Bonus (zum Nachhinein prüfen welche unterschiedlich waren)
      </label>
      <div style={STYLES.header}>
        <span style={STYLES.title}>API-Logs ({logs.length} Einträge)</span>
        <div style={STYLES.btnRow}>
          <button onClick={handleRefresh} style={STYLES.btn}>
            Aktualisieren
          </button>
          <button onClick={handleExport} style={{ ...STYLES.btn, ...STYLES.btnPrimary }}>
            Als JSON exportieren
          </button>
          <button onClick={handleExportForensicBundle} style={STYLES.btn} title="API + Realtime + Audit in einem Bundle">
            Forensic Bundle
          </button>
          <button onClick={() => exportBonusLogsAsFile()} style={STYLES.btn} title="Bonus-Responses als JSON exportieren">
            Bonus-Logs exportieren
          </button>
          <button onClick={handleClear} style={STYLES.btn}>
            Löschen
          </button>
        </div>
      </div>

      <details style={{ marginTop: '0.75rem' }}>
        <summary style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
          Realtime Audit
        </summary>
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
              onClick={() => {
                resetRealtimeAudit()
                setRealtimeAudit(getRealtimeReconcileSnapshot())
              }}
              style={STYLES.btn}
            >
              Realtime Audit reset
            </button>
          </div>
          <div style={{ marginTop: '0.55rem', color: 'var(--text-muted)' }}>
            BetHistory audit entries: {historyAudit.length}
          </div>
          <div style={{ ...STYLES.logList, maxHeight: 130, marginTop: '0.35rem' }}>
            {historyAudit.length === 0 ? (
              <div style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Keine BetHistory-Audit-Einträge.</div>
            ) : (
              [...historyAudit].reverse().slice(0, 30).map((entry, i) => (
                <div key={i} style={STYLES.logEntry}>
                  <span style={STYLES.logTs}>{String(entry.ts || '').slice(11, 19)}</span>
                  <span style={STYLES.logType}>{entry.event}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{entry.slotSlug || '-'}</span>
                </div>
              ))
            )}
          </div>
          <div style={{ marginTop: '0.55rem', color: 'var(--text-muted)' }}>
            Realtime timeline events: {realtimeTimeline.length}
          </div>
          <div style={{ ...STYLES.logList, maxHeight: 130, marginTop: '0.35rem' }}>
            {realtimeTimeline.length === 0 ? (
              <div style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Keine Realtime-Timeline-Einträge.</div>
            ) : (
              [...realtimeTimeline].reverse().slice(0, 40).map((entry, i) => (
                <div key={i} style={STYLES.logEntry}>
                  <span style={STYLES.logTs}>{String(entry?.emittedAt || '').slice(11, 19)}</span>
                  <span style={STYLES.logType}>{entry?.eventSource || 'event'}</span>
                  <span style={{ color: 'var(--text-muted)' }}>corr={String(entry?.correlationId || '').slice(0, 18)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </details>
      <div style={STYLES.logList}>
        {logs.length === 0 ? (
          <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>
            Keine Logs. Spins/Session starten erzeugt Einträge.
          </div>
        ) : (
          [...logs].reverse().map((entry, i) => (
            <div
              key={i}
              style={{
                ...STYLES.logEntry,
                ...(entry.error ? STYLES.logEntryError : {}),
              }}
            >
              <span style={STYLES.logTs}>{entry.ts?.slice(11, 19)}</span>
              <span style={STYLES.logType}>{entry.type}</span>
              {entry.durationMs != null && (
                <span style={{ color: 'var(--text-muted)' }}>{entry.durationMs}ms</span>
              )}
              {entry.error && (
                <div style={STYLES.logError}>{entry.error}</div>
              )}
              {(entry.correlationId || entry.eventSource) && (
                <div style={STYLES.metaLine}>
                  {entry.eventSource ? `src=${entry.eventSource}` : ''}{entry.eventSource && entry.correlationId ? ' · ' : ''}{entry.correlationId ? `corr=${entry.correlationId}` : ''}
                </div>
              )}
              <details style={STYLES.logDetails}>
                <summary>Request/Response</summary>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '0.25rem 0' }}>
                  {JSON.stringify({ request: entry.request, response: entry.response }, null, 2)}
                </pre>
              </details>
            </div>
          ))
        )}
      </div>

      <details style={{ marginTop: '1rem' }} open>
        <summary style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
          Bonus-Responses ({bonusLogs.length})
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ ...STYLES.btnRow, marginBottom: '0.5rem' }}>
            <button onClick={handleBonusRefresh} style={STYLES.btn}>
              Aktualisieren
            </button>
            <button onClick={() => exportBonusLogsAsFile()} style={{ ...STYLES.btn, ...STYLES.btnPrimary }}>
              Bonus-Logs exportieren
            </button>
            <button onClick={handleBonusClear} style={STYLES.btn}>
              Löschen
            </button>
          </div>
          {bonusLogs.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
              <div style={{ padding: '0.5rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Zähler</div>
                <div>Free-Spin-Eintritt: {bonusSummary.fsEnter}</div>
                <div>Multiplier erkannt: {bonusSummary.mult}</div>
                <div>Activator-only: {bonusSummary.activatorOnly}</div>
              </div>
              <div style={{ padding: '0.5rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Top Features</div>
                {bonusSummary.topFeatures.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>—</div>
                ) : (
                  bonusSummary.topFeatures.map(([k, v]) => (
                    <div key={k}>{k}: {v}</div>
                  ))
                )}
              </div>
              <div style={{ gridColumn: '1 / -1', padding: '0.5rem', background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Top Actions</div>
                {bonusSummary.topActions.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>—</div>
                ) : (
                  bonusSummary.topActions.map(([k, v]) => (
                    <span key={k} style={{ display: 'inline-block', marginRight: '0.5rem' }}>{k}: {v}</span>
                  ))
                )}
              </div>
            </div>
          )}
          <div style={{ ...STYLES.logList, maxHeight: 200 }}>
            {bonusLogs.length === 0 ? (
              <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Keine Bonus-Responses. Checkbox aktivieren und spielen.
              </div>
            ) : (
              [...bonusLogs].reverse().map((entry, i) => (
                <div key={i} style={STYLES.logEntry}>
                  <span style={STYLES.logTs}>{entry.ts?.slice(11, 19)}</span>
                  <span style={STYLES.logType}>{entry.slotName || entry.slotSlug || '?'}</span>
                  {entry.parsed?.scatterCount != null && (
                    <span style={{ color: 'var(--accent)', marginLeft: '0.5rem' }}>{entry.parsed.scatterCount} Scatter</span>
                  )}
                  {entry.parsed?.bonusFeatureId && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.25rem' }}>({entry.parsed.bonusFeatureId})</span>
                  )}
                  <details style={STYLES.logDetails}>
                    <summary>Request/Response</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '0.25rem 0' }}>
                      {JSON.stringify({ request: entry.request, response: entry.response }, null, 2)}
                    </pre>
                  </details>
                </div>
              ))
            )}
          </div>
        </div>
      </details>

      <details style={{ marginTop: '1rem' }}>
        <summary style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
          Slot Spin Samples ({Object.keys(spinSamples).length} Slots) – Auto-Lernen
        </summary>
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          Pro Slot 1–2 Spins automatisch. Bei Bonus zusätzlich bis zu 5 Bonus-Samples (×-bonus) für Vergleiche Hacksaw/Pragmatic/StakeEngine.
        </div>
        <div style={{ ...STYLES.btnRow, marginBottom: '0.5rem' }}>
          <button onClick={handleSpinSamplesRefresh} style={STYLES.btn}>Aktualisieren</button>
          <button onClick={() => exportSlotSpinSamplesAsFile()} style={{ ...STYLES.btn, ...STYLES.btnPrimary }}>
            Als JSON exportieren
          </button>
          <button onClick={handleSpinSamplesClear} style={STYLES.btn}>Löschen</button>
        </div>
        <div style={{ ...STYLES.logList, maxHeight: 240 }}>
          {Object.keys(spinSamples).length === 0 ? (
            <div style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>
              Keine Samples. Spiel einen Slot – es werden automatisch 1–2 Spins pro Slot gespeichert.
            </div>
          ) : (
            Object.entries(spinSamples).map(([slug, entries]) => {
              const isBonus = slug.endsWith('-bonus')
              const baseName = entries?.[0]?.slotName || slug.replace(/-bonus$/, '')
              return (
              <div key={slug} style={STYLES.logEntry}>
                <span style={{ ...STYLES.logType, fontWeight: 600 }}>{baseName}</span>
                {isBonus && <span style={{ background: 'var(--accent)', color: 'var(--bg-deep)', padding: '0.1rem 0.35rem', borderRadius: 4, fontSize: '0.65rem', marginLeft: '0.35rem' }}>Bonus</span>}
                <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                  · {entries?.length || 0} Sample(s)
                </span>
                {(entries || []).map((entry, i) => (
                  <details key={i} style={{ ...STYLES.logDetails, marginTop: '0.35rem' }}>
                    <summary>{entry.ts?.slice(11, 19)} – Sample {i + 1}</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '0.25rem 0', fontSize: '0.68rem' }}>
                      {JSON.stringify({ request: entry.request, response: entry.response }, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            )})
          )}
        </div>
      </details>
    </div>
  )
}
