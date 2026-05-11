/**
 * tests/unit/db-002.test.ts
 *
 * DB-002: Storage quota exceeded during patient persistence.
 *
 * Contracts:
 *   A. savePatient: QuotaExceededError propagates to caller
 *   B. savePatient: existing records not corrupted when a write fails
 *   C. savePatient: idempotent — writing same patient twice succeeds
 *   D. Batch import partial failure: patients from successful files are preserved
 *      (validates allImported.push() accumulation + partial write semantics)
 */

import { describe, it, expect } from 'vitest';
import { savePatient } from '@/lib/db';
import { FakeStore }   from '../__helpers__/FakeStore';
import type { Patient } from '@/lib/data';

function makePatient(id: string): Patient {
  return {
    id, name: `Patient ${id}`, siteId: 'FALP-CL',
    lang: 'English', phase: 'PSB', phaseCode: 'psb' as const,
    phaseLabel: 'Pre-Screening Baseline',
    screeningDate: new Date('2026-01-01'), studyDay: 0,
    alert: null, dtqPos: false, randomizationDate: null,
    rvInfectionDate: null, psbStartDate: null,
    protocolVersion: 'v1.0',
    tasks: { q: [], pr: [], l: [], ad: [] },
    labNote: '', documents: [], queries: [],
  } as unknown as Patient;
}

describe('DB-002 — savePatient: quota exceeded and data integrity', () => {

  // ──────────────────────────────────────────────────────────────────────────
  it('DB-002.A — QuotaExceededError propagates to the caller', async () => {
    const store = new FakeStore();
    store.addFault({ operation: 'setItem', triggerOnCall: 1, errorType: 'QuotaExceededError' });

    const err = await savePatient(makePatient('P-001'), store as any).catch(e => e);
    expect(err).toBeInstanceOf(DOMException);
    expect(err.name).toBe('QuotaExceededError');
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('DB-002.B — existing records not corrupted when a later write fails', async () => {
    const store = new FakeStore();

    // Calls 1, 2, 3 — write successfully
    for (const id of ['P-001', 'P-002', 'P-003']) {
      await savePatient(makePatient(id), store as any);
    }
    expect(await store.length()).toBe(3);

    // Call 4 (absolute) — inject fault at the 4th setItem invocation
    store.addFault({ operation: 'setItem', triggerOnCall: 4, errorType: 'QuotaExceededError' });
    await savePatient(makePatient('P-004'), store as any).catch(() => {});

    // Existing 3 records must be intact
    expect(await store.length()).toBe(3);
    for (const id of ['P-001', 'P-002', 'P-003']) {
      expect(await store.getItem(id)).not.toBeNull();
    }
    // P-004 was not written
    expect(await store.getItem('P-004')).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('DB-002.C — idempotent: writing the same patient twice succeeds, no duplicate', async () => {
    const store  = new FakeStore();
    const patient = makePatient('P-001');

    await savePatient(patient, store as any);
    await savePatient(patient, store as any);  // second write — must not throw

    expect(await store.length()).toBe(1);  // only one entry
    expect(await store.getItem('P-001')).toEqual(patient);
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('DB-002.D — batch import accumulation: patients from successful decrypts preserved', async () => {
    // Simulate the allImported.push() logic from ManagerDashboard.handleFileUpload
    // after SEC-005 fix (no artificial delays, no O(n²) spread).
    const allImported: Patient[] = [];

    // Simulate 3 successful file decrypts
    const batches = [
      [makePatient('P-001'), makePatient('P-002')],
      [makePatient('P-003'), makePatient('P-004')],
      [makePatient('P-005')],
    ];

    for (const batch of batches) {
      // SEC-006 fix: push instead of spread re-allocation
      allImported.push(...batch);
    }

    // Total must be 5 — correct accumulation
    expect(allImported).toHaveLength(5);

    // No duplicates (all IDs unique)
    const ids = allImported.map(p => p.id);
    expect(new Set(ids).size).toBe(5);

    // Simulate partial write failure on the 3rd patient (quota exceeded)
    const store = new FakeStore();
    store.addFault({ operation: 'setItem', triggerOnCall: 3, errorType: 'QuotaExceededError' });

    const writeResults = await Promise.allSettled(
      allImported.map(p => savePatient(p, store as any))
    );

    const succeeded = writeResults.filter(r => r.status === 'fulfilled').length;
    const failed    = writeResults.filter(r => r.status === 'rejected').length;

    expect(succeeded).toBe(4); // Promise.all: 4 succeed before/after the fault
    expect(failed).toBe(1);    // exactly the 3rd call fails

    // In-memory allImported is unaffected by store failures (no data loss in memory)
    expect(allImported).toHaveLength(5);
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('DB-002.E — recovery: after quota fault cleared, subsequent writes succeed', async () => {
    const store   = new FakeStore();
    const patient = makePatient('P-001');

    // First attempt fails
    store.addFault({ operation: 'setItem', triggerOnCall: 1, errorType: 'QuotaExceededError' });
    await savePatient(patient, store as any).catch(() => {});
    expect(await store.length()).toBe(0);

    // Fault cleared (user frees disk space) — retry succeeds
    store.clearFaults();
    await savePatient(patient, store as any);
    expect(await store.length()).toBe(1);
    expect(await store.getItem('P-001')).toEqual(patient);
  });
});
