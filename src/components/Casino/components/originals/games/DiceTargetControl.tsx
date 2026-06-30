import DiceChanceControl from './DiceChanceControl'
import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

interface DiceTargetControlProps {
  options: OriginalsWorkbenchOptions
  onPatch: (partial: Partial<OriginalsWorkbenchOptions>) => void
  readOnly?: boolean
}

export default function DiceTargetControl(props: DiceTargetControlProps) {
  return <DiceChanceControl {...props} />
}
