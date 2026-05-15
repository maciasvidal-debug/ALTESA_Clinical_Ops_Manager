/**
 * Pure, read-only timeline query module for the ALTESA bidirectional visit navigator.
 *
 * All functions in this module are deterministic and free of side effects.
 * No IndexedDB access, no mutations. Calling any function multiple times with
 * the same input produces identical results (idempotent by design).
 *
 * Retrospective queries: surface protocol-required assessments for past visits.
 * Prospective queries:   surface projected assessments for future visits.
 * Current visit:         surfaces real-time task completion from patient.tasks.
 */

import { addDays, diffDays, getToday, type Patient, type Task } from './data';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type AssessmentCategory = 'Q' | 'PR' | 'L' | 'AD';

/** A single assessment row in the Schedule of Assessments (SoA). */
export type SoAItem = {
  code: string;
  label: string;
  category: AssessmentCategory;
};

/** Protocol-canonical visit definition (derived from the approved SoA). */
export type VisitDef = {
  key: string;
  /** Full label, e.g. "Treatment Day 7 (±1)" */
  label: string;
  /** Abbreviated label for timeline chips, e.g. "D7" */
  shortLabel: string;
  phase: 'scr' | 'psb' | 'rv' | 'tx' | 'fu' | 'rescr';
  /** Visit window tolerance in ±days (undefined = no window). */
  window?: number;
  items: SoAItem[];
};

/** Temporal classification of a visit relative to the patient's current position. */
export type VisitStatus = 'past' | 'current' | 'future';

/** Completion state of a single assessment within a visit snapshot. */
export type AssessmentResult = {
  code: string;
  label: string;
  category: AssessmentCategory;
  required: boolean;
  /**
   * true  = confirmed completed (current-visit, task.done === true)
   * false = confirmed incomplete (current-visit, task.done === false)
   * null  = not tracked (past visits have no per-visit history; future visits are projected)
   */
  completed: boolean | null;
};

/** Full read-only snapshot of a protocol visit for a specific patient. */
export type VisitSnapshot = {
  def: VisitDef;
  status: VisitStatus;
  /** Computed calendar date for this visit based on patient anchor dates. */
  estimatedDate: Date | null;
  /** True when clinical evidence confirms the visit has taken place. */
  occurred: boolean;
  assessments: AssessmentResult[];
};

// ─── Protocol SoA — Assessment Item Banks ─────────────────────────────────────
// These mirror the task lists in lib/data.ts, but are keyed to the SoA matrix
// rather than to the current visit's live task state.

const SCREENING_ITEMS: SoAItem[] = [
  { code: 'IC',    label: 'Informed Consent',                        category: 'Q'  },
  { code: 'CAT',   label: 'COPD Assessment Test (CAT)',               category: 'Q'  },
  { code: 'PE',    label: 'Physical Exam (incl. height)',             category: 'PR' },
  { code: 'VS',    label: 'Vital Signs',                             category: 'PR' },
  { code: 'OSC',   label: 'Oscillometry',                            category: 'PR' },
  { code: 'SPI',   label: 'Spirometry (PRE & POST)',                 category: 'PR' },
  { code: 'ECG',   label: 'ECG (12-lead)',                           category: 'PR' },
  { code: 'CSL',   label: 'Central Safety Labs',                     category: 'L'  },
  { code: 'PT',    label: 'Pregnancy Test (blood, WOCBP)',           category: 'L'  },
  { code: 'DEMO',  label: 'Demographics',                            category: 'AD' },
  { code: 'MSH',   label: 'Medical & Smoking History',               category: 'AD' },
  { code: 'ELG',   label: 'Eligibility Criteria',                   category: 'AD' },
  { code: 'COPH',  label: 'COPD History & Medications',             category: 'AD' },
  { code: 'CMED',  label: 'Concomitant Medications',                category: 'AD' },
  { code: 'TRAIN', label: 'Train Participant on Study Procedures',   category: 'AD' },
];

const RESCREENING_ITEMS: SoAItem[] = [
  { code: 'IC',    label: 'Informed Consent — Re-confirm',           category: 'Q'  },
  { code: 'CAT',   label: 'COPD Assessment Test (CAT)',               category: 'Q'  },
  { code: 'PE',    label: 'Physical Exam (limited, include weight)',  category: 'PR' },
  { code: 'VS',    label: 'Vital Signs',                             category: 'PR' },
  { code: 'OSC',   label: 'Oscillometry',                            category: 'PR' },
  { code: 'SPI',   label: 'Spirometry (PRE & POST)',                 category: 'PR' },
  { code: 'ECG',   label: 'ECG (12-lead)',                           category: 'PR' },
  { code: 'CSL',   label: 'Central Safety Labs',                     category: 'L'  },
  { code: 'PT',    label: 'Pregnancy Test (blood, WOCBP)',           category: 'L'  },
  { code: 'DEMO',  label: 'Demographics — verify/update',            category: 'AD' },
  { code: 'MSH',   label: 'Medical & Smoking History — update',      category: 'AD' },
  { code: 'ELG',   label: 'Eligibility Criteria — Exclusion only',  category: 'AD' },
  { code: 'COPH',  label: 'COPD History & Medications — update',    category: 'AD' },
  { code: 'CMED',  label: 'Concomitant Medications',                category: 'AD' },
  { code: 'TRAIN', label: 'Re-train Participant on Study Procedures',category: 'AD' },
];

const PSB_MONTHLY_ITEMS: SoAItem[] = [
  { code: 'DTQ',  label: 'Daily Trigger Questionnaire',             category: 'Q'  },
  { code: 'ERS',  label: 'E-RS / PGIS',                            category: 'Q'  },
  { code: 'WURSS',label: 'WURSS-11',                               category: 'Q'  },
  { code: 'MC',   label: 'Monthly Phone/Telehealth Call',          category: 'AD' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                   category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications',                category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',          category: 'AD' },
];

const PSB_SGRQ_ITEMS: SoAItem[] = [
  { code: 'SGRQ', label: "Saint George's Respiratory Questionnaire (SGRQ)", category: 'Q'  },
  { code: 'DTQ',  label: 'Daily Trigger Questionnaire',             category: 'Q'  },
  { code: 'ERS',  label: 'E-RS / PGIS',                            category: 'Q'  },
  { code: 'WURSS',label: 'WURSS-11',                               category: 'Q'  },
  { code: 'VS',   label: 'Vital Signs',                            category: 'PR' },
  { code: 'MC',   label: 'Monthly Phone/Telehealth Call',          category: 'AD' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                   category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications',                category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',          category: 'AD' },
];

const RV_ONSET_ITEMS: SoAItem[] = [
  { code: 'DTQ',      label: 'DTQ Positive — RV Onset Confirmed',     category: 'Q'  },
  { code: 'HVIR',     label: 'Home Self-Collect Virology (COVID/Flu)', category: 'PR' },
  { code: 'PSB_CALC', label: 'Validate PSB Value & Eligibility',      category: 'AD' },
  { code: 'CMED',     label: 'Concomitant Medications Review',         category: 'AD' },
];

const RV_D1_ITEMS: SoAItem[] = [
  { code: 'ERS',  label: 'E-RS / PGIS',                              category: 'Q'  },
  { code: 'WURSS',label: 'WURSS-11',                                 category: 'Q'  },
  { code: 'PE',   label: 'Physical Exam (limited, include weight)',  category: 'PR' },
  { code: 'VS',   label: 'Vital Signs',                             category: 'PR' },
  { code: 'ECG',  label: 'ECG (12-lead) — Pre-dose',                category: 'PR' },
  { code: 'OSC',  label: 'Oscillometry',                            category: 'PR' },
  { code: 'CVC',  label: 'Central Virology Collection',             category: 'PR' },
  { code: 'PK',   label: 'Sparse PK Sampling — Pre-dose Day 1',     category: 'PR' },
  { code: 'DRUG', label: 'Study Drug Dosing — Day 1',               category: 'PR' },
  { code: 'CSL',  label: 'Central Safety Labs (Chemistry/Haem/UA)', category: 'L'  },
  { code: 'PT',   label: 'Pregnancy Test (urine, WOCBP)',           category: 'L'  },
  { code: 'ELG',  label: 'Randomisation Eligibility Check',         category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications',                 category: 'AD' },
  { code: 'AE',   label: 'Adverse Events (collection start)',       category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',           category: 'AD' },
];

const RV_D3_ITEMS: SoAItem[] = [
  { code: 'ERS',  label: 'E-RS / PGIS',                             category: 'Q'  },
  { code: 'WURSS',label: 'WURSS-11',                                category: 'Q'  },
  { code: 'VS',   label: 'Vital Signs',                            category: 'PR' },
  { code: 'OSC',  label: 'Oscillometry',                           category: 'PR' },
  { code: 'CVC',  label: 'Central Virology Collection',            category: 'PR' },
  { code: 'PK',   label: 'Sparse PK Sampling (~24 h after D2)',    category: 'PR' },
  { code: 'DRUG', label: 'Study Drug Dosing — Day 3',              category: 'PR' },
  { code: 'CSL',  label: 'Central Safety Labs (Chemistry/Haem)',   category: 'L'  },
  { code: 'AE',   label: 'Adverse Events',                         category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications',                category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',          category: 'AD' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                   category: 'AD' },
];

const RV_D7_ITEMS: SoAItem[] = [
  { code: 'ERS',  label: 'E-RS / PGIS',                             category: 'Q'  },
  { code: 'WURSS',label: 'WURSS-11',                                category: 'Q'  },
  { code: 'VS',   label: 'Vital Signs',                            category: 'PR' },
  { code: 'ECG',  label: 'ECG (12-lead)',                          category: 'PR' },
  { code: 'OSC',  label: 'Oscillometry',                           category: 'PR' },
  { code: 'SPI',  label: 'Spirometry',                             category: 'PR' },
  { code: 'CVC',  label: 'Central Virology Collection',            category: 'PR' },
  { code: 'DRUG', label: 'Study Drug Dosing — Day 7',              category: 'PR' },
  { code: 'CSL',  label: 'Central Safety Labs (Chemistry/Haem)',   category: 'L'  },
  { code: 'AE',   label: 'Adverse Events',                         category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications',                category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',          category: 'AD' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                   category: 'AD' },
];

const RV_D14_ITEMS: SoAItem[] = [
  { code: 'ERS',  label: 'E-RS / PGIS',                             category: 'Q'  },
  { code: 'WURSS',label: 'WURSS-11',                                category: 'Q'  },
  { code: 'VS',   label: 'Vital Signs',                            category: 'PR' },
  { code: 'OSC',  label: 'Oscillometry',                           category: 'PR' },
  { code: 'SPI',  label: 'Spirometry',                             category: 'PR' },
  { code: 'CVC',  label: 'Central Virology Collection',            category: 'PR' },
  { code: 'AE',   label: 'Adverse Events',                         category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications',                category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',          category: 'AD' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                   category: 'AD' },
];

const RV_D28_ITEMS: SoAItem[] = [
  { code: 'SGRQ', label: "Saint George's Respiratory Questionnaire (SGRQ)", category: 'Q'  },
  { code: 'ERS',  label: 'E-RS / PGIS',                             category: 'Q'  },
  { code: 'WURSS',label: 'WURSS-11 (final collection)',             category: 'Q'  },
  { code: 'PE',   label: 'Physical Exam (limited, include weight)', category: 'PR' },
  { code: 'VS',   label: 'Vital Signs',                            category: 'PR' },
  { code: 'OSC',  label: 'Oscillometry',                           category: 'PR' },
  { code: 'SPI',  label: 'Spirometry',                             category: 'PR' },
  { code: 'CVC',  label: 'Central Virology Collection',            category: 'PR' },
  { code: 'CSL',  label: 'Central Safety Labs (Chemistry/Haem)',   category: 'L'  },
  { code: 'PT',   label: 'Pregnancy Test (blood, WOCBP)',          category: 'L'  },
  { code: 'AE',   label: 'Adverse Events',                         category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications',                category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',          category: 'AD' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                   category: 'AD' },
];

const RV_D42_ITEMS: SoAItem[] = [
  { code: 'ERS',  label: 'E-RS / PGIS (final)',                     category: 'Q'  },
  { code: 'VS',   label: 'Vital Signs',                            category: 'PR' },
  { code: 'OSC',  label: 'Oscillometry',                           category: 'PR' },
  { code: 'SPI',  label: 'Spirometry',                             category: 'PR' },
  { code: 'AE',   label: 'Adverse Events — Final Collection',      category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications — Final',        category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations — Final',  category: 'AD' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                   category: 'AD' },
];

// ─── Static Visit Definitions ─────────────────────────────────────────────────

export const VISIT_SCR: VisitDef = {
  key: 'SCR', label: 'Screening (Day 0)', shortLabel: 'SCR',
  phase: 'scr', items: SCREENING_ITEMS,
};

export const VISIT_RESCR: VisitDef = {
  key: 'RESCR', label: 'Rescreening (Week 48 or 68)', shortLabel: 'Re-SCR',
  phase: 'rescr', window: 7, items: RESCREENING_ITEMS,
};

export const VISIT_RV_ONSET: VisitDef = {
  key: 'RV_ONSET', label: 'RV Onset — DTQ Positive', shortLabel: 'RV+',
  phase: 'rv', items: RV_ONSET_ITEMS,
};

export const VISIT_D1: VisitDef = {
  key: 'RV_D1', label: 'Randomisation / Day 1 Pre-Dose', shortLabel: 'D1',
  phase: 'tx', items: RV_D1_ITEMS,
};

export const VISIT_D3: VisitDef = {
  key: 'RV_D3', label: 'Treatment Day 3 (±1)', shortLabel: 'D3',
  phase: 'tx', window: 1, items: RV_D3_ITEMS,
};

export const VISIT_D7: VisitDef = {
  key: 'RV_D7', label: 'Treatment Day 7 (±1)', shortLabel: 'D7',
  phase: 'tx', window: 1, items: RV_D7_ITEMS,
};

export const VISIT_D14: VisitDef = {
  key: 'RV_D14', label: 'Follow-up Day 14 (±2)', shortLabel: 'D14',
  phase: 'fu', window: 2, items: RV_D14_ITEMS,
};

export const VISIT_D28: VisitDef = {
  key: 'RV_D28', label: 'Follow-up Day 28 (±3)', shortLabel: 'D28',
  phase: 'fu', window: 3, items: RV_D28_ITEMS,
};

export const VISIT_D42: VisitDef = {
  key: 'RV_D42', label: 'End of Study / Day 42 (±3)', shortLabel: 'EOS',
  phase: 'fu', window: 3, items: RV_D42_ITEMS,
};

// ─── Dynamic PSB Visit Generation ────────────────────────────────────────────

/**
 * Generates monthly PSB visit definitions up to maxWeeks.
 * SGRQ clinic visits are inserted at protocol-specified weeks (8, 16, 24, 32, 40, 48, 64).
 * Pure function — no side effects.
 */
export function buildPSBVisitDefs(maxWeeks: number): VisitDef[] {
  const SGRQ_WEEKS = new Set([8, 16, 24, 32, 40, 48, 64]);
  const visits: VisitDef[] = [];
  const totalMonths = Math.ceil(maxWeeks / 4);

  for (let m = 1; m <= totalMonths; m++) {
    const weekNum = m * 4;
    if (weekNum > maxWeeks) break;
    const hasSGRQ = SGRQ_WEEKS.has(weekNum);
    visits.push({
      key: `PSB_M${m}`,
      label: `PSB Month ${m} — Week ${weekNum}${hasSGRQ ? ' (SGRQ Clinic Visit)' : ' (Monthly Call)'}`,
      shortLabel: `W${weekNum}`,
      phase: 'psb',
      window: 5,
      items: hasSGRQ ? PSB_SGRQ_ITEMS : PSB_MONTHLY_ITEMS,
    });
  }
  return visits;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function findTaskInPatient(patient: Patient, code: string): Task | undefined {
  return ([] as Task[])
    .concat(patient.tasks.q, patient.tasks.pr, patient.tasks.l, patient.tasks.ad)
    .find(t => t.code === code);
}

function estimateVisitDate(
  patient: Patient,
  def: VisitDef,
  psbVisitDefs: VisitDef[],
): Date | null {
  const { screeningDate, psbStartDate, rvInfectionDate, randomizationDate } = patient;

  switch (def.key) {
    case 'SCR':      return screeningDate ?? null;
    case 'RESCR': {
      const ref = psbStartDate ?? screeningDate;
      return ref ? addDays(ref, 48 * 7) : null;
    }
    case 'RV_ONSET': return rvInfectionDate ?? null;
    case 'RV_D1':   return randomizationDate ?? null;
    case 'RV_D3':   return randomizationDate ? addDays(randomizationDate, 2)  : null;
    case 'RV_D7':   return randomizationDate ? addDays(randomizationDate, 6)  : null;
    case 'RV_D14':  return randomizationDate ? addDays(randomizationDate, 13) : null;
    case 'RV_D28':  return randomizationDate ? addDays(randomizationDate, 27) : null;
    case 'RV_D42':  return randomizationDate ? addDays(randomizationDate, 41) : null;
    default: break;
  }

  if (def.key.startsWith('PSB_M')) {
    const idx = psbVisitDefs.findIndex(v => v.key === def.key);
    if (idx < 0) return null;
    const ref = psbStartDate ?? screeningDate;
    return ref ? addDays(ref, (idx + 1) * 28) : null;
  }

  return null;
}

function determineOccurred(
  patient: Patient,
  def: VisitDef,
  psbVisitDefs: VisitDef[],
): boolean {
  const today = getToday();
  const { screeningDate, psbStartDate, randomizationDate, rvInfectionDate, resolution } = patient;

  switch (def.key) {
    case 'SCR':
      return !!screeningDate && screeningDate <= today;
    case 'RESCR':
      return patient.phaseCode === 'rescr';
    case 'RV_ONSET':
      return !!rvInfectionDate;
    case 'RV_D1':
      return !!randomizationDate;
    case 'RV_D3':
      return !!randomizationDate && diffDays(randomizationDate, today) > 3;
    case 'RV_D7':
      return !!randomizationDate && diffDays(randomizationDate, today) > 7;
    case 'RV_D14':
      return !!randomizationDate && diffDays(randomizationDate, today) > 14;
    case 'RV_D28':
      return !!randomizationDate && diffDays(randomizationDate, today) > 28;
    case 'RV_D42':
      return (
        !!resolution ||
        (!!randomizationDate && diffDays(randomizationDate, today) > 42)
      );
    default: break;
  }

  if (def.key.startsWith('PSB_M')) {
    const idx = psbVisitDefs.findIndex(v => v.key === def.key);
    if (idx < 0) return false;
    const ref = psbStartDate ?? screeningDate;
    if (!ref) return false;
    const estimatedDate = addDays(ref, (idx + 1) * 28);
    return estimatedDate <= today;
  }

  return false;
}

// ─── Current Visit Key Resolution ────────────────────────────────────────────

/**
 * Returns the SoA visit key that best matches the patient's current study position.
 * Used as the default reference timepoint when opening the TimelineNavigator.
 */
export function getCurrentVisitKey(patient: Patient): string {
  const { phaseCode, dtqPos, randomizationDate, rvInfectionDate, psbStartDate, screeningDate } = patient;

  if (phaseCode === 'scr')   return 'SCR';
  if (phaseCode === 'rescr') return 'RESCR';

  if (phaseCode === 'psb') {
    if (dtqPos && !randomizationDate) return 'RV_ONSET';
    const ref = psbStartDate ?? screeningDate;
    const daysSincePsb = ref ? diffDays(ref, getToday()) : 0;
    const monthNum = Math.max(1, Math.ceil(daysSincePsb / 28));
    return `PSB_M${monthNum}`;
  }

  const refDate = randomizationDate ?? rvInfectionDate;
  if (!refDate) return 'RV_D1';
  const daysSinceRando = diffDays(refDate, getToday());
  if (daysSinceRando <= 1)  return 'RV_D1';
  if (daysSinceRando <= 5)  return 'RV_D3';
  if (daysSinceRando <= 10) return 'RV_D7';
  if (daysSinceRando <= 20) return 'RV_D14';
  if (daysSinceRando <= 35) return 'RV_D28';
  return 'RV_D42';
}

// ─── Main Timeline Builder ────────────────────────────────────────────────────

/**
 * Builds the full, ordered visit timeline for a given patient.
 *
 * - Only visits reachable in the patient's protocol path are included.
 * - For the current visit: real-time completion state is sourced from patient.tasks.
 * - For past/future visits: completion is null (no per-visit historical store exists).
 * - Idempotent: same patient input always yields the same output.
 */
export function buildPatientTimeline(patient: Patient): VisitSnapshot[] {
  const today = getToday();
  const { phaseCode, psbStartDate, screeningDate } = patient;
  const currentKey = getCurrentVisitKey(patient);

  // Determine how many PSB weeks to model based on the patient's position
  const psbRef = psbStartDate ?? screeningDate;
  const daysSincePsb = psbRef ? diffDays(psbRef, today) : 0;
  const currentPSBWeek = Math.ceil(daysSincePsb / 7);
  const psbMaxWeeks = Math.min(68, Math.max(currentPSBWeek + 8, 16));
  const psbVisitDefs = buildPSBVisitDefs(psbMaxWeeks);

  // Assemble the ordered visit list for this patient's protocol path
  const allDefs: VisitDef[] = [];

  allDefs.push(VISIT_SCR);

  const hasPSB = ['psb', 'rescr', 'rv', 'tx', 'fu'].includes(phaseCode);
  if (hasPSB) {
    allDefs.push(...psbVisitDefs);
  }

  if (phaseCode === 'rescr') {
    allDefs.push(VISIT_RESCR);
  }

  const hasRV =
    patient.dtqPos || !!patient.rvInfectionDate || ['tx', 'fu'].includes(phaseCode);
  if (hasRV) {
    allDefs.push(VISIT_RV_ONSET, VISIT_D1, VISIT_D3, VISIT_D7, VISIT_D14, VISIT_D28, VISIT_D42);
  }

  // Build snapshots (read-only)
  return allDefs.map(def => {
    const estimatedDate = estimateVisitDate(patient, def, psbVisitDefs);
    const occurred = determineOccurred(patient, def, psbVisitDefs);

    let status: VisitStatus;
    if (def.key === currentKey) {
      status = 'current';
    } else if (occurred) {
      status = 'past';
    } else {
      status = 'future';
    }

    const assessments: AssessmentResult[] = def.items.map(item => {
      let completed: boolean | null = null;
      if (status === 'current') {
        const task = findTaskInPatient(patient, item.code);
        completed = task ? task.done : null;
      }
      return {
        code: item.code,
        label: item.label,
        category: item.category,
        required: true,
        completed,
      };
    });

    return { def, status, estimatedDate, occurred, assessments };
  });
}

/**
 * Narrow helper: returns just the snapshot for a specific visit key.
 * Returns undefined if the visit is not in the patient's protocol path.
 */
export function getVisitSnapshot(
  patient: Patient,
  visitKey: string,
): VisitSnapshot | undefined {
  return buildPatientTimeline(patient).find(s => s.def.key === visitKey);
}
