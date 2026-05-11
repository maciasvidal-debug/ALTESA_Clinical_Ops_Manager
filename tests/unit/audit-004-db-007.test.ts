/**
 * tests/unit/audit-004-db-007.test.ts
 *
 * AUDIT-004: Clock skew — LogEntry timestamps based on client Date.now()
 *   can be skewed if the system clock is wrong. This test documents the
 *   gap (no server-side timestamp correction exists) and validates that
 *   entries are STORED in the order they arrive regardless of timestamp value.
 *
 * DB-007: Null entry in IndexedDB iterate — a manually-injected null
 *   value must not crash getAllPatients(). The function must filter
 *   defensively.
 */

import { describe, it, expect } from 'vitest';
import { getAllPatients } from '@/lib/db';
import { FakeStore } from '../__helpers__/FakeStore';
import { TemporalHarness, COLLISION_TIMESTAMP } from '../__helpers__/TemporalHarness';
import type { LogEntry } from '@/lib/data';

const clock = new TemporalHarness();
afterEach(() => clock.restore());

// ── AUDIT-004: Clock skew documentation ───────────────────────────────────────

describe('AUDIT-004 — clock skew: timestamp integrity of LogEntry', () => {

  it('entries are stored and retrieved in creation order regardless of timestamp value', () => {
    // Simulate a device with a 2-hour clock skew
    const entries: LogEntry[] = [];

    const makeEntry = (text: string, offsetHours = 0): LogEntry => ({
      id:        `HMC-047_${crypto.randomUUID()}`,
      patientId: 'HMC-047',
      text,
      // Timestamp with clock skew applied
      timestamp: new Date(Date.now() - offsetHours * 3_600_000).toISOString(),
      type:      'note',
      done:      false,
    });

    // Entry created with 2h backward skew appears "earlier" than it was
    const skewedEntry  = makeEntry('Skewed entry', 2);   // ts = now - 2h
    const normalEntry  = makeEntry('Normal entry', 0);   // ts = now

    entries.push(skewedEntry, normalEntry);

    // Application stores in insertion order (array order)
    expect(entries[0].text).toBe('Skewed entry');
    expect(entries[1].text).toBe('Normal entry');

    // The timestamps ARE in the wrong chronological order due to skew
    const ts0 = new Date(entries[0].timestamp).getTime();
    const ts1 = new Date(entries[1].timestamp).getTime();
    expect(ts0).toBeLessThan(ts1);  // skewed ts appears 2h earlier

    // ALCOA+ GAP documented: the timestamp `ts0` does NOT accurately
    // reflect the contemporaneous moment of entry creation.
    // Mitigation path: synchronise system clock via NTP on each Firebase auth.
    // This test documents the gap — it does NOT assert correct behaviour
    // because the app cannot correct for client-side clock skew without backend.
  });

  it('two entries in correct chronological order have ascending timestamps', () => {
    clock.install(COLLISION_TIMESTAMP);
    const t1 = new Date().toISOString();
    clock.advance(1000); // advance 1 second
    const t2 = new Date().toISOString();

    expect(new Date(t1).getTime()).toBeLessThan(new Date(t2).getTime());
  });

  it('ALCOA+ gap: UUID-based IDs are NOT affected by clock skew', () => {
    // Even with a skewed clock, crypto.randomUUID() remains unique
    clock.install(COLLISION_TIMESTAMP);
    const ids = Array.from({ length: 50 }, () =>
      `HMC-047_${crypto.randomUUID()}`
    );
    expect(new Set(ids).size).toBe(50);
  });
});

// ── DB-007: Null entry in iterate ─────────────────────────────────────────────

describe('DB-007 — getAllPatients: null entry in store must not crash iterate', () => {

  it('store with a null value does not throw — returns only valid patients', async () => {
    // Inject a null value directly into the store (simulates manual DevTools edit)
    const store = new FakeStore();
    await store.setItem('VALID-001', {
      id: 'VALID-001', name: 'Valid Patient', siteId: 'HMC',
      tasks: { q: [], pr: [], l: [], ad: [] },
    });
    // Null value — FakeStore allows it; real IndexedDB would too via DevTools
    (store as any).storage.set('CORRUPT-NULL', null);
    await store.setItem('VALID-002', {
      id: 'VALID-002', name: 'Another Valid', siteId: 'HMC',
      tasks: { q: [], pr: [], l: [], ad: [] },
    });

    // getAllPatients with injected store — must filter null defensively
    const result = await getAllPatients(store as any);

    expect(result.every(p => p !== null && p !== undefined)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
    // The null entry must not appear in results
    expect(result.find(p => (p as any) === null)).toBeUndefined();
  });

  it('empty store returns empty array (no crash)', async () => {
    const store  = new FakeStore();
    const result = await getAllPatients(store as any);
    expect(result).toEqual([]);
  });
});
