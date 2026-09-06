/**
 * Web Notifications – Benachrichtigungen bei wichtigen Events (Bonus, etc.).
 */

import { useInAppNotificationStore } from '../../../store/inAppNotificationStore'

const PERMISSION_KEY = 'slotbot_notifications_enabled'

/**
 * @returns {'default'|'granted'|'denied'}
 */
export function getNotificationPermission() {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

/**
 * Fordert Benachrichtigungs-Berechtigung an.
 * @returns {Promise<boolean>} true wenn erteilt
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  if (result === 'granted') {
    try {
      localStorage.setItem(PERMISSION_KEY, '1')
    } catch {
      // ignore
    }
    return true
  }
  return false
}

/**
 * @returns {boolean}
 */
export function hasNotificationPermission() {
  return getNotificationPermission() === 'granted'
}

/**
 * Sendet eine Benachrichtigung (falls Berechtigung).
 * @param {string} title
 * @param {string} [body]
 * @param {{ tag?: string }} [options]
 */
export function notify(title, body, options = {}) {
  if (!options.skipInbox) {
    try {
      useInAppNotificationStore.getState().push({
        source: 'challengeHub',
        kind: String(options?.tag || 'notification'),
        title: String(title || 'Notification'),
        body: body != null ? String(body) : undefined,
        severity: 'info',
        meta: { tag: options?.tag || 'slotbot' },
      })
    } catch {
      // ignore
    }
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, {
      body: body ?? '',
      tag: options.tag ?? 'slotbot',
      icon: '/favicon.ico',
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
    setTimeout(() => n.close(), 5000)
  } catch {
    // ignore
  }
}

/**
 * Benachrichtigung: Bonus getroffen.
 * @param {string} slotName
 * @param {number} [spinCount]
 */
export function notifyBonusHit(slotName, spinCount) {
  const msg = spinCount != null
    ? `Bonus bei ${slotName} nach ${spinCount} Spin(s)`
    : `Bonus bei ${slotName}`
  try {
    useInAppNotificationStore.getState().push({
      source: 'bonusHunt',
      kind: 'bonus_hit',
      title: 'Bonus getroffen',
      body: msg,
      severity: 'success',
      meta: { slotName, spinCount },
    })
  } catch {
    // ignore
  }
  notify('Bonus getroffen', msg, { tag: 'slotbot-bonus', skipInbox: true })
}

/**
 * Benachrichtigung: Challenge gestartet.
 * @param {string} slotName
 * @param {number | null | undefined} targetMulti – null/undefined = Originals ohne festes Multi-Ziel
 */
export function notifyChallengeStart(slotName, targetMulti) {
  const openEnded =
    targetMulti === null ||
    targetMulti === undefined ||
    targetMulti === '' ||
    targetMulti === '—'
  if (openEnded) {
    try {
      useInAppNotificationStore.getState().push({
        source: 'autoChallengeHunter',
        kind: 'challenge_start',
        title: 'Challenge gestartet',
        body: `Starte Originals-Challenge bei ${slotName} (offenes Ziel)`,
        severity: 'info',
        meta: { slotName, targetMulti: null },
      })
    } catch {
      // ignore
    }
    notify(
      'Challenge gestartet',
      `Starte Originals-Challenge bei ${slotName} (offenes Ziel – Stop Loss / manuell)`,
      { tag: 'slotbot-challenge-start', skipInbox: true }
    )
    return
  }
  const n = Number(targetMulti)
  const msg = Number.isFinite(n)
    ? `Starte Challenge bei ${slotName} (Ziel: ${n}x)`
    : `Starte Challenge bei ${slotName} (Ziel: ${targetMulti}x)`
  try {
    useInAppNotificationStore.getState().push({
      source: 'autoChallengeHunter',
      kind: 'challenge_start',
      title: 'Challenge gestartet',
      body: msg,
      severity: 'info',
      meta: { slotName, targetMulti },
    })
  } catch {
    // ignore
  }
  notify('Challenge gestartet', msg, { tag: 'slotbot-challenge-start', skipInbox: true })
}
