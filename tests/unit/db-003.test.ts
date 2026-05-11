/**
 * tests/unit/db-003.test.ts
 * DB-003: wipeAllData partial failure and safety guards.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { wipeAllData } from '@/lib/db';
import { FakeStore } from '../__helpers__/FakeStore';

afterEach(() => vi.restoreAllMocks());

function populated(n = 3) {
  const s = new FakeStore();
  for (let i = 0; i < n; i++) s.setItem(`key-${i}`, { data: i });
  return s;
}

describe('DB-003 — wipeAllData: partial failure and safety guards', () => {

  it('DB-003.1 — guard: wrong confirm string throws before any clear', async () => {
    const ps = populated();
    const clearSpy = vi.spyOn(ps, 'clear');

    // @ts-expect-error — testing guard
    await expect(wipeAllData('wrong')).rejects.toThrow('requires explicit confirmation string');
    expect(clearSpy).not.toHaveBeenCalled();
    expect(await ps.length()).toBe(3); // data untouched
  });

  it('DB-003.2 — partial failure: stores 1-3 clear, failing store #4 preserves data', async () => {
    const ps = populated(3);
    const pr = populated(2);
    const cs = populated(4);
    const as = populated(5);
    const ks = populated(2);
    const ls = populated(1);

    as.addFault({ operation: 'clear', triggerOnCall: 1, errorType: 'UnknownError' });

    await expect(
      wipeAllData('WIPE_CONFIRMED', {
        patientsStore: ps as any, protocolStore: pr as any, configStore: cs as any,
        auditStore:    as as any, keysStore:    ks as any, logsStore:   ls as any,
      })
    ).rejects.toThrow();

    // Stores before the failed one were cleared
    expect(await ps.length()).toBe(0);
    expect(await pr.length()).toBe(0);
    expect(await cs.length()).toBe(0);
    // Failing store retains data
    expect(await as.length()).toBe(5);
  });

  it('DB-003.3 — second call after partial failure completes the wipe', async () => {
    const as = populated(5);
    as.addFault({ operation: 'clear', triggerOnCall: 1, errorType: 'UnknownError' });

    await wipeAllData('WIPE_CONFIRMED', { auditStore: as as any }).catch(() => {});
    expect(await as.length()).toBe(5); // still has data

    // Second call — no fault → succeeds
    await wipeAllData('WIPE_CONFIRMED', { auditStore: as as any });
    expect(await as.length()).toBe(0);
  });

  it('DB-003.4 — idempotency: wipeAllData on empty stores is a no-op', async () => {
    const ps = new FakeStore();
    expect(await ps.length()).toBe(0);

    await expect(
      wipeAllData('WIPE_CONFIRMED', { patientsStore: ps as any })
    ).resolves.toBeUndefined();

    expect(await ps.length()).toBe(0);
  });

  it('DB-003.5 — happy path: all stores cleared successfully', async () => {
    const s = {
      patientsStore: populated(3) as any,
      protocolStore: populated(2) as any,
      configStore:   populated(4) as any,
      auditStore:    populated(5) as any,
      keysStore:     populated(2) as any,
      logsStore:     populated(1) as any,
    };

    await wipeAllData('WIPE_CONFIRMED', s);

    for (const [name, store] of Object.entries(s)) {
      expect(await (store as FakeStore).length(), `${name} should be empty`).toBe(0);
    }
  });
});
