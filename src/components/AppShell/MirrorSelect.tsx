import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useStakeSiteStore } from '../../store/stakeSiteStore'
import type { StakeMirrorState } from '../../electron'

const CUSTOM_OPTION = '__custom__'

interface MirrorSelectProps {
  /** Nach erfolgreichem Wechsel — z. B. Login öffnen, wenn für den Mirror noch keine Session existiert. */
  onChanged?: (state: StakeMirrorState) => void
}

function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '')
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || 'Could not switch mirror'
}

/** Mirror-Domain der Classic-Plattform wählen (stake.com, stake.bet, stake3114.com, eigene Domains). */
export function MirrorSelect({ onChanged }: MirrorSelectProps) {
  const setStoreMirror = useStakeSiteStore(s => s.setMirror)
  const [state, setState] = useState<StakeMirrorState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const load = useCallback(async () => {
    try {
      const next = await window.electronAPI.getStakeMirrors()
      setState(next)
      setStoreMirror(next.mirror)
    } catch {
      setError('Mirror list unavailable')
    }
  }, [setStoreMirror])

  useEffect(() => {
    void load()
    const refresh = () => { void load() }
    window.addEventListener('stake-session-revalidated', refresh)
    return () => window.removeEventListener('stake-session-revalidated', refresh)
  }, [load])

  const apply = async (mirror: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const next = await window.electronAPI.setStakeMirror(mirror)
      setState(next)
      setStoreMirror(next.mirror)
      setAdding(false)
      setDraft('')
      onChanged?.(next)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const removeSelected = async () => {
    if (busy || !state) return
    setBusy(true)
    setError('')
    try {
      const next = await window.electronAPI.removeStakeMirror(state.mirror)
      setState(next)
      setStoreMirror(next.mirror)
      onChanged?.(next)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const submitCustom = (event: FormEvent) => {
    event.preventDefault()
    if (draft.trim()) void apply(draft.trim())
  }

  const selected = state?.mirror ?? 'auto'
  const isCustomSelected = !!state && state.options.custom.includes(selected)

  return (
    <div className="workspace-mirror">
      <label htmlFor="stake-mirror-select">Mirror domain</label>
      <select
        id="stake-mirror-select"
        value={adding ? CUSTOM_OPTION : selected}
        disabled={busy || !state}
        onChange={event => {
          const value = event.target.value
          if (value === CUSTOM_OPTION) { setAdding(true); return }
          setAdding(false)
          void apply(value)
        }}
      >
        <option value="auto">Auto (stake.bet / stake.com)</option>
        {state?.options.builtin.map(host => <option key={host} value={host}>{host}</option>)}
        {state?.options.custom.map(host => <option key={host} value={host}>{host} (custom)</option>)}
        <option value={CUSTOM_OPTION}>Add custom domain…</option>
      </select>
      {adding && (
        <form className="workspace-mirror-add" onSubmit={submitCustom}>
          <input
            type="text"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder="example-mirror.com"
            aria-label="Custom mirror domain"
            autoFocus
            spellCheck={false}
          />
          <button type="submit" className="workspace-button" disabled={busy || !draft.trim()}>Use</button>
        </form>
      )}
      {state && <small>Active: {state.activeOrigin} · {state.valid ? 'signed in' : 'sign-in required (separate session per domain)'}</small>}
      {isCustomSelected && <button type="button" className="workspace-text-button" onClick={() => void removeSelected()} disabled={busy}>Remove {selected} from list</button>}
      {error && <p className="workspace-inline-error" role="alert">{error}</p>}
    </div>
  )
}
