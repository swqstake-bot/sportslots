/**
 * OriginalsView – Fokus auf Code-Mode (Script ausführen) und Script Builder.
 */

import OriginalsScriptView from './originals/OriginalsScriptView'

interface OriginalsViewProps {
  accessToken?: string
}

export default function OriginalsView(_props: OriginalsViewProps) {
  return (
    <div className="space-y-6">
      <div className="casino-card">
        <OriginalsScriptView />
      </div>
    </div>
  )
}
