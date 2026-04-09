import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const fixturePath = path.join(root, 'qa-fixtures', 'monetary-contract-fixtures.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

const zeroDecimal = new Set(['idr', 'jpy', 'krw', 'vnd'])
const fiat = new Set([
  'eur', 'usd', 'usdc', 'usdt', 'ars', 'brl', 'mxn', 'cad', 'aud', 'clp', 'jpy', 'krw', 'inr', 'idr', 'php',
  'pkr', 'pln', 'ngn', 'cny', 'rub', 'try', 'dkk', 'pen', 'cop',
])

function factor(currency) {
  const c = String(currency || '').toLowerCase()
  if (zeroDecimal.has(c)) return 1
  if (fiat.has(c)) return 100
  return 1e8
}

let failed = 0
for (const testCase of fixture.cases || []) {
  const value = Number(testCase.value || 0)
  const unit = String(testCase.unit || 'major')
  const expectedMinor = Number(testCase.expectedMinor)
  const f = factor(testCase.currency)
  const actualMinor = unit === 'major' ? Math.round(value * f) : Math.round(value)
  if (actualMinor !== expectedMinor) {
    failed += 1
    console.error(`[qa][contract] FAIL ${testCase.name}: expectedMinor=${expectedMinor}, actualMinor=${actualMinor}`)
  } else {
    console.log(`[qa][contract] OK ${testCase.name}`)
  }
}

if (failed > 0) {
  console.error(`[qa][contract] ${failed} contract fixture(s) failed`)
  process.exit(1)
}

console.log('[qa][contract] all fixtures passed')

