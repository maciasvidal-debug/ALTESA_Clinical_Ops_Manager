/**
 * Dual-Mode Telemetry Engine
 *
 * Implements two complementary tracking paradigms:
 *   1. Observational (passive) — system-generated events fired automatically on UI
 *      interactions. All writes are fire-and-forget to guarantee zero impact on the
 *      clinical data entry flow (Zero Regressions constraint).
 *   2. Declarative (active) — user-submitted time logs for off-platform activities.
 *      Awaited by the caller; errors are propagated so the UI can report failures.
 *
 * Technical Compliance: every record carries an `origin` discriminator that is part
 * of the type union and enforced at the TypeScript level, ensuring system-generated
 * and user-reported records are always distinguishable in queries and exports.
 *
 * Idempotence: records are keyed by a UUID-based ID (TEL_<uuid>). Re-dispatching
 * the same logical event always produces a new ID and a new record; no deduplication
 * is attempted at the dispatch layer. Aggregation functions (getWorkloadSummary) are
 * pure read-only computations — re-running them on the same store always yields the
 * same result.
 */

import { filterPII } from './crypto';

// ── Type Taxonomy ─────────────────────────────────────────────────────────────

export type AppScreen = 'auth' | 'dashboard' | 'patient' | 'manager_dashboard' | 'settings';

export type ObservationalEventType =
  | 'session_start'
  | 'session_end'
  | 'screen_view'
  | 'screen_leave'
  | 'task_completed'
  | 'task_unchecked'
  | 'patient_opened'
  | 'modal_opened'
  | 'modal_closed'
  | 'search_performed'
  | 'log_note_added';

export type DeclarativeTaskCategory =
  | 'external_communication'
  | 'protocol_review'
  | 'site_interaction'
  | 'regulatory_submission'
  | 'training'
  | 'administrative'
  | 'data_management'
  | 'other';

/**
 * System-generated telemetry record. The `origin: 'observational'` literal is the
 * Technical Compliance discriminator — it can never be set to 'declarative' here.
 */
export type ObservationalEvent = {
  id: string;
  origin: 'observational';
  sessionId: string;
  userId: string;
  timestamp: string;
  eventType: ObservationalEventType;
  screen?: AppScreen;
  durationMs?: number;
  context?: Record<string, string>;
};

/**
 * User-reported time log for off-platform activities. The `origin: 'declarative'`
 * literal is the Technical Compliance discriminator.
 */
export type DeclarativeLog = {
  id: string;
  origin: 'declarative';
  sessionId: string;
  userId: string;
  timestamp: string;
  taskCategory: DeclarativeTaskCategory;
  taskLabel: string;
  durationMinutes: number;
  notes?: string;
  relatedPatientPhase?: string;
};

export type TelemetryRecord = ObservationalEvent | DeclarativeLog;

export type WorkloadSummary = {
  date: string;
  observationalMinutes: number;
  declarativeMinutes: number;
  totalMinutes: number;
  byCategory: Record<string, number>;
  eventCount: number;
  logCount: number;
};

export const DECLARATIVE_CATEGORY_LABELS: Record<DeclarativeTaskCategory, string> = {
  external_communication: 'External Communication',
  protocol_review: 'Protocol Review',
  site_interaction: 'Site Interaction',
  regulatory_submission: 'Regulatory Submission',
  training: 'Training',
  administrative: 'Administrative',
  data_management: 'Data Management',
  other: 'Other',
};

// ── Session State ─────────────────────────────────────────────────────────────
// Module-level singletons are appropriate for a single-user browser SPA.
// These values are never serialized or persisted in this module.

let _sessionId = '';
let _userId = 'anonymous';
let _currentScreen: AppScreen | null = null;
let _screenEnterMs = 0;

// ── Internal Helpers ──────────────────────────────────────────────────────────

const genId = (): string => `TEL_${crypto.randomUUID()}`;
const nowISO = (): string => new Date().toISOString();

/**
 * Fire-and-forget event dispatch. Dynamically imports the DB module to avoid
 * a circular dependency at load time and to keep telemetry out of the critical
 * bundle path. Errors are intentionally swallowed — a telemetry write failure
 * must never interrupt clinical workflows.
 */
function dispatch(event: TelemetryRecord): void {
  import('@/lib/db')
    .then(({ appendTelemetryEvent }) => {
      appendTelemetryEvent(event).catch(() => { /* silent */ });
    })
    .catch(() => { /* silent */ });
}

// ── Public API — Session Management ──────────────────────────────────────────

/**
 * Called once after successful authentication. Establishes the session context
 * used by all subsequent observational events.
 */
export function initTelemetrySession(userId: string): void {
  _sessionId = `SESS_${crypto.randomUUID()}`;
  _userId = userId || 'anonymous';
  _currentScreen = null;
  _screenEnterMs = 0;

  dispatch({
    id: genId(),
    origin: 'observational',
    sessionId: _sessionId,
    userId: _userId,
    timestamp: nowISO(),
    eventType: 'session_start',
  });
}

/**
 * Called on logout / lock. Flushes any open screen_leave event before ending
 * the session record.
 */
export function endTelemetrySession(): void {
  if (!_sessionId) return;

  if (_currentScreen) {
    const durationMs = _screenEnterMs > 0
      ? Math.round(performance.now() - _screenEnterMs)
      : undefined;

    dispatch({
      id: genId(),
      origin: 'observational',
      sessionId: _sessionId,
      userId: _userId,
      timestamp: nowISO(),
      eventType: 'screen_leave',
      screen: _currentScreen,
      ...(durationMs !== undefined && { durationMs }),
    });
  }

  dispatch({
    id: genId(),
    origin: 'observational',
    sessionId: _sessionId,
    userId: _userId,
    timestamp: nowISO(),
    eventType: 'session_end',
  });

  _sessionId = '';
  _currentScreen = null;
  _screenEnterMs = 0;
}

// ── Public API — Observational Tracking ──────────────────────────────────────

/**
 * Records the transition to a new screen. Implicitly closes the previous screen
 * with a dwell-time measurement using a monotonic clock (performance.now) so
 * wall-clock skew cannot inflate durations.
 */
export function trackScreenView(screen: AppScreen): void {
  if (!_sessionId) return;

  const now = performance.now();

  if (_currentScreen && _currentScreen !== screen) {
    const durationMs = _screenEnterMs > 0
      ? Math.round(now - _screenEnterMs)
      : undefined;

    dispatch({
      id: genId(),
      origin: 'observational',
      sessionId: _sessionId,
      userId: _userId,
      timestamp: nowISO(),
      eventType: 'screen_leave',
      screen: _currentScreen,
      ...(durationMs !== undefined && { durationMs }),
    });
  }

  _currentScreen = screen;
  _screenEnterMs = now;

  dispatch({
    id: genId(),
    origin: 'observational',
    sessionId: _sessionId,
    userId: _userId,
    timestamp: nowISO(),
    eventType: 'screen_view',
    screen,
  });
}

/**
 * Generic observational event dispatcher. Use for discrete UI interactions
 * (task completion, modal open, search) that do not carry duration.
 *
 * `context` must not contain PII — callers are responsible for passing only
 * structural metadata (phase codes, task codes, not patient names or IDs).
 */
export function trackEvent(
  eventType: ObservationalEventType,
  context?: Record<string, string>,
): void {
  if (!_sessionId) return;

  dispatch({
    id: genId(),
    origin: 'observational',
    sessionId: _sessionId,
    userId: _userId,
    timestamp: nowISO(),
    eventType,
    screen: _currentScreen ?? undefined,
    ...(context && { context }),
  });
}

// ── Public API — Declarative Logging ─────────────────────────────────────────

export type DeclarativeLogInput = {
  taskCategory: DeclarativeTaskCategory;
  taskLabel: string;
  durationMinutes: number;
  notes?: string;
  relatedPatientPhase?: string;
};

/**
 * Submits a user-reported time log. Unlike observational events this IS awaited
 * by the caller so that the UI can confirm persistence or surface an error.
 * All free-text fields are passed through filterPII before storage.
 */
export async function submitDeclarativeLog(input: DeclarativeLogInput): Promise<void> {
  if (input.durationMinutes <= 0) {
    throw new RangeError('durationMinutes must be a positive number.');
  }

  const record: DeclarativeLog = {
    id: genId(),
    origin: 'declarative',
    sessionId: _sessionId || 'no-session',
    userId: _userId,
    timestamp: nowISO(),
    taskCategory: input.taskCategory,
    taskLabel: filterPII(input.taskLabel.trim()),
    durationMinutes: input.durationMinutes,
    ...(input.notes && { notes: filterPII(input.notes.trim()) }),
    ...(input.relatedPatientPhase && { relatedPatientPhase: input.relatedPatientPhase }),
  };

  const { appendTelemetryEvent } = await import('@/lib/db');
  await appendTelemetryEvent(record);
}

// ── Public API — Workload Aggregation ────────────────────────────────────────

/**
 * Produces an idempotent workload summary for a given ISO date (defaults to today).
 * This is a pure read — calling it multiple times on the same store always yields
 * the same result, satisfying the Idempotence constraint.
 *
 * Observational time is derived from `screen_leave` durationMs values to avoid
 * double-counting (screen_view does not carry duration).
 */
export async function getWorkloadSummary(isoDate?: string): Promise<WorkloadSummary> {
  const date = isoDate ?? new Date().toISOString().slice(0, 10);

  const { getTelemetryByDate } = await import('@/lib/db');
  const records = await getTelemetryByDate(date);

  let observationalMs = 0;
  let declarativeMinutes = 0;
  let eventCount = 0;
  let logCount = 0;
  const byCategory: Record<string, number> = {};

  for (const r of records) {
    if (r.origin === 'observational') {
      eventCount++;
      if (r.eventType === 'screen_leave' && r.durationMs) {
        observationalMs += r.durationMs;
      }
    } else {
      logCount++;
      declarativeMinutes += r.durationMinutes;
      const label = DECLARATIVE_CATEGORY_LABELS[r.taskCategory] ?? r.taskCategory;
      byCategory[label] = (byCategory[label] ?? 0) + r.durationMinutes;
    }
  }

  const observationalMinutes = Math.round(observationalMs / 60_000);
  const inAppLabel = 'In-App Activity';
  if (observationalMinutes > 0) {
    byCategory[inAppLabel] = (byCategory[inAppLabel] ?? 0) + observationalMinutes;
  }

  return {
    date,
    observationalMinutes,
    declarativeMinutes,
    totalMinutes: observationalMinutes + declarativeMinutes,
    byCategory,
    eventCount,
    logCount,
  };
}

/** Returns all declarative logs for a given date, most-recent first. */
export async function getDeclarativeLogsForDate(isoDate?: string): Promise<DeclarativeLog[]> {
  const date = isoDate ?? new Date().toISOString().slice(0, 10);
  const { getTelemetryByDate } = await import('@/lib/db');
  const records = await getTelemetryByDate(date);
  return records
    .filter((r): r is DeclarativeLog => r.origin === 'declarative')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
