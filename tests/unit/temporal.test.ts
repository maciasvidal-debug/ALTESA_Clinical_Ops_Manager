/**
 * tests/unit/temporal.test.ts
 *
 * Regression suite for TIMELINE-001 — visual timeline misalignment.
 *
 * Guards the central temporal module against:
 *   • PSB week labels computed from screening anchor (off by ~2 weeks)
 *   • Tx Day labels using days-since-screening instead of days-since-randomisation
 *   • Rescreening patients clamped to the SCR segment of the timeline bar
 *   • De novo (newly-enrolled) patients showing Week 0 / negative day
 *   • Marker position (getTimelineMarkerPct) drifting from SoA-correct day
 */

import { describe, it, expect } from 'vitest';
import {
  getStudyDay, getPSBDay, getPSBWeek, getRVDay, getRVOnsetDay,
  getProtocolDayLabel, getProtocolPhaseLabel,
  getTimelineMarkerPct, getRescreeningStatus,
  PHASE_PCT,
} from '@/lib/temporal';
import { addDays, getToday, type Patient } from '@/lib/data';

function makePatient(overrides: Partial<Patient> = {}): Patient {
  const today = getToday();
  return {
    id: 'TEMP-000',
    siteId: 'TEMP',
    name: 'Temporal Test',
    phase: 'PSB',
    phaseCode: 'psb',
    phaseLabel: 'Test',
    loc: 'CLINIC',
    lang: 'English',
    alert: null,
    screeningDate: addDays(today, -21),
    psbStartDate: addDays(today, -14),
    tasks: { q: [], pr: [], l: [], ad: [] },
    ers: [],
    psb: null,
    psbRecords: 0,
    nextVisit: today,
    nextVisitLabel: 'Test',
    documents: [],
    ...overrides,
  } as Patient;
}

// ─── Atomic day/week counters ─────────────────────────────────────────────────

describe('TEMPORAL-DAY — phase-anchored day counters', () => {
  const today = getToday();

  it('getStudyDay = days from screeningDate', () => {
    const p = makePatient({ screeningDate: addDays(today, -10) });
    expect(getStudyDay(p)).toBe(10);
  });

  it('getStudyDay returns 0 on the day of screening (de novo)', () => {
    const p = makePatient({ screeningDate: today });
    expect(getStudyDay(p)).toBe(0);
  });

  it('getPSBDay = 1 on the day PSB starts (SoA convention: Day 1 = psbStartDate)', () => {
    const p = makePatient({ psbStartDate: today });
    expect(getPSBDay(p)).toBe(1);
  });

  it('getPSBDay = 7 at the end of PSB Week 1', () => {
    const p = makePatient({ psbStartDate: addDays(today, -6) });
    expect(getPSBDay(p)).toBe(7);
  });

  it('getPSBDay = 8 at the start of PSB Week 2', () => {
    const p = makePatient({ psbStartDate: addDays(today, -7) });
    expect(getPSBDay(p)).toBe(8);
  });

  it('getPSBWeek = 1 throughout days 1-7 (de novo PSB patient)', () => {
    for (let d = 0; d <= 6; d++) {
      const p = makePatient({ psbStartDate: addDays(today, -d) });
      expect(getPSBWeek(p), `day ${d + 1}`).toBe(1);
    }
  });

  it('getPSBWeek = 2 on day 8 (boundary)', () => {
    const p = makePatient({ psbStartDate: addDays(today, -7) });
    expect(getPSBWeek(p)).toBe(2);
  });

  it('getPSBWeek = 4 on day 28 (matches PSB_W4_BLOCK estimateVisitDate)', () => {
    const p = makePatient({ psbStartDate: addDays(today, -27) });
    expect(getPSBWeek(p)).toBe(4);
  });

  it('getRVDay = 1 on randomisation day', () => {
    const p = makePatient({ phaseCode: 'tx', randomizationDate: today });
    expect(getRVDay(p)).toBe(1);
  });

  it('getRVDay = 7 on Treatment Day 7', () => {
    const p = makePatient({ phaseCode: 'tx', randomizationDate: addDays(today, -6) });
    expect(getRVDay(p)).toBe(7);
  });

  it('getRVDay = 42 on Day 42 / EOS', () => {
    const p = makePatient({ phaseCode: 'fu', randomizationDate: addDays(today, -41) });
    expect(getRVDay(p)).toBe(42);
  });

  it('getRVOnsetDay = 0 on the day DTQ turns positive', () => {
    const p = makePatient({ phaseCode: 'psb', dtqPos: true, rvInfectionDate: today });
    expect(getRVOnsetDay(p)).toBe(0);
  });

  it('returns null when the relevant anchor is missing', () => {
    expect(getPSBDay(makePatient({ psbStartDate: undefined }))).toBeNull();
    expect(getRVDay(makePatient({ randomizationDate: undefined }))).toBeNull();
  });
});

// ─── Critical regression: SoA-anchored labels ─────────────────────────────────
// This block exists to catch the legacy bug where
//   "PSB W" + Math.floor(studyDay / 7)
// was used instead of getPSBWeek(). studyDay is days-since-screening, which
// silently shifts the PSB week by however many days the screening period took.

describe('TIMELINE-001 — PSB Week label must use PSB anchor, not screening anchor', () => {
  const today = getToday();

  it('Patient screened 14 days ago, PSB started today → PSB Week 1 (not Week 2)', () => {
    const p = makePatient({
      screeningDate: addDays(today, -14),
      psbStartDate: today,
    });
    // Legacy bug: Math.floor(14 / 7) = 2 → "PSB W2"
    // Correct:    getPSBWeek = 1
    expect(getPSBWeek(p)).toBe(1);
    expect(getProtocolDayLabel(p)).toMatch(/PSB W1 · D1/);
  });

  it('Patient screened 21 days ago, PSB started 7 days ago → PSB Week 2', () => {
    const p = makePatient({
      screeningDate: addDays(today, -21),
      psbStartDate: addDays(today, -7),
    });
    expect(getPSBWeek(p)).toBe(2);
  });

  it('Patient screened 35 days ago, PSB started 21 days ago → PSB Week 4', () => {
    const p = makePatient({
      screeningDate: addDays(today, -35),
      psbStartDate: addDays(today, -21),
    });
    expect(getPSBWeek(p)).toBe(4);
  });
});

describe('TIMELINE-001 — Tx Day label must use randomisation anchor', () => {
  const today = getToday();

  it('Patient screened 140 days ago, randomised 6 days ago → Tx D7 (not Tx D147)', () => {
    const p = makePatient({
      phaseCode: 'tx',
      screeningDate: addDays(today, -140),
      psbStartDate: addDays(today, -126),
      rvInfectionDate: addDays(today, -7),
      randomizationDate: addDays(today, -6),
    });
    expect(getRVDay(p)).toBe(7);
    expect(getProtocolDayLabel(p)).toBe('Tx D7');
  });

  it('FU patient at Day 28', () => {
    const p = makePatient({
      phaseCode: 'fu',
      screeningDate: addDays(today, -200),
      randomizationDate: addDays(today, -27),
    });
    expect(getRVDay(p)).toBe(28);
    expect(getProtocolDayLabel(p)).toBe('FU D28');
  });
});

// ─── De novo / newly-enrolled patient ─────────────────────────────────────────

describe('TIMELINE-DENOVO — newly enrolled patients have sane baseline values', () => {
  const today = getToday();

  it('De novo screening patient: studyDay 0, label "SCR D0"', () => {
    const p = makePatient({
      phaseCode: 'scr',
      screeningDate: today,
      psbStartDate: undefined,
    });
    expect(getStudyDay(p)).toBe(0);
    expect(getProtocolDayLabel(p)).toBe('SCR D0');
  });

  it('Patient transitioned to PSB today: PSB W1 · D1 (not W0, not negative)', () => {
    const p = makePatient({
      phaseCode: 'psb',
      screeningDate: addDays(today, -14),
      psbStartDate: today,
    });
    expect(getPSBWeek(p)).toBe(1);
    expect(getPSBDay(p)).toBe(1);
    expect(getProtocolDayLabel(p)).toBe('PSB W1 · D1');
  });

  it('Patient randomised today: Tx D1', () => {
    const p = makePatient({
      phaseCode: 'tx',
      screeningDate: addDays(today, -140),
      randomizationDate: today,
    });
    expect(getRVDay(p)).toBe(1);
    expect(getProtocolDayLabel(p)).toBe('Tx D1');
  });

  it('PSB patient with no psbStartDate yet does not crash and returns null label fragments', () => {
    const p = makePatient({ phaseCode: 'psb', psbStartDate: undefined });
    expect(getPSBWeek(p)).toBeNull();
    expect(getProtocolDayLabel(p)).toBe('PSB');
  });
});

// ─── Marker position alignment ────────────────────────────────────────────────
// The marker position MUST land inside the segment that matches the label.
// Historical bug: rescr patients were clamped to <= 10% (SCR segment).

describe('TIMELINE-MARKER — marker position must land in the correct phase segment', () => {
  const today = getToday();
  const OFF_PSB = PHASE_PCT.SCR;
  const OFF_RV  = OFF_PSB + PHASE_PCT.PSB;
  const OFF_TX  = OFF_RV  + PHASE_PCT.RV;
  const OFF_FU  = OFF_TX  + PHASE_PCT.TX;

  it('SCR patient → marker inside [0, SCR_END]', () => {
    const p = makePatient({ phaseCode: 'scr', screeningDate: addDays(today, -5) });
    const pct = getTimelineMarkerPct(p);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(PHASE_PCT.SCR);
  });

  it('PSB patient at Week 4 → marker inside PSB segment', () => {
    const p = makePatient({
      phaseCode: 'psb',
      psbStartDate: addDays(today, -28),
      screeningDate: addDays(today, -42),
    });
    const pct = getTimelineMarkerPct(p);
    expect(pct).toBeGreaterThan(OFF_PSB);
    expect(pct).toBeLessThan(OFF_RV);
  });

  it('RESCR patient (Week 48 of PSB) → marker WELL INSIDE PSB segment, NOT clamped to SCR', () => {
    const p = makePatient({
      phaseCode: 'rescr',
      screeningDate: addDays(today, -336),
      psbStartDate: addDays(today, -329), // ~ Week 47 / 48
    });
    const pct = getTimelineMarkerPct(p);
    // Regression: legacy implementation returned ≤ 10% here. The corrected
    // marker should sit deep inside the PSB segment (not the SCR segment).
    expect(pct, 'rescr marker must escape the SCR segment').toBeGreaterThan(PHASE_PCT.SCR);
    expect(pct, 'rescr marker should be past the PSB midpoint at week 48').toBeGreaterThan(OFF_PSB + PHASE_PCT.PSB / 2);
    expect(pct).toBeLessThanOrEqual(OFF_RV);
  });

  it('RESCR patient (Week 68 of PSB) → marker at the very end of the PSB segment', () => {
    const p = makePatient({
      phaseCode: 'rescr',
      psbStartDate: addDays(today, -475), // PSB Day 476 ≈ end of Week 68
      screeningDate: addDays(today, -489),
    });
    const pct = getTimelineMarkerPct(p);
    expect(pct).toBeGreaterThan(OFF_PSB + PHASE_PCT.PSB * 0.95);
    expect(pct).toBeLessThanOrEqual(OFF_RV);
  });

  it('Tx D7 patient → marker at END of TX segment', () => {
    const p = makePatient({
      phaseCode: 'tx',
      randomizationDate: addDays(today, -6),
    });
    const pct = getTimelineMarkerPct(p);
    expect(pct).toBeGreaterThanOrEqual(OFF_TX);
    expect(pct).toBeLessThanOrEqual(OFF_TX + PHASE_PCT.TX + 0.01);
  });

  it('FU D42 patient → marker at the very end of FU segment (≥ 99%)', () => {
    // FU spans D8 → D42 = 35 days; D42 reaches 34/35 of the segment.
    // Day 43+ clamps to 100%. So D42 must be close to but not necessarily 100%.
    const p = makePatient({
      phaseCode: 'fu',
      randomizationDate: addDays(today, -41),
    });
    const pct = getTimelineMarkerPct(p);
    expect(pct).toBeGreaterThanOrEqual(99);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it('FU patient past Day 42 → marker clamped to 100%', () => {
    const p = makePatient({
      phaseCode: 'fu',
      randomizationDate: addDays(today, -49),
    });
    expect(getTimelineMarkerPct(p)).toBe(100);
  });

  it('RV (DTQ+ before randomisation) → marker inside RV segment', () => {
    const p = makePatient({
      phaseCode: 'psb',
      dtqPos: true,
      rvInfectionDate: today,
      randomizationDate: undefined,
    });
    const pct = getTimelineMarkerPct(p);
    expect(pct).toBeGreaterThanOrEqual(OFF_RV);
    expect(pct).toBeLessThanOrEqual(OFF_RV + PHASE_PCT.RV);
  });
});

// ─── Rescreening milestone alert ──────────────────────────────────────────────

describe('TIMELINE-RESCR — rescreening alerts fire on PSB-anchored milestones', () => {
  const today = getToday();

  it('PSB Day 308 (4 weeks before Week 48 milestone) → alert with 28 days', () => {
    const p = makePatient({
      phaseCode: 'psb',
      psbStartDate: addDays(today, -307),
      screeningDate: addDays(today, -321),
    });
    const status = getRescreeningStatus(p);
    expect(status).not.toBeNull();
    expect(status!.milestone).toBe(48);
    expect(status!.days).toBe(28);
  });

  it('PSB Day 100 (far from any milestone) → no alert', () => {
    const p = makePatient({
      phaseCode: 'psb',
      psbStartDate: addDays(today, -99),
    });
    expect(getRescreeningStatus(p)).toBeNull();
  });

  it('Non-PSB patient → no rescreening alert', () => {
    const p = makePatient({ phaseCode: 'tx', psbStartDate: undefined });
    expect(getRescreeningStatus(p)).toBeNull();
  });

  it('Two weeks before Week 68 milestone → alert with 14 days', () => {
    const p = makePatient({
      phaseCode: 'psb',
      psbStartDate: addDays(today, -461), // PSB Day 462 → 14 days before Day 476 (W68)
    });
    const status = getRescreeningStatus(p);
    expect(status).not.toBeNull();
    expect(status!.milestone).toBe(68);
    expect(status!.days).toBe(14);
  });
});

// ─── Composite labels ────────────────────────────────────────────────────────

describe('TIMELINE-LABEL — composite phase labels', () => {
  const today = getToday();

  it('getProtocolPhaseLabel matches PSB convention', () => {
    const p = makePatient({
      phaseCode: 'psb',
      psbStartDate: addDays(today, -27),
    });
    expect(getProtocolPhaseLabel(p)).toBe('Asymptomatic Phase · Week 4 · Day 28');
  });

  it('DTQ+ before randomisation → RV Protocol Active', () => {
    const p = makePatient({
      phaseCode: 'psb',
      dtqPos: true,
      rvInfectionDate: today,
    });
    expect(getProtocolPhaseLabel(p)).toBe('RV Protocol Active');
  });
});
