/**
 * Bet-History dauerhaft – IndexedDB.
 * Pro Slot gespeichert, lädt beim Start.
 */

import { CASINO_DB_REGISTRY } from './storageRegistry'

const DB_NAME = CASINO_DB_REGISTRY.betHistory.name
const DB_VERSION = CASINO_DB_REGISTRY.betHistory.version
const STORE_NAME = CASINO_DB_REGISTRY.betHistory.store

/** @type {IDBDatabase | null} */
let db = null
let dbPromise = null

function openDb() {
  if (db) return Promise.resolve(db)
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB not supported'))
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
    req.onsuccess = () => {
      db = req.result
      resolve(db)
    }
    req.onupgradeneeded = (e) => {
      const database = e.target.result
      const tx = e.target.transaction
      let store
      if (database.objectStoreNames.contains(STORE_NAME)) {
        store = tx.objectStore(STORE_NAME)
        if (!store.indexNames.contains('byAddedAt')) {
          store.createIndex('byAddedAt', 'addedAt')
        }
      } else {
        store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('slotAdded', ['slotSlug', 'addedAt'])
        store.createIndex('byAddedAt', 'addedAt')
      }
    }
  })
  return dbPromise
}

/**
 * @param {string} slotSlug
 * @param {number} [limit]
 * @returns {Promise<Array<{ id: number, slotSlug: string, betAmount: number, winAmount: number, isBonus: boolean, balance?: number, roundId?: string, addedAt: number }>>}
 */
export async function loadBetHistory(slotSlug, limit = 500) {
  const database = await openDb()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('slotAdded')
    const range = IDBKeyRange.bound([slotSlug, 0], [slotSlug, Number.MAX_SAFE_INTEGER])
    const results = []
    const req = index.openCursor(range, 'prev')
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor || results.length >= limit) {
        resolve(results)
        return
      }
      results.push(cursor.value)
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * @param {string} slotSlug
 * @param {object} entry
 * @param {string} [slotName]
 */
export async function appendBet(slotSlug, entry, slotName) {
  const database = await openDb()
  const { betAmount, winAmount, isBonus, balance, roundId, currencyCode } = entry
  const doc = {
    id: Date.now() + Math.random(),
    slotSlug,
    slotName: slotName ?? undefined,
    betAmount: Number(betAmount) || 0,
    winAmount: Number(winAmount) || 0,
    isBonus: Boolean(isBonus),
    balance: balance != null ? Number(balance) : undefined,
    currencyCode: currencyCode ?? undefined,
    roundId: roundId ?? undefined,
    addedAt: Date.now(),
  }
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.add(doc)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/**
 * Letzte Bets aus allen Slots (global nach addedAt sortiert).
 * @param {number} [limit]
 * @returns {Promise<Array<{ id: number, slotSlug: string, betAmount: number, winAmount: number, isBonus: boolean, balance?: number, roundId?: string, addedAt: number }>>}
 */
export async function loadRecentBets(limit = 30) {
  const database = await openDb()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('byAddedAt')
    const req = index.openCursor(null, 'prev')
    const results = []
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor || results.length >= limit) {
        resolve(results)
        return
      }
      const doc = cursor.value
      results.push({
        ...doc,
        slotName: doc.slotName ?? doc.slotSlug ?? '-',
      })
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * @param {string} slotSlug
 */
export async function clearSlotHistory(slotSlug) {
  const database = await openDb()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('slotAdded')
    const range = IDBKeyRange.bound([slotSlug, 0], [slotSlug, Number.MAX_SAFE_INTEGER])
    const req = index.openCursor(range)
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      } else {
        resolve()
      }
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * Alle Bet-History aller Slots löschen (z.B. beim App-Start).
 */
export async function clearAllBetHistory() {
  const database = await openDb()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

const BET_HISTORY_AUDIT_KEY = 'slotbot_bet_history_audit'

export function recordBetHistoryAudit(event) {
  try {
    const raw = localStorage.getItem(BET_HISTORY_AUDIT_KEY)
    const list = raw ? JSON.parse(raw) : []
    const next = [...list.slice(-199), { ts: new Date().toISOString(), ...event }]
    localStorage.setItem(BET_HISTORY_AUDIT_KEY, JSON.stringify(next))
  } catch (_) {}
}

export function getBetHistoryAudit() {
  try {
    const raw = localStorage.getItem(BET_HISTORY_AUDIT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (_) {
    return []
  }
}

export function clearBetHistoryAudit() {
  try {
    localStorage.removeItem(BET_HISTORY_AUDIT_KEY)
  } catch (_) {}
}
