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

/**
 * Hacksaw liefert bei manchen Slots den Marketing-Titel statt fs_3/fs_5 (z. B. Epic Bullets and Bounty:
 * „GO AHEAD, MAKE HER DAY“ für den 5-Scatter-Bonus nach Gamble).
 */
function isHacksawStyleNamedBonusRound(idRaw) {
  if (idRaw == null) return false
  const id = String(idRaw).toLowerCase().replace(/\s+/g, ' ').trim()
  if (id.length < 8) return false
  if (MINI_FEATURE_IDS.has(id)) return false
  if (id.includes('make her day') || id.includes('go ahead')) return true
  // Le Digger u. a.: 5-Scatter / Epic-Gamble → bonusFeatureWon z. B. „Gold Digger“ / GoldDigger
  if (id.includes('gold digger')) return true
  if (id.replace(/\s+/g, '').includes('golddigger')) return true
  return false
}

function isRealFreeSpin(bonusFeatureId) {
  if (!bonusFeatureId) return false
  const id = String(bonusFeatureId).toLowerCase()
  if (MINI_FEATURE_IDS.has(id)) return false
  if (FREE_SPIN_IDS.has(id) || FREE_SPIN_PATTERN.test(id) || id.startsWith('fs')) return true
  return isHacksawStyleNamedBonusRound(bonusFeatureId)
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
        if (scatterCount == null && isHacksawStyleNamedBonusRound(bonusFeatureId)) {
          scatterCount = 5
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
      if (scatterCount == null && isHacksawStyleNamedBonusRound(bonusFeatureId)) {
        scatterCount = 5
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
  const roundId =
    response?.round?.roundId ??
    response?.round?.id ??
    response?.round?.betID ??
    response?.round?.betId ??
    response?.roundId ??
    null

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
    // Pragmatic: Bonus wenn na=b, fs, fs_opt oder fs_total gesetzt
    (r) => (r?._pragmatic?.na === 'b' || r?._pragmatic?.fs === true || r?._pragmatic?.fs_opt === true || r?._pragmatic?.fs_total != null)
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
    // Hacksaw: feature_enter, bonus_spin, pick = Bonus
    (r) => r?.round?.events?.some((ev) => {
      const etn = String(ev?.etn || '').toLowerCase()
      return etn === 'feature_enter' || etn === 'fs_enter' || etn === 'freespins_enter' || etn === 'fs_start' ||
        etn === 'bonus_spin' || etn === 'pick'
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
  let scatterCount = bonusFromEvents.scatterCount ?? stateBonus?.scatterCount ?? null
  if (isBonus && !bonusFeatureId && response?._nolimitRaw) {
    bonusFeatureId = 'fs'
  }
  if (isBonus && !bonusFeatureId && (response?._pragmatic?.na === 'b' || response?.freeRoundOffer)) {
    bonusFeatureId = 'fs'
  }
  // Hacksaw: 5-Scatter-/Epic-Gamble liefert oft bonusFeatureWon: fs_epic (kein _5-Suffix)
  if (scatterCount == null && String(bonusFeatureId || '').toLowerCase() === 'fs_epic') {
    scatterCount = 5
  }

  const hasRealFsEnter = response?.round?.events?.some((ev) => {
    if (String(ev?.etn || '').toLowerCase() !== 'feature_enter') return false
    const fid = ev?.c?.bonusFeatureWon || ev?.c?.bonusFeaturewon
    return isRealFreeSpin(fid)
  })
  // Scatter-Trigger (3+) mit bfw "bonus" = echter Bonus (Le Pharaoh etc.), kein Mini-Feature
  const isScatterTriggeredBonus = scatterCount != null && scatterCount >= 3 && String(bonusFeatureId || '').toLowerCase() === 'bonus'
  if (isBonus && isMiniFeature(bonusFeatureId) && !hasRealFsEnter && !isScatterTriggeredBonus) {
    isBonus = false
  }
  shouldStopOnBonus = isBonus && (isRealFreeSpin(bonusFeatureId) || hasRealFsEnter || shouldStopOnBonus)

  // WIN EXTRACTION MIT BONUS-FILTER
  let winAmount = 0
  let usedStakeEngineWinMinor = false
  const seWinMinor = response?._stakeEngine?.winMinor
  // stakeEngine.placeBet setzt winMinor in Minor-Units — zuerst nutzen, damit round.state/Events/Bonus-Heuristiken
  // den Gewinn nicht überschreiben (Colorful Play / Black Coffee liefern oft große `state`-Arrays).
  if (success && response?._stakeEngine != null && seWinMinor !== undefined && seWinMinor !== null) {
    const n = Number(seWinMinor)
    if (Number.isFinite(n)) {
      winAmount = n
      usedStakeEngineWinMinor = true
    }
  }
  // Third-Party (Hacksaw etc.): `winAmountDisplay` ist nicht zuverlässig in derselben Minor-Skala wie `betAmount`;
  // wenn Events mit `awa` existieren, die zuerst — sonst falsche Win/Net/Multi in BetList.
  if (success && !usedStakeEngineWinMinor && Array.isArray(response?.round?.events) && response.round.events.length > 0) {
    const events = response.round.events
    const hasFeatureExit = events.some((ev) => String(ev?.etn || '').toLowerCase() === 'feature_exit')
    let filteredEvents = events
    if (shouldStopOnBonus && !hasFeatureExit) {
      filteredEvents = events.filter((ev) => {
        const etn = String(ev?.etn || '').toLowerCase()
        if (etn.includes('_reveal') && etn.startsWith('fs')) return false
        if (etn === 'feature_exit') return false
        return true
      })
    }
    winAmount = extractWinFromEvents(filteredEvents)
    if (winAmount === 0) {
      winAmount = extractWinFromActions(filteredEvents)
    }
  } else if (success && !usedStakeEngineWinMinor && response?.round?.winAmountDisplay != null) {
    winAmount = Number(response.round.winAmountDisplay)
  }

  const effectiveBet = Number(betAmount) || 0
  const result = {
    success,
    betAmount: effectiveBet,
    winAmount,
    netResult: winAmount - effectiveBet,
    balance,
    currencyCode,
    roundId,
    isBonus,
    shouldStopOnBonus: !!shouldStopOnBonus,
    bonusFeatureId: bonusFeatureId || undefined,
    scatterCount: scatterCount != null ? scatterCount : undefined,
    /** Multiplikator = winAmount / betSize (beide in Minor Units) */
    multiplier: winAmount > 0 && effectiveBet > 0 ? winAmount / effectiveBet : undefined,
  }

  if (!success) {
    result.error = response?.statusMessage || `Status ${response?.statusCode}`
  }

  return result
}
