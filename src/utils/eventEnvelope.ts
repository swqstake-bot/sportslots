export interface EventEnvelope<T = unknown> {
  eventId: string
  correlationId: string
  eventSource: string
  emittedAt: string
  payload: T
}

function randomIdPart() {
  return Math.random().toString(36).slice(2, 10)
}

export function generateCorrelationId(prefix = 'evt'): string {
  return `${prefix}-${Date.now()}-${randomIdPart()}`
}

export function createEventEnvelope<T>(eventSource: string, payload: T, correlationId?: string): EventEnvelope<T> {
  return {
    eventId: generateCorrelationId('id'),
    correlationId: correlationId || generateCorrelationId('corr'),
    eventSource,
    emittedAt: new Date().toISOString(),
    payload,
  }
}

