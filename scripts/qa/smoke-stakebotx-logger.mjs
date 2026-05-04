/**
 * Logger row normalization smoke — aligns with apps/stakebotx-ui normalizeLoggerEntry expectations.
 */
import assert from 'node:assert/strict';

function normalizeLoggerEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw;
  const receivedAt = typeof o.receivedAt === 'string' && o.receivedAt.trim() ? o.receivedAt.trim() : undefined;
  if (!receivedAt) return null;
  return {
    receivedAt,
    houseId: o.houseId != null ? String(o.houseId) : null,
    betId: o.betId != null ? String(o.betId) : null,
  };
}

const row = normalizeLoggerEntry({ receivedAt: '2026-01-01T00:00:00.000Z', betId: 'b1' });
assert.ok(row);
assert.equal(row.betId, 'b1');
assert.equal(normalizeLoggerEntry({}), null);
console.log('[qa:smoke:logger] ok — logger row normalize');
