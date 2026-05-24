/**
 * OriginalsView — Dice Runner + Script Mode.
 */

import { useState } from 'react'
import OriginalsScriptView from './originals/OriginalsScriptView'
import DiceRunnerTab from './originals/DiceRunnerTab'

type OriginalsTab = 'dice' | 'script'

interface OriginalsViewProps {
  accessToken?: string
}

export default function OriginalsView(_props: OriginalsViewProps) {
  const [tab, setTab] = useState<OriginalsTab>('dice')

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-[var(--border-subtle)] pb-2">
        <button
          type="button"
          onClick={() => setTab('dice')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'dice'
              ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          Dice Runner
        </button>
        <button
          type="button"
          onClick={() => setTab('script')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'script'
              ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          Script
        </button>
      </div>

      {tab === 'dice' ? (
        <DiceRunnerTab />
      ) : (
        <div className="casino-card">
          <OriginalsScriptView />
        </div>
      )}
    </div>
  )
}
