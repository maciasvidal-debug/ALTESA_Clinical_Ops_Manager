/**
 * lib/task-utils.ts
 *
 * Pure task-completion logic extracted from the App component's
 * isChecked useCallback. Keeping it pure enables deterministic unit
 * testing of STATE-001 and PERF-001 without mounting a React component.
 *
 * Zero-regression refactor: page.tsx imports this function and delegates
 * to it. The hook signature and behaviour are identical to before.
 */

import type { Patient } from './data';

/** Immutable view of the patient lookup map built by OPT-1 useMemo. */
export type PatientMap   = ReadonlyMap<string, Patient>;

/** Session-level task overrides (checked-but-not-yet-persisted). */
export type OverrideMap  = Readonly<Record<string, ReadonlySet<string>>>;

/**
 * Returns true if task `code` is considered complete for patient `pid`.
 *
 * Priority order (first match wins):
 *   1. `pid` not in map → false (safe for missing/unknown patients)
 *   2. Override set (chkd) contains code → true (session-level override)
 *   3. Any task array contains a done task with that code → true
 */
export function checkTaskCompletion(
  pid:        string,
  code:       string,
  patientMap: PatientMap,
  overrides:  OverrideMap = {}
): boolean {
  const p = patientMap.get(pid);
  if (!p) return false;                          // STATE-001: safe on unknown pid
  if (overrides[pid]?.has(code)) return true;    // session override fast path
  return (
    p.tasks.q.some(t  => t.code === code && t.done) ||
    p.tasks.pr.some(t => t.code === code && t.done) ||
    p.tasks.l.some(t  => t.code === code && t.done) ||
    p.tasks.ad.some(t => t.code === code && t.done)
  );
}
