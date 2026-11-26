import { useSlotCatalogReload } from '../hooks/useSlots'

/**
 * „Slots aktualisieren“: startet einen kompletten Katalog-Scan (alle Kategorien + Provider) und
 * zeigt den Fortschritt als Balken. Status kommt global aus stakeSlotsApi (läuft weiter, auch wenn
 * die Komponente kurz unmountet).
 */
export function SlotCatalogReloadBar({ slotCount = 0 }) {
  const { reload, reloading, progress, lastResult } = useSlotCatalogReload()
  const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0))
  const failed = progress?.phase === 'error'
  const finished = !reloading && progress?.phase === 'done' && lastResult

  let status = `${slotCount} Slots im Katalog`
  if (reloading) {
    const total = progress?.total || 0
    const done = progress?.done || 0
    const where = progress?.phase === 'groups' ? 'Kategorien' : 'Provider'
    status = `${done}/${total || '…'} ${where} · ${progress?.slots || 0} Slots`
    if (progress?.current) status += ` · ${progress.current}`
  } else if (failed) {
    status = `Fehler: ${progress?.error || 'unbekannt'}`
  } else if (finished) {
    status = `${lastResult.added > 0 ? `+${lastResult.added} neue Slots` : 'Keine neuen Slots'} · ${lastResult.total} gesamt`
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        marginBottom: '0.6rem',
        padding: '0.45rem 0.6rem',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--bg-elevated) 92%, rgba(var(--accent-rgb), 0.05))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={reloading}
          title="Kompletten Slot-Katalog von Stake neu laden (alle Kategorien und Provider)"
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--accent)',
            background: 'rgba(var(--accent-rgb), 0.12)',
            color: 'var(--accent)',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: reloading ? 'progress' : 'pointer',
            opacity: reloading ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {reloading ? `Aktualisiere… ${percent}%` : 'Slots aktualisieren'}
        </button>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: '0.72rem',
            color: failed ? 'var(--danger, #f87171)' : 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          aria-live="polite"
        >
          {status}
        </span>
      </div>
      {(reloading || finished) && (
        <div
          role="progressbar"
          aria-label="Slot-Katalog wird aktualisiert"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          style={{
            height: 6,
            borderRadius: 999,
            background: 'var(--border-subtle)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${percent}%`,
              height: '100%',
              background: 'var(--accent)',
              boxShadow: '0 0 8px rgba(var(--accent-rgb), 0.5)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}
    </div>
  )
}
