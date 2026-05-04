import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const fixturePath = path.join(root, 'qa-fixtures', 'stats-replay-fixtures.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

const rates = fixture.rates || {}
const entries = fixture.entries || []

function toUsd(amount, currency) {
  const c = String(currency || '').toLowerCase()
  if (c === 'usd' || c === 'usdc' || c === 'usdt') return Number(amount || 0)
  const rate = Number(rates[c] || 0)
  if (!(rate > 0)) return null
  return Number(amount || 0) * rate
}

let winCount = 0
let lossCount = 0
let evenCount = 0
let cumulative = 0

for (const row of entries) {
  const amount = Number(row.amount || 0)
  const payout = Number(row.payout || 0)
  if (payout > amount) winCount += 1
  else if (payout < amount) lossCount += 1
  else evenCount += 1
  const amountUsd = toUsd(amount, row.currency)
  const payoutUsd = toUsd(payout, row.currency)
  if (amountUsd != null && payoutUsd != null) {
    cumulative += payoutUsd - amountUsd
  }
}

const expected = fixture.expected || {}
let failed = 0

if (entries.length !== Number(expected.count)) {
  failed += 1
  console.error(`[qa][replay] FAIL count expected=${expected.count} actual=${entries.length}`)
}
if (winCount !== Number(expected.winCount)) {
  failed += 1
  console.error(`[qa][replay] FAIL winCount expected=${expected.winCount} actual=${winCount}`)
}
if (lossCount !== Number(expected.lossCount)) {
  failed += 1
  console.error(`[qa][replay] FAIL lossCount expected=${expected.lossCount} actual=${lossCount}`)
}

console.log(`[qa][replay] evenCount=${evenCount} netUsd=${cumulative.toFixed(2)}`)

if (failed > 0) process.exit(1)
console.log('[qa][replay] fixtures passed')

