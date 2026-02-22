/**
 * Web Notifications – Benachrichtigungen bei wichtigen Events (Bonus, etc.).
 */

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
  notify('Bonus getroffen', msg, { tag: 'slotbot-bonus' })
}

/**
 * Benachrichtigung: Challenge gestartet.
 * @param {string} slotName
 * @param {number} targetMulti
 */
export function notifyChallengeStart(slotName, targetMulti) {
  const msg = `Starte Challenge bei ${slotName} (Ziel: ${targetMulti}x)`
  notify('Challenge gestartet', msg, { tag: 'slotbot-challenge-start' })
}
