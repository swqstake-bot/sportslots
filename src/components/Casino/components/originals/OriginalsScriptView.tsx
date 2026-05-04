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

const CURRENCIES = ['usdc', 'usdt', 'btc', 'eth', 'eur', 'usd']

export default function OriginalsScriptView() {
  const [subTab, setSubTab] = useState<ScriptSubTab>('run')
  const [scriptPath, setScriptPath] = useState('')
  const [profilePath, setProfilePath] = useState('')
  const [scriptContent, setScriptContent] = useState('')
  const [profileContent, setProfileContent] = useState('')
  const [currency, setCurrency] = useState('usdc')
  const [running, setRunning] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  const [lastStats, setLastStats] = useState<{ bets: number; profit: number; wins: number; losses: number; totalWagered?: number } | null>(null)
  const [chartData, setChartData] = useState<{ index: number; profit: number }[]>([])
  const [betList, setBetList] = useState<{ game: string; betSizeUsd: number; payoutUsd: number; profitUsd: number; multi: number; b2bMulti: number; win: boolean }[]>([])
  const [appVersion, setAppVersion] = useState<string>('…')
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const api = (window as any).electronAPI
    void (async () => {
      if (api?.getAppVersion) {
        const v = await api.getAppVersion()
        setAppVersion(v ?? '…')
      } else if (api?.version) {
        setAppVersion(api.version)
      }
    })()
  }, [])

  const MAX_BET_LIST = 30

  const addLog = useCallback((msg: string) => {
    setLogLines((prev) => [...prev.slice(-99), `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  const handleStart = useCallback(async () => {
    const profileJson = profileContent.trim()
    const scriptCode = scriptContent.trim()
    if (!profileJson && !scriptCode) {
      addLog('Please paste profile JSON or script code.')
      return
    }
    addLog('Loading exchange rates (stake = USD)...')
    let usdRates: Record<string, number> = {}
    try {
      usdRates = (await fetchCurrencyRates('')) ?? {}
      if (Object.keys(usdRates).length > 0) addLog('Exchange rates loaded.')
    } catch {
      addLog('Exchange rates not loaded - stake is used 1:1 as currency unit.')
    }
    const callbacks = {
      onLog: addLog,
      onBetPlaced: (r: { error?: string; game?: string; betSizeUsd?: number; payoutUsd?: number; profitUsd?: number; multi?: number; b2bMulti?: number }) => {
        if (r.error) addLog(r.error)
        else {
          const row = {
            game: (r.game || '—').toUpperCase(),
            betSizeUsd: Number(r.betSizeUsd ?? 0),
            payoutUsd: Number(r.payoutUsd ?? 0),
            profitUsd: Number(r.profitUsd ?? 0),
            multi: Number(r.multi ?? 0),
            b2bMulti: Number(r.b2bMulti ?? 0),
            win: Number(r.payoutUsd ?? 0) > 0,
          }
          queueMicrotask(() => {
            setBetList((prev) => [...prev.slice(-(MAX_BET_LIST - 1)), row])
          })
        }
      },
      onStats: (stats: { bets: number; profit: number; wins: number; losses: number; totalWagered?: number }) => {
        // Entkoppeln, um React-Reentrancy in schnellen Loops zu vermeiden
        queueMicrotask(() => {
          setLastStats(stats)
          setChartData((prev) => [...prev.slice(-299), { index: stats.bets, profit: stats.profit }])
        })
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
    addLog('Statistics reset.')
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
            Paste a <strong>profile (.json)</strong> and press Start - or paste a <strong>script (.js)</strong>, then the config (game, stake, ...) is extracted and executed as a session. <strong>Stake is always in USD</strong> (e.g. 0.01 = $0.01); with another currency it is converted on start.
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
                placeholder="Paste script code (game=, initialBetSize=, ... are extracted)"
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
                placeholder='Paste profile JSON (e.g. { "name": "...", "options": { "game": "keno", ... } })'
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
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                  <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
                    <span className="text-[var(--text-muted)] block text-xs">Bets</span>
                    <span className="font-medium text-[var(--text)]">{lastStats.bets}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
                    <span className="text-[var(--text-muted)] block text-xs">Gewagert</span>
                    <span className="font-medium text-[var(--text)]">{(lastStats.totalWagered ?? 0).toFixed(2)}</span>
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

          <div className="text-xs font-medium text-[var(--text-muted)] mb-1">Letzte 30 Bets</div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-deep)]/50">
            <div className="grid grid-cols-6 gap-2 px-2 py-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-deep)]">
              <div>Game</div>
              <div className="text-right">BetSize ($)</div>
              <div className="text-right">Payout ($)</div>
              <div className="text-right">Multi</div>
              <div className="text-right">B2B Multi</div>
              <div className="text-right">Profit ($)</div>
            </div>
            {[...betList].reverse().map((b, i) => (
              <div key={i} className="grid grid-cols-6 gap-2 px-2 py-1.5 text-xs border-b border-[var(--border-subtle)]/60">
                <div className="font-mono text-[var(--text)]">{b.game}</div>
                <div className="text-right font-mono text-[var(--text)]">{b.betSizeUsd.toFixed(2)}</div>
                <div className={`text-right font-mono ${b.win ? 'text-emerald-400' : 'text-red-400'}`}>{b.payoutUsd.toFixed(2)}</div>
                <div className="text-right font-mono text-[var(--text)]">{b.multi.toFixed(2)}x</div>
                <div className="text-right font-mono text-[var(--text-muted)]">{b.b2bMulti > 0 ? `${b.b2bMulti.toFixed(2)}x` : '—'}</div>
                <div className={`text-right font-mono ${b.profitUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{b.profitUsd >= 0 ? '+' : ''}{b.profitUsd.toFixed(2)}</div>
              </div>
            ))}
            {betList.length === 0 && (
              <div className="px-2 py-3 text-[var(--text-muted)] text-xs">Noch keine Bets.</div>
            )}
          </div>

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
