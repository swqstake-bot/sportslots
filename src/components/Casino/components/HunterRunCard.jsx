import { memo, useMemo } from 'react'
import { Button } from './ui/Button'
import {
  formatStakeShareBetId,
  stakeBetIdForPreviewApi,
  stakeBetModalShareUrl,
} from '../utils/stakeBetShareId'
import {
  HUNTER_CARD_STAT_ROW,
  hubPickShareRawFromBetList,
  hunterHubListMaxForRun,
  hunterHubListMaxForSlot,
  loadOverallBetIdForSlug,
  minorToUsd,
} from '../utils/hunterHubFeedDisplay'
import { useChallengeHubRecentBets } from './challengeHub/ChallengeHubBetListContext'

export const HunterRunCard = memo(function HunterRunCard({
  run,
  prizeLine,
  targetCurrency,
  rates,
  bestMultiBySlot,
  onLog,
  onSeedResetChange,
  onStopRun,
  onRestartRun,
  onRemoveRun,
}) {
  const hubRecentBets = useChallengeHubRecentBets()

  const {
    copyBetIdRunFormatted,
    canCopyRunShare,
    copyBetIdRecord,
    previewBetId,
    stakeBetLink,
    displayRunMax,
    displaySlotRec,
  } = useMemo(() => {
    const shareRaw = run.bestBetId || hubPickShareRawFromBetList(hubRecentBets, run.id)
    const runFormatted = formatStakeShareBetId(shareRaw)
    const canCopyRun =
      typeof runFormatted === 'string' && String(runFormatted).trim() !== ''
    const recordStored = loadOverallBetIdForSlug(run.slotSlug)
    const recordFromRun =
      run.bestBetId && String(run.bestBetId).trim()
        ? formatStakeShareBetId(run.bestBetId) || String(run.bestBetId).trim()
        : null
    const record = recordStored || recordFromRun
    const combined =
      (canCopyRun ? runFormatted : null) || (record ? formatStakeShareBetId(record) || record : null)
    const preview = combined ? stakeBetIdForPreviewApi(combined) : null
    const link = combined ? stakeBetModalShareUrl(combined) : null
    const runListMax = hubRecentBets?.length ? hunterHubListMaxForRun(hubRecentBets, run.id).max : 0
    const runMax = hubRecentBets?.length
      ? Math.max(Number(run.bestMultiRun) || 0, runListMax)
      : Number(run.bestMultiRun) || 0
    const storedSlotNum =
      bestMultiBySlot[run.slotSlug] != null && Number.isFinite(Number(bestMultiBySlot[run.slotSlug]))
        ? Number(bestMultiBySlot[run.slotSlug])
        : null
    const slotListMax =
      hubRecentBets?.length && run.slotSlug ? hunterHubListMaxForSlot(hubRecentBets, run.slotSlug).max : 0
    const mergedSlotRec = Math.max(storedSlotNum ?? 0, slotListMax)
    const slotRec = hubRecentBets?.length
      ? mergedSlotRec > 0 || storedSlotNum != null
        ? mergedSlotRec
        : null
      : storedSlotNum

    return {
      copyBetIdRunFormatted: runFormatted,
      canCopyRunShare: canCopyRun,
      copyBetIdRecord: record,
      previewBetId: preview,
      stakeBetLink: link,
      displayRunMax: runMax,
      displaySlotRec: slotRec,
    }
  }, [hubRecentBets, run, bestMultiBySlot])

  const statRow = HUNTER_CARD_STAT_ROW
  const runCurrency = run.runCurrency || targetCurrency

  return (
    <div className="hunter-run-card">
      <div className="hunter-run-card-inner">
        <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
          {run.slotName}
          {run.currencySlotIndex > 0 ? (
            <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              {' '}
              (Copy #{run.currencySlotIndex + 1}
              {run.runCurrency ? ` · ${String(run.runCurrency).toUpperCase()}` : ''})
            </span>
          ) : run.runCurrency ? (
            <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              {' '}
              · {String(run.runCurrency).toUpperCase()}
            </span>
          ) : null}
          {run.forcedTargetCurrency ? (
            <span
              style={{ fontWeight: 500, color: 'var(--accent)', fontSize: '0.68rem', marginLeft: '0.25rem' }}
              title="Manual target currency selected for this run"
            >
              manual
            </span>
          ) : null}
        </div>
        <div style={statRow}>
          <span>Status</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            {run.status === 'running' ? (
              <span
                title="Running"
                aria-label="Running"
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 35%, #86efac, #16a34a)',
                  boxShadow: '0 0 6px 2px rgba(34, 197, 94, 0.9), 0 0 16px rgba(34, 197, 94, 0.5)',
                }}
              />
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>{run.status}</span>
            )}
          </span>
        </div>
        <div style={statRow}>
          <span>Spins</span>
          <span>{run.spins}</span>
        </div>
        <div style={statRow}>
          <span>Wagered (USD)</span>
          <span>
            $
            {(
              run.wageredUsd != null
                ? run.wageredUsd
                : minorToUsd(run.wagered, runCurrency, rates)
            ).toFixed(2)}
          </span>
        </div>
        <div style={statRow}>
          <span title="Cumulative per-spin net in USD (win minus stake)">Net (USD)</span>
          <span>
            $
            {(run.wonUsd != null ? run.wonUsd : minorToUsd(run.won ?? 0, runCurrency, rates)).toFixed(2)}
          </span>
        </div>
        <div style={statRow}>
          <span>Bet (USD)</span>
          <span>${minorToUsd(run.currentBet, runCurrency, rates).toFixed(2)}</span>
        </div>
        {String(run.providerId || '').toLowerCase() === 'stakeengine' ? (
          <div style={statRow}>
            <span style={{ color: 'var(--text-muted)' }}>Seed Reset</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                justifyContent: 'flex-end',
              }}
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>every</span>
              <input
                type="number"
                min="0"
                step="1"
                value={Number(run.stakeRgsSeedResetEvery) || 0}
                onChange={(e) => {
                  const n = Math.max(0, Math.min(100000, parseInt(e.target.value || '0', 10) || 0))
                  onSeedResetChange(run.id, n)
                }}
                style={{
                  width: '3.6rem',
                  padding: '0.12rem 0.25rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-deep)',
                  color: 'var(--text)',
                  fontSize: '0.72rem',
                  textAlign: 'right',
                }}
                title="0 = off. Applied when queued run starts; adjustable while running (Stake RGS)."
              />
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Spins</span>
            </span>
          </div>
        ) : null}
        <div style={statRow}>
          <span style={{ fontWeight: 600 }}>Target Multi</span>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
            {run.targetMultiplier != null && Number.isFinite(Number(run.targetMultiplier))
              ? `${Number(run.targetMultiplier).toLocaleString('en-US', { maximumFractionDigits: 2 })}×`
              : '—'}
          </span>
        </div>
        <div style={statRow}>
          <span style={{ color: 'var(--text-muted)' }}>Potential Prize</span>
          <span style={{ textAlign: 'right' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{prizeLine.main}</span>
            {prizeLine.hint ? (
              <span
                style={{
                  display: 'block',
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                  marginTop: '0.12rem',
                }}
              >
                {prizeLine.hint}
              </span>
            ) : null}
          </span>
        </div>
        <div style={statRow}>
          <span style={{ color: 'var(--text-muted)' }}>Max (this run)</span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.25rem',
              flexWrap: 'wrap',
            }}
          >
            <span>{Number(displayRunMax).toFixed(2)}×</span>
            <button
              type="button"
              disabled={!canCopyRunShare}
              onClick={() => {
                if (!canCopyRunShare) return
                try {
                  if (navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(copyBetIdRunFormatted).catch(() => {})
                    onLog(`Run bet id copied — ${run.slotName}`)
                  }
                } catch (_) {}
              }}
              style={{
                padding: '0.15rem 0.35rem',
                fontSize: '0.65rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--accent)',
                cursor: canCopyRunShare ? 'pointer' : 'not-allowed',
                opacity: canCopyRunShare ? 1 : 0.45,
              }}
              title={
                canCopyRunShare
                  ? `Same format as BetList: ${copyBetIdRunFormatted}`
                  : 'No houseBets share id yet (run state and feed rows are empty).'
              }
            >
              Copy Run
            </button>
            <button
              type="button"
              disabled={!stakeBetLink}
              onClick={() => {
                if (!stakeBetLink) return
                try {
                  if (navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(stakeBetLink).catch(() => {})
                    onLog(`Stake bet link copied (${run.slotName})`)
                  }
                } catch (_) {}
              }}
              style={{
                padding: '0.15rem 0.35rem',
                fontSize: '0.65rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: stakeBetLink ? 'pointer' : 'not-allowed',
                opacity: stakeBetLink ? 1 : 0.45,
              }}
              title={
                stakeBetLink
                  ? 'Full Stake share link (?iid is exact houseBets.iid, URL encoded)'
                  : 'Copy a bet id first (Copy ID).'
              }
            >
              Link
            </button>
            <button
              type="button"
              disabled={!previewBetId}
              onClick={() => {
                if (!previewBetId) return
                try {
                  if (navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(previewBetId).catch(() => {})
                    onLog(
                      `Bet preview UUID copied (${run.slotName}) — for POST /bet/preview body betId`
                    )
                  }
                } catch (_) {}
              }}
              style={{
                padding: '0.15rem 0.35rem',
                fontSize: '0.65rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: previewBetId ? 'pointer' : 'not-allowed',
                opacity: previewBetId ? 1 : 0.45,
              }}
              title={
                previewBetId
                  ? 'UUID only (no casino: prefix) for Stake REST bet preview: { "betId": "<uuid>" }'
                  : 'Copy bet ID first (Copy ID).'
              }
            >
              Preview
            </button>
          </span>
        </div>
        <div style={statRow}>
          <span style={{ color: 'var(--text-muted)' }}>Record Multi</span>
          <span>
            {run.slotSlug && displaySlotRec != null && Number.isFinite(Number(displaySlotRec))
              ? `${Number(displaySlotRec).toFixed(2)}×`
              : '—'}
          </span>
        </div>
        <div style={statRow}>
          <span style={{ color: 'var(--text-muted)' }}>Bet ID record (slot)</span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.25rem',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '0.68rem', wordBreak: 'break-all', textAlign: 'right' }}>
              {copyBetIdRecord || '—'}
            </span>
            <button
              type="button"
              disabled={!copyBetIdRecord}
              onClick={() => {
                if (!copyBetIdRecord) return
                try {
                  if (navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(copyBetIdRecord).catch(() => {})
                    onLog(`Bet ID (lifetime slot record, houseBets) copied — ${run.slotName}`)
                  }
                } catch (_) {}
              }}
              style={{
                padding: '0.15rem 0.35rem',
                fontSize: '0.65rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--accent)',
                cursor: copyBetIdRecord ? 'pointer' : 'not-allowed',
                opacity: copyBetIdRecord ? 1 : 0.45,
              }}
            >
              Copy
            </button>
          </span>
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button
              onClick={() => onStopRun(run.id)}
              variant="secondary"
              disabled={run.status !== 'running'}
              title={
                run.status === 'running'
                  ? 'No further spin after the current one — this parallel run only'
                  : 'No active spin'
              }
            >
              Stop after spin
            </Button>
            <Button
              onClick={() => onRestartRun(run.id)}
              variant="primary"
              disabled={run.status === 'running' || run.status === 'completed'}
              title={
                run.status === 'running'
                  ? 'Only possible after stop'
                  : run.status === 'completed'
                    ? 'Stake challenge completed'
                    : 'Start this run again'
              }
            >
              Restart
            </Button>
            <Button onClick={() => onRemoveRun(run.id)} variant="outline" title="Aus Liste und Queue entfernen">
              Aus Liste
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
})
