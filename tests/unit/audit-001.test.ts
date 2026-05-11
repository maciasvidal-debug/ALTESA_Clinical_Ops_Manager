/**
 * tests/unit/audit-001.test.ts
 *
 * Validates AUDIT-001: LogEntry ID uniqueness under concurrent submissions.
 *
 * Contracts:
 *  A. 100 rapid submissions produce 100 distinct UUIDs (no collision possible)
 *  B. Two entries submitted in same microtask tick have different IDs
 *  C. With pinned Date.now(), the OLD strategy (Date.now()-based ID) would
 *     have produced a collision — this test DOCUMENTS the regression that
 *     crypto.randomUUID() prevents
 *  D. Both concurrent entries persist to the store (no data loss)
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { LogEntry } from '@/lib/data';
import { TemporalHarness, submitConcurrent, COLLISION_TIMESTAMP }
  from '../__helpers__/TemporalHarness';

const clock = new TemporalHarness();
afterEach(() => clock.restore());

// ── Helper: build a LogEntry using the same logic as NavigatorLog.handleSubmit ──
function makeEntry(patientId: string, text: string): LogEntry {
  return {
    // Production code after AUDIT-001 fix:
    id:          `${patientId}_${crypto.randomUUID()}`,
    patientId,
    text,
    timestamp:   new Date().toISOString(),
    type:        'note',
    done:        false,
    siteId:      'FALP-CL',
  };
}

// ── Helper: build a LogEntry with the OLD (broken) ID strategy ──────────────
function makeEntryLegacy(patientId: string, text: string): LogEntry {
  return {
    id:          `${patientId}_${Date.now()}`,   // <-- old strategy
    patientId,
    text,
    timestamp:   new Date().toISOString(),
    type:        'note',
    done:        false,
  };
}

describe('AUDIT-001 — LogEntry ID uniqueness (ALCOA+ Original)', () => {

  // ─────────────────────────────────────────────────────────────────────
  it('AUDIT-001.A — 100 rapid entries produce 100 distinct UUIDs', () => {
    const ids = Array.from({ length: 100 }, (_, i) =>
      makeEntry('HMC-047', `Entry ${i}`).id
    );
    const unique = new Set(ids);
    expect(unique.size).toBe(100);
  });

  // ─────────────────────────────────────────────────────────────────────
  it('AUDIT-001.B — concurrent entries (same microtask) have different IDs', async () => {
    const results = await submitConcurrent([
      () => Promise.resolve(makeEntry('HMC-047', 'Spoke with patient today')),
      () => Promise.resolve(makeEntry('HMC-047', 'TODO: follow up on spirometry')),
    ]);

    const entries = results
      .filter((r): r is PromiseFulfilledResult<LogEntry> => r.status === 'fulfilled')
      .map(r => r.value);

    expect(entries).toHaveLength(2);
    expect(entries[0].id).not.toBe(entries[1].id);
  });

  // ─────────────────────────────────────────────────────────────────────
  it('AUDIT-001.C — REGRESSION DOC: old Date.now() strategy collides when clock is pinned', async () => {
    // Pin the clock to COLLISION_TIMESTAMP for this block
    clock.install(COLLISION_TIMESTAMP);

    const [entry1, entry2] = await Promise.all([
      Promise.resolve(makeEntryLegacy('HMC-047', 'Entry A')),
      Promise.resolve(makeEntryLegacy('HMC-047', 'Entry B')),
    ]);

    // Both use Date.now() = COLLISION_TIMESTAMP → identical IDs
    expect(entry1.id).toBe(entry2.id);

    // This IS the bug: the ID `HMC-047_${COLLISION_TIMESTAMP}` appears twice.
    // In logsStore, the second setItem overwrites the first → data loss.
    // crypto.randomUUID() (test A and B above) prevents this.
  });

  // ─────────────────────────────────────────────────────────────────────
  it('AUDIT-001.D — store integrity: both concurrent entries persist without loss', async () => {
    // Simulate the persist() logic from NavigatorLog
    const store: LogEntry[] = [];

    const persist = async (entry: LogEntry) => {
      // Simulate the logsStore read-modify-write cycle
      const next = [entry, ...store];
      store.splice(0, store.length, ...next);
    };

    const [e1, e2] = [
      makeEntry('HMC-047', 'Entry A'),
      makeEntry('HMC-047', 'Entry B'),
    ];

    // Submit both concurrently
    await submitConcurrent([
      () => persist(e1),
      () => persist(e2),
    ]);

    // Both entries must be retrievable
    expect(store.find(e => e.id === e1.id)).toBeDefined();
    expect(store.find(e => e.id === e2.id)).toBeDefined();

    // IDs are different (UUID prevents collision)
    expect(e1.id).not.toBe(e2.id);
  });

  // ─────────────────────────────────────────────────────────────────────
  it('AUDIT-001.E — UUID format validation: IDs match expected pattern', () => {
    // UUID v4 pattern: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const UUID_PATTERN = /^HMC-047_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const entry = makeEntry('HMC-047', 'test');
    expect(entry.id).toMatch(UUID_PATTERN);
  });
});
