import type { ReactNode } from 'react'
import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import PlinkoTargetControl from './PlinkoTargetControl'
import WheelTargetControl from './WheelTargetControl'
import RoundMultiplierPicker from './RoundMultiplierPicker'
import KenoTargetControl from './KenoTargetControl'
import MinesTargetControl from './MinesTargetControl'
import HiloTargetControl from './HiloTargetControl'
import SnakesTargetControl from './SnakesTargetControl'
import FlipTargetControl from './FlipTargetControl'
import RpsTargetControl from './RpsTargetControl'
import SlotsLinesControl from './SlotsLinesControl'
import DifficultyGameControl from './DifficultyGameControl'
import BarsTargetControl from './BarsTargetControl'
import DragonTowerTargetControl from './DragonTowerTargetControl'
import PacksTargetControl from './PacksTargetControl'
import NoParamsGameControl from './NoParamsGameControl'
import GamePanelShell from './GamePanelShell'
import GameTargetSummary from './GameTargetSummary'
import { getGameMeta } from '../registry/gameMeta'

interface OriginalsGamePanelProps {
  slug: string
  options: OriginalsWorkbenchOptions
  onOptionsPatch: (partial: Partial<OriginalsWorkbenchOptions>) => void
  readOnly?: boolean
  currency?: string
}

const BLOCKED = new Set(['roulette', 'baccarat', 'video-poker', 'drill', 'moles', 'blitz'])

const TITLES: Record<string, string> = {
  dice: 'Dice',
  limbo: 'Limbo',
  mines: 'Mines',
  plinko: 'Plinko',
  keno: 'Keno',
  snakes: 'Snakes',
  pump: 'Pump',
  'dragon-tower': 'Dragon Tower',
  darts: 'Darts',
  cases: 'Cases',
  bars: 'Bars',
  tarot: 'Tarot',
  chicken: 'Chicken',
  wheel: 'Wheel',
  flip: 'Flip',
  hilo: 'Hilo',
  'rock-paper-scissors': 'Rock Paper Scissors',
  'tome-of-life': 'Tome of Life',
  'slots-scarab': 'Scarab Spin',
  'slots-samurai': 'Blue Samurai',
  diamonds: 'Diamonds',
  packs: 'Packs',
  blackjack: 'Blackjack',
}

export default function OriginalsGamePanel({ slug, options, onOptionsPatch, readOnly, currency }: OriginalsGamePanelProps) {
  const g = slug.toLowerCase()
  const meta = getGameMeta(g)
  const title = TITLES[g] ?? g
  const patch = onOptionsPatch

  if (BLOCKED.has(g)) {
    return (
      <GamePanelShell slug={g} title={title} bare>
        <p className="originals-game-hint originals-game-hint--warn">{meta.optionsHint}</p>
      </GamePanelShell>
    )
  }

  let body: ReactNode = null

  switch (g) {
    case 'dice':
    case 'limbo':
      return (
        <GamePanelShell slug={g} title={title} bare>
          <div className="originals-game-strategy-redirect">
            Target / chance is set in the <strong>Strategy</strong> tab (Static / Random / Combo).
            This Game tab stays for games with board parameters (Keno, Mines, Plinko…).
          </div>
          <GameTargetSummary gameSlug={g} options={options} gameOnly />
        </GamePanelShell>
      )
    case 'mines':
      return (
        <GamePanelShell slug={g} title={title} bare>
          <MinesTargetControl options={options} onPatch={patch} readOnly={readOnly} />
        </GamePanelShell>
      )
    case 'plinko':
      body = <PlinkoTargetControl options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'keno':
      body = <KenoTargetControl options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'snakes':
      body = <SnakesTargetControl options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'pump':
      body = <RoundMultiplierPicker game="pump" options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'chicken':
      body = <RoundMultiplierPicker game="chicken" options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'dragon-tower':
      body = <DragonTowerTargetControl options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'darts':
      body = <DifficultyGameControl gameSlug="darts" options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'cases':
      body = <DifficultyGameControl gameSlug="cases" options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'tarot':
      body = <DifficultyGameControl gameSlug="tarot" options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'bars':
      body = <BarsTargetControl options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'wheel':
      body = <WheelTargetControl options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'flip':
      body = <FlipTargetControl options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'hilo':
      body = <HiloTargetControl options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'rock-paper-scissors':
      body = <RpsTargetControl options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'tome-of-life':
      body = <SlotsLinesControl gameSlug="tome-of-life" options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'slots-scarab':
      body = <SlotsLinesControl gameSlug="slots-scarab" options={options} onPatch={patch} readOnly={readOnly} />
      break
    case 'diamonds':
    case 'slots-samurai':
    case 'blackjack':
      body = <NoParamsGameControl gameSlug={g} />
      break
    case 'packs':
      body = <PacksTargetControl options={options} onPatch={patch} readOnly={readOnly} currency={currency} />
      break
    default:
      return (
        <GamePanelShell slug={g} title={title} bare>
          <p className="originals-game-hint">{meta.optionsHint ?? 'Configure bet size in Profile.'}</p>
        </GamePanelShell>
      )
  }

  return (
    <GamePanelShell slug={g} title={title}>
      {body}
    </GamePanelShell>
  )
}
