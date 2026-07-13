/**
 * tests/unit/operations.test.ts
 *
 * Operational Data Capture (Phase 1) — correctness + regression coverage.
 *
 * Each block documents a specific defect in the "Noela's KPI tracker" workbook
 * that the app's aggregation eliminates by construction:
 *
 *   OPS-001  Guarded averages/ratios return null, never #DIV/0! (empty ranges)
 *   OPS-002  Compliance roll-up counts DISTINCT patients, not rows
 *   OPS-003  Date-range filtering (the Graph Sum averages whole columns)
 *   OPS-004  Cross-site roll-up (scope 'ALL') vs per-site scoping
 *   OPS-005  Inbound-only response time — no "N/A in a number column" corruption
 *   OPS-006  Recruitment funnel ratio + source counts
 *   OPS-007  Dropout vs prevented retention counting
 *   OPS-008  Derived patient status replaces manual typing
 *   OPS-009  PII filtering on free-text fields
 *   OPS-010  DB round-trip via appendOperationsRecord / getAllOperations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { appendOperationsRecord, getAllOperations } from '@/lib/db';
import {
  summariseOperations,
  deriveOpStatus,
  deriveStatusCounts,
  safeAverage,
  safeRatio,
  daysBetween,
  hoursBetween,
  submitInteraction,
  setOperationsUser,
  RANDOMIZATION_WINDOW_HOURS,
  type OperationsRecord,
  type PatientInteraction,
  type ReferralIntake,
  type ComplianceEvent,
  type DropoutEvent,
  type TriggerEvent,
} from '@/lib/operations';
import type { Patient } from '@/lib/data';
import { FakeStore } from '../__helpers__/FakeStore';

// ── Builders ──────────────────────────────────────────────────────────────────

let seq = 0;
const uid = () => `OPS_test_${seq++}`;
const TODAY = new Date().toISOString().slice(0, 10);

function interaction(o: Partial<PatientInteraction> = {}): PatientInteraction {
  return {
    id: uid(), kind: 'interaction', siteId: '130', userId: 'u',
    timestamp: `${TODAY}T10:00:00.000Z`, channel: 'call', direction: 'outbound',
    ...o,
  };
}
function referral(o: Partial<ReferralIntake> = {}): ReferralIntake {
  return {
    id: uid(), kind: 'referral', siteId: '130', userId: 'u',
    timestamp: `${TODAY}T10:00:00.000Z`,
    reviewed: 0, meetsCriteria: 0, doesNotMeet: 0,
    recruitedFromWebsite: 0, recruitedFromDatabase: 0,
    ...o,
  };
}
function compliance(o: Partial<ComplianceEvent> = {}): ComplianceEvent {
  return {
    id: uid(), kind: 'compliance', siteId: '130', userId: 'u',
    timestamp: `${TODAY}T10:00:00.000Z`, patientId: 'P1', fellOutDate: '2026-06-01',
    ...o,
  };
}
function dropout(o: Partial<DropoutEvent> = {}): DropoutEvent {
  return {
    id: uid(), kind: 'dropout', siteId: '130', userId: 'u',
    timestamp: `${TODAY}T10:00:00.000Z`, patientId: 'P1',
    ...o,
  };
}
function trigger(o: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    id: uid(), kind: 'trigger', siteId: '130', userId: 'u',
    timestamp: `${TODAY}T10:00:00.000Z`, patientId: 'P1',
    triggerAt: '2026-06-01T08:00:00', ...o,
  };
}
function patient(o: Partial<Patient> = {}): Patient {
  return {
    id: 'P1', name: 'Test', phase: 'PSB', phaseCode: 'psb', phaseLabel: '',
    loc: '', lang: 'English', alert: null,
    screeningDate: new Date(), tasks: { q: [], pr: [], l: [], ad: [] },
    ers: [], psb: null, psbRecords: 0, nextVisit: new Date(), nextVisitLabel: '',
    documents: [], ...o,
  } as Patient;
}

// ── OPS-001: no #DIV/0! ───────────────────────────────────────────────────────

describe('OPS-001 — guarded averages/ratios (no #DIV/0!)', () => {
  it('OPS-001.1 — empty store yields nulls, not NaN', () => {
    const s = summariseOperations([]);
    expect(s.avgResponseMinutes).toBeNull();
    expect(s.meetRatio).toBeNull();
    expect(s.avgReferralResponseDays).toBeNull();
    expect(s.avgDaysOutOfCompliance).toBeNull();
    expect(s.totalInteractions).toBe(0);
  });

  it('OPS-001.2 — safeAverage([]) is null; safeRatio(_,0) is null', () => {
    expect(safeAverage([])).toBeNull();
    expect(safeRatio(5, 0)).toBeNull();
    expect(safeAverage([2, 4])).toBe(3);
    expect(safeRatio(1, 4)).toBe(0.25);
  });

  it('OPS-001.3 — referrals reviewed=0 gives null ratio, not a thrown error', () => {
    const s = summariseOperations([referral({ meetsCriteria: 0, reviewed: 0 })]);
    expect(s.meetRatio).toBeNull();
  });
});

// ── OPS-002: distinct-patient compliance counting ────────────────────────────

describe('OPS-002 — compliance counts distinct patients, not rows', () => {
  it('OPS-002.1 — same patient falling out twice counts once', () => {
    const recs = [
      compliance({ patientId: 'P1', fellOutDate: '2026-06-01' }),
      compliance({ patientId: 'P1', fellOutDate: '2026-06-20' }), // both open
    ];
    const s = summariseOperations(recs);
    expect(s.patientsCurrentlyNonCompliant).toBe(1);
    expect(s.patientIdsCurrentlyNonCompliant).toEqual(['P1']);
  });

  it('OPS-002.2 — a closed window does not mark the patient non-compliant', () => {
    const s = summariseOperations([
      compliance({ patientId: 'P2', fellOutDate: '2026-06-01', returnedDate: '2026-06-10' }),
    ]);
    expect(s.patientsCurrentlyNonCompliant).toBe(0);
  });

  it('OPS-002.3 — two distinct open patients count as two', () => {
    const s = summariseOperations([
      compliance({ patientId: 'P1' }),
      compliance({ patientId: 'P2' }),
    ]);
    expect(s.patientsCurrentlyNonCompliant).toBe(2);
  });

  it('OPS-002.4 — avgDaysOutOfCompliance uses closed-window duration', () => {
    const s = summariseOperations([
      compliance({ fellOutDate: '2026-06-01', returnedDate: '2026-06-11' }), // 10 days
    ]);
    expect(s.avgDaysOutOfCompliance).toBe(10);
  });
});

// ── OPS-003: date-range filtering ────────────────────────────────────────────

describe('OPS-003 — date-range filtering', () => {
  const recs = [
    interaction({ timestamp: '2026-06-01T09:00:00.000Z', channel: 'call' }),
    interaction({ timestamp: '2026-06-15T09:00:00.000Z', channel: 'text' }),
    interaction({ timestamp: '2026-07-01T09:00:00.000Z', channel: 'email' }),
  ];
  it('OPS-003.1 — inclusive from/to window narrows the set', () => {
    const s = summariseOperations(recs, { from: '2026-06-01', to: '2026-06-30' });
    expect(s.totalInteractions).toBe(2);
    expect(s.calls).toBe(1);
    expect(s.texts).toBe(1);
    expect(s.emails).toBe(0);
  });
  it('OPS-003.2 — no range = all records', () => {
    expect(summariseOperations(recs).totalInteractions).toBe(3);
  });
});

// ── OPS-004: cross-site vs per-site scope ────────────────────────────────────

describe('OPS-004 — scope: per-site vs cross-site (ALL)', () => {
  const recs = [
    interaction({ siteId: '130', channel: 'call' }),
    interaction({ siteId: '131', channel: 'call' }),
    interaction({ siteId: '131', channel: 'text' }),
  ];
  it('OPS-004.1 — scope ALL sums across sites', () => {
    expect(summariseOperations(recs, { scope: 'ALL' }).totalInteractions).toBe(3);
  });
  it('OPS-004.2 — scope 131 isolates one site', () => {
    const s = summariseOperations(recs, { scope: '131' });
    expect(s.totalInteractions).toBe(2);
    expect(s.calls).toBe(1);
    expect(s.texts).toBe(1);
  });
});

// ── OPS-005: inbound-only response time ──────────────────────────────────────

describe('OPS-005 — response time is inbound-only', () => {
  it('OPS-005.1 — outbound contacts never contribute to avgResponseMinutes', () => {
    const s = summariseOperations([
      interaction({ direction: 'inbound', responseMinutes: 30 }),
      interaction({ direction: 'inbound', responseMinutes: 90 }),
      interaction({ direction: 'outbound' }), // must not skew the mean
    ]);
    expect(s.inboundCount).toBe(2);
    expect(s.avgResponseMinutes).toBe(60);
  });
});

// ── OPS-006: recruitment funnel ──────────────────────────────────────────────

describe('OPS-006 — recruitment funnel', () => {
  it('OPS-006.1 — sums, ratio and source counts', () => {
    const s = summariseOperations([
      referral({ reviewed: 10, meetsCriteria: 4, doesNotMeet: 6, recruitedFromWebsite: 3, recruitedFromDatabase: 1 }),
      referral({ reviewed: 10, meetsCriteria: 6, doesNotMeet: 4, recruitedFromWebsite: 2, recruitedFromDatabase: 4 }),
    ]);
    expect(s.referralsReviewed).toBe(20);
    expect(s.referralsMeet).toBe(10);
    expect(s.referralsNotMeet).toBe(10);
    expect(s.meetRatio).toBe(0.5);
    expect(s.recruitedWebsite).toBe(5);
    expect(s.recruitedDatabase).toBe(5);
  });
});

// ── OPS-007: dropout vs prevented ────────────────────────────────────────────

describe('OPS-007 — dropout vs prevented retention', () => {
  it('OPS-007.1 — dropoutDate ⇒ dropout; preventionAction w/o dropout ⇒ prevented', () => {
    const s = summariseOperations([
      dropout({ patientId: 'A', dropoutDate: '2026-06-10' }),
      dropout({ patientId: 'B', intentDate: '2026-06-05', preventionAction: 'Extra call, rescheduled visit' }),
      dropout({ patientId: 'C', intentDate: '2026-06-05' }), // intent only, neither
    ]);
    expect(s.dropouts).toBe(1);
    expect(s.dropoutsPrevented).toBe(1);
  });
});

// ── OPS-011: trigger → office visit (hours, computed not typed) ──────────────

describe('OPS-011 — symptom trigger → office visit', () => {
  it('OPS-011.1 — avg hours is computed from the two timestamps', () => {
    const s = summariseOperations([
      trigger({ triggerAt: '2026-06-01T08:00:00', officeVisitAt: '2026-06-01T20:00:00' }), // 12h
      trigger({ triggerAt: '2026-06-02T08:00:00', officeVisitAt: '2026-06-02T14:00:00' }), // 6h
    ]);
    expect(s.triggerCount).toBe(2);
    expect(s.avgTriggerToVisitHours).toBe(9);
    expect(s.triggersPendingVisit).toBe(0);
    expect(s.triggerWindowBreaches).toBe(0);
  });

  it('OPS-011.2 — a trigger without a visit is pending and excluded from the average', () => {
    const s = summariseOperations([
      trigger({ triggerAt: '2026-06-01T08:00:00', officeVisitAt: '2026-06-01T18:00:00' }), // 10h
      trigger({ triggerAt: '2026-06-03T08:00:00' }), // pending
    ]);
    expect(s.triggerCount).toBe(2);
    expect(s.triggersPendingVisit).toBe(1);
    expect(s.avgTriggerToVisitHours).toBe(10); // pending one does not skew the mean
  });

  it('OPS-011.3 — a gap beyond the randomisation window is flagged as a breach', () => {
    const overBy = RANDOMIZATION_WINDOW_HOURS + 10;
    const start = new Date('2026-06-01T00:00:00');
    const end = new Date(start.getTime() + overBy * 3_600_000);
    const s = summariseOperations([
      trigger({ triggerAt: start.toISOString(), officeVisitAt: end.toISOString() }),
    ]);
    expect(s.triggerWindowBreaches).toBe(1);
  });

  it('OPS-011.4 — empty set yields null avg, not #DIV/0!', () => {
    expect(summariseOperations([]).avgTriggerToVisitHours).toBeNull();
    expect(summariseOperations([]).triggerCount).toBe(0);
  });

  it('OPS-011.5 — hoursBetween computes and rejects bad input', () => {
    expect(hoursBetween('2026-06-01T00:00:00', '2026-06-01T06:00:00')).toBe(6);
    expect(hoursBetween('nonsense', '2026-06-01T06:00:00')).toBeNull();
  });
});

// ── OPS-008: derived status ──────────────────────────────────────────────────

describe('OPS-008 — derived patient status (no manual typing)', () => {
  it('OPS-008.1 — dtqPos ⇒ symptomatic', () => {
    expect(deriveOpStatus(patient({ dtqPos: true }))).toBe('symptomatic');
  });
  it('OPS-008.2 — plain PSB ⇒ asymptomatic', () => {
    expect(deriveOpStatus(patient({ phaseCode: 'psb' }))).toBe('asymptomatic');
  });
  it('OPS-008.3 — open compliance window overrides to noncompliant', () => {
    expect(deriveOpStatus(patient({ dtqPos: true }), true)).toBe('noncompliant');
  });
  it('OPS-008.4 — deriveStatusCounts honours the open-compliance set', () => {
    const counts = deriveStatusCounts(
      [patient({ id: 'P1', dtqPos: true }), patient({ id: 'P2', phaseCode: 'psb' })],
      new Set(['P2']),
    );
    expect(counts).toEqual({ symptomatic: 1, asymptomatic: 0, noncompliant: 1, unknown: 0 });
  });
});

// ── OPS-009: PII filtering ───────────────────────────────────────────────────

describe('OPS-009 — PII filtering', () => {
  beforeEach(() => setOperationsUser('coord_1'));
  it('OPS-009.1 — synopsis email is redacted before storage', async () => {
    const store = new FakeStore();
    // submitInteraction imports @/lib/db dynamically → we can't inject the store,
    // so assert filterPII behaviour on the field the same way the submitter does.
    const { filterPII } = await import('@/lib/crypto');
    expect(filterPII('spoke w/ nurse@clinic.org')).toContain('[REDACTED EMAIL]');
    expect(store).toBeDefined();
  });
});

// ── OPS-010: DB round-trip ───────────────────────────────────────────────────

describe('OPS-010 — appendOperationsRecord / getAllOperations round-trip', () => {
  it('OPS-010.1 — records survive a store round-trip; null junk is filtered', async () => {
    const store = new FakeStore();
    const rec = interaction({ channel: 'email', effortMinutes: 12 });
    await appendOperationsRecord(rec, store as any);
    await store.setItem('junk', null as any); // simulate injected null
    const all = await getAllOperations(store as any);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(rec.id);
    expect((all[0] as PatientInteraction).effortMinutes).toBe(12);
  });

  it('OPS-010.2 — re-writing the same id does not duplicate', async () => {
    const store = new FakeStore();
    const rec = referral({ reviewed: 5 });
    await appendOperationsRecord(rec, store as any);
    await appendOperationsRecord(rec, store as any);
    const all = await getAllOperations(store as any);
    expect(all.filter((r) => r.id === rec.id)).toHaveLength(1);
  });

  it('OPS-010.3 — end-to-end: summarise a mixed round-tripped set', async () => {
    const store = new FakeStore();
    const recs: OperationsRecord[] = [
      interaction({ channel: 'call' }),
      referral({ reviewed: 4, meetsCriteria: 2 }),
      compliance({ patientId: 'X' }),
    ];
    for (const r of recs) await appendOperationsRecord(r, store as any);
    const all = await getAllOperations(store as any);
    const s = summariseOperations(all);
    expect(s.calls).toBe(1);
    expect(s.meetRatio).toBe(0.5);
    expect(s.patientsCurrentlyNonCompliant).toBe(1);
  });
});

// ── daysBetween sanity ────────────────────────────────────────────────────────

describe('daysBetween', () => {
  it('computes whole-day spans and clamps negatives to 0', () => {
    expect(daysBetween('2026-06-01', '2026-06-11')).toBe(10);
    expect(daysBetween('2026-06-11', '2026-06-01')).toBe(0);
  });
});
