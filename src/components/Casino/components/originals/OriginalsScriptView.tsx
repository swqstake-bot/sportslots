/**
 * Originals Script Mode – Scripts (.js) und Profile (.json) laden & ausführen,
 * plus Script Builder (Mechaniken → Profil exportieren).
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Button } from '../ui/Button'
import { fetchCurrencyRates } from '../../api/stakeChallenges'
import OriginalsScriptBuilder from './scriptBuilder/OriginalsScriptBuilder'
import { runProfileJson, runScriptAsProfile } from './scriptEngine/runScript'

type ScriptSubTab = 'run' | 'builder'

const CURRENCIES = ['usdc', 'btc', 'eth', 'eur', 'usd']

export default function OriginalsScriptView() {
  const [subTab, setSubTab] = useState<ScriptSubTab>('run')
  const [scriptPath, setScriptPath] = useState('')
  const [profilePath, setProfilePath] = useState('')
  const [scriptContent, setScriptContent] = useState('')
  const [profileContent, setProfileContent] = useState('')
  const [currency, setCurrency] = useState('usdc')
  const [running, setRunning] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  const [lastStats, setLastStats] = useState<{ bets: number; profit: number; wins: number; losses: number } | null>(null)
  const [chartData, setChartData] = useState<{ index: number; profit: number }[]>([])
  const [betList, setBetList] = useState<{ amount: number; payout: number; win: boolean }[]>([])
  const [appVersion, setAppVersion] = useState<string>('…')
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const api = (window as any).electronAPI
    if (api?.getAppVersion) api.getAppVersion().then((v: string) => setAppVersion(v ?? '…'))
    else if (api?.version) setAppVersion(api.version)
  }, [])

  const MAX_BET_LIST = 30

  const addLog = useCallback((msg: string) => {
    setLogLines((prev) => [...prev.slice(-99), `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  const handleStart = useCallback(async () => {
    const profileJson = profileContent.trim()
    const scriptCode = scriptContent.trim()
    if (!profileJson && !scriptCode) {
      addLog('Bitte Profil-JSON oder Script-Code einfügen.')
      return
    }
    addLog('Lade Wechselkurse (Einsatz = USD)…')
    let usdRates: Record<string, number> = {}
    try {
      usdRates = (await fetchCurrencyRates('')) ?? {}
      if (Object.keys(usdRates).length > 0) addLog('Wechselkurse geladen.')
    } catch {
      addLog('Wechselkurse nicht geladen – Einsatz wird 1:1 als Währungseinheit verwendet.')
    }
    const callbacks = {
      onLog: addLog,
      onBetPlaced: (r: { error?: string; amount?: number; payout?: number }) => {
        if (r.error) addLog(r.error)
        else if (r.amount != null && r.payout != null) {
          setBetList((prev) => [...prev.slice(-(MAX_BET_LIST - 1)), { amount: r.amount!, payout: r.payout!, win: r.payout! > 0 }])
        }
      },
      onStats: (stats: { bets: number; profit: number; wins: number; losses: number }) => {
        setLastStats(stats)
        setChartData((prev) => [...prev.slice(-299), { index: stats.bets, profit: stats.profit }])
      },
      onStopped: () => setRunning(false),
      onSeedReset: (tier: number, newBet: number) => addLog(`Block ${tier} · neuer Einsatz: $${newBet.toFixed(2)} USD`),
    }
    if (profileJson) {
      const stop = runProfileJson(profileJson, currency, callbacks, usdRates)
      if (stop) {
        stopRef.current = stop
        setChartData([])
        setBetList([])
        setRunning(true)
        addLog('Profil gestartet. Einsatz = USD.')
      }
    } else if (scriptCode) {
      const looksLikeJson = scriptCode.startsWith('{') && (scriptCode.includes('"game"') || scriptCode.includes('"options"'))
      const stop = looksLikeJson
        ? runProfileJson(scriptCode, currency, callbacks, usdRates)
        : runScriptAsProfile(scriptCode, currency, callbacks, usdRates)
      if (stop) {
        stopRef.current = stop
        setChartData([])
        setBetList([])
        setRunning(true)
        addLog(looksLikeJson ? 'Profil (JSON) gestartet. Einsatz = USD.' : 'Script-Konfig extrahiert, Session gestartet. Einsatz = USD.')
      }
    }
  }, [profileContent, scriptContent, currency, addLog])

  const handleStop = useCallback(() => {
    if (stopRef.current) {
      stopRef.current()
      stopRef.current = null
      setRunning(false)
      addLog('Gestoppt.')
    }
  }, [addLog])

  const handleResetStats = useCallback(() => {
    setChartData([])
    setLastStats(null)
    setBetList([])
    addLog('Statistik zurückgesetzt.')
  }, [addLog])

  return (
    <div className="casino-card space-y-4">
      <h3 className="casino-card-header text-base flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="casino-card-header-accent" />
          Script-Mode
        </span>
        <span className="text-xs font-mono text-[var(--text-muted)]" title="App-Version (vom Main-Prozess, korrekt nach Auto-Update)">
          v{appVersion}
        </span>
      </h3>

      <div className="flex gap-2 w-fit">
        <Button
          type="button"
          variant={subTab === 'run' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setSubTab('run')}
        >
          Script ausführen
        </Button>
        <Button
          type="button"
          variant={subTab === 'builder' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setSubTab('builder')}
        >
          Script Builder
        </Button>
      </div>

      <div className={`space-y-4 ${subTab !== 'run' ? 'hidden' : ''}`}>
          <p className="text-sm text-[var(--text-muted)]">
            <strong>Profil (.json)</strong> einfügen und Start – oder <strong>Script (.js)</strong> einfügen, dann wird die Konfig (game, Einsatz, …) extrahiert und als Session ausgeführt. <strong>Einsatz immer in USD</strong> (z. B. 0.01 = $0.01); bei anderer Währung wird zum Start umgerechnet.
          </p>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-[var(--text-muted)]">Währung</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)]"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Script (.js) – Inhalt</label>
              <input
                type="text"
                value={scriptPath}
                onChange={(e) => setScriptPath(e.target.value)}
                placeholder="Optional: Pfad"
                className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm mb-2"
              />
              <textarea
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                placeholder="Script-Code einfügen (game=, initialBetSize=, … werden ausgelesen)"
                rows={8}
                className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] outline-none resize-y"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Profil (.json) – Inhalt</label>
              <input
                type="text"
                value={profilePath}
                onChange={(e) => setProfilePath(e.target.value)}
                placeholder="Optional: Pfad"
                className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm mb-2"
              />
              <textarea
                value={profileContent}
                onChange={(e) => setProfileContent(e.target.value)}
                placeholder='Profil-JSON einfügen (z. B. { "name": "...", "options": { "game": "keno", ... } })'
                rows={8}
                className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] outline-none resize-y"
              />
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Button onClick={handleStart} disabled={running}>
              Start
            </Button>
            {running && (
              <Button onClick={handleStop} variant="secondary">
                Stop
              </Button>
            )}
            <Button onClick={handleResetStats} variant="secondary" disabled={running}>
              Reset Statistik
            </Button>
          </div>

          {(chartData.length > 0 || lastStats) && (
            <>
              <div className="text-xs font-medium text-[var(--text-muted)] mb-1">Chart & Statistik</div>
              {chartData.length > 0 && (
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="index" tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="var(--text-muted)" tickFormatter={(v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))} />
                      <Tooltip formatter={(v: number | undefined) => [v != null ? (v >= 0 ? `+${v.toFixed(4)}` : v.toFixed(4)) : '—', 'Kum. Profit']} contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--border)' }} labelFormatter={(i) => `Bet #${i}`} />
                      <Line type="monotone" dataKey="profit" stroke="var(--accent)" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {lastStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
                    <span className="text-[var(--text-muted)] block text-xs">Bets</span>
                    <span className="font-medium text-[var(--text)]">{lastStats.bets}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
                    <span className="text-[var(--text-muted)] block text-xs">Wins / Losses</span>
                    <span className="font-medium text-[var(--text)]">{lastStats.wins} / {lastStats.losses}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
                    <span className="text-[var(--text-muted)] block text-xs">Win-Rate</span>
                    <span className="font-medium text-[var(--text)]">{lastStats.bets ? ((lastStats.wins / lastStats.bets) * 100).toFixed(1) : '0'}%</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
                    <span className="text-[var(--text-muted)] block text-xs">Profit</span>
                    <span className={`font-medium ${lastStats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {lastStats.profit >= 0 ? '+' : ''}{lastStats.profit.toFixed(4)}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="text-xs font-medium text-[var(--text-muted)] mb-1">Letzte 30 Wetten</div>
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-deep)]/50 divide-y divide-[var(--border-subtle)]">
            {[...betList].reverse().map((b, i) => {
              const multi = b.amount > 0 ? (b.payout ?? 0) / b.amount : 0
              return (
                <li key={i} className="px-2 py-1.5 flex justify-between text-xs">
                  <span>Einsatz: {b.amount.toFixed(4)} → {multi.toFixed(2)}x</span>
                  <span className={b.win ? 'text-emerald-400' : 'text-red-400'}>{b.win ? 'Win' : 'Loss'}</span>
                </li>
              )
            })}
            {betList.length === 0 && (
              <li className="px-2 py-3 text-[var(--text-muted)] text-xs">Noch keine Wetten.</li>
            )}
          </ul>

          {logLines.length > 0 && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-deep)] p-2 max-h-40 overflow-y-auto">
              <div className="text-xs font-medium text-[var(--text-muted)] mb-1">Log</div>
              {logLines.map((line, i) => (
                <div key={i} className="text-xs text-[var(--text)] font-mono">{line}</div>
              ))}
            </div>
          )}
      </div>

      <div className={subTab !== 'builder' ? 'hidden' : ''}>
        <OriginalsScriptBuilder />
      </div>
    </div>
  )
}
