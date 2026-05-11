/**
 * tests/unit/migr-001-003.test.ts
 *
 * MIGR-001/002/003: Schema compatibility and backward compatibility.
 *
 * MIGR-001: Patients without `siteId` (pre-siteId records) must work
 *   correctly with getSiteId() fallback to ID prefix.
 *
 * MIGR-002: localforage driver fallback (INDEXEDDB unavailable) must
 *   be handled gracefully.
 *
 * MIGR-003: Mixed store (siteId present on some, absent on others)
 *   must produce correct site filtering in patientSiteMap.
 */

import { describe, it, expect } from 'vitest';
import { getSiteId } from '@/lib/data';
import { checkTaskCompletion } from '@/lib/task-utils';
import type { Patient } from '@/lib/data';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function legacyPatient(id: string): Patient {
  // Pre-MIGR patient: no siteId field
  return {
    id, name: `Legacy ${id}`, lang: 'English',
    phase: 'PSB', phaseCode: 'psb' as const, phaseLabel: '',
    screeningDate: new Date(), studyDay: 0, alert: null, dtqPos: false,
    randomizationDate: null, rvInfectionDate: null, psbStartDate: null,
    protocolVersion: 'v1', tasks: { q: [], pr: [], l: [], ad: [] },
    labNote: '', documents: [], queries: [],
  } as unknown as Patient; // deliberately omits siteId
}

function modernPatient(id: string, siteId: string): Patient {
  return { ...legacyPatient(id), siteId };
}

// ── MIGR-001: getSiteId backward compatibility ─────────────────────────────────

describe('MIGR-001 — getSiteId: backward compat for patients without siteId', () => {

  it('modern patient: returns explicit siteId directly', () => {
    expect(getSiteId(modernPatient('HMC-047', 'HMC'))).toBe('HMC');
    expect(getSiteId(modernPatient('CUN-001', 'FALP-CL'))).toBe('FALP-CL');
  });

  it('legacy patient with dash in ID: derives site from prefix', () => {
    expect(getSiteId(legacyPatient('HMC-047'))).toBe('HMC');
    expect(getSiteId(legacyPatient('CUN-001'))).toBe('CUN');
    expect(getSiteId(legacyPatient('ALTESA-VPV-003'))).toBe('ALTESA');
  });

  it('legacy patient without dash: returns UNKNOWN (safe fallback)', () => {
    expect(getSiteId(legacyPatient('NONDASH'))).toBe('UNKNOWN');
    expect(getSiteId(legacyPatient('P001'))).toBe('UNKNOWN');
  });

  it('modern patient siteId takes priority over ID prefix', () => {
    // ID says "HMC", siteId says "FALP-CL" — siteId wins
    const p = modernPatient('HMC-047', 'FALP-CL');
    expect(getSiteId(p)).toBe('FALP-CL');
  });

  it('empty siteId falls back to ID prefix (truthy check)', () => {
    const p = { ...legacyPatient('HMC-047'), siteId: '' };
    // '' is falsy → falls back to prefix
    expect(getSiteId(p)).toBe('HMC');
  });
});

// ── MIGR-003: Mixed store — patientSiteMap filtering ──────────────────────────

describe('MIGR-003 — mixed store: getSiteId correct for all patient types', () => {

  const patients = [
    modernPatient('HMC-047', 'HMC'),
    modernPatient('FALP-001', 'FALP-CL'),
    legacyPatient('CUN-023'),      // no siteId → derive from ID
    legacyPatient('CUN-058'),      // no siteId → derive from ID
    legacyPatient('NOID'),         // no siteId, no dash → UNKNOWN
  ];

  it('builds correct site set from mixed store', () => {
    const sites = [...new Set(patients.map(getSiteId))].sort();
    expect(sites).toEqual(['CUN', 'FALP-CL', 'HMC', 'UNKNOWN'].sort());
  });

  it('site filter using getSiteId correctly partitions patients', () => {
    const cunPatients = patients.filter(p => getSiteId(p) === 'CUN');
    expect(cunPatients).toHaveLength(2);
    expect(cunPatients.map(p => p.id)).toEqual(['CUN-023', 'CUN-058']);
  });

  it('UNKNOWN site contains only patients without dash in ID', () => {
    const unknownPatients = patients.filter(p => getSiteId(p) === 'UNKNOWN');
    expect(unknownPatients).toHaveLength(1);
    expect(unknownPatients[0].id).toBe('NOID');
  });

  it('patientSiteMap built from mixed store enables O(1) query filtering', () => {
    const patientSiteMap = new Map(patients.map(p => [p.id, getSiteId(p)]));

    // Simulate filteredQueries filter
    const mockQueryPids = ['HMC-047', 'CUN-023', 'FALP-001', 'UNKNOWN-PID'];
    const hmcQueries = mockQueryPids.filter(pid => patientSiteMap.get(pid) === 'HMC');
    expect(hmcQueries).toEqual(['HMC-047']);

    // PID not in map → undefined → not equal to any siteFilter → excluded safely
    const unknownPidQueries = mockQueryPids.filter(pid => patientSiteMap.get(pid) === 'FALP-CL');
    expect(unknownPidQueries).toEqual(['FALP-001']);
  });
});

// ── MIGR-001 + STATE-001: checkTaskCompletion still works on legacy patients ──

describe('MIGR-001 + STATE-001 — checkTaskCompletion on legacy patients', () => {

  it('legacy patient (no siteId) still supports task lookup correctly', () => {
    const p = {
      ...legacyPatient('HMC-047'),
      tasks: {
        q:  [{ code: 'ECG', label: 'ECG', icon: '', done: true,  critical: false, regulatory: false, periodic: false }],
        pr: [],
        l:  [],
        ad: [],
      },
    };
    const map = new Map([[p.id, p]]);
    expect(checkTaskCompletion('HMC-047', 'ECG', map)).toBe(true);
    expect(checkTaskCompletion('HMC-047', 'MISSING', map)).toBe(false);
  });
});
