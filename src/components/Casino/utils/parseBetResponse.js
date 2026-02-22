/**
 * Parst Le Bandit Bet-Responses und extrahiert Statistik-relevante Daten.
 *
 * Response-Struktur (aus HAR):
 * - round: { status, roundId, events: [{ wa, awa, c: { actions: [{ data: { winAmount } }] } }] }
 * - accountBalance: { currencyCode, balance }
 * - statusCode: 0 = OK, 5 = Insufficient Funds, etc.
 */

/**
 * Extrahiert den Gewinn eines Rounds aus den Events.
 * wa = Win Amount pro Event, awa = Accumulated Win Amount
 */
function extractWinFromEvents(events) {
  if (!events?.length) return 0
  // Letzte awa = Gesamtgewinn (akkumuliert über Reveals/Collapses)
  const lastAwa = events[events.length - 1]?.awa
  if (lastAwa != null) return Number(lastAwa)

  // Fallback: Summe aller wa
  return events.reduce((sum, e) => sum + Number(e.wa || 0), 0)
}

/**
 * Extrahiert Gewinn aus gridwin-Actions in den Events.
 */
function extractWinFromActions(events) {
  let total = 0
  for (const e of events || []) {
    const actions = e?.c?.actions || []
    for (const a of actions) {
      if (a?.data?.winAmount) {
        total += Number(a.data.winAmount)
      }
    }
  }
  return total
}

/** Echte Freispiel-Boni (Stopp bei Bonus) – keine Mini-Features wie Pick, Activator, Base-Game-Feature */
const FREE_SPIN_IDS = new Set([
  'fs', 'freespins', 'free_spins', 'freespintrigger',
  'fs_consume', 'sticky_mult', 'sticky_wild',
  'progressive_fs', 'bonus_tomb', 'xmult', 'bonus_curse',
  'fs_moon',
])
const FREE_SPIN_PATTERN = /^fs_\d+$/i // fs_1, fs_2, fs_3, fs_4, fs_5

/** Bekannte Mini-Features – werden nicht als Bonus registriert und stoppen nicht */
const MINI_FEATURE_IDS = new Set([
  'bonus', 'activator', 'collect', 'modifier',
  'feature', // Bloodthirst, Immortal Desire: Base-Game-Features (Monster Reel, etc.) – kein Freispiel
])

function isMiniFeature(bonusFeatureId) {
  if (!bonusFeatureId) return false
  return MINI_FEATURE_IDS.has(String(bonusFeatureId).toLowerCase())
}

function isRealFreeSpin(bonusFeatureId) {
  if (!bonusFeatureId) return false
  const id = String(bonusFeatureId).toLowerCase()
  if (MINI_FEATURE_IDS.has(id)) return false
  return FREE_SPIN_IDS.has(id) || FREE_SPIN_PATTERN.test(id) || id.startsWith('fs')
}

/**
 * Extrahiert bonusFeatureId und scatterCount aus Hacksaw-ähnlichen Events.
 * bfw/bfc (Hacksaw): bfc = Scatter bei "collect", sonst z.B. Freispiele (sticky_mult).
 * Scatter-Anzahl aus gridwin mit winAmount 0 (Scatter-Trigger) im selben Event.
 * @returns {{ bonusFeatureId: string|null, scatterCount: number|null }}
 */
function extractBonusFeatureFromEvents(events) {
  let bonusFeatureId = null
  let scatterCount = null
  for (const ev of events || []) {
    const actions = ev?.c?.actions || []
    let scatterFromGridwin = null
    for (const a of actions) {
      const at = String(a?.at || '').toLowerCase()
      if (at === 'gridwin') {
        const w = Number(a?.data?.winAmount ?? 0)
        if (w === 0) {
          const c = parseInt(a?.data?.count ?? '', 10)
          if (!isNaN(c)) scatterFromGridwin = c
        }
      }
      if (at !== 'bonusfeaturewon') continue
      const d = a?.data || {}
      const id = d.bonusGameId ?? d.bonusId ?? d.featureId ?? d.bfw
      if (id && String(id).toLowerCase() !== 'any') {
        bonusFeatureId = String(id)
        if (scatterFromGridwin != null) {
          scatterCount = scatterFromGridwin
        } else {
          const m = bonusFeatureId.match(/_(\d+)$/)
          if (m) {
            scatterCount = parseInt(m[1], 10)
          } else if (bonusFeatureId.toLowerCase() === 'collect' && (d.bfc != null || d.bonusFeatureCount != null)) {
            const n = parseInt(d.bfc ?? d.bonusFeatureCount ?? '', 10)
            if (!isNaN(n)) scatterCount = n
          }
        }
        return { bonusFeatureId, scatterCount }
      }
    }
    if (ev?.c?.bonusFeatureWon != null) {
      bonusFeatureId = String(ev.c.bonusFeatureWon)
      if (scatterFromGridwin != null) {
        scatterCount = scatterFromGridwin
      } else {
        const m = bonusFeatureId.match(/_(\d+)$/)
        if (m) {
          scatterCount = parseInt(m[1], 10)
        } else if (bonusFeatureId.toLowerCase() === 'collect' && ev?.c?.bonusFeatureCount != null) {
          const n = parseInt(ev.c.bonusFeatureCount, 10)
          if (!isNaN(n)) scatterCount = n
        }
      }
      return { bonusFeatureId, scatterCount }
    }
    if (ev?.c?.bonus) {
      const bonus = Array.isArray(ev.c.bonus) ? ev.c.bonus[0] : ev.c.bonus
      if (bonus?.type === 'bonus' || bonus?.bonusGameId != null) {
        bonusFeatureId = bonus?.bonusGameId ?? bonus?.bonusId ?? bonus?.featureId ?? 'bonus'
        const m = String(bonusFeatureId).match(/_(\d+)$/)
        if (m) scatterCount = parseInt(m[1], 10)
        return { bonusFeatureId, scatterCount }
      }
    }
  }
  return { bonusFeatureId, scatterCount }
}

function extractBonusFeatureFromState(state) {
  if (!Array.isArray(state)) return { bonusFeatureId: null, scatterCount: null }
  for (const s of state) {
    const t = String(s?.type || '').toLowerCase()
    if (t === 'freespintrigger') {
      const scatterCount = Array.isArray(s?.positions) ? s.positions.length : null
      return { bonusFeatureId: 'fs', scatterCount }
    }
    if (t === 'enterbonus' || t.includes('bonus') || s?.bonusType != null) {
      const bonusFeatureId = s?.bonusType ?? (t.includes('bonus') ? 'fs' : null)
      if (bonusFeatureId) return { bonusFeatureId, scatterCount: null }
    }
  }
  return { bonusFeatureId: null, scatterCount: null }
}

/**
 * Parst eine Bet-Response und liefert strukturierte Daten für die Statistik.
 *
 * @param {object} response - Roh-Response von /api/play/bet
 * @param {number} betAmount - Einsatz für diesen Spin (von unserem Request)
 * @returns {{ success, winAmount, balance, roundId, currencyCode, error? }}
 */
export function parseBetResponse(response, betAmount) {
  const success = response?.statusCode === 0
  const balance = response?.accountBalance?.balance != null
    ? Number(response.accountBalance.balance)
    : null
  const currencyCode = response?.accountBalance?.currencyCode || null
  const roundId = response?.round?.roundId ?? response?.round?.id ?? response?.roundId ?? null

  // DETEKTION VOR DEM WIN-EXTRAHIEREN LAUFEN LASSEN
  // Grund: Wenn wir einen Bonus erkennen, müssen wir ggf. Events ignorieren (Instant Bonus Win Bug)
  const events = response?.round?.events || []
  let hasActivatorOnly = false
  for (const ev of events) {
    if (String(ev?.etn || '').toLowerCase() === 'activator') hasActivatorOnly = true
    for (const a of ev?.c?.actions || []) {
      if (String(a?.at || '').toLowerCase() === 'activator') hasActivatorOnly = true
    }
  }
  const stateBonus = extractBonusFeatureFromState(response?.round?.state)
  const detectors = [
    () => stateBonus?.bonusFeatureId ? { isBonus: true, shouldStopOnBonus: true } : null,
    (r) => (r?.freeRoundOffer || r?.promotionWin) ? { isBonus: true, shouldStopOnBonus: true } : null,
    // Pragmatic Fallback: Parser darf Bonus setzen, wenn Provider-Flag vorhanden
    (r) => (r?._pragmatic?.na === 'b' || r?._pragmatic?.fs === true || r?._pragmatic?.fs_opt === true)
      ? { isBonus: true, shouldStopOnBonus: true }
      : null,
    (r) => {
      const raw = r?._nolimitRaw
      const mode = String(r?.round?.mode || '').toUpperCase()
      const freespinsLeft = Number(r?.round?.freespinsLeft ?? 0)
      const fsRoundWin = raw?.fsRoundWin
      const isBonusMode = !!mode && mode !== 'NORMAL'
      const hasFsLeft = freespinsLeft > 0
      const hasFsWin = typeof fsRoundWin === 'number' && fsRoundWin > 0
      const wasFeatureBuy = !!raw?.wasFeatureBuy
      if (isBonusMode || hasFsLeft || hasFsWin || wasFeatureBuy) {
        return { isBonus: true, shouldStopOnBonus: true }
      }
      return null
    },
    // Blueprint Gaming / Relax / Endorphina: Felder in Events/Features
    (r) => {
      const evs = r?.round?.events || []
      for (const ev of evs) {
        const f = ev?.features || ev?.feature || ev?.c?.features
        const issued = Number(f?.freespins_issued ?? f?.freespinsIssued ?? 0)
        const left = Number(f?.freespins_left ?? f?.freespinsLeft ?? 0)
        if (issued > 0 || left > 0) return { isBonus: true, shouldStopOnBonus: true }
      }
      return null
    },
    (r) => {
      const anyBfw = r?.round?.events?.some((ev) => {
        const fid = ev?.c?.bonusFeatureWon || ev?.c?.bonusFeaturewon
        return isRealFreeSpin(fid)
      })
      if (anyBfw) return { isBonus: true, shouldStopOnBonus: true }
      const anyActionFs = r?.round?.events?.some((ev) =>
        (ev?.c?.actions || []).some((a) => String(a?.at || '').toLowerCase() === 'bonusfeaturewon')
      )
      if (anyActionFs) return { isBonus: true, shouldStopOnBonus: true }
      return null
    },
    (r) => r?.round?.events?.some((ev) => {
      const etn = String(ev?.etn || '').toLowerCase()
      return etn === 'feature_enter' || etn === 'fs_enter' || etn === 'freespins_enter' || etn === 'fs_start'
    })
      ? { isBonus: true, shouldStopOnBonus: true }
      : null,
    // ENTFERNT: 'mult' in actions darf NICHT automatisch isBonus=true setzen.
    // Bei Fire My Laser (und anderen) ist 'mult' Teil des Basisspiels oder normaler Gewinne.
    // Wenn 'isBonus' true wird, wird 'shouldStopOnBonus' im nächsten Schritt (hasRealFsEnter Logik) zwar ggf. false,
    // aber 'isBonus' bleibt true, was das Reporting verwirrt und ggf. Logik stört.
    // (r) => r?.round?.events?.some((ev) => (ev?.c?.actions || []).some((a) => String(a?.at || '').toLowerCase() === 'mult')) ? { isBonus: true, shouldStopOnBonus: false } : null,
  ]
  let detection = null
  for (const d of detectors) {
    const res = d(response)
    if (res) { detection = res; break }
  }
  let isBonus = !!detection?.isBonus
  let shouldStopOnBonus = !!detection?.shouldStopOnBonus
  const isStakeEngine = !!response?._stakeEngine
  if (isStakeEngine) {
    const raw = response?._stakeEngine?.raw || {}
    const r = response?.round || raw?.round || {}
    const mode = String(r?.mode || raw?.mode || '').toLowerCase()
    const fsLeft = Number(
      r?.freespinsLeft ??
      r?.freeSpinsLeft ??
      r?.freespins_left ??
      r?.freeSpins ??
      r?.fs ??
      r?.bonusRounds ??
      0
    )
    const fsIssued = Number(r?.freespinsIssued ?? r?.freeSpinsIssued ?? r?.freespins_issued ?? 0)
    const evs = Array.isArray(r?.events) ? r.events : []
    const hasFeatureEnter = evs.some((ev) => {
      const etn = String(ev?.etn || '').toLowerCase()
      return etn === 'feature_enter' || etn === 'fs_enter' || etn === 'freespins_enter' || etn === 'fs_start'
    })
    const hasBonusAction = evs.some((ev) => {
      const fid = ev?.c?.bonusFeatureWon || ev?.c?.bonusFeaturewon
      if (isRealFreeSpin(fid)) return true
      return (ev?.c?.actions || []).some((a) => String(a?.at || '').toLowerCase() === 'bonusfeaturewon')
    })
    const stakeEngineBonus = mode === 'bonus' || fsLeft > 0 || fsIssued > 0 || hasFeatureEnter || hasBonusAction || !!stateBonus?.bonusFeatureId
    isBonus = stakeEngineBonus
    shouldStopOnBonus = stakeEngineBonus
  }
  if (hasActivatorOnly && isBonus && !shouldStopOnBonus) {
    const hasRealBonus = !!response?.freeRoundOffer || !!response?.promotionWin ||
      events.some((ev) =>
        ev?.bonusFeatureWon || ev?.c?.bonusFeatureWon ||
        String(ev?.etn || '').toLowerCase() === 'feature_enter' ||
        (ev?.c?.actions || []).some((a) =>
          ['bonusfeaturewon'].includes(String(a?.at || '').toLowerCase())
        )
      )
    if (!hasRealBonus) {
      isBonus = false
      shouldStopOnBonus = false
    }
  }

  const bonusFromEvents = isBonus
    ? extractBonusFeatureFromEvents(response?.round?.events)
    : { bonusFeatureId: null, scatterCount: null }
  let bonusFeatureId = bonusFromEvents.bonusFeatureId ?? stateBonus?.bonusFeatureId ?? null
  const scatterCount = bonusFromEvents.scatterCount ?? stateBonus?.scatterCount ?? null
  if (isBonus && !bonusFeatureId && response?._nolimitRaw) {
    bonusFeatureId = 'fs'
  }
  if (isBonus && !bonusFeatureId && (response?._pragmatic?.na === 'b' || response?.freeRoundOffer)) {
    bonusFeatureId = 'fs'
  }

  const hasRealFsEnter = response?.round?.events?.some((ev) => {
    if (String(ev?.etn || '').toLowerCase() !== 'feature_enter') return false
    const fid = ev?.c?.bonusFeatureWon || ev?.c?.bonusFeaturewon
    return isRealFreeSpin(fid)
  })
  if (isBonus && isMiniFeature(bonusFeatureId) && !hasRealFsEnter) {
    isBonus = false
  }
  shouldStopOnBonus = isBonus && (isRealFreeSpin(bonusFeatureId) || hasRealFsEnter || shouldStopOnBonus)

  // WIN EXTRACTION MIT BONUS-FILTER
  let winAmount = 0
  if (success && response?.round?.winAmountDisplay != null) {
    // Stake Engine liefert oft den korrekten End-Betrag (Vorsicht: bei Instant Bonus könnte auch hier schon alles drin sein?)
    // Wir vertrauen winAmountDisplay meistens, aber bei Hacksaw Instant Bonus ist es sicherer, die Events zu filtern.
    winAmount = Number(response.round.winAmountDisplay)
  } else if (success && response?.round?.events) {
    // Filtern der Events: Wenn Bonus erkannt (shouldStopOnBonus), ignorieren wir Future-Events (fs_..._reveal)
    let filteredEvents = response.round.events
    if (shouldStopOnBonus) {
      // Alles nach dem "feature_enter" oder "bonusfeaturewon" Event könnte "Zukunft" sein.
      // Sicherer: Wir ignorieren Events, die explizit FreeSpin-Reveals sind.
      filteredEvents = filteredEvents.filter(ev => {
        const etn = String(ev?.etn || '').toLowerCase()
        // Ignoriere fs_..._reveal Events (z.B. fs_2_reveal)
        if (etn.includes('_reveal') && etn.startsWith('fs')) return false
        // Ignoriere feature_exit
        if (etn === 'feature_exit') return false
        return true
      })
    }
    
    winAmount = extractWinFromEvents(filteredEvents)
    if (winAmount === 0) {
      winAmount = extractWinFromActions(filteredEvents)
    }
  }

  const result = {
    success,
    betAmount: Number(betAmount) || 0,
    winAmount,
    netResult: winAmount - (Number(betAmount) || 0),
    balance,
    currencyCode,
    roundId,
    isBonus,
    shouldStopOnBonus: !!shouldStopOnBonus,
    bonusFeatureId: bonusFeatureId || undefined,
    scatterCount: scatterCount != null ? scatterCount : undefined,
  }

  if (!success) {
    result.error = response?.statusMessage || `Status ${response?.statusCode}`
  }

  return result
}
