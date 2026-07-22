import { useCallback, useState, type ReactNode } from 'react'
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

  const save = useCallback(() => {
    onChange(draft)
    onClose()
  }, [draft, onChange, onClose])

  const inputCls = 'originals-field-input'

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
          <input
            type="number"
            min="0"
            step="any"
            value={draft.maxFiatBetSize}
            onChange={(e) =>
              setDraft((d) => ({ ...d, maxFiatBetSize: Math.max(0, Number(e.target.value) || 0) }))
            }
            className={inputCls}
          />
        </label>
      </SettingsSection>

      <SettingsSection title="Timing (normal mode)">
        <label className="originals-field">
          <span className="originals-field-label">Request interval (ms)</span>
          <input
            type="number"
            min="0"
            step="10"
            value={draft.requestInterval}
            onChange={(e) =>
              setDraft((d) => ({ ...d, requestInterval: Math.max(0, Number(e.target.value) || 0) }))
            }
            className={inputCls}
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
            <input
              type="number"
              min="1"
              max="300"
              step="1"
              value={draft.forceRestartDelaySeconds}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  forceRestartDelaySeconds: Math.max(1, Number(e.target.value) || 15),
                }))
              }
              className={inputCls}
            />
          </label>
        )}

        <label className="originals-field">
          <span className="originals-field-label">Rate-limit interval bump (ms per 429)</span>
          <input
            type="number"
            min="0"
            max="500"
            step="5"
            value={draft.requestIntervalRateLimitIncrement}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                requestIntervalRateLimitIncrement: Math.max(0, Number(e.target.value) || 10),
              }))
            }
            className={inputCls}
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
          <input
            type="number"
            min="1"
            max={MAX_TURBO_MAX_IN_FLIGHT}
            step="1"
            value={draft.turboMaxInFlight}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                turboMaxInFlight: Math.min(
                  MAX_TURBO_MAX_IN_FLIGHT,
                  Math.max(1, Number(e.target.value) || DEFAULT_TURBO_MAX_IN_FLIGHT)
                ),
              }))
            }
            className={inputCls}
          />
          <span className="originals-field-hint">Default: {DEFAULT_TURBO_MAX_IN_FLIGHT} parallel bets.</span>
        </label>
        <label className="originals-field">
          <span className="originals-field-label">Fire interval (ms)</span>
          <input
            type="number"
            min={MIN_TURBO_FIRE_INTERVAL_MS}
            step="5"
            value={draft.turboFireIntervalMs}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                turboFireIntervalMs: Math.max(
                  MIN_TURBO_FIRE_INTERVAL_MS,
                  Number(e.target.value) || STAKE_TURBO_DEFAULT_INTERVAL_MS
                ),
              }))
            }
            className={inputCls}
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
          <input
            type="number"
            min="20"
            max="2000"
            step="10"
            value={draft.betListMaxEntries}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                betListMaxEntries: Math.min(2000, Math.max(20, Number(e.target.value) || 250)),
              }))
            }
            className={inputCls}
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
          <input
            type="number"
            min="300"
            max="520"
            step="10"
            value={draft.sidebarWidth}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                sidebarWidth: Math.min(520, Math.max(300, Number(e.target.value) || 380)),
              }))
            }
            className={inputCls}
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
  if (!open) return null

  return createPortal(
    <div className="originals-settings-overlay" role="presentation">
      <button type="button" className="originals-settings-backdrop" aria-label="Close settings" onClick={onClose} />
      <aside
        className="casino-root originals-settings-modal casino-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="originals-settings-title"
      >
        <div className="originals-stats-drawer-header">
          <h3 id="originals-settings-title">Workbench settings</h3>
          <button type="button" onClick={onClose} className="originals-stats-close">
            ×
          </button>
        </div>
        <SettingsForm initial={settings} onClose={onClose} onChange={onChange} />
      </aside>
    </div>,
    document.body
  )
}
