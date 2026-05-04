import { createEventEnvelope, type EventEnvelope } from '../utils/eventEnvelope'

type RealtimeHandler = (envelope: EventEnvelope<any>) => void

const listeners = new Set<RealtimeHandler>()
const seenIds = new Set<string>()
const orderedEvents: Array<EventEnvelope<any>> = []

const audit = {
  published: 0,
  duplicates: 0,
  droppedOutOfOrder: 0,
}

export function publishRealtimeEvent(source: string, payload: any, correlationId?: string): EventEnvelope<any> | null {
  const envelope = createEventEnvelope(source, payload, correlationId)
  if (seenIds.has(envelope.eventId)) {
    audit.duplicates += 1
    return null
  }
  seenIds.add(envelope.eventId)
  if (seenIds.size > 2000) {
    const first = seenIds.values().next().value
    if (first) seenIds.delete(first)
  }

  const last = orderedEvents[orderedEvents.length - 1]
  if (last && Date.parse(envelope.emittedAt) < Date.parse(last.emittedAt)) {
    audit.droppedOutOfOrder += 1
  }
  orderedEvents.push(envelope)
  if (orderedEvents.length > 500) orderedEvents.shift()
  audit.published += 1

  for (const cb of listeners) {
    try {
      cb(envelope)
    } catch {
      // Ignore listener failures to keep bus delivery stable.
    }
  }
  return envelope
}

export function subscribeRealtimeBus(handler: RealtimeHandler) {
  listeners.add(handler)
  return () => listeners.delete(handler)
}

export function getRealtimeBusAudit() {
  return {
    ...audit,
    bufferedEvents: orderedEvents.length,
    lastEventSource: orderedEvents[orderedEvents.length - 1]?.eventSource || null,
  }
}

export function getRealtimeBusRecentEvents(limit = 50) {
  return orderedEvents.slice(-Math.max(1, limit))
}

