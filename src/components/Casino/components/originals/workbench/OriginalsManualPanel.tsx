import { useCallback, useMemo, useState } from 'react'

import { Button } from '../../ui/Button'

import { runManualOriginalsBet } from '../engine/runOriginalsSession'

import { fetchCurrencyRates } from '../../../api/stakeChallenges'

import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

import HiloCardDisplay from '../games/HiloCardDisplay'

import type { OriginalsLastBetVisual } from './OriginalsLastResultVisual'



interface OriginalsManualPanelProps {

  gameSlug: string

  options: OriginalsWorkbenchOptions

  currency: string

  accessToken?: string

  onResult?: (result: OriginalsLastBetVisual | null) => void

}



const HILO_GUESS_LABEL: Record<string, string> = {

  higher: 'Higher ↑',

  lower: 'Lower ↓',

  equal: 'Equal =',

}



export default function OriginalsManualPanel({

  gameSlug,

  options,

  currency,

  accessToken,

  onResult,

}: OriginalsManualPanelProps) {

  const [amount, setAmount] = useState(String(options.initialBetSize ?? 0.01))

  const [busy, setBusy] = useState(false)

  const [lastResult, setLastResult] = useState<{ payout?: number; multi?: number; error?: string } | null>(

    null

  )



  const isHilo = gameSlug.toLowerCase() === 'hilo'

  const hiloRank = options.startCardRank?.trim()

  const hiloSuit = (options.startCardSuit ?? '').toUpperCase().slice(0, 1)

  const hiloGuessLabel = HILO_GUESS_LABEL[String(options.hiloGuess ?? 'higher').toLowerCase()] ?? 'Higher ↑'



  const hiloPreviewCard = useMemo(() => {

    if (!isHilo) return null

    if (hiloRank || hiloSuit) {

      return <HiloCardDisplay rank={hiloRank} suit={hiloSuit} size="lg" />

    }

    return (

      <div className="originals-hilo-card originals-hilo-card--lg originals-hilo-card--placeholder">

        <span className="originals-hilo-card-rank">?</span>

        <span className="text-[10px] text-[var(--text-muted)] mt-1">Random start</span>

      </div>

    )

  }, [hiloRank, hiloSuit, isHilo])



  const placeBet = useCallback(async () => {

    const amt = Number(amount) || 0.01

    if (!(amt > 0)) {

      const err = { error: 'Enter a bet amount greater than zero.' }

      setLastResult(err)

      onResult?.(null)

      return

    }

    setBusy(true)

    setLastResult(null)

    onResult?.(null)

    try {

      let usdRates: Record<string, number> = {}

      try {

        usdRates = (await fetchCurrencyRates(accessToken ?? '')) ?? {}

      } catch {

        /* ignore */

      }

      const result = await runManualOriginalsBet(gameSlug, amt, currency, { ...options, game: gameSlug }, usdRates)

      if (result.error) {

        setLastResult({ error: result.error })

        onResult?.(null)

      } else {

        setLastResult(result)

        const payout = Number(result.payout ?? 0)

        const multi = Number(result.multi ?? 0)

        const win = payout > 0

        onResult?.({

          game: gameSlug.toUpperCase(),

          win,

          multi,

          roundProfitUsd: payout - amt,

          betSizeUsd: amt,

          resultLabel: multi > 0 ? `${multi.toFixed(2)}×` : undefined,

          hiloRank: hiloRank || undefined,

          hiloSuit: hiloSuit || undefined,

        })

      }

    } catch (e: unknown) {

      setLastResult({ error: e instanceof Error ? e.message : String(e) })

      onResult?.(null)

    } finally {

      setBusy(false)

    }

  }, [accessToken, amount, currency, gameSlug, hiloRank, hiloSuit, onResult, options])



  return (

    <div className="originals-manual-panel space-y-4 p-4">

      <p className="text-xs text-[var(--text-muted)]">

        Place a single bet with the game options configured in the left panel.

      </p>



      {isHilo && (

        <div className="originals-hilo-manual-preview">

          {hiloPreviewCard}

          <span className="originals-hilo-manual-guess">Guess: {hiloGuessLabel}</span>

          <span className="text-[10px] text-[var(--text-muted)]">

            {options.hiloRounds ?? options.rounds ?? 1} round(s) before cashout

          </span>

        </div>

      )}



      <div className="flex flex-wrap items-end gap-3">

        <label className="block min-w-[7rem]">

          <span className="text-xs text-[var(--text-muted)]">Bet ($)</span>

          <input

            type="number"

            min="0"

            step="any"

            value={amount}

            disabled={busy}

            onChange={(e) => setAmount(e.target.value)}

            className="block w-full mt-1 bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm tabular-nums"

          />

        </label>

        <Button type="button" onClick={placeBet} disabled={busy}>

          {busy ? 'Placing…' : 'Place bet'}

        </Button>

      </div>



      {lastResult && (

        <div

          className={`originals-manual-result${lastResult.error ? ' originals-manual-result--error' : ' originals-manual-result--success'}`}

          role="status"

        >

          {lastResult.error ??

            `Payout $${(lastResult.payout ?? 0).toFixed(4)}${lastResult.multi ? ` · ${lastResult.multi.toFixed(2)}×` : ''}`}

        </div>

      )}

    </div>

  )

}

