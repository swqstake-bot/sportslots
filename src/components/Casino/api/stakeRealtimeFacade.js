import {
  subscribeToBetUpdates as subscribeToBetUpdatesRaw,
  subscribeToBalanceUpdates as subscribeToBalanceUpdatesRaw,
} from './stakeBalanceSubscription'
import { createEventEnvelope } from '../../../utils/eventEnvelope'
import { getRealtimeBusAudit, publishRealtimeEvent } from '../../../services/realtimeBus'

/**
 * Multiplexed Realtime-Fassade:
 * - eine houseBets-Subscription pro accessToken
 * - eine balanceUpdated-Subscription pro accessToken
 * - beliebig viele lokale Listener in Komponenten
 */

const houseBetChannels = new Map()
const balanceChannels = new Map()
const realtimeAudit = {
  houseBetsReceived: 0,
  houseBetsDuplicate: 0,
  balanceReceived: 0,
  lastHouseBetKey: null,
  lastBalanceCurrency: null,
}

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
    seenKeys: new Set(),
  }
  map.set(tokenKey, channel)

  channel.connecting = createRawSubscription(tokenKey, (payload) => {
    if (map === houseBetChannels) {
      realtimeAudit.houseBetsReceived += 1
      const key = String(payload?.houseId || payload?.iid || payload?.betId || '')
      realtimeAudit.lastHouseBetKey = key || null
      if (key) {
        if (channel.seenKeys.has(key)) realtimeAudit.houseBetsDuplicate += 1
        channel.seenKeys.add(key)
        if (channel.seenKeys.size > 500) {
          const first = channel.seenKeys.values().next().value
          channel.seenKeys.delete(first)
        }
      }
    } else if (map === balanceChannels) {
      realtimeAudit.balanceReceived += 1
      realtimeAudit.lastBalanceCurrency = payload?.currency || null
    }
    for (const cb of channel.listeners) {
      try {
        cb(payload)
      } catch (_) {}
    }
    try {
      const eventSource = map === houseBetChannels ? 'realtime.houseBets' : 'realtime.balanceUpdated'
      const envelope = createEventEnvelope(eventSource, payload)
      publishRealtimeEvent(eventSource, payload, envelope.correlationId)
      window.dispatchEvent(new CustomEvent('sportslots-realtime-event', { detail: envelope }))
    } catch (_) {}
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

export function getRealtimeAuditSnapshot() {
  return { ...realtimeAudit }
}

export function resetRealtimeAudit() {
  realtimeAudit.houseBetsReceived = 0
  realtimeAudit.houseBetsDuplicate = 0
  realtimeAudit.balanceReceived = 0
  realtimeAudit.lastHouseBetKey = null
  realtimeAudit.lastBalanceCurrency = null
}

export function getRealtimeReconcileSnapshot() {
  const bus = getRealtimeBusAudit()
  return {
    ...realtimeAudit,
    busPublished: bus.published,
    busDuplicates: bus.duplicates,
    busDroppedOutOfOrder: bus.droppedOutOfOrder,
    busBufferedEvents: bus.bufferedEvents,
    busLastSource: bus.lastEventSource,
  }
}

