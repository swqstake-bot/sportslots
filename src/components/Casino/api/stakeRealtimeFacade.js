import {
  subscribeToBetUpdates as subscribeToBetUpdatesRaw,
  subscribeToBalanceUpdates as subscribeToBalanceUpdatesRaw,
} from './stakeBalanceSubscription'

/**
 * Multiplexed Realtime-Fassade:
 * - eine houseBets-Subscription pro accessToken
 * - eine balanceUpdated-Subscription pro accessToken
 * - beliebig viele lokale Listener in Komponenten
 */

const houseBetChannels = new Map()
const balanceChannels = new Map()

function getTokenKey(accessToken) {
  return String(accessToken || '').trim()
}

async function ensureChannel(map, tokenKey, createRawSubscription) {
  let channel = map.get(tokenKey)
  if (channel) return channel

  channel = {
    listeners: new Set(),
    disconnectRaw: null,
    connecting: null,
  }
  map.set(tokenKey, channel)

  channel.connecting = createRawSubscription(tokenKey, (payload) => {
    for (const cb of channel.listeners) {
      try {
        cb(payload)
      } catch (_) {}
    }
  })
    .then((sub) => {
      channel.disconnectRaw = typeof sub?.disconnect === 'function' ? sub.disconnect : null
      return channel
    })
    .catch((err) => {
      map.delete(tokenKey)
      throw err
    })

  return channel.connecting
}

function makeSubscriber(map, createRawSubscription) {
  return async function subscribe(accessToken, onUpdate) {
    const tokenKey = getTokenKey(accessToken)
    if (!tokenKey || typeof onUpdate !== 'function') {
      return { disconnect() {} }
    }

    const channel = await ensureChannel(map, tokenKey, createRawSubscription)
    channel.listeners.add(onUpdate)

    return {
      disconnect() {
        const current = map.get(tokenKey)
        if (!current) return
        current.listeners.delete(onUpdate)
        if (current.listeners.size > 0) return
        try {
          current.disconnectRaw?.()
        } catch (_) {}
        map.delete(tokenKey)
      },
    }
  }
}

export const subscribeToHouseBets = makeSubscriber(
  houseBetChannels,
  (token, cb) => subscribeToBetUpdatesRaw(token, cb)
)

export const subscribeToStakeBalance = makeSubscriber(
  balanceChannels,
  (token, cb) => subscribeToBalanceUpdatesRaw(token, cb)
)

