/**
 * Lightweight sports mapper smoke (no TS build): mirrors mapFixtureListResponse happy path.
 */
import assert from 'node:assert/strict';

function mapFixtureListResponse(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const root = raw;
  if (Array.isArray(root.errors) && root.errors.length > 0) return [];
  const list = root.data?.fixtureList;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id : undefined;
    const name = typeof item.name === 'string' ? item.name : undefined;
    const slug = typeof item.slug === 'string' ? item.slug : undefined;
    if (!id || !name || !slug) continue;
    out.push({ id, name, slug });
  }
  return out;
}

const sample = {
  data: {
    fixtureList: [
      {
        id: 'fx1',
        name: 'A vs B',
        slug: 'a-vs-b',
        status: 'active',
        sport: { name: 'Soccer' },
        data: { __typename: 'SportFixtureDataMatch', startTime: '2026-01-01T00:00:00.000Z' },
        eventStatus: { __typename: 'SportFixtureEventStatus', matchStatus: 'live', homeScore: 1, awayScore: 0 },
      },
    ],
  },
};

const rows = mapFixtureListResponse(sample);
assert.equal(rows.length, 1);
assert.equal(rows[0].id, 'fx1');
console.log('[qa:smoke:sports] ok — fixture mapper shape');
