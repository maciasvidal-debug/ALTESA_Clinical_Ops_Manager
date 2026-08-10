/**
 * Compliance Auto-Detection Engine — Phase 2
 * ============================================================================
 * The spreadsheet asked the coordinator to eyeball each patient's ePRO
 * adherence and hand-type the dates they fell below / recovered 80% compliance
 * (Pt_Thread_Compliance). This module derives that instead of asking for it.
 *
 * Two layers, deliberately separated by data source:
 *
 *   1. Pure window engine (`detectComplianceWindows`) — operates on a per-day
 *      adherence stream (expected vs submitted ePRO). This is the real thing:
 *      given an eDiary submission stream it emits fall-out / recovery windows
 *      with no manual entry. Fully unit-tested against synthetic streams.
 *
 *   2. Cumulative derivation (`deriveCumulativeAdherence`) — a proxy computed
 *      from data the app ALREADY holds: PSB E-RS records collected
 *      (`psbRecords`) against days elapsed in the Pre-Symptomatic Baseline. It
 *      needs no new data source, so it flags low-adherence patients on today's
 *      records — but it is a *cumulative* ratio, not a rolling window. When a
 *      true per-day eDiary stream becomes available, layer 1 supersedes it.
 *
 * Nothing here fabricates precision it does not have: `deriveCumulativeAdherence`
 * returns null for patients with no PSB baseline (e.g. still screening), and the
 * window engine returns [] on a stream that never dips — which is the correct
 * result, not a gap.
 */

import { diffDays, getToday, type Patient, type Task } from './data';

/** Protocol adherence threshold below which a patient is flagged non-compliant. */
export const ADHERENCE_THRESHOLD = 0.8;

// ── Layer 1: pure per-day window engine ──────────────────────────────────────

/** One day of ePRO adherence: how many entries were expected vs submitted. */
export type AdherenceSample = {
  date: string;       // ISO date (YYYY-MM-DD)
  expected: number;
  submitted: number;
};

export type RollingPoint = { date: string; ratio: number | null };

/**
 * Trailing-window adherence ratio for each day. The window is the last
 * `windowDays` *samples* (chronologically sorted). A day whose window has zero
 * expected entries yields ratio null (undefined, not 0 — avoids a false
 * fall-out flag on a legitimately-empty window).
 */
export function rollingAdherence(samples: AdherenceSample[], windowDays = 7): RollingPoint[] {
  const sorted = [...samples].sort((a, b) => a.date.localeCompare(b.date));
  const out: RollingPoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let expected = 0, submitted = 0;
    for (let j = i; j >= 0 && i - j < windowDays; j--) {
      expected += sorted[j].expected;
      submitted += sorted[j].submitted;
    }
    out.push({ date: sorted[i].date, ratio: expected > 0 ? submitted / expected : null });
  }
  return out;
}

/**
 * A period during which trailing adherence stayed below the threshold.
 * `returnedDate` absent ⇒ the patient is still below threshold at the end of
 * the stream (an open window).
 */
export type ComplianceWindow = {
  fellOutDate: string;
  returnedDate?: string;
  nadir: number;        // lowest trailing ratio observed within the window
};

/**
 * Detects fall-out / recovery windows from an adherence stream. A window opens
 * the first day trailing adherence drops below `threshold` and closes the first
 * day it climbs back to/above it. Days with a null ratio are neutral (they
 * neither open nor close a window).
 */
export function detectComplianceWindows(
  samples: AdherenceSample[],
  opts: { threshold?: number; windowDays?: number } = {},
): ComplianceWindow[] {
  const threshold = opts.threshold ?? ADHERENCE_THRESHOLD;
  const roll = rollingAdherence(samples, opts.windowDays ?? 7);
  const windows: ComplianceWindow[] = [];
  let current: ComplianceWindow | null = null;

  for (const { date, ratio } of roll) {
    if (ratio == null) continue;
    if (ratio < threshold) {
      if (!current) current = { fellOutDate: date, nadir: ratio };
      else current.nadir = Math.min(current.nadir, ratio);
    } else if (current) {
      current.returnedDate = date;
      windows.push(current);
      current = null;
    }
  }
  if (current) windows.push(current);
  return windows;
}

// ── Layer 2: cumulative derivation from existing app data ────────────────────

export type AdherenceEstimate = {
  expected: number;   // days elapsed in PSB
  actual: number;     // PSB E-RS records collected
  ratio: number;      // clamped to [0, 1]
};

/**
 * Estimates a patient's cumulative PSB ePRO adherence from data already stored:
 * `psbRecords` (E-RS records collected) over days elapsed in the Pre-Symptomatic
 * Baseline. For symptomatic patients the baseline is measured to RV onset; for
 * asymptomatic patients, to today.
 *
 * Returns null when there is no PSB baseline yet (screening patients) or the
 * elapsed window is non-positive — never a fabricated ratio.
 */
export function deriveCumulativeAdherence(p: Patient, today: Date = getToday()): AdherenceEstimate | null {
  if (!p.psbStartDate) return null;
  const end = p.rvInfectionDate && p.rvInfectionDate < today ? p.rvInfectionDate : today;
  const expected = diffDays(p.psbStartDate, end) + 1; // inclusive of PSB Day 1
  if (expected <= 0) return null;
  const actual = Math.max(0, p.psbRecords ?? 0);
  return { expected, actual, ratio: Math.min(1, actual / expected) };
}

/** True when a patient's derived cumulative adherence is below the threshold. */
export function isBelowAdherence(p: Patient, threshold = ADHERENCE_THRESHOLD, today: Date = getToday()): boolean {
  const est = deriveCumulativeAdherence(p, today);
  return est != null && est.ratio < threshold;
}

/**
 * Set of patient IDs auto-detected as below the adherence threshold. This feeds
 * the dashboard's non-compliant status without any manual entry, alongside (and
 * de-duplicated with) explicit ComplianceEvent records.
 */
export function autoNonCompliantIds(
  patients: Patient[],
  threshold = ADHERENCE_THRESHOLD,
  today: Date = getToday(),
): Set<string> {
  return new Set(patients.filter((p) => isBelowAdherence(p, threshold, today)).map((p) => p.id));
}

// ── Layer 3: Questionnaire-only compliance (CR-01 / CR-02 / CR-03 / CR-04 / CR-10) ──
//
// Confirmed with the study team (protocol/business-rule findings + resolved
// open questions):
//   - In scope:  DTQ, E-RS/PGIS, WURSS, SGRQ (CR-02; protocol findings).
//   - CAT is OUT — it is an eligibility assessment, not a compliance
//     questionnaire (OQ-3 resolution).
//   - HVIR (Home Virology) is OUT — a conditional, non-deterministic
//     collection triggered post-DTQ+, not a patient-reported questionnaire
//     the study team wants tracked for completion (OQ-4 resolution).
//   - PRN (Rescue Inhaler) is OUT — conditional PRN event, weight 0 in both
//     numerator and denominator (CR-10; protocol findings).
//   - IC is OUT — an administrative attestation, not an ePRO.
//   - Non-questionnaire activities (PR/L/AD categories generally) never
//     affect this number (CR-03).
//
// This is an EXPLICIT allow-list, not a derivation from which `patient.tasks`
// array a code happens to live in. The seed data for HMC-012 / CUN-023 /
// CUN-058 previously placed PRN inside `tasks.q` — trusting category alone
// would have silently counted the Rescue Inhaler as a questionnaire. The
// seed data has been corrected, but the calculator is defended by code
// (`QUESTIONNAIRE_EXCLUDED_CODES`) rather than by data hygiene alone, since
// CAT and HVIR are legitimately `category: 'Q'` in the SoA yet must still be
// excluded here.

/** Protocol ePRO instruments that count toward questionnaire compliance. */
export const QUESTIONNAIRE_CODES: ReadonlySet<string> = new Set(['DTQ', 'ERS', 'WURSS', 'SGRQ']);

/**
 * Codes explicitly excluded from questionnaire compliance even if they carry
 * a Q-category label or appear (due to a data error) inside `tasks.q`.
 */
export const QUESTIONNAIRE_EXCLUDED_CODES: ReadonlySet<string> = new Set(['PRN', 'HVIR', 'CAT', 'IC']);

export type QuestionnaireCompliance = {
  done: number;
  total: number;
  /** null (render "—") when no in-scope questionnaire is present in this snapshot — never a fabricated 0. */
  pct: number | null;
};

/**
 * Current-visit-scoped questionnaire completion: done/total across the
 * confirmed questionnaire allow-list only. Independent of which
 * `patient.tasks` array a code is placed in (defends against the PRN
 * miscategorization found during the gap analysis) and independent of
 * completion in every other domain — procedures, labs, and admin tasks never
 * move this number (CR-03).
 *
 * Scope note: this reflects the patient's CURRENT task snapshot (today's
 * visit), matching how `countTasks` already scopes "task completion" in this
 * app. It is NOT the monthly payment-eligibility percentage (CR-05 /
 * payment_compliance domain) — that requires a per-day submission history and
 * a defined calendar/study-month window not yet available (open: calendar-vs-
 * study-month window definition, and the Day 28→42 E-RS extension handling).
 */
export function computeQuestionnaireCompliance(p: Patient): QuestionnaireCompliance {
  const all: Task[] = ([] as Task[]).concat(p.tasks.q, p.tasks.pr, p.tasks.l, p.tasks.ad);
  const inScope = all.filter((t) => QUESTIONNAIRE_CODES.has(t.code) && !QUESTIONNAIRE_EXCLUDED_CODES.has(t.code));
  const total = inScope.length;
  const done = inScope.filter((t) => t.done).length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : null };
}
