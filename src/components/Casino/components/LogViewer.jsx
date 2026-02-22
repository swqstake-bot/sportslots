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
}

export default function LogViewer({ refreshKey }) {
  const [logs, setLogs] = useState([])
  const [bonusLogs, setBonusLogs] = useState([])
  const [saveBonus, setSaveBonus] = useState(isSaveBonusLogsEnabled())

  useEffect(() => {
    setLogs(getApiLogs())
    setBonusLogs(getBonusLogsExport())
  }, [refreshKey])

  function handleSaveBonusChange(checked) {
    setSaveBonus(checked)
    setSaveBonusLogsEnabled(checked)
  }

  function handleRefresh() {
    setLogs(getApiLogs())
  }

  function handleClear() {
    if (confirm('Alle Logs löschen?')) {
      clearLogs()
      setLogs([])
    }
  }

  function handleExport() {
    exportLogsAsFile()
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
          <button onClick={() => exportBonusLogsAsFile()} style={STYLES.btn} title="Bonus-Responses als JSON exportieren">
            Bonus-Logs exportieren
          </button>
          <button onClick={handleClear} style={STYLES.btn}>
            Löschen
          </button>
        </div>
      </div>
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
    </div>
  )
}
