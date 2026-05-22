/**
 * tests/unit/soa-compliance.test.ts
 *
 * Regression suite for SoA audit findings.
 * Guards against reintroduction of:
 *   SOA-001  VISIT_D1 phase mis-assignment (Baseline ≠ Treatment)
 *   SOA-002  Missing MSH / COPH at Day 1 Pre-Dose
 *   SOA-003  False OSC assignment at Day 3
 *   SOA-004  False "Oscillometry → Spirometry" note at Day 1
 *   SOA-005  False ECG sequence note at Day 28
 *   SOA-006  OSC task present in patient HMC-031 Day 3 task list
 *   TRIG-001 RV_D42 prematurely marked occurred via !!resolution
 *
 * Also validates:
 *   TOL-*    All VisitDef window tolerances against Table 1 / Table 2
 *   TRIG-*   getCurrentVisitKey edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  VISIT_SCR, VISIT_RESCR, VISIT_RV_ONSET,
  VISIT_D1, VISIT_D3, VISIT_D7, VISIT_D14, VISIT_D28, VISIT_D42,
  buildPSBVisitDefs, buildPatientTimeline, getCurrentVisitKey,
  type VisitDef,
} from '@/lib/timeline';
import { PATIENTS, addDays, getToday, type Patient } from '@/lib/data';

// ─── Minimal patient factory ──────────────────────────────────────────────────

function makePatient(overrides: Partial<Patient> = {}): Patient {
  const today = getToday();
  return {
    id: 'TEST-000',
    siteId: 'TEST',
    name: 'Test Patient',
    phase: 'PSB',
    phaseCode: 'psb',
    phaseLabel: 'Test',
    loc: 'CLINIC',
    lang: 'English',
    alert: null,
    screeningDate: addDays(today, -21),
    psbStartDate: addDays(today, -7),
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

// ─── SOA-001: VISIT_D1 phase ──────────────────────────────────────────────────

describe('SOA-001 — VISIT_D1 phase assignment', () => {
  it('VISIT_D1 has phase "rv" (Day 1 Pre-Dose belongs to Baseline Period per Table 1)', () => {
    expect(VISIT_D1.phase).toBe('rv');
  });

  it('VISIT_D1 phase is not "tx" (Treatment Period starts at Day 1 Dose, not Pre-Dose)', () => {
    expect(VISIT_D1.phase).not.toBe('tx');
  });
});

// ─── SOA-002: MSH and COPH at Day 1 Pre-Dose ─────────────────────────────────

describe('SOA-002 — Day 1 Pre-Dose required assessments', () => {
  it('VISIT_D1 items include MSH (Medical & Smoking History required per Table 1)', () => {
    expect(VISIT_D1.items.some(i => i.code === 'MSH')).toBe(true);
  });

  it('VISIT_D1 items include COPH (COPD History & Medications required per Table 1)', () => {
    expect(VISIT_D1.items.some(i => i.code === 'COPH')).toBe(true);
  });

  it('MSH appears in the AD category (not misclassified)', () => {
    const msh = VISIT_D1.items.find(i => i.code === 'MSH');
    expect(msh?.category).toBe('AD');
  });

  it('COPH appears in the AD category (not misclassified)', () => {
    const coph = VISIT_D1.items.find(i => i.code === 'COPH');
    expect(coph?.category).toBe('AD');
  });

  it('MSH precedes ELG in item order (history review gates eligibility check)', () => {
    const codes = VISIT_D1.items.map(i => i.code);
    expect(codes.indexOf('MSH')).toBeLessThan(codes.indexOf('ELG'));
  });

  it('COPH precedes ELG in item order', () => {
    const codes = VISIT_D1.items.map(i => i.code);
    expect(codes.indexOf('COPH')).toBeLessThan(codes.indexOf('ELG'));
  });
});

// ─── SOA-003: No OSC at Day 3 ─────────────────────────────────────────────────

describe('SOA-003 — Day 3 assessment list (Table 1)', () => {
  it('VISIT_D3 items do not include OSC (Oscillometry not in Day 3 column of Table 1)', () => {
    expect(VISIT_D3.items.some(i => i.code === 'OSC')).toBe(false);
  });

  it('VISIT_D3 items do not include SPI (Spirometry not in Day 3 column of Table 1)', () => {
    expect(VISIT_D3.items.some(i => i.code === 'SPI')).toBe(false);
  });

  it('VISIT_D3 items retain required assessments: VS, CVC, PK, DRUG, CSL', () => {
    const codes = VISIT_D3.items.map(i => i.code);
    for (const code of ['VS', 'CVC', 'PK', 'DRUG', 'CSL']) {
      expect(codes).toContain(code);
    }
  });
});

// ─── SOA-004: No false Oscillometry→Spirometry note at Day 1 ─────────────────

describe('SOA-004 — VISIT_D1 coordinationNotes accuracy', () => {
  const notes = VISIT_D1.coordinationNotes ?? [];

  it('coordinationNotes does not contain false "Oscillometry → Spirometry" sequence', () => {
    const hasFalseSeq = notes.some(n => /Oscillometry\s*→\s*Spirometry/i.test(n));
    expect(hasFalseSeq).toBe(false);
  });

  it('coordinationNotes acknowledges that spirometry is absent at Day 1 Pre-Dose', () => {
    const clarifies = notes.some(n =>
      /spirometry/i.test(n) && (/no spirometry/i.test(n) || /resumes/i.test(n) || /absent/i.test(n))
    );
    expect(clarifies).toBe(true);
  });

  it('coordinationNotes still references ECG → Blood draw (valid sequence at D1)', () => {
    const hasEcg = notes.some(n => /ECG/i.test(n) && /blood/i.test(n));
    expect(hasEcg).toBe(true);
  });
});

// ─── SOA-005: No false ECG note at Day 28 ────────────────────────────────────

describe('SOA-005 — VISIT_D28 coordinationNotes accuracy', () => {
  const notes = VISIT_D28.coordinationNotes ?? [];

  it('coordinationNotes does not contain "ECG → Blood draw" (ECG absent at Day 28 per Table 1)', () => {
    const hasFalseEcg = notes.some(n => /ECG\s*→\s*[Bb]lood/i.test(n));
    expect(hasFalseEcg).toBe(false);
  });

  it('coordinationNotes retains correct OSC → SPI sequence for Day 28', () => {
    const hasOscSpi = notes.some(n =>
      /Oscillometry/i.test(n) && /Spirometry/i.test(n)
    );
    expect(hasOscSpi).toBe(true);
  });

  it('VISIT_D28 items do not include ECG (not in Table 1 at Day 28)', () => {
    expect(VISIT_D28.items.some(i => i.code === 'ECG')).toBe(false);
  });
});

// ─── SOA-006: HMC-031 Day 3 task list ────────────────────────────────────────

describe('SOA-006 — Patient HMC-031 Day 3 task data', () => {
  const hmc031 = PATIENTS.find(p => p.id === 'HMC-031');

  it('Patient HMC-031 exists in PATIENTS seed', () => {
    expect(hmc031).toBeDefined();
  });

  it('HMC-031 Day 3 tasks.pr does not include OSC', () => {
    expect(hmc031!.tasks.pr.some(t => t.code === 'OSC')).toBe(false);
  });

  it('HMC-031 Day 3 tasks.pr retains VS, CVC, PK, DRUG', () => {
    const codes = hmc031!.tasks.pr.map(t => t.code);
    for (const code of ['VS', 'CVC', 'PK', 'DRUG']) {
      expect(codes).toContain(code);
    }
  });
});

// ─── TOL-*: Visit window tolerances vs SoA Table 1 ───────────────────────────

describe('TOL — VisitDef window tolerances (Table 1)', () => {
  it('TOL-SCR: Screening has no window (exact date, no SoA tolerance)', () => {
    expect(VISIT_SCR.window).toBeUndefined();
  });

  it('TOL-RV_ONSET: RV Onset has no window (real event timestamp, no tolerance)', () => {
    expect(VISIT_RV_ONSET.window).toBeUndefined();
  });

  it('TOL-D1: Day 1 Pre-Dose has no window (exact randomisation date)', () => {
    expect(VISIT_D1.window).toBeUndefined();
  });

  it('TOL-D3: Day 3 window = 1 (±1 per Table 1)', () => {
    expect(VISIT_D3.window).toBe(1);
  });

  it('TOL-D7: Day 7 window = 1 (±1 per Table 1)', () => {
    expect(VISIT_D7.window).toBe(1);
  });

  it('TOL-D14: Day 14 window = 2 (±2 per Table 1)', () => {
    expect(VISIT_D14.window).toBe(2);
  });

  it('TOL-D28: Day 28 window = 3 (±3 per Table 1)', () => {
    expect(VISIT_D28.window).toBe(3);
  });

  it('TOL-D42: Day 42/EOS window = 3 (±3 per Table 1)', () => {
    expect(VISIT_D42.window).toBe(3);
  });
});

describe('TOL — PSB visit window tolerances (Table 2)', () => {
  const psbVisits = buildPSBVisitDefs(68);

  it('TOL-PSB-MC: standalone MC visits (non-block) have window = 5 (±5-day per Table 2)', () => {
    // Block visits with embedded MC use dayRange for scheduling; the ±5 tolerance
    // applies only to standalone weekly MC contacts (non-block, non-dayRange).
    const standaloneMcVisits = psbVisits.filter(
      v => !v.dayRange && v.items.some(i => i.code === 'MC')
    );
    expect(standaloneMcVisits.length).toBeGreaterThan(0);
    for (const v of standaloneMcVisits) {
      expect(v.window, `${v.key} standalone MC visit should have window 5`).toBe(5);
    }
  });

  it('TOL-PSB-MC-BLOCK: block visits with embedded MC use dayRange (not window) for scheduling', () => {
    const blockMcVisits = psbVisits.filter(
      v => v.dayRange != null && v.items.some(i => i.code === 'MC')
    );
    for (const v of blockMcVisits) {
      expect(v.window, `${v.key} block+MC visit should use dayRange, not window`).toBeUndefined();
      expect(v.dayRange, `${v.key} should have dayRange`).toBeDefined();
    }
  });

  it('TOL-PSB-WEEKLY: non-MC weekly contacts have no tolerance window', () => {
    const nonMcWeekly = psbVisits.filter(v =>
      !v.dayRange && !v.items.some(i => i.code === 'MC')
    );
    expect(nonMcWeekly.length).toBeGreaterThan(0);
    for (const v of nonMcWeekly) {
      expect(v.window, `${v.key} weekly contact should have no window`).toBeUndefined();
    }
  });

  it('TOL-PSB-BLOCK: 3-day block visits have no window tolerance (dayRange defines extent)', () => {
    const blockVisits = psbVisits.filter(v => v.dayRange != null);
    expect(blockVisits.length).toBeGreaterThan(0);
    for (const v of blockVisits) {
      expect(v.window, `${v.key} block visit should use dayRange, not window`).toBeUndefined();
    }
  });

  it('TOL-PSB-MC-POSITIONS: Monthly Calls fall at weeks 2, 5, 8, 12 within each 12-week cycle', () => {
    const mcWeeks = psbVisits
      .filter(v => !v.dayRange && v.items.some(i => i.code === 'MC'))
      .map(v => {
        const m = v.key.match(/^PSB_W(\d+)$/);
        return m ? parseInt(m[1], 10) : null;
      })
      .filter((w): w is number => w !== null);

    for (const w of mcWeeks) {
      const pos = ((w - 1) % 12) + 1;
      expect([2, 5, 8, 12]).toContain(pos);
    }
  });
});

// ─── TRIG-001: RV_D42 occurred via !!resolution bug ──────────────────────────

describe('TRIG-001 — RV_D42 occurred: resolution must not gate EOS visit', () => {
  it('TRIG-001.A: Day 42 is FUTURE (not past) when patient resolved at Day 14 and is only at Day 28', () => {
    const today = getToday();
    const patient = makePatient({
      phaseCode: 'fu',
      rvInfectionDate: addDays(today, -15),
      randomizationDate: addDays(today, -14),
      // Patient clinically resolved at Day 14 post-dose
      resolution: addDays(today, 0),
      tasks: { q: [], pr: [], l: [], ad: [] },
    });
    const timeline = buildPatientTimeline(patient);
    const d42 = timeline.find(s => s.def.key === 'RV_D42');
    expect(d42).toBeDefined();
    expect(d42!.occurred).toBe(false);
    expect(d42!.status).toBe('future');
  });

  it('TRIG-001.B: Day 42 occurred correctly when >42 days have passed since randomisation', () => {
    const today = getToday();
    const patient = makePatient({
      phaseCode: 'fu',
      rvInfectionDate: addDays(today, -44),
      randomizationDate: addDays(today, -43),
      resolution: addDays(today, -29),
      tasks: { q: [], pr: [], l: [], ad: [] },
    });
    const timeline = buildPatientTimeline(patient);
    const d42 = timeline.find(s => s.def.key === 'RV_D42');
    expect(d42).toBeDefined();
    expect(d42!.occurred).toBe(true);
  });

  it('TRIG-001.C: Day 42 is current (not past) when patient is exactly at Day 42 window', () => {
    const today = getToday();
    const patient = makePatient({
      phaseCode: 'fu',
      rvInfectionDate: addDays(today, -43),
      randomizationDate: addDays(today, -42),
      resolution: addDays(today, -28),
      tasks: { q: [], pr: [], l: [], ad: [] },
    });
    const timeline = buildPatientTimeline(patient);
    const d42 = timeline.find(s => s.def.key === 'RV_D42');
    expect(d42).toBeDefined();
    // d = 42, 42 > 42 is false → occurred = false
    // getCurrentVisitKey → d > 35 → 'RV_D42' → status = 'current'
    expect(d42!.status).toBe('current');
  });
});

// ─── TRIG-002..004: getCurrentVisitKey edge cases ─────────────────────────────

describe('TRIG — getCurrentVisitKey edge cases', () => {
  it('TRIG-002: dtqPos=true without randomizationDate returns RV_ONSET', () => {
    const patient = makePatient({
      phaseCode: 'psb',
      dtqPos: true,
      randomizationDate: undefined,
    });
    expect(getCurrentVisitKey(patient)).toBe('RV_ONSET');
  });

  it('TRIG-003: phaseCode=tx with no dates at all defaults to RV_D1', () => {
    const patient = makePatient({
      phaseCode: 'tx',
      randomizationDate: undefined,
      rvInfectionDate: undefined,
    });
    expect(getCurrentVisitKey(patient)).toBe('RV_D1');
  });

  it('TRIG-004.SCR: phaseCode=scr always returns SCR', () => {
    expect(getCurrentVisitKey(makePatient({ phaseCode: 'scr' }))).toBe('SCR');
  });

  it('TRIG-004.RESCR: phaseCode=rescr always returns RESCR', () => {
    expect(getCurrentVisitKey(makePatient({ phaseCode: 'rescr' }))).toBe('RESCR');
  });

  it('TRIG-004.D3: returns RV_D3 when 2–5 days elapsed since randomisation', () => {
    const today = getToday();
    for (const offset of [2, 3, 4, 5]) {
      const patient = makePatient({
        phaseCode: 'tx',
        randomizationDate: addDays(today, -offset),
        rvInfectionDate: addDays(today, -offset - 1),
        tasks: { q: [], pr: [], l: [], ad: [] },
      });
      expect(getCurrentVisitKey(patient), `offset=${offset}`).toBe('RV_D3');
    }
  });

  it('TRIG-004.D7: returns RV_D7 when 6–10 days elapsed since randomisation', () => {
    const today = getToday();
    for (const offset of [6, 7, 8, 9, 10]) {
      const patient = makePatient({
        phaseCode: 'tx',
        randomizationDate: addDays(today, -offset),
        rvInfectionDate: addDays(today, -offset - 1),
        tasks: { q: [], pr: [], l: [], ad: [] },
      });
      expect(getCurrentVisitKey(patient), `offset=${offset}`).toBe('RV_D7');
    }
  });

  it('TRIG-004.D14: returns RV_D14 when 11–20 days elapsed since randomisation', () => {
    const today = getToday();
    for (const offset of [11, 14, 20]) {
      const patient = makePatient({
        phaseCode: 'fu',
        randomizationDate: addDays(today, -offset),
        rvInfectionDate: addDays(today, -offset - 1),
        tasks: { q: [], pr: [], l: [], ad: [] },
      });
      expect(getCurrentVisitKey(patient), `offset=${offset}`).toBe('RV_D14');
    }
  });

  it('TRIG-004.D28: returns RV_D28 when 21–35 days elapsed since randomisation', () => {
    const today = getToday();
    for (const offset of [21, 28, 35]) {
      const patient = makePatient({
        phaseCode: 'fu',
        randomizationDate: addDays(today, -offset),
        rvInfectionDate: addDays(today, -offset - 1),
        tasks: { q: [], pr: [], l: [], ad: [] },
      });
      expect(getCurrentVisitKey(patient), `offset=${offset}`).toBe('RV_D28');
    }
  });

  it('TRIG-004.D42: returns RV_D42 when >35 days elapsed since randomisation', () => {
    const today = getToday();
    for (const offset of [36, 42, 50]) {
      const patient = makePatient({
        phaseCode: 'fu',
        randomizationDate: addDays(today, -offset),
        rvInfectionDate: addDays(today, -offset - 1),
        tasks: { q: [], pr: [], l: [], ad: [] },
      });
      expect(getCurrentVisitKey(patient), `offset=${offset}`).toBe('RV_D42');
    }
  });
});

// ─── Cross-phase: visits with ECG exactly match Table 1 ──────────────────────

describe('ECG assignment — Table 1 cross-check', () => {
  const ecgExpected: Record<string, boolean> = {
    SCR: true, RESCR: true, RV_ONSET: false,
    RV_D1: true, RV_D3: false, RV_D7: true,
    RV_D14: false, RV_D28: false, RV_D42: false,
  };

  const visitMap: Record<string, VisitDef> = {
    SCR: VISIT_SCR, RESCR: VISIT_RESCR, RV_ONSET: VISIT_RV_ONSET,
    RV_D1: VISIT_D1, RV_D3: VISIT_D3, RV_D7: VISIT_D7,
    RV_D14: VISIT_D14, RV_D28: VISIT_D28, RV_D42: VISIT_D42,
  };

  for (const [key, expected] of Object.entries(ecgExpected)) {
    it(`ECG ${expected ? 'required' : 'absent'} at ${key} (Table 1)`, () => {
      const has = visitMap[key].items.some(i => i.code === 'ECG');
      expect(has).toBe(expected);
    });
  }
});

// ─── Cross-phase: OSC assignment matches Table 1 ─────────────────────────────

describe('OSC assignment — Table 1 cross-check', () => {
  const oscExpected: Record<string, boolean> = {
    SCR: true, RESCR: true, RV_D1: true,
    RV_D3: false,           // SOA-003 fix — Day 3 has no OSC
    RV_D7: true, RV_D14: true, RV_D28: true, RV_D42: true,
  };

  const visitMap: Record<string, VisitDef> = {
    SCR: VISIT_SCR, RESCR: VISIT_RESCR,
    RV_D1: VISIT_D1, RV_D3: VISIT_D3, RV_D7: VISIT_D7,
    RV_D14: VISIT_D14, RV_D28: VISIT_D28, RV_D42: VISIT_D42,
  };

  for (const [key, expected] of Object.entries(oscExpected)) {
    it(`OSC ${expected ? 'required' : 'absent'} at ${key} (Table 1)`, () => {
      const has = visitMap[key].items.some(i => i.code === 'OSC');
      expect(has).toBe(expected);
    });
  }
});

// ─── Cross-phase: Spirometry assignment matches Table 1 ──────────────────────

describe('SPI assignment — Table 1 cross-check', () => {
  const spiExpected: Record<string, boolean> = {
    SCR: true, RESCR: true,
    RV_D1: false, RV_D3: false,  // SOA-004: no SPI at D1 Pre-Dose or D3
    RV_D7: true, RV_D14: true, RV_D28: true, RV_D42: true,
  };

  const visitMap: Record<string, VisitDef> = {
    SCR: VISIT_SCR, RESCR: VISIT_RESCR,
    RV_D1: VISIT_D1, RV_D3: VISIT_D3, RV_D7: VISIT_D7,
    RV_D14: VISIT_D14, RV_D28: VISIT_D28, RV_D42: VISIT_D42,
  };

  for (const [key, expected] of Object.entries(spiExpected)) {
    it(`SPI ${expected ? 'required' : 'absent'} at ${key} (Table 1)`, () => {
      const has = visitMap[key].items.some(i => i.code === 'SPI');
      expect(has).toBe(expected);
    });
  }
});
