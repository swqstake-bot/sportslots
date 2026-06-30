import type { ReactNode } from 'react'
import { getGameApiProfile } from '../registry/gameApiSchema'
import { getGameMeta } from '../registry/gameMeta'
import { FieldGroup } from './gamePanelFields'

interface GamePanelShellProps {
  slug: string
  title: string
  children: ReactNode
  /** Skip FieldGroup wrapper (multi-section panels) */
  bare?: boolean
}

export default function GamePanelShell({ slug, title, children, bare }: GamePanelShellProps) {
  const meta = getGameMeta(slug)
  const api = getGameApiProfile(slug)

  return (
    <div className="originals-game-panel">
      {meta.optionsHint && <p className="originals-game-hint">{meta.optionsHint}</p>}
      {api && (
        <p className="originals-game-api-hint" title={api.betFields.join(' · ')}>
          {api.mutationOrRest}
        </p>
      )}
      {bare ? children : <FieldGroup title={title}>{children}</FieldGroup>}
    </div>
  )
}
