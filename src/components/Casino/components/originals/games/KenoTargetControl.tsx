import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import KenoNumberPicker from './KenoNumberPicker'
import TargetSliderControl from './TargetSliderControl'
import GameTargetSummary from './GameTargetSummary'
import { SelectField, SegToggle } from './gamePanelFields'

interface KenoTargetControlProps {
  options: OriginalsWorkbenchOptions
  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void
  readOnly?: boolean
}

export default function KenoTargetControl({ options, onPatch, readOnly }: KenoTargetControlProps) {
  const count = options.useHeatmapHotNumbers ? options.heatmapHotNumbers ?? 5 : options.numbers?.length ?? 0

  return (
    <>
      <GameTargetSummary gameSlug="keno" options={options} gameOnly />
      <SelectField
        label="Risk"
        value={options.risk ?? 'medium'}
        readOnly={readOnly}
        onChange={(v) => onPatch({ risk: v as OriginalsWorkbenchOptions['risk'] })}
        options={[
          { value: 'classic', label: 'Classic' },
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ]}
      />
      <SegToggle
        label="Number source"
        value={options.useHeatmapHotNumbers ? 'heatmap' : 'manual'}
        readOnly={readOnly}
        options={[
          { value: 'manual', label: 'Manual picks' },
          { value: 'heatmap', label: 'Heatmap hot' },
        ]}
        onChange={(v) => onPatch({ useHeatmapHotNumbers: v === 'heatmap' })}
      />
      {options.useHeatmapHotNumbers ? (
        <div className="originals-game-grid originals-game-grid--2">
          <TargetSliderControl
            label="Hot count"
            value={options.heatmapHotNumbers ?? 5}
            min={1}
            max={10}
            step={1}
            readOnly={readOnly}
            prominent={false}
            onChange={(n) => onPatch({ heatmapHotNumbers: n || 5 })}
          />
          <TargetSliderControl
            label="Range 1–N"
            value={options.heatmapRange ?? 30}
            min={1}
            max={40}
            step={1}
            readOnly={readOnly}
            prominent={false}
            onChange={(n) => onPatch({ heatmapRange: n || 30 })}
          />
        </div>
      ) : (
        <KenoNumberPicker
          selected={options.numbers ?? []}
          readOnly={readOnly}
          onChange={(numbers) =>
            onPatch({
              numbers,
              // Clear Antebot random-count so manual 1–10 picks are not ignored.
              randomNumbersFrom: 0,
              randomNumbersTo: 0,
            })
          }
        />
      )}
      <p className="originals-target-slider-hint">Picks: {count} · Board 1–40 · API sends numbers[] + risk</p>
    </>
  )
}
