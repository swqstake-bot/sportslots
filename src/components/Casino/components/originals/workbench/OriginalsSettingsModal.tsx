import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ALL_CURRENCIES, CURRENCY_GROUPS } from '../../../constants/currencies'
import type { WorkbenchSettings, BetListColumnId } from './workbenchStorage'
import {
  STAKE_TURBO_DEFAULT_INTERVAL_MS,
  DEFAULT_TURBO_MAX_IN_FLIGHT,
  MAX_TURBO_MAX_IN_FLIGHT,
  MIN_TURBO_FIRE_INTERVAL_MS,
  STAKE_SOFT_MAX_BETS_PER_SEC,
  turboSpawnRatePerSec,
} from '../engine/turboConfig'

interface OriginalsSettingsModalProps {
  open: boolean
  onClose: () => void
  settings: WorkbenchSettings
  onChange: (next: WorkbenchSettings) => void
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="originals-settings-section">
      <h4 className="originals-settings-section-title">{title}</h4>
      <div className="originals-settings-section-body">{children}</div>
    </section>
  )
}

/** Commit number on blur so clearing/retyping does not snap the value mid-keystroke. */
function DraftNumberInput({
  value,
  onValueChange,
  min,
  max,
  step,
  className,
  fallback,
}: {
  value: number
  onValueChange: (n: number) => void
  min?: number
  max?: number
  step?: number | string
  className?: string
  fallback: number
}) {
  const [text, setText] = useState(() => String(value))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setText(String(value))
  }, [value])

  const commit = (raw: string) => {
    const parsed = Number(raw)
    let next = Number.isFinite(parsed) ? parsed : fallback
    if (min != null) next = Math.max(min, next)
    if (max != null) next = Math.min(max, next)
    onValueChange(next)
    setText(String(next))
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      className={className}
      value={text}
      onFocus={() => {
        focusedRef.current = true
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focusedRef.current = false
        commit(text)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

function SettingsForm({
  initial,
  onClose,
  onChange,
}: {
  initial: WorkbenchSettings
  onClose: () => void
  onChange: (next: WorkbenchSettings) => void
}) {
  const [draft, setDraft] = useState(initial)
  const inputCls = 'originals-field-input'

  const save = useCallback(() => {
    onChange(draft)
    onClose()
  }, [draft, onChange, onClose])

  return (
    <div className="originals-settings-form">
      <SettingsSection title="Session">
        <label className="originals-field">
          <span className="originals-field-label">Currency</span>
          <select
            value={draft.currency}
            onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
            className={inputCls}
          >
            <optgroup label="Crypto">
              {CURRENCY_GROUPS.crypto.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Fiat">
              {CURRENCY_GROUPS.fiat.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </optgroup>
            {!ALL_CURRENCIES.some((c) => c.value === draft.currency) && (
              <option value={draft.currency}>{draft.currency.toUpperCase()}</option>
            )}
          </select>
        </label>

        <label className="originals-field">
          <span className="originals-field-label">Client seed</span>
          <input
            type="text"
            value={draft.clientSeed}
            onChange={(e) => setDraft((d) => ({ ...d, clientSeed: e.target.value }))}
            className={inputCls}
            placeholder="Random if empty"
          />
        </label>

        <label className="originals-field">
          <span className="originals-field-label">Max fiat bet ($, 0 = off)</span>
          <DraftNumberInput
            className={inputCls}
            value={draft.maxFiatBetSize}
            min={0}
            step="any"
            fallback={0}
            onValueChange={(n) => setDraft((d) => ({ ...d, maxFiatBetSize: n }))}
          />
        </label>
      </SettingsSection>

      <SettingsSection title="Timing (normal mode)">
        <label className="originals-field">
          <span className="originals-field-label">Request interval (ms)</span>
          <DraftNumberInput
            className={inputCls}
            value={draft.requestInterval}
            min={0}
            step={10}
            fallback={0}
            onValueChange={(n) => setDraft((d) => ({ ...d, requestInterval: n }))}
          />
          <span className="originals-field-hint">Delay between sequential bets. 0 = as fast as API allows.</span>
        </label>

        <label className="originals-settings-check">
          <input
            type="checkbox"
            checked={draft.forceRestartBetting}
            onChange={(e) => setDraft((d) => ({ ...d, forceRestartBetting: e.target.checked }))}
            className="accent-[var(--accent)]"
          />
          <span>Force restart after stop</span>
        </label>

        {draft.forceRestartBetting && (
          <label className="originals-field">
            <span className="originals-field-label">Force restart delay (seconds)</span>
            <DraftNumberInput
              className={inputCls}
              value={draft.forceRestartDelaySeconds}
              min={1}
              max={300}
              step={1}
              fallback={15}
              onValueChange={(n) => setDraft((d) => ({ ...d, forceRestartDelaySeconds: n }))}
            />
          </label>
        )}

        <label className="originals-field">
          <span className="originals-field-label">Rate-limit interval bump (ms per 429)</span>
          <DraftNumberInput
            className={inputCls}
            value={draft.requestIntervalRateLimitIncrement}
            min={0}
            max={500}
            step={5}
            fallback={10}
            onValueChange={(n) => setDraft((d) => ({ ...d, requestIntervalRateLimitIncrement: n }))}
          />
          <span className="originals-field-hint">Adds this many ms to request interval on each 429. Default 10. Caps at 500ms extra.</span>
        </label>
      </SettingsSection>

      <SettingsSection title="Turbo ⚡ (parallel bets)">
        <p className="originals-field-hint originals-field-hint--block">
          Toggle Turbo in the header. Recommended fire interval on Stake is {STAKE_TURBO_DEFAULT_INTERVAL_MS}ms (~
          {turboSpawnRatePerSec(STAKE_TURBO_DEFAULT_INTERVAL_MS).toFixed(1)}/s). Stake rate-limits around{' '}
          {STAKE_SOFT_MAX_BETS_PER_SEC}/s — values below that are safer. Turbo uses a flat bet — B2B / combo chains run in normal mode only.
        </p>
        <label className="originals-field">
          <span className="originals-field-label">Max bets in flight</span>
          <DraftNumberInput
            className={inputCls}
            value={draft.turboMaxInFlight}
            min={1}
            max={MAX_TURBO_MAX_IN_FLIGHT}
            step={1}
            fallback={DEFAULT_TURBO_MAX_IN_FLIGHT}
            onValueChange={(n) => setDraft((d) => ({ ...d, turboMaxInFlight: n }))}
          />
          <span className="originals-field-hint">Default: {DEFAULT_TURBO_MAX_IN_FLIGHT} parallel bets.</span>
        </label>
        <label className="originals-field">
          <span className="originals-field-label">Fire interval (ms)</span>
          <DraftNumberInput
            className={inputCls}
            value={draft.turboFireIntervalMs}
            min={MIN_TURBO_FIRE_INTERVAL_MS}
            step={5}
            fallback={STAKE_TURBO_DEFAULT_INTERVAL_MS}
            onValueChange={(n) => setDraft((d) => ({ ...d, turboFireIntervalMs: n }))}
          />
          <span className="originals-field-hint">
            Spawn rate ~{turboSpawnRatePerSec(draft.turboFireIntervalMs || STAKE_TURBO_DEFAULT_INTERVAL_MS).toFixed(1)}
            /s. Min {MIN_TURBO_FIRE_INTERVAL_MS}ms (~18/s). Recommended: {STAKE_TURBO_DEFAULT_INTERVAL_MS}ms.
          </span>
        </label>
      </SettingsSection>

      <SettingsSection title="Layout">
        <label className="originals-settings-check">
          <input
            type="checkbox"
            checked={draft.showBetList}
            onChange={(e) => setDraft((d) => ({ ...d, showBetList: e.target.checked }))}
            className="accent-[var(--accent)]"
          />
          <span>Show bet list</span>
        </label>

        <label className="originals-settings-check">
          <input
            type="checkbox"
            checked={draft.showStatsPanel}
            onChange={(e) => setDraft((d) => ({ ...d, showStatsPanel: e.target.checked }))}
            className="accent-[var(--accent)]"
          />
          <span>Show statistics panel</span>
        </label>

        <label className="originals-settings-check">
          <input
            type="checkbox"
            checked={draft.statsFloating}
            onChange={(e) => setDraft((d) => ({ ...d, statsFloating: e.target.checked }))}
            className="accent-[var(--accent)]"
          />
          <span>Floating statistics window</span>
        </label>

        <label className="originals-field">
          <span className="originals-field-label">Bet list max rows</span>
          <DraftNumberInput
            className={inputCls}
            value={draft.betListMaxEntries}
            min={20}
            max={2000}
            step={10}
            fallback={250}
            onValueChange={(n) => setDraft((d) => ({ ...d, betListMaxEntries: n }))}
          />
        </label>

        <div className="originals-settings-columns">
          <span className="originals-field-label">Bet list columns</span>
          <div className="originals-settings-columns-grid">
            {(
              [
                ['game', 'Game'],
                ['betId', 'Bet ID'],
                ['bet', 'Bet'],
                ['multi', '×'],
                ['b2b', 'B2B'],
                ['pl', 'P/L'],
                ['time', 'Time'],
                ['kenoPicks', 'Keno picks'],
                ['kenoDrawn', 'Keno drawn'],
                ['kenoHits', 'Keno hits'],
              ] as [BetListColumnId, string][]
            ).map(([id, label]) => (
              <label key={id} className="originals-settings-check originals-settings-check--compact">
                <input
                  type="checkbox"
                  checked={draft.betListColumns[id]}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      betListColumns: { ...d.betListColumns, [id]: e.target.checked },
                    }))
                  }
                  className="accent-[var(--accent)]"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="originals-field">
          <span className="originals-field-label">Sidebar width (px)</span>
          <DraftNumberInput
            className={inputCls}
            value={draft.sidebarWidth}
            min={300}
            max={520}
            step={10}
            fallback={380}
            onValueChange={(n) => setDraft((d) => ({ ...d, sidebarWidth: n }))}
          />
        </label>
      </SettingsSection>

      <SettingsSection title="Audio">
        <label className="originals-settings-check">
          <input
            type="checkbox"
            checked={draft.soundOnWin}
            onChange={(e) => setDraft((d) => ({ ...d, soundOnWin: e.target.checked }))}
            className="accent-[var(--accent)]"
          />
          <span>Sound on win</span>
        </label>

        <label className="originals-settings-check">
          <input
            type="checkbox"
            checked={draft.soundOnLoss}
            onChange={(e) => setDraft((d) => ({ ...d, soundOnLoss: e.target.checked }))}
            className="accent-[var(--accent)]"
          />
          <span>Sound on loss</span>
        </label>
      </SettingsSection>

      <div className="originals-settings-actions">
        <button type="button" className="originals-mini-btn originals-mini-btn--primary flex-1" onClick={save}>
          Save
        </button>
        <button type="button" className="originals-mini-btn flex-1" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function OriginalsSettingsModal({
  open,
  onClose,
  settings,
  onChange,
}: OriginalsSettingsModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)

    // Focus the dialog shell once — not a field — so the first click can enter inputs normally.
    const t = window.setTimeout(() => {
      panelRef.current?.focus({ preventScroll: true })
    }, 0)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
    }
  }, [open, onClose])

  if (!open) return null

  // Use casino-root for design tokens, but NEVER leave its fullscreen ::before active
  // (see CSS: .originals-settings-modal.casino-root::before { display: none }).
  // That fixed grain layer was letting clicks fall through so focus vanished instantly.
  return createPortal(
    <div
      className="originals-settings-overlay"
      role="presentation"
      onMouseDown={(e) => {
        // Close only when pressing the dimmed overlay itself (not the panel).
        if (e.target === e.currentTarget && e.button === 0) onClose()
      }}
    >
      <aside
        ref={panelRef}
        className="casino-root originals-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="originals-stats-drawer-header">
          <h3 id={titleId}>Workbench settings</h3>
          <button type="button" onClick={onClose} className="originals-stats-close" aria-label="Close settings">
            ×
          </button>
        </div>
        <SettingsForm initial={settings} onClose={onClose} onChange={onChange} />
      </aside>
    </div>,
    document.body
  )
}
