/**
 * tests/unit/db-001.test.ts
 * DB-001: ID-based idempotency and partial-failure recovery.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { initializeDbWithDefaults } from '@/lib/db';
import { PATIENTS, PROTOCOL_AMENDMENTS } from '@/lib/data';
import { FakeStore }    from '../__helpers__/FakeStore';
import { StoreSnapshot } from '../__helpers__/StoreSnapshot';

const TEST_PATIENTS  = PATIENTS.slice(0, 8);
const TEST_PROTOCOLS = PROTOCOL_AMENDMENTS.slice(0, 2);

afterEach(() => vi.restoreAllMocks());

function stores() {
  return { ps: new FakeStore(), pr: new FakeStore() };
}

describe('DB-001 — initializeDbWithDefaults: ID-based idempotency', () => {

  it('DB-001.1 — happy path: writes all 8 patients on first call', async () => {
    const { ps, pr } = stores();
    await initializeDbWithDefaults(TEST_PATIENTS, TEST_PROTOCOLS,
      { patientsStore: ps as any, protocolStore: pr as any });

    expect(await ps.length()).toBe(8);
    for (const p of TEST_PATIENTS) {
      expect(await ps.getItem(p.id)).toBeDefined();
    }
  });

  it('DB-001.2 — partial failure on call #6: some writes complete, function rejects', async () => {
    const { ps, pr } = stores();
    ps.addFault({ operation: 'setItem', triggerOnCall: 6, errorType: 'QuotaExceededError' });

    await expect(
      initializeDbWithDefaults(TEST_PATIENTS, TEST_PROTOCOLS,
        { patientsStore: ps as any, protocolStore: pr as any })
    ).rejects.toThrow();

    const count = await ps.length();
    // Promise.all: some writes completed before call #6 threw
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThan(8);
  });

  it('DB-001.3 — second call after partial failure writes ONLY missing records', async () => {
    const { ps, pr } = stores();
    ps.addFault({ operation: 'setItem', triggerOnCall: 6, errorType: 'QuotaExceededError' });

    // First call: partial failure
    await initializeDbWithDefaults(TEST_PATIENTS, TEST_PROTOCOLS,
      { patientsStore: ps as any, protocolStore: pr as any }
    ).catch(() => {});

    const partial = await ps.length();
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(8);

    // Remove fault and retry → writes missing records
    ps.clearFaults();
    await initializeDbWithDefaults(TEST_PATIENTS, TEST_PROTOCOLS,
      { patientsStore: ps as any, protocolStore: pr as any });

    // All 8 patients must now be present
    expect(await ps.length()).toBe(8);
    for (const p of TEST_PATIENTS) {
      expect(await ps.getItem(p.id), `Patient ${p.id} missing after recovery`).toBeDefined();
    }
  });

  it('DB-001.4 — idempotency: second complete call makes ZERO store changes', async () => {
    const { ps, pr } = stores();
    await initializeDbWithDefaults(TEST_PATIENTS, TEST_PROTOCOLS,
      { patientsStore: ps as any, protocolStore: pr as any });

    const before = await StoreSnapshot.capture({ patients: ps as any });

    // Idempotency: second call must be a no-op
    await initializeDbWithDefaults(TEST_PATIENTS, TEST_PROTOCOLS,
      { patientsStore: ps as any, protocolStore: pr as any });

    const after = await StoreSnapshot.capture({ patients: ps as any });
    StoreSnapshot.assertNoChange(
      StoreSnapshot.diff(before, after),
      'DB-001.4 idempotency — second call must not mutate any record'
    );
  });

  it('DB-001.5 — no data corruption: existing records are never overwritten on retry', async () => {
    const { ps, pr } = stores();
    // Pre-populate first 3 with a test marker
    for (const p of TEST_PATIENTS.slice(0, 3)) {
      await ps.setItem(p.id, { ...p, _marker: 'original' });
    }

    await initializeDbWithDefaults(TEST_PATIENTS, TEST_PROTOCOLS,
      { patientsStore: ps as any, protocolStore: pr as any });

    // Verify the pre-existing records were NOT overwritten
    for (const p of TEST_PATIENTS.slice(0, 3)) {
      const stored = await ps.getItem<any>(p.id);
      expect(stored?._marker).toBe('original');
    }
    // And the missing patients were added
    for (const p of TEST_PATIENTS.slice(3)) {
      expect(await ps.getItem(p.id)).toBeDefined();
    }
  });
});
