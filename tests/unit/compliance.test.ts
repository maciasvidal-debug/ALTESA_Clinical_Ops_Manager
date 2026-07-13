/**
 * tests/unit/compliance.test.ts
 *
 * Compliance auto-detection (Phase 2) — replaces the workbook's hand-typed
 * Pt_Thread_Compliance fall-out / recovery dates.
 *
 *   CMP-001  rollingAdherence — trailing window ratio, null on empty window
 *   CMP-002  detectComplianceWindows — fall-out, recovery, open window, nadir
 *   CMP-003  threshold + null-ratio neutrality
 *   CMP-004  deriveCumulativeAdherence — from psbRecords vs PSB days
 *   CMP-005  isBelowAdherence / autoNonCompliantIds
 */

import { describe, it, expect } from 'vitest';
import {
  rollingAdherence,
  detectComplianceWindows,
  deriveCumulativeAdherence,
  isBelowAdherence,
  autoNonCompliantIds,
  ADHERENCE_THRESHOLD,
  type AdherenceSample,
} from '@/lib/compliance';
import type { Patient } from '@/lib/data';
import { addDays, getToday } from '@/lib/data';

// full-adherence day / missed day helpers
const day = (d: string, submitted: number, expected = 1): AdherenceSample => ({ date: d, expected, submitted });

function patient(o: Partial<Patient> = {}): Patient {
  return {
    id: 'P1', name: 'T', phase: 'PSB', phaseCode: 'psb', phaseLabel: '',
    loc: '', lang: 'English', alert: null,
    screeningDate: addDays(getToday(), -100), psbStartDate: addDays(getToday(), -100),
    tasks: { q: [], pr: [], l: [], ad: [] },
    ers: [], psb: null, psbRecords: 0, nextVisit: getToday(), nextVisitLabel: '',
    documents: [], ...o,
  } as Patient;
}

// ── CMP-001 ───────────────────────────────────────────────────────────────────

describe('CMP-001 — rollingAdherence', () => {
  it('CMP-001.1 — trailing window of size 3', () => {
    const s = [day('2026-06-01', 1), day('2026-06-02', 0), day('2026-06-03', 0), day('2026-06-04', 1)];
    const r = rollingAdherence(s, 3);
    expect(r[0].ratio).toBe(1);          // [1/1]
    expect(r[1].ratio).toBe(0.5);        // [1,0]/2
    expect(r[2].ratio).toBeCloseTo(1 / 3); // [1,0,0]/3
    expect(r[3].ratio).toBeCloseTo(1 / 3); // [0,0,1]/3
  });

  it('CMP-001.2 — a window with zero expected yields null, not 0', () => {
    const r = rollingAdherence([day('2026-06-01', 0, 0)], 7);
    expect(r[0].ratio).toBeNull();
  });

  it('CMP-001.3 — samples are sorted chronologically before windowing', () => {
    const r = rollingAdherence([day('2026-06-03', 1), day('2026-06-01', 0)], 7);
    expect(r[0].date).toBe('2026-06-01');
    expect(r[1].date).toBe('2026-06-03');
  });
});

// ── CMP-002 ───────────────────────────────────────────────────────────────────

describe('CMP-002 — detectComplianceWindows', () => {
  it('CMP-002.1 — a dip below 80% then recovery is one closed window', () => {
    // window=1 so each day is its own ratio
    const s = [
      day('2026-06-01', 1), day('2026-06-02', 1),
      day('2026-06-03', 0), day('2026-06-04', 0), // below
      day('2026-06-05', 1), day('2026-06-06', 1), // recovered
    ];
    const w = detectComplianceWindows(s, { windowDays: 1 });
    expect(w).toHaveLength(1);
    expect(w[0].fellOutDate).toBe('2026-06-03');
    expect(w[0].returnedDate).toBe('2026-06-05');
    expect(w[0].nadir).toBe(0);
  });

  it('CMP-002.2 — still below at end of stream ⇒ open window (no returnedDate)', () => {
    const s = [day('2026-06-01', 1), day('2026-06-02', 0), day('2026-06-03', 0)];
    const w = detectComplianceWindows(s, { windowDays: 1 });
    expect(w).toHaveLength(1);
    expect(w[0].returnedDate).toBeUndefined();
  });

  it('CMP-002.3 — a stream that never dips yields no windows (correct, not a gap)', () => {
    const s = [day('2026-06-01', 1), day('2026-06-02', 1), day('2026-06-03', 1)];
    expect(detectComplianceWindows(s, { windowDays: 1 })).toEqual([]);
  });

  it('CMP-002.4 — two separate dips yield two windows', () => {
    const s = [
      day('2026-06-01', 0), day('2026-06-02', 1),
      day('2026-06-03', 0), day('2026-06-04', 1),
    ];
    expect(detectComplianceWindows(s, { windowDays: 1 })).toHaveLength(2);
  });
});

// ── CMP-003 ───────────────────────────────────────────────────────────────────

describe('CMP-003 — threshold + null neutrality', () => {
  it('CMP-003.1 — custom threshold changes what counts as a dip', () => {
    const s = [day('2026-06-01', 1, 2)]; // ratio 0.5
    expect(detectComplianceWindows(s, { windowDays: 1, threshold: 0.4 })).toHaveLength(0);
    expect(detectComplianceWindows(s, { windowDays: 1, threshold: 0.6 })).toHaveLength(1);
  });

  it('CMP-003.2 — null-ratio days neither open nor close a window', () => {
    const s = [day('2026-06-01', 0), day('2026-06-02', 0, 0), day('2026-06-03', 1)];
    const w = detectComplianceWindows(s, { windowDays: 1 });
    expect(w).toHaveLength(1);
    expect(w[0].fellOutDate).toBe('2026-06-01');
    expect(w[0].returnedDate).toBe('2026-06-03'); // the null day in between is neutral
  });
});

// ── CMP-004 ───────────────────────────────────────────────────────────────────

describe('CMP-004 — deriveCumulativeAdherence', () => {
  it('CMP-004.1 — ratio = records / days-in-PSB, clamped to 1', () => {
    const p = patient({ psbStartDate: addDays(getToday(), -99), psbRecords: 50 }); // ~100 expected
    const est = deriveCumulativeAdherence(p)!;
    expect(est.expected).toBe(100);
    expect(est.actual).toBe(50);
    expect(est.ratio).toBeCloseTo(0.5);
  });

  it('CMP-004.2 — over-full records clamp to ratio 1', () => {
    const p = patient({ psbStartDate: addDays(getToday(), -9), psbRecords: 999 });
    expect(deriveCumulativeAdherence(p)!.ratio).toBe(1);
  });

  it('CMP-004.3 — no PSB baseline ⇒ null (screening patient)', () => {
    const p = patient({ psbStartDate: undefined });
    expect(deriveCumulativeAdherence(p)).toBeNull();
  });

  it('CMP-004.4 — symptomatic patient measured to RV onset, not today', () => {
    const p = patient({
      psbStartDate: addDays(getToday(), -100),
      rvInfectionDate: addDays(getToday(), -50), // baseline ends 50d ago → ~51 expected
      psbRecords: 51,
    });
    const est = deriveCumulativeAdherence(p)!;
    expect(est.expected).toBe(51);
    expect(est.ratio).toBe(1);
  });
});

// ── CMP-005 ───────────────────────────────────────────────────────────────────

describe('CMP-005 — isBelowAdherence / autoNonCompliantIds', () => {
  it('CMP-005.1 — below threshold flagged, at/above not', () => {
    const low = patient({ id: 'LOW', psbStartDate: addDays(getToday(), -99), psbRecords: 40 }); // 0.40
    const ok = patient({ id: 'OK', psbStartDate: addDays(getToday(), -99), psbRecords: 95 });   // 0.95
    expect(isBelowAdherence(low)).toBe(true);
    expect(isBelowAdherence(ok)).toBe(false);
    const ids = autoNonCompliantIds([low, ok]);
    expect([...ids]).toEqual(['LOW']);
  });

  it('CMP-005.2 — screening patients (no baseline) are never flagged', () => {
    const scr = patient({ id: 'SCR', psbStartDate: undefined });
    expect(autoNonCompliantIds([scr]).size).toBe(0);
  });

  it('CMP-005.3 — threshold constant is 0.8', () => {
    expect(ADHERENCE_THRESHOLD).toBe(0.8);
  });
});
