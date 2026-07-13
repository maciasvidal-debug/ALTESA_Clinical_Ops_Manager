/**
 * Operational Data Capture Engine — Phase 1
 * ============================================================================
 * Replaces the manual, per-site "Noela's KPI tracker" spreadsheet with a
 * structured, single-entry capture layer that rolls up automatically per-site
 * AND cross-site.
 *
 * DESIGN PRINCIPLES (why this is not a 1:1 clone of the 54-sheet workbook):
 *
 *   1. Derive, don't re-type. The Symptomatic / Asymptomatic / Non-compliant
 *      status the spreadsheet asks a coordinator to type by hand is instead
 *      derived from clinical signals already captured in the app
 *      (`deriveOpStatus`). The coordinator never keys a status twice.
 *
 *   2. Capture only genuinely-new primitives at the point of care:
 *        - PatientInteraction  → contact channel + effort (billing-facing)
 *        - ReferralIntake      → recruitment-funnel top (operational)
 *        - ComplianceEvent     → 80%-adherence fall-out / recovery windows
 *        - DropoutEvent        → withdrawal intent / retention
 *
 *   3. Guarded aggregation. Every average / ratio the workbook computes with a
 *      bare AVERAGE()/SUM(a)/SUM(b) — which surfaces `#DIV/0!` on an empty range
 *      — returns `null` here (rendered as "—"). See `summariseOperations`.
 *
 *   4. Distinct-entity counting. The workbook's
 *      `COUNTIFS(C:C,"<>",D:D,"")` counts *rows*, so a patient who falls out of
 *      compliance twice is double-counted. We count DISTINCT patient IDs.
 *
 *   5. Separation of concerns. Billing-facing effort metrics (channel counts,
 *      effort minutes) and operational study metrics (status, trigger→visit,
 *      compliance, dropout) are distinguishable in every query so the two
 *      audiences — the invoicing manager and the clinical manager — get clean,
 *      un-entangled views.
 *
 * All records carry a `kind` discriminator enforced at the TypeScript level and
 * a UUID-based id (OPS_<uuid>). Aggregation functions are pure reads.
 */

import { filterPII } from './crypto';
import type { Patient } from './data';

// ── Type Taxonomy ─────────────────────────────────────────────────────────────

export type OperationsKind = 'interaction' | 'referral' | 'compliance' | 'dropout' | 'trigger';

/**
 * Protocol randomisation window: symptom onset → clinic within 48 h, plus a 6 h
 * operational grace (see WZ_STEPS "48 h + 6 h randomisation window"). A
 * trigger→visit gap beyond this is a window breach the manager should see —
 * something the spreadsheet's bare AVERAGE never surfaced.
 */
export const RANDOMIZATION_WINDOW_HOURS = 54;

export type InteractionChannel = 'call' | 'text' | 'email' | 'other';
export type InteractionDirection = 'outbound' | 'inbound';
export type ReferralSource = 'website' | 'site_database' | 'physician' | 'other';

/**
 * Derived operational status for a patient. This is the app's structured
 * replacement for the spreadsheet's free-typed "Patient Status" column.
 */
export type PatientOpStatus =
  | 'symptomatic'
  | 'asymptomatic'
  | 'noncompliant'
  | 'unknown';

// ── Records ─────────────────────────────────────────────────────────────────

/**
 * A single Navigator↔patient contact. Merges the spreadsheet's
 * Patient_Daily_Log effort columns (Interaction Type, Time to Navigator
 * response, Call Synopsis) into one structured record.
 *
 * The workbook forced coordinators to type "N/A" into the numeric response
 * column whenever the Navigator initiated the contact — silently corrupting the
 * AVERAGE. Here `responseMinutes` is simply omitted for outbound contacts and
 * only carries meaning for inbound (patient-initiated) ones.
 */
export type PatientInteraction = {
  id: string;
  kind: 'interaction';
  siteId: string;
  patientId?: string;
  userId: string;
  timestamp: string;         // ISO — ALCOA+ Contemporaneous
  channel: InteractionChannel;
  direction: InteractionDirection;
  /** Only meaningful when direction === 'inbound'. Minutes until Navigator responded. */
  responseMinutes?: number;
  /** No-PHI free-text synopsis; passed through filterPII before storage. */
  synopsis?: string;
  /** Billable effort spent on this contact, in minutes. */
  effortMinutes?: number;
};

/** A recruitment-funnel intake batch (spreadsheet: Site_Daily_Referrals). */
export type ReferralIntake = {
  id: string;
  kind: 'referral';
  siteId: string;
  userId: string;
  timestamp: string;
  reviewed: number;
  meetsCriteria: number;
  doesNotMeet: number;
  recruitedFromWebsite: number;
  recruitedFromDatabase: number;
  /** Time to Navigator response for the referral, in days. */
  responseDays?: number;
};

/**
 * An 80%-adherence fall-out window (spreadsheet: Pt_Thread_Compliance).
 * `returnedDate` undefined ⇒ patient is CURRENTLY out of compliance.
 */
export type ComplianceEvent = {
  id: string;
  kind: 'compliance';
  siteId: string;
  patientId: string;
  userId: string;
  timestamp: string;
  fellOutDate: string;       // ISO date
  returnedDate?: string;     // ISO date; open window if absent
  reason?: string;           // PII-filtered
};

/** A withdrawal / retention event (spreadsheet: Pt_Dropout_Rate). */
export type DropoutEvent = {
  id: string;
  kind: 'dropout';
  siteId: string;
  patientId: string;
  userId: string;
  timestamp: string;
  intentDate?: string;       // ISO date the patient expressed intent to withdraw
  dropoutDate?: string;      // ISO date of actual withdrawal; absent ⇒ retained
  preventionAction?: string; // PII-filtered — "Anything Done to Prevent"
  reason?: string;           // PII-filtered
};

/**
 * An ePRO symptom trigger and its resulting office visit (spreadsheet:
 * Patient_Triggers_Log). The workbook stored the trigger→visit gap as a
 * hand-typed number (F2 was a literal `1`); here it is COMPUTED from the two
 * timestamps via `hoursBetween`, so it can never drift from the source data.
 * `officeVisitAt` undefined ⇒ the patient has triggered but not yet attended.
 */
export type TriggerEvent = {
  id: string;
  kind: 'trigger';
  siteId: string;
  patientId: string;
  userId: string;
  timestamp: string;
  triggerAt: string;         // ISO datetime — DTQ-positive / symptom onset
  officeVisitAt?: string;    // ISO datetime — clinic attendance; open if absent
};

export type OperationsRecord =
  | PatientInteraction
  | ReferralIntake
  | ComplianceEvent
  | DropoutEvent
  | TriggerEvent;

// ── Labels ──────────────────────────────────────────────────────────────────

export const CHANNEL_LABELS: Record<InteractionChannel, string> = {
  call: 'Call',
  text: 'Text',
  email: 'Email',
  other: 'Other',
};

export const SOURCE_LABELS: Record<ReferralSource, string> = {
  website: 'Website',
  site_database: 'Site Database',
  physician: 'Physician',
  other: 'Other',
};

export const STATUS_LABELS: Record<PatientOpStatus, string> = {
  symptomatic: 'Symptomatic',
  asymptomatic: 'Asymptomatic',
  noncompliant: 'Non-compliant',
  unknown: 'Unknown',
};

// ── Session context ───────────────────────────────────────────────────────────

let _userId = 'anonymous';
export function setOperationsUser(userId: string): void {
  _userId = userId || 'anonymous';
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

const genId = (): string => `OPS_${crypto.randomUUID()}`;
const nowISO = (): string => new Date().toISOString();

/** Coerce to a finite, non-negative integer count (defends against NaN/negatives). */
const count = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
};

/** Whole-day difference between two ISO dates, inclusive of the start day. */
export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + (fromISO.length === 10 ? 'T00:00:00' : ''));
  const b = new Date(toISO + (toISO.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

/** Hours between an ISO datetime pair (used for trigger→visit). */
export function hoursBetween(fromISO: string, toISO: string): number | null {
  const a = new Date(fromISO);
  const b = new Date(toISO);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return (b.getTime() - a.getTime()) / 3_600_000;
}

// ── Derivation — replaces manual "Patient Status" typing ─────────────────────

/**
 * Derives the operational status of a patient from clinical signals already
 * captured in the app, plus an optional "has an open compliance window" flag.
 *
 * Priority: an open compliance window wins (the coordinator has explicitly
 * flagged the patient), otherwise symptom status is derived from the RV/DTQ
 * signals, otherwise the patient is asymptomatic.
 *
 * NOTE: true auto-detection of the 80% eDiary-adherence window requires a
 * per-day ePRO submission stream that the current data model does not carry;
 * that is a Phase-2 data source. Compliance therefore comes from explicit
 * ComplianceEvent records here — but its ROLL-UP is computed correctly
 * (distinct patients, guarded averages), fixing the spreadsheet's bugs.
 */
export function deriveOpStatus(p: Patient, hasOpenCompliance = false): PatientOpStatus {
  if (hasOpenCompliance) return 'noncompliant';
  const symptomatic =
    p.dtqPos === true ||
    p.alert === 'DTQ_POSITIVE' ||
    (p.rvInfectionDate != null && p.resolution == null &&
      (p.phaseCode === 'tx' || p.phaseCode === 'fu'));
  if (symptomatic) return 'symptomatic';
  return 'asymptomatic';
}

export type StatusCounts = {
  symptomatic: number;
  asymptomatic: number;
  noncompliant: number;
  unknown: number;
};

/**
 * Rolls a patient list into status counts. `openCompliancePatientIds` is the
 * set of patient IDs with a currently-open compliance window (from
 * `summariseOperations`), so a flagged patient is counted as non-compliant
 * rather than by their clinical phase.
 */
export function deriveStatusCounts(
  patients: Patient[],
  openCompliancePatientIds: Set<string> = new Set(),
): StatusCounts {
  const c: StatusCounts = { symptomatic: 0, asymptomatic: 0, noncompliant: 0, unknown: 0 };
  for (const p of patients) {
    c[deriveOpStatus(p, openCompliancePatientIds.has(p.id))]++;
  }
  return c;
}

// ── Public API — Capture ──────────────────────────────────────────────────────

export type InteractionInput = {
  siteId: string;
  patientId?: string;
  channel: InteractionChannel;
  direction: InteractionDirection;
  responseMinutes?: number;
  synopsis?: string;
  effortMinutes?: number;
};

export async function submitInteraction(input: InteractionInput): Promise<PatientInteraction> {
  if (!input.siteId) throw new Error('siteId is required.');
  const rec: PatientInteraction = {
    id: genId(),
    kind: 'interaction',
    siteId: input.siteId,
    ...(input.patientId && { patientId: input.patientId }),
    userId: _userId,
    timestamp: nowISO(),
    channel: input.channel,
    direction: input.direction,
    // Response time is only recorded for inbound (patient-initiated) contacts —
    // eliminating the spreadsheet's "type N/A into a number column" corruption.
    ...(input.direction === 'inbound' && input.responseMinutes != null && input.responseMinutes >= 0
      ? { responseMinutes: input.responseMinutes }
      : {}),
    ...(input.synopsis && { synopsis: filterPII(input.synopsis.trim()) }),
    ...(input.effortMinutes != null && input.effortMinutes > 0 && { effortMinutes: input.effortMinutes }),
  };
  const { appendOperationsRecord } = await import('@/lib/db');
  await appendOperationsRecord(rec);
  return rec;
}

export type ReferralInput = {
  siteId: string;
  reviewed: number;
  meetsCriteria: number;
  doesNotMeet: number;
  recruitedFromWebsite?: number;
  recruitedFromDatabase?: number;
  responseDays?: number;
};

export async function submitReferralIntake(input: ReferralInput): Promise<ReferralIntake> {
  if (!input.siteId) throw new Error('siteId is required.');
  const rec: ReferralIntake = {
    id: genId(),
    kind: 'referral',
    siteId: input.siteId,
    userId: _userId,
    timestamp: nowISO(),
    reviewed: count(input.reviewed),
    meetsCriteria: count(input.meetsCriteria),
    doesNotMeet: count(input.doesNotMeet),
    recruitedFromWebsite: count(input.recruitedFromWebsite),
    recruitedFromDatabase: count(input.recruitedFromDatabase),
    ...(input.responseDays != null && input.responseDays >= 0 && { responseDays: input.responseDays }),
  };
  const { appendOperationsRecord } = await import('@/lib/db');
  await appendOperationsRecord(rec);
  return rec;
}

export type ComplianceInput = {
  siteId: string;
  patientId: string;
  fellOutDate: string;
  returnedDate?: string;
  reason?: string;
};

export async function submitComplianceEvent(input: ComplianceInput): Promise<ComplianceEvent> {
  if (!input.siteId || !input.patientId) throw new Error('siteId and patientId are required.');
  if (!input.fellOutDate) throw new Error('fellOutDate is required.');
  if (input.returnedDate && input.returnedDate < input.fellOutDate) {
    throw new Error('returnedDate cannot precede fellOutDate.');
  }
  const rec: ComplianceEvent = {
    id: genId(),
    kind: 'compliance',
    siteId: input.siteId,
    patientId: input.patientId,
    userId: _userId,
    timestamp: nowISO(),
    fellOutDate: input.fellOutDate,
    ...(input.returnedDate && { returnedDate: input.returnedDate }),
    ...(input.reason && { reason: filterPII(input.reason.trim()) }),
  };
  const { appendOperationsRecord } = await import('@/lib/db');
  await appendOperationsRecord(rec);
  return rec;
}

export type DropoutInput = {
  siteId: string;
  patientId: string;
  intentDate?: string;
  dropoutDate?: string;
  preventionAction?: string;
  reason?: string;
};

export async function submitDropoutEvent(input: DropoutInput): Promise<DropoutEvent> {
  if (!input.siteId || !input.patientId) throw new Error('siteId and patientId are required.');
  if (!input.intentDate && !input.dropoutDate) {
    throw new Error('A dropout event needs at least an intent date or a dropout date.');
  }
  const rec: DropoutEvent = {
    id: genId(),
    kind: 'dropout',
    siteId: input.siteId,
    patientId: input.patientId,
    userId: _userId,
    timestamp: nowISO(),
    ...(input.intentDate && { intentDate: input.intentDate }),
    ...(input.dropoutDate && { dropoutDate: input.dropoutDate }),
    ...(input.preventionAction && { preventionAction: filterPII(input.preventionAction.trim()) }),
    ...(input.reason && { reason: filterPII(input.reason.trim()) }),
  };
  const { appendOperationsRecord } = await import('@/lib/db');
  await appendOperationsRecord(rec);
  return rec;
}

export type TriggerInput = {
  siteId: string;
  patientId: string;
  triggerAt: string;
  officeVisitAt?: string;
};

export async function submitTriggerEvent(input: TriggerInput): Promise<TriggerEvent> {
  if (!input.siteId || !input.patientId) throw new Error('siteId and patientId are required.');
  if (!input.triggerAt) throw new Error('triggerAt is required.');
  if (input.officeVisitAt && new Date(input.officeVisitAt).getTime() < new Date(input.triggerAt).getTime()) {
    throw new Error('officeVisitAt cannot precede triggerAt.');
  }
  const rec: TriggerEvent = {
    id: genId(),
    kind: 'trigger',
    siteId: input.siteId,
    patientId: input.patientId,
    userId: _userId,
    timestamp: nowISO(),
    triggerAt: input.triggerAt,
    ...(input.officeVisitAt && { officeVisitAt: input.officeVisitAt }),
  };
  const { appendOperationsRecord } = await import('@/lib/db');
  await appendOperationsRecord(rec);
  return rec;
}

// ── Public API — Aggregation (the guarded roll-up) ───────────────────────────

export type OperationsSummary = {
  scope: string;                         // siteId, or 'ALL' for cross-site
  from?: string;
  to?: string;

  // — Effort / interaction (billing-facing) —
  calls: number;
  texts: number;
  emails: number;
  otherContacts: number;
  totalInteractions: number;
  totalEffortMinutes: number;
  inboundCount: number;
  /** null (rendered "—") instead of #DIV/0! when there are no inbound contacts. */
  avgResponseMinutes: number | null;

  // — Recruitment funnel (operational) —
  referralsReviewed: number;
  referralsMeet: number;
  referralsNotMeet: number;
  /** meets / reviewed — null-guarded. */
  meetRatio: number | null;
  recruitedWebsite: number;
  recruitedDatabase: number;
  avgReferralResponseDays: number | null;

  // — Compliance (distinct patients) —
  /** DISTINCT patient IDs with a currently-open compliance window. */
  patientsCurrentlyNonCompliant: number;
  patientIdsCurrentlyNonCompliant: string[];
  avgDaysOutOfCompliance: number | null;

  // — Retention —
  dropouts: number;
  dropoutsPrevented: number;

  // — Symptom trigger → office visit —
  triggerCount: number;
  triggersPendingVisit: number;
  /** Mean hours from ePRO trigger to office visit — null-guarded, computed not typed. */
  avgTriggerToVisitHours: number | null;
  /** Attended visits whose gap exceeded RANDOMIZATION_WINDOW_HOURS. */
  triggerWindowBreaches: number;
};

/** Guarded mean: returns null on an empty sample instead of NaN / #DIV/0!. */
export function safeAverage(values: number[]): number | null {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

/** Guarded ratio: returns null when the denominator is zero. */
export function safeRatio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

type DateRange = { from?: string; to?: string };

function inRange(iso: string, range: DateRange): boolean {
  const day = iso.slice(0, 10);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

/**
 * Pure roll-up of operations records. Pass `scope: 'ALL'` (or omit) for a
 * cross-site total, or a specific siteId to scope down. Optional `from`/`to`
 * (YYYY-MM-DD, inclusive) restrict the window — the capability the spreadsheet
 * lacks entirely, since its Graph Sum averages whole columns with no date
 * filter.
 *
 * Idempotent: the same store + args always yield the same summary.
 */
export function summariseOperations(
  records: OperationsRecord[],
  opts: { scope?: string; from?: string; to?: string } = {},
): OperationsSummary {
  const scope = opts.scope ?? 'ALL';
  const range: DateRange = { from: opts.from, to: opts.to };

  const scoped = records.filter(
    (r) => (scope === 'ALL' || r.siteId === scope) && inRange(r.timestamp, range),
  );

  let calls = 0, texts = 0, emails = 0, otherContacts = 0, totalEffortMinutes = 0, inboundCount = 0;
  const responseMinutes: number[] = [];

  let referralsReviewed = 0, referralsMeet = 0, referralsNotMeet = 0;
  let recruitedWebsite = 0, recruitedDatabase = 0;
  const referralResponseDays: number[] = [];

  // Compliance windows are keyed by patient so re-entries don't double-count.
  // A patient with ANY open window (no returnedDate) is "currently non-compliant".
  const openComplianceByPatient = new Set<string>();
  const outOfComplianceDays: number[] = [];

  let dropouts = 0, dropoutsPrevented = 0;

  let triggerCount = 0, triggersPendingVisit = 0, triggerWindowBreaches = 0;
  const triggerToVisitHours: number[] = [];

  for (const r of scoped) {
    switch (r.kind) {
      case 'interaction': {
        if (r.channel === 'call') calls++;
        else if (r.channel === 'text') texts++;
        else if (r.channel === 'email') emails++;
        else otherContacts++;
        if (r.effortMinutes) totalEffortMinutes += r.effortMinutes;
        if (r.direction === 'inbound') {
          inboundCount++;
          if (r.responseMinutes != null) responseMinutes.push(r.responseMinutes);
        }
        break;
      }
      case 'referral': {
        referralsReviewed += r.reviewed;
        referralsMeet += r.meetsCriteria;
        referralsNotMeet += r.doesNotMeet;
        recruitedWebsite += r.recruitedFromWebsite;
        recruitedDatabase += r.recruitedFromDatabase;
        if (r.responseDays != null) referralResponseDays.push(r.responseDays);
        break;
      }
      case 'compliance': {
        if (!r.returnedDate) {
          openComplianceByPatient.add(r.patientId);
        }
        // Closed windows contribute a measured duration; open windows are
        // measured to "today" so the average reflects live exposure.
        const end = r.returnedDate ?? new Date().toISOString().slice(0, 10);
        outOfComplianceDays.push(daysBetween(r.fellOutDate, end));
        break;
      }
      case 'dropout': {
        if (r.dropoutDate) dropouts++;
        else if (r.preventionAction) dropoutsPrevented++;
        break;
      }
      case 'trigger': {
        triggerCount++;
        if (!r.officeVisitAt) {
          triggersPendingVisit++;
        } else {
          const hrs = hoursBetween(r.triggerAt, r.officeVisitAt);
          if (hrs != null) {
            triggerToVisitHours.push(hrs);
            if (hrs > RANDOMIZATION_WINDOW_HOURS) triggerWindowBreaches++;
          }
        }
        break;
      }
    }
  }

  return {
    scope,
    from: opts.from,
    to: opts.to,

    calls,
    texts,
    emails,
    otherContacts,
    totalInteractions: calls + texts + emails + otherContacts,
    totalEffortMinutes,
    inboundCount,
    avgResponseMinutes: safeAverage(responseMinutes),

    referralsReviewed,
    referralsMeet,
    referralsNotMeet,
    meetRatio: safeRatio(referralsMeet, referralsReviewed),
    recruitedWebsite,
    recruitedDatabase,
    avgReferralResponseDays: safeAverage(referralResponseDays),

    patientsCurrentlyNonCompliant: openComplianceByPatient.size,
    patientIdsCurrentlyNonCompliant: [...openComplianceByPatient],
    avgDaysOutOfCompliance: safeAverage(outOfComplianceDays),

    dropouts,
    dropoutsPrevented,

    triggerCount,
    triggersPendingVisit,
    avgTriggerToVisitHours: safeAverage(triggerToVisitHours),
    triggerWindowBreaches,
  };
}

/** Distinct site IDs present in a record set, sorted. */
export function sitesInRecords(records: OperationsRecord[]): string[] {
  return [...new Set(records.map((r) => r.siteId))].sort();
}

// ── Public API — Export (spreadsheet-shaped report) ──────────────────────────

/**
 * Column order for the operational-KPI export. Ordered by audience so the
 * manager can hand the same file up the chain the spreadsheet used to serve.
 */
const CSV_COLUMNS: { key: keyof OperationsSummary; header: string }[] = [
  { key: 'scope', header: 'Scope' },
  { key: 'from', header: 'From' },
  { key: 'to', header: 'To' },
  // Effort (billing-facing)
  { key: 'calls', header: 'Calls' },
  { key: 'texts', header: 'Texts' },
  { key: 'emails', header: 'Emails' },
  { key: 'otherContacts', header: 'Other contacts' },
  { key: 'totalInteractions', header: 'Total interactions' },
  { key: 'totalEffortMinutes', header: 'Effort minutes' },
  { key: 'inboundCount', header: 'Inbound contacts' },
  { key: 'avgResponseMinutes', header: 'Avg response (min)' },
  // Recruitment funnel
  { key: 'referralsReviewed', header: 'Referrals reviewed' },
  { key: 'referralsMeet', header: 'Referrals meet criteria' },
  { key: 'referralsNotMeet', header: 'Referrals do not meet' },
  { key: 'meetRatio', header: 'Meet ratio' },
  { key: 'recruitedWebsite', header: 'Recruited (website)' },
  { key: 'recruitedDatabase', header: 'Recruited (database)' },
  { key: 'avgReferralResponseDays', header: 'Avg referral response (days)' },
  // Trigger → visit
  { key: 'triggerCount', header: 'Triggers' },
  { key: 'triggersPendingVisit', header: 'Triggers awaiting visit' },
  { key: 'avgTriggerToVisitHours', header: 'Avg trigger→visit (h)' },
  { key: 'triggerWindowBreaches', header: 'Window breaches' },
  // Compliance & retention
  { key: 'patientsCurrentlyNonCompliant', header: 'Currently non-compliant' },
  { key: 'avgDaysOutOfCompliance', header: 'Avg days out of compliance' },
  { key: 'dropouts', header: 'Dropouts' },
  { key: 'dropoutsPrevented', header: 'Dropouts prevented' },
];

/** RFC-4180 field escaping: quote when the value contains a comma, quote or newline. */
function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Renders one summary field to a CSV cell. null → empty (no #DIV/0!, no "NaN"). */
function csvCell(value: OperationsSummary[keyof OperationsSummary]): string {
  if (value == null) return '';
  if (Array.isArray(value)) return csvEscape(value.join(' '));
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return csvEscape(String(value));
}

/**
 * Serialises the operational KPIs to CSV — one row per scope — so the manager
 * can download the report and open it in Excel. This is the loop-closing
 * replacement for "email the spreadsheet": the numbers leave the app already
 * consolidated, date-filtered and guarded, instead of being hand-maintained.
 *
 * `scopes` is typically ['ALL', ...sites]. The same `from`/`to` window is
 * applied to every row so the file is internally consistent.
 */
export function operationsSummaryToCsv(
  records: OperationsRecord[],
  scopes: string[],
  opts: { from?: string; to?: string } = {},
): string {
  const header = CSV_COLUMNS.map((c) => c.header).join(',');
  const rows = scopes.map((scope) => {
    const s = summariseOperations(records, { scope, from: opts.from, to: opts.to });
    return CSV_COLUMNS.map((c) => csvCell(s[c.key])).join(',');
  });
  return [header, ...rows].join('\n');
}
