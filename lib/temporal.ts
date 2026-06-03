/**
 * Centralized temporal utilities — single source of truth for all
 * date / week / day computations across the ALTESA app.
 *
 * Why this module exists
 * ──────────────────────
 * The SoA (Schedule of Assessments) uses DIFFERENT anchors for "Day N" /
 * "Week N" depending on the patient's phase:
 *
 *   • SCR / RESCR   →  anchor = screeningDate         (Day 0 = screening)
 *   • PSB           →  anchor = psbStartDate          (Day 1 = PSB start, Week 1 = days 1-7)
 *   • RV / Tx / FU  →  anchor = randomizationDate     (Day 1 = randomisation, D1/D3/D7/D14/D28/D42)
 *
 * Historically the codebase used a single `patient.studyDay` (days from
 * screening) as a one-size-fits-all "day number" and then divided by 7 in
 * various places to derive PSB weeks or Tx day labels. This produced visual
 * timelines whose position (calculated from the correct anchor in
 * getTodayPct) disagreed with the label (calculated from screeningDate).
 *
 * All temporal queries should go through this module so that frontend
 * representations and backend logic stay aligned with the SoA.
 */

import { addDays, diffDays, getToday, type Patient } from './data';

// ─── Atomic phase-anchored day/week counters ──────────────────────────────────
// Conventions, drawn directly from Table 1 / Table 2 of the approved SoA:
//   PSB:  Day 1 = psbStartDate           → daysSincePsb + 1
//   RV:   Day 1 = randomizationDate      → daysSinceRand + 1
//   SCR:  Day 0 = screeningDate          → daysSinceScreening (zero-based)
// Returns null when the anchor date is unavailable.

/** Days since screening (Day 0). Always recomputed against `today`. */
export function getStudyDay(patient: Patient, today: Date = getToday()): number | null {
  if (!patient.screeningDate) return null;
  return diffDays(patient.screeningDate, today);
}

/** PSB Day (1-based). Day 1 = psbStartDate. Falls back to null if PSB hasn't started. */
export function getPSBDay(patient: Patient, today: Date = getToday()): number | null {
  if (!patient.psbStartDate) return null;
  return diffDays(patient.psbStartDate, today) + 1;
}

/** PSB Week (1-based). Week 1 = PSB Days 1-7. */
export function getPSBWeek(patient: Patient, today: Date = getToday()): number | null {
  const day = getPSBDay(patient, today);
  if (day == null || day < 1) return null;
  return Math.ceil(day / 7);
}

/** Treatment / Follow-up Day (1-based). Day 1 = randomizationDate. */
export function getRVDay(patient: Patient, today: Date = getToday()): number | null {
  if (!patient.randomizationDate) return null;
  return diffDays(patient.randomizationDate, today) + 1;
}

/** Days since RV onset (DTQ positive). 0-based. */
export function getRVOnsetDay(patient: Patient, today: Date = getToday()): number | null {
  if (!patient.rvInfectionDate) return null;
  return diffDays(patient.rvInfectionDate, today);
}

// ─── Phase-aware composite label ──────────────────────────────────────────────
// Returns the SoA-correct "Day X" or "Week X" expression for the patient's
// current phase. Used wherever the UI needs a single-line temporal label.

/** Phase-aware short label (e.g. "Tx D7", "PSB W4 · D28", "SCR D0"). */
export function getProtocolDayLabel(patient: Patient, today: Date = getToday()): string {
  const phase = patient.dtqPos && !patient.randomizationDate ? 'rv' : patient.phaseCode;

  switch (phase) {
    case 'scr': {
      const d = getStudyDay(patient, today);
      return d != null ? `SCR D${d}` : 'SCR';
    }
    case 'rescr': {
      const w = getPSBWeek(patient, today);
      return w != null ? `Rescr · PSB W${w}` : 'Rescr';
    }
    case 'psb': {
      const w = getPSBWeek(patient, today);
      const d = getPSBDay(patient, today);
      if (w == null || d == null) return 'PSB';
      return `PSB W${w} · D${d}`;
    }
    case 'rv': {
      const d = getRVOnsetDay(patient, today);
      return d != null ? `RV Onset +${d}d` : 'RV Onset';
    }
    case 'tx':
    case 'fu': {
      const d = getRVDay(patient, today);
      return d != null ? `${phase === 'tx' ? 'Tx' : 'FU'} D${d}` : phase === 'tx' ? 'Treatment' : 'Follow-up';
    }
    default:
      return patient.phase ?? '—';
  }
}

/** Long descriptive label suitable for headers (e.g. "Asymptomatic Phase · Week 4 · Day 28"). */
export function getProtocolPhaseLabel(patient: Patient, today: Date = getToday()): string {
  const phase = patient.dtqPos && !patient.randomizationDate ? 'rv' : patient.phaseCode;

  switch (phase) {
    case 'scr': {
      const d = getStudyDay(patient, today);
      return d != null ? `Screening · Day ${d}` : 'Screening';
    }
    case 'rescr': {
      const w = getPSBWeek(patient, today);
      return w != null ? `Rescreening · PSB Week ${w}` : 'Rescreening';
    }
    case 'psb': {
      const w = getPSBWeek(patient, today);
      const d = getPSBDay(patient, today);
      if (w == null || d == null) return 'Asymptomatic Phase';
      return `Asymptomatic Phase · Week ${w} · Day ${d}`;
    }
    case 'rv':
      return 'RV Protocol Active';
    case 'tx': {
      const d = getRVDay(patient, today);
      return d != null ? `Treatment Period · Day ${d}` : 'Treatment Period';
    }
    case 'fu': {
      const d = getRVDay(patient, today);
      return d != null ? `Follow-up · Day ${d}` : 'Follow-up';
    }
    default:
      return patient.phaseLabel ?? '—';
  }
}

// ─── Timeline progress percentage (visual marker) ─────────────────────────────
// Returns the marker position on the global 5-segment timeline bar.
// Segment widths must match the visual definition in PatientDetail / Dashboard:
//   SCR 10% · PSB 60% · RV 2% · TX 4.6% · FU 23.4%
// Each segment's progress uses the ANCHOR that the SoA actually uses for that
// phase — so the marker position matches the SoA-correct day/week label.

export const PHASE_PCT = {
  SCR: 10.0,
  PSB: 60.0,
  RV:  2.0,
  TX:  4.6,
  FU:  23.4,
} as const;

// Cumulative offsets (start of each segment).
const OFF_PSB = PHASE_PCT.SCR;
const OFF_RV  = OFF_PSB + PHASE_PCT.PSB;
const OFF_TX  = OFF_RV  + PHASE_PCT.RV;
const OFF_FU  = OFF_TX  + PHASE_PCT.TX;

// Reference durations used to normalise progress within each segment.
const SCR_NORMALISATION_DAYS = 42;   // protocol-permitted screening window
const PSB_NORMALISATION_DAYS = 68 * 7; // 68 weeks = 476 days
const TX_NORMALISATION_DAYS  = 7;    // D1 → D7
const FU_NORMALISATION_DAYS  = 35;   // D7 → D42

/**
 * Returns the visual "today" position as a percentage on the global timeline bar.
 * Uses phase-correct anchors so position aligns with the SoA day/week labels.
 */
export function getTimelineMarkerPct(patient: Patient, today: Date = getToday()): number {
  // Effective phase: a DTQ+ patient before randomisation is in the RV gap.
  const phase = patient.dtqPos && !patient.randomizationDate ? 'rv' : patient.phaseCode;

  switch (phase) {
    case 'scr': {
      const d = Math.max(0, getStudyDay(patient, today) ?? 0);
      return Math.min(PHASE_PCT.SCR, (d / SCR_NORMALISATION_DAYS) * PHASE_PCT.SCR);
    }

    case 'psb': {
      // Anchor = psbStartDate; clamp at the segment edges.
      const d = Math.max(0, getPSBDay(patient, today) != null ? getPSBDay(patient, today)! - 1 : 0);
      return OFF_PSB + Math.min(PHASE_PCT.PSB, (d / PSB_NORMALISATION_DAYS) * PHASE_PCT.PSB);
    }

    case 'rescr': {
      // Rescreening occurs at the END of PSB (Week 48 / 68). The historical
      // implementation clamped this to the SCR segment, putting the marker at
      // the wrong end of the bar. Anchor at PSB and clamp at the segment end.
      const d = Math.max(0, getPSBDay(patient, today) != null ? getPSBDay(patient, today)! - 1 : 0);
      return OFF_PSB + Math.min(PHASE_PCT.PSB, (d / PSB_NORMALISATION_DAYS) * PHASE_PCT.PSB);
    }

    case 'rv': {
      // Between RV onset and randomisation: park inside the 2% RV gap.
      return OFF_RV + PHASE_PCT.RV / 2;
    }

    case 'tx': {
      const d = Math.max(0, getRVDay(patient, today) != null ? getRVDay(patient, today)! - 1 : 0);
      return OFF_TX + Math.min(PHASE_PCT.TX, (d / TX_NORMALISATION_DAYS) * PHASE_PCT.TX);
    }

    case 'fu': {
      // Anchor = randomizationDate. FU spans D7 → D42 = 35 days.
      const rvDay = getRVDay(patient, today);
      const elapsedAfterTx = Math.max(0, (rvDay ?? 1) - 1 - TX_NORMALISATION_DAYS);
      return OFF_FU + Math.min(PHASE_PCT.FU, (elapsedAfterTx / FU_NORMALISATION_DAYS) * PHASE_PCT.FU);
    }

    default:
      return 100;
  }
}

// ─── Rescreening milestones (PSB-anchored) ────────────────────────────────────
// SoA Table 2 — Screening/Rescreening column: "Rescreening (Every 6 Months)".
// Rescreening therefore RECURS every 6 months throughout the Asymptomatic Phase
// (PSB), not at two fixed weeks. We anchor on psbStartDate (the SoA-correct PSB
// anchor) rather than the screening date, so the warning window doesn't drift by
// the length of the screening period.
//
// 6 months ≈ 26 weeks. Milestones fall at PSB Day 182, 364, 546 … (Weeks 26, 52,
// 78 …) and the alert opens 28 days ahead of each one.
export const RESCREENING_INTERVAL_WEEKS = 26;
const RESCREENING_INTERVAL_DAYS = RESCREENING_INTERVAL_WEEKS * 7; // 182

/** Days ahead of a rescreening milestone that the alert window opens. */
export const RESCREENING_WINDOW_DAYS = 28;

export type RescreeningStatus = {
  /** Days until the next rescreening milestone (PSB-anchored). */
  days: number;
  /** PSB week of the milestone (26, 52, 78 …). */
  milestone: number;
};

/**
 * Returns a rescreening alert when a PSB patient is within
 * RESCREENING_WINDOW_DAYS of their next 6-month rescreening milestone.
 * Returns null otherwise.
 */
export function getRescreeningStatus(patient: Patient, today: Date = getToday()): RescreeningStatus | null {
  if (patient.phaseCode !== 'psb') return null;
  const psbDay = getPSBDay(patient, today);
  if (psbDay == null || psbDay < 1) return null;

  // PSB Day of the next 6-month milestone at or after the current PSB day.
  const nextIndex = Math.max(1, Math.ceil(psbDay / RESCREENING_INTERVAL_DAYS));
  const milestoneDay = nextIndex * RESCREENING_INTERVAL_DAYS;
  const remaining = milestoneDay - psbDay;

  if (remaining > 0 && remaining <= RESCREENING_WINDOW_DAYS) {
    return { days: remaining, milestone: milestoneDay / 7 };
  }
  return null;
}

// ─── Convenience: target date for a SoA visit on a fresh patient ──────────────

/**
 * Returns the SoA-target date for a named milestone on a de novo patient.
 * Used by the screening-success flow to schedule downstream visits without
 * hand-rolling day arithmetic.
 */
export function getMilestoneDate(
  patient: Patient,
  milestone: 'psb_start' | 'rescr_w48' | 'rescr_w68',
): Date | null {
  switch (milestone) {
    case 'psb_start':
      return patient.psbStartDate ?? null;
    case 'rescr_w48':
      return patient.psbStartDate ? addDays(patient.psbStartDate, 48 * 7 - 1) : null;
    case 'rescr_w68':
      return patient.psbStartDate ? addDays(patient.psbStartDate, 68 * 7 - 1) : null;
  }
}
