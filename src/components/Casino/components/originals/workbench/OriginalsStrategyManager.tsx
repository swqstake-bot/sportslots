import { useCallback, useState } from 'react'

import type { OriginalsProfileV2, OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

import {

  deleteProfile,

  exportProfileJson,

  loadProfiles,

  saveProfilesForGame,

  upsertProfile,

} from '../profileStorage'



interface OriginalsStrategyManagerProps {

  options: OriginalsWorkbenchOptions

  gameSlug: string

  onLoad: (options: OriginalsWorkbenchOptions, name?: string) => void

  disabled?: boolean

}



export default function OriginalsStrategyManager({ options, gameSlug, onLoad, disabled }: OriginalsStrategyManagerProps) {

  const [profiles, setProfiles] = useState<OriginalsProfileV2[]>(() => {
    const loaded = loadProfiles(gameSlug)
    return [...loaded].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0))
  })

  const [name, setName] = useState('My strategy')



  const refresh = useCallback(() => {
    const loaded = loadProfiles(gameSlug)
    setProfiles([...loaded].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)))
  }, [gameSlug])

  const activeProfile = profiles.find((p) => p.lastUsed)



  const saveCurrent = useCallback(() => {

    const trimmed = name.trim()

    if (!trimmed) return

    const existing = profiles.find((p) => p.name === trimmed)

    upsertProfile({

      name: trimmed,

      options: { ...options, game: gameSlug },

      lastUsed: true,

      favorite: existing?.favorite,

      loadOnStart: existing?.loadOnStart,

    }, gameSlug)

    refresh()

  }, [name, options, profiles, refresh, gameSlug])



  const toggleFavorite = useCallback(

    (profileName: string) => {

      const p = profiles.find((x) => x.name === profileName)

      if (!p) return

      upsertProfile({ ...p, favorite: !p.favorite }, gameSlug)

      refresh()

    },

    [profiles, refresh, gameSlug]

  )



  const toggleLoadOnStart = useCallback(

    (profileName: string) => {

      const toggled = profiles.find((p) => p.name === profileName)

      if (!toggled) return

      const next = profiles.map((p) => ({

        ...p,

        loadOnStart: p.name === profileName ? !toggled.loadOnStart : false,

      }))

      saveProfilesForGame(gameSlug, next)

      refresh()

    },

    [profiles, refresh, gameSlug]

  )



  const loadProfile = useCallback(

    (p: OriginalsProfileV2) => {

      onLoad({ ...p.options, game: gameSlug }, p.name)

      upsertProfile({ ...p, lastUsed: true }, gameSlug)

      refresh()

    },

    [onLoad, refresh, gameSlug]

  )



  const removeProfile = useCallback(

    (profileName: string) => {

      deleteProfile(profileName, gameSlug)

      refresh()

    },

    [refresh, gameSlug]

  )



  const exportCurrent = useCallback(() => {

    const json = exportProfileJson({ name: name.trim() || 'Strategy', options: { ...options, game: gameSlug } })

    void navigator.clipboard?.writeText(json)

  }, [name, options, gameSlug])



  return (

    <section className="originals-strategy-manager space-y-2">

      <h4 className="originals-section-title">Strategy Manager</h4>

      <div className="originals-strategy-toolbar">

        <input

          type="text"

          value={name}

          disabled={disabled}

          onChange={(e) => setName(e.target.value)}

          placeholder="Profile name"

          className="originals-strategy-name-input flex-1"

        />

        <button type="button" disabled={disabled} className="originals-mini-btn" onClick={saveCurrent}>

          Save

        </button>

        <button type="button" disabled={disabled} className="originals-mini-btn" onClick={exportCurrent}>

          Export

        </button>

      </div>



      {profiles.length > 0 ? (

        <ul className="originals-strategy-list">

          {profiles.map((p) => (

            <li

              key={p.name}

              className={`originals-strategy-item${p.lastUsed || p.name === activeProfile?.name ? ' is-active' : ''}`}

            >

              <button

                type="button"

                disabled={disabled}

                className="originals-strategy-load"

                onClick={() => loadProfile(p)}

              >

                {p.name}

                {p.favorite ? ' ★' : ''}

                {p.loadOnStart ? ' ⏵' : ''}

              </button>

              <button

                type="button"

                disabled={disabled}

                className="originals-strategy-icon-btn"

                title={p.favorite ? 'Unfavorite' : 'Favorite'}

                onClick={() => toggleFavorite(p.name)}

              >

                {p.favorite ? '★' : '☆'}

              </button>

              <button

                type="button"

                disabled={disabled}

                className="originals-strategy-icon-btn"

                title={p.loadOnStart ? 'Clear load on start' : 'Load on start'}

                onClick={() => toggleLoadOnStart(p.name)}

              >

                ⏵

              </button>

              <button

                type="button"

                disabled={disabled}

                className="originals-combo-del"

                aria-label={`Delete ${p.name}`}

                onClick={() => removeProfile(p.name)}

              >

                ×

              </button>

            </li>

          ))}

        </ul>

      ) : (

        <p className="originals-empty-hint">No saved profiles — configure options and save.</p>

      )}

    </section>

  )

}


