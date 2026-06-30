import { useCallback, useMemo, useState } from 'react'
import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import { DEFAULT_WORKBENCH_OPTIONS } from '../schema/workbenchOptions'
import OriginalsExtendedStops from './OriginalsExtendedStops'
import OriginalsB2bResetPanel, { OriginalsWinLossFields } from './OriginalsB2bResetPanel'

interface OriginalsBetConditionsPanelProps {
  options: OriginalsWorkbenchOptions
  onChange: (next: OriginalsWorkbenchOptions) => void
  disabled?: boolean
  gameSlug?: string
}

type TabId = 'stops' | 'behavior' | 'seeds'

function ToggleNum({
  label,
  enabled,
  value,
  onEnabled,
  onValue,
  disabled,
  inputCls,
  step = 'any',
}: {
  label: string
  enabled: boolean
  value: number
  onEnabled: (v: boolean) => void
  onValue: (v: number) => void
  disabled?: boolean
  inputCls: string
  step?: string
}) {
  return (
    <div className="originals-stop-row">
      <label className="flex items-center gap-2 cursor-pointer shrink-0">
        <input
          type="checkbox"
          disabled={disabled}
          checked={enabled}
          onChange={(e) => onEnabled(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        <span className="text-xs text-[var(--text)]">{label}</span>
      </label>
      <input
        type="number"
        min="0"
        step={step}
        disabled={disabled || !enabled}
        className={inputCls}
        value={value}
        onChange={(e) => onValue(Number(e.target.value) || 0)}
      />
    </div>
  )
}

export default function OriginalsBetConditionsPanel({
  options,
  onChange,
  disabled = false,
  gameSlug,
}: OriginalsBetConditionsPanelProps) {
  const [tab, setTab] = useState<TabId>('stops')
  const o = useMemo(() => ({ ...DEFAULT_WORKBENCH_OPTIONS, ...options }), [options])
  const inputCls =
    'w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none disabled:opacity-50 tabular-nums'
  const isDice = gameSlug === 'dice'
  const isDiceOrLimbo = isDice || gameSlug === 'limbo'

  const patch = useCallback(
    (partial: Partial<OriginalsWorkbenchOptions>) => {
      onChange({ ...DEFAULT_WORKBENCH_OPTIONS, ...options, ...partial })
    },
    [options, onChange]
  )

  const tabs: { id: TabId; label: string }[] = [
    { id: 'stops', label: 'Stops' },
    { id: 'behavior', label: 'Bet behavior' },
    { id: 'seeds', label: 'Seeds' },
  ]

  return (
    <div className="originals-bet-conditions space-y-3">
      <div className="originals-sidebar-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`originals-sidebar-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stops' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-[var(--text-muted)]">Stop profit ($)</span>
              <input
                type="number"
                min="0"
                step="any"
                disabled={disabled}
                className={inputCls}
                value={o.stopOnProfit ?? 0}
                onChange={(e) => patch({ stopOnProfit: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="block">
              <span className="text-xs text-[var(--text-muted)]">Stop loss ($)</span>
              <input
                type="number"
                min="0"
                step="any"
                disabled={disabled}
                className={inputCls}
                value={o.stopOnLoss ?? 0}
                onChange={(e) => patch({ stopOnLoss: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              disabled={disabled}
              checked={!!o.stopOnNextWin}
              onChange={(e) => patch({ stopOnNextWin: e.target.checked })}
              className="accent-[var(--accent)]"
            />
            <span className="text-xs">Stop on next win (defer)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              disabled={disabled}
              checked={!!o.sendBetIdToChallengesRoom}
              onChange={(e) => patch({ sendBetIdToChallengesRoom: e.target.checked })}
              className="accent-[var(--accent)]"
            />
            <span className="text-xs">Send bet ID to challenges room (log)</span>
          </label>
          <OriginalsExtendedStops
            options={o}
            patch={patch}
            disabled={disabled}
            inputCls={inputCls}
            showDiceRoll={isDice}
          />
        </div>
      )}

      {tab === 'behavior' && (
        <div className="space-y-3">
          <OriginalsWinLossFields options={o} patch={patch} disabled={disabled} inputCls={inputCls} />
          <OriginalsB2bResetPanel options={o} patch={patch} disabled={disabled} inputCls={inputCls} compact />

          <label className="block">
            <span className="text-xs text-[var(--text-muted)]">Min bet size ($, 0=off)</span>
            <input
              type="number"
              min="0"
              step="any"
              disabled={disabled}
              className={inputCls}
              value={o.minBetSize ?? 0}
              onChange={(e) => patch({ minBetSize: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>

          <div className="originals-stop-subsection">
            <span className="originals-section-title">Pre-rolls (warmup)</span>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-[var(--text-muted)]">Count</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={disabled}
                  className={inputCls}
                  value={o.preRolls ?? 0}
                  onChange={(e) => patch({ preRolls: Math.max(0, Number(e.target.value) || 0) })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--text-muted)]">Bet size ($)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  disabled={disabled}
                  className={inputCls}
                  value={o.preRollsBetSize ?? o.initialBetSize ?? 0.01}
                  onChange={(e) => patch({ preRollsBetSize: Number(e.target.value) || 0.01 })}
                />
              </label>
            </div>
          </div>

          {isDiceOrLimbo && (
            <>
              <div className="originals-stop-subsection">
                <span className="originals-section-title">Random target</span>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={!!o.isRandomMultiplier}
                    onChange={(e) => patch({ isRandomMultiplier: e.target.checked })}
                    className="accent-[var(--accent)]"
                  />
                  <span className="text-xs">Random multiplier range</span>
                </label>
                {o.isRandomMultiplier && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs text-[var(--text-muted)]">From ×</span>
                      <input
                        type="number"
                        min="1.01"
                        step="any"
                        disabled={disabled}
                        className={inputCls}
                        value={o.randomMultiplier1 ?? 2}
                        onChange={(e) => patch({ randomMultiplier1: Number(e.target.value) || 2 })}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-[var(--text-muted)]">To ×</span>
                      <input
                        type="number"
                        min="1.01"
                        step="any"
                        disabled={disabled}
                        className={inputCls}
                        value={o.randomMultiplier2 ?? 10}
                        onChange={(e) => patch({ randomMultiplier2: Number(e.target.value) || 10 })}
                      />
                    </label>
                  </div>
                )}
                {o.targetSelectionMode === 'random' && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="block">
                      <span className="text-xs text-[var(--text-muted)]">Static from ×</span>
                      <input
                        type="number"
                        min="1.01"
                        step="any"
                        disabled={disabled}
                        className={inputCls}
                        value={o.targetMultiplierFrom ?? 2}
                        onChange={(e) => patch({ targetMultiplierFrom: Number(e.target.value) || 2 })}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-[var(--text-muted)]">Static to ×</span>
                      <input
                        type="number"
                        min="1.01"
                        step="any"
                        disabled={disabled}
                        className={inputCls}
                        value={o.targetMultiplierTo ?? 10}
                        onChange={(e) => patch({ targetMultiplierTo: Number(e.target.value) || 10 })}
                      />
                    </label>
                  </div>
                )}
              </div>

              {isDice && (
                <div className="originals-stop-subsection">
                  <span className="originals-section-title">Switch over/under</span>
                  <ToggleNum
                    label="After rolls"
                    enabled={!!o.isSwitchOverUnderAfterRolls}
                    value={o.switchOverUnderAfterRolls ?? 0}
                    onEnabled={(v) => patch({ isSwitchOverUnderAfterRolls: v })}
                    onValue={(v) => patch({ switchOverUnderAfterRolls: v })}
                    disabled={disabled}
                    inputCls={inputCls}
                  />
                  <ToggleNum
                    label="After wins"
                    enabled={!!o.isSwitchOverUnderAfterWins}
                    value={o.switchOverUnderAfterWins ?? 0}
                    onEnabled={(v) => patch({ isSwitchOverUnderAfterWins: v })}
                    onValue={(v) => patch({ switchOverUnderAfterWins: v })}
                    disabled={disabled}
                    inputCls={inputCls}
                  />
                  <ToggleNum
                    label="After losses"
                    enabled={!!o.isSwitchOverUnderAfterLosses}
                    value={o.switchOverUnderAfterLosses ?? 0}
                    onEnabled={(v) => patch({ isSwitchOverUnderAfterLosses: v })}
                    onValue={(v) => patch({ switchOverUnderAfterLosses: v })}
                    disabled={disabled}
                    inputCls={inputCls}
                  />
                  <ToggleNum
                    label="Win streak"
                    enabled={!!o.isSwitchOverUnderAfterWinStreak}
                    value={o.switchOverUnderAfterWinStreak ?? 0}
                    onEnabled={(v) => patch({ isSwitchOverUnderAfterWinStreak: v })}
                    onValue={(v) => patch({ switchOverUnderAfterWinStreak: v })}
                    disabled={disabled}
                    inputCls={inputCls}
                  />
                  <ToggleNum
                    label="Loss streak"
                    enabled={!!o.isSwitchOverUnderAfterLossStreak}
                    value={o.switchOverUnderAfterLossStreak ?? 0}
                    onEnabled={(v) => patch({ isSwitchOverUnderAfterLossStreak: v })}
                    onValue={(v) => patch({ switchOverUnderAfterLossStreak: v })}
                    disabled={disabled}
                    inputCls={inputCls}
                  />
                </div>
              )}
            </>
          )}

          <div className="originals-stop-subsection">
            <span className="originals-section-title">Vault profits</span>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={!!o.isVaultAllProfits}
                onChange={(e) => patch({ isVaultAllProfits: e.target.checked })}
                className="accent-[var(--accent)]"
              />
              <span className="text-xs">Vault when profit threshold reached</span>
            </label>
            {o.isVaultAllProfits && (
              <label className="block">
                <span className="text-xs text-[var(--text-muted)]">Threshold ($)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  disabled={disabled}
                  className={inputCls}
                  value={o.vaultProfitsThreshold ?? 0}
                  onChange={(e) => patch({ vaultProfitsThreshold: Number(e.target.value) || 0 })}
                />
              </label>
            )}
          </div>
        </div>
      )}

      {tab === 'seeds' && (
        <div className="space-y-2">
          <ToggleNum
            label="Change after rolls"
            enabled={!!o.isSeedChangeAfterRolls}
            value={o.seedChangeAfterRolls ?? 0}
            onEnabled={(v) => patch({ isSeedChangeAfterRolls: v })}
            onValue={(v) => patch({ seedChangeAfterRolls: v })}
            disabled={disabled}
            inputCls={inputCls}
          />
          <label className="block">
            <span className="text-xs text-[var(--text-muted)]">Increase bet after seed reset ($)</span>
            <input
              type="number"
              min="0"
              step="any"
              disabled={disabled}
              className={inputCls}
              value={o.increaseBetAfterSeedReset ?? 0}
              onChange={(e) => patch({ increaseBetAfterSeedReset: Number(e.target.value) || 0 })}
            />
          </label>
          <ToggleNum
            label="After wins"
            enabled={!!o.isSeedChangeAfterWins}
            value={o.seedChangeAfterWins ?? 0}
            onEnabled={(v) => patch({ isSeedChangeAfterWins: v })}
            onValue={(v) => patch({ seedChangeAfterWins: v })}
            disabled={disabled}
            inputCls={inputCls}
          />
          <ToggleNum
            label="After losses"
            enabled={!!o.isSeedChangeAfterLosses}
            value={o.seedChangeAfterLosses ?? 0}
            onEnabled={(v) => patch({ isSeedChangeAfterLosses: v })}
            onValue={(v) => patch({ seedChangeAfterLosses: v })}
            disabled={disabled}
            inputCls={inputCls}
          />
          <ToggleNum
            label="Win streak"
            enabled={!!o.isSeedChangeAfterWinStreak}
            value={o.seedChangeAfterWinStreak ?? 0}
            onEnabled={(v) => patch({ isSeedChangeAfterWinStreak: v })}
            onValue={(v) => patch({ seedChangeAfterWinStreak: v })}
            disabled={disabled}
            inputCls={inputCls}
          />
          <ToggleNum
            label="Loss streak"
            enabled={!!o.isSeedChangeAfterLossStreak}
            value={o.seedChangeAfterLossStreak ?? 0}
            onEnabled={(v) => patch({ isSeedChangeAfterLossStreak: v })}
            onValue={(v) => patch({ seedChangeAfterLossStreak: v })}
            disabled={disabled}
            inputCls={inputCls}
          />
          <ToggleNum
            label="On multiplier ≥"
            enabled={!!o.isSeedChangeOnMultiplier}
            value={o.seedChangeOnMultiplier ?? 0}
            onEnabled={(v) => patch({ isSeedChangeOnMultiplier: v })}
            onValue={(v) => patch({ seedChangeOnMultiplier: v })}
            disabled={disabled}
            inputCls={inputCls}
            step="0.01"
          />
          <ToggleNum
            label="Loss streak (legacy)"
            enabled={(o.seedResetOnLossStreak ?? 0) > 0}
            value={o.seedResetOnLossStreak ?? 0}
            onEnabled={(v) => patch({ seedResetOnLossStreak: v ? o.seedResetOnLossStreak || 5 : 0 })}
            onValue={(v) => patch({ seedResetOnLossStreak: v })}
            disabled={disabled}
            inputCls={inputCls}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              disabled={disabled}
              checked={!!o.resetSeedOnLoss}
              onChange={(e) => patch({ resetSeedOnLoss: e.target.checked })}
              className="accent-[var(--accent)]"
            />
            <span className="text-xs">Reset seed on every loss</span>
          </label>
        </div>
      )}
    </div>
  )
}
