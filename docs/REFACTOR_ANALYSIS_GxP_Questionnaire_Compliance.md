# GxP Refactor Analysis — Questionnaire Compliance, Timeline Auditability & Role Consolidation

**Study:** ALTESA Clinical Ops Manager
**Scope:** Change requests CR-01 … CR-10
**Author role:** Senior GxP software architect / protocol analyst / compliance reviewer / refactoring strategist
**Document type:** Phase 1 deliverable (requirement validation & gap analysis) + Phase 2 log
(compliance-engine redesign, partial — see §12).
**Status:** Phase 1 complete. Phase 2 partially implemented against stakeholder-resolved open questions
(§8). Phases 3, 4 (design only), 5–7 not yet executed.

> **Governing rule of this document.** Every statement about *current* behavior is grounded in a
> specific file/line in this repository. Every statement about *required* behavior is grounded in the
> Study Protocol, the Schedule of Assessments (SoA — Table 1 / Table 2 as encoded in
> `lib/timeline.ts`), or the approved business rules. Where a change request cannot be satisfied
> without information that is **not** in those sources, it is raised as an **Open Question** rather than
> resolved by assumption. Assumptions are prohibited (source-of-truth rule).

---

## 0. Source-of-truth hierarchy applied

| Priority | Source | Where it lives in this repo |
|---|---|---|
| 1 | Study Protocol | Encoded indirectly via `lib/timeline.ts` matrix + `WZ_STEPS` (`lib/data.ts`) |
| 2 | Schedule of Assessments (SoA) | `lib/timeline.ts` (`ALL_MATRIX_ROWS`, `VISIT_*`, `buildPSBVisitDefs`), `lib/temporal.ts` |
| 3 | Approved business rules | `lib/compliance.ts` (`ADHERENCE_THRESHOLD = 0.8`), `lib/operations.ts` |
| 4 | Stakeholder requests | CR-01 … CR-10 (this task) |
| 5 | Assumptions | **Prohibited unless explicitly flagged** — see §7 Open Questions |

When a stakeholder request (priority 4) conflicts with the Protocol or SoA (priority 1–2), the
conflict is flagged and the higher-priority source wins pending an approved protocol amendment.

---

## 1. Evidence base (files reviewed)

- Compliance engine: `lib/compliance.ts`
- Operational KPI engine: `lib/operations.ts`
- SoA / visit matrix: `lib/timeline.ts`
- Phase-anchored temporal math: `lib/temporal.ts`
- Domain model & seed data: `lib/data.ts`
- Task-completion logic: `lib/task-utils.ts`
- Persistence & audit stores: `lib/db.ts`
- Crypto primitives: `lib/crypto.ts`
- Roles & UI surfacing: `app/page.tsx`, `components/Dashboard.tsx`, `components/ManagerDashboard.tsx`, `components/StatsScreen.tsx`, `components/TimelineNavigator.tsx`, `components/ComplianceVault.tsx`, `components/OperationsCapture.tsx`
- Role manuals: `MANUAL_CRC.md`, `MANUAL_MANAGER.md`
- Regression contract: `tests/unit/soa-compliance.test.ts`, `tests/unit/audit-001.test.ts`

---

## 2. Current-state map (what the code actually does today)

There is **no single "compliance" concept** in the codebase today. There are **three disconnected
notions**, none of which is "questionnaire-only compliance" and none of which is "payment eligibility":

### 2.1 "Compliance Index" on the dashboards = **task completion across ALL categories**
`countTasks(p)` flattens **every** task bucket — questionnaires *and* procedures *and* labs *and*
admin — and returns `done/total` (`lib/data.ts:604-610`):

```ts
export function countTasks(p: Patient) {
  const all = Object.values(p.tasks).flat();     // q + pr + l + ad  ← ALL categories
  return { done: all.filter(t => t.done).length, total: all.length };
}
```

This ratio is rendered to the user under the label **"Compliance"** / **"Compliance Index"**:
- `components/Dashboard.tsx:139,194,230,251` → `Math.round((done/total)*100) + '%'`
- `components/ManagerDashboard.tsx:578-601` → `compliance = Math.round((doneTasks/totalTasks)*100)`; `:707-712` → `"Low compliance (${pct}%)"`; `:2736,2786-2796` → **"Compliance Index"** progress bar.
- `components/StatsScreen.tsx:437-438` and `components/TimelineNavigator.tsx:453` → same `done/total` percentage.

**Consequence:** today, a spirometry, a blood draw, an ECG, or an admin form directly move the number
the app calls "compliance." This is exactly the conflation CR-01/CR-03/CR-04 exist to remove.

### 2.2 ePRO "adherence" flag = **E-RS-only cumulative ratio**
`lib/compliance.ts` derives a *separate* non-compliance flag from a single questionnaire:
`deriveCumulativeAdherence` = `psbRecords / days-elapsed-in-PSB` (`lib/compliance.ts:122-129`), threshold
`0.8` (`:31`). It uses **only** E-RS (`psbRecords`) — **DTQ, WURSS, SGRQ, PGIS are not in it**. It feeds
`autoNonCompliantIds` → the operational "Non-compliant" status, *not* the dashboard "Compliance Index."
A pure per-day window engine (`detectComplianceWindows`, `:81`) exists but is unused by real data (no
per-day ePRO submission stream is stored — see the module header and `lib/operations.ts:230-240`).

### 2.3 Operational compliance events = **manually-logged fall-out windows**
`ComplianceEvent` (`lib/operations.ts:117-127`) is a coordinator-entered "fell out of / returned to 80%"
window, rolled up by **distinct patient** in `summariseOperations` (`:613-622,666-668`). It is an
operational KPI, not a per-questionnaire calculation and not payment.

### 2.4 Roles
Two roles exist: `'coordinator' | 'manager'` (`app/page.tsx:148`). The **coordinator** mutates task
completion (`app/page.tsx:1425,1428`); the **manager** is **read-only** on tasks
(`:1429` cursor `default`, no toggle) but holds the privileged surface: protocol editing
(`components/VisualProtocolEditor.tsx`), key import, **site activation-code generation**
(`lib/security.ts:92-110`), master password, and cross-site visibility (`MANUAL_MANAGER.md`).
Note: the term **"Navigator"** is already used in the code for the logged-in clinical user of the
daily log (`lib/data.ts:38`, `components/NavigatorLog.tsx`).

### 2.5 Timeline & audit
`lib/timeline.ts` is **pure/read-only by design** ("No mutations… Idempotent" header, `:1-10`) and
**computes** visits from four anchor dates (`screeningDate`, `psbStartDate`, `rvInfectionDate`,
`randomizationDate`). There is **no stored per-visit historical completion** — `TimelineNavigator.tsx:894`
states plainly: *"Per-visit historical completion is not tracked in the current schema."* The
"cryptographically sealed audit ledger" described in the manuals is, in code, a **hard-coded `useState`
array** (`components/ManagerDashboard.tsx:286`); `lib/crypto.ts` provides SHA-256/AES-GCM/RSA/ECDSA
primitives but **no hash-chained append-only audit log** (no `prevHash`/chain anywhere). `LogEntry`
(`lib/data.ts:34-44`) has a UUID id + ISO timestamp but **no correction envelope** (no
original/corrected/reason/user-of-change fields).

---

## 3. Per-change-request gap analysis

Verdict legend: **✅ Aligned** (protocol-consistent, may need wiring) · **🟠 Gap** (greenfield or partial)
· **🔴 Contradiction** (conflicts with Protocol/SoA — must be reconciled before build).

| CR | Request | Verdict | Evidence & rationale |
|----|---------|---------|----------------------|
| **CR-01** | Display questionnaire-only compliance | 🟢 Engine implemented (Phase 2) | `computeQuestionnaireCompliance()` added in `lib/compliance.ts` (§12). UI surfacing is Phase 5. |
| **CR-02** | Questionnaire compliance must include DTQ | 🟢 Implemented (Phase 2) | DTQ is in `QUESTIONNAIRE_CODES` (`lib/compliance.ts`). |
| **CR-03** | Non-questionnaire activities must not affect questionnaire compliance | 🟢 Implemented (Phase 2) | Fixed at the root: PRN seed-data mis-bucketing corrected for HMC-012/CUN-023/CUN-058 (moved `tasks.q` → `tasks.ad`, `lib/data.ts`), **and** the calculator uses an explicit code allow-list independent of array placement (defense in depth — CAT/HVIR are legitimately category `Q` but must still be excluded). Regression-guarded: CMP-006.3, CMP-006.4, CMP-006.8 in `tests/unit/compliance.test.ts`. |
| **CR-04** | Display task completion percentage independently | 🟡 Engine unaffected, UI pending | `countTasks` (`lib/data.ts:604`) remains the correct all-category primitive; relabeling away from "Compliance" in the UI is Phase 5. |
| **CR-05** | Display participant payment eligibility | 🔴 Still blocked | OQ-1 (rule source) and OQ-2 (month definition) remain **Pending** per the study team. OQ-5 (E-RS D28→D42 extension handling) also **Pending**. No payment code written. |
| **CR-06** | Enable retrospective timeline corrections | 🔴 Not started (Phase 3) | Unchanged from Phase 1 finding — architecture gap, not addressed this pass. |
| **CR-07** | Timeline corrections must satisfy ALCOA+ | 🔴 Not started (Phase 3) | Unchanged from Phase 1 finding. |
| **CR-08** | Merge Coordinator + Manager into one Navigator role | 🟡 Direction confirmed, not implemented (Phase 4) | Study team resolved OQ-7: Navigator = **full Manager privileges** (§8). This is a conscious acceptance of the SoD risk documented in §6 — the requester is the Manager-privilege holder. **No RBAC code has been changed.** Phase 4 will implement this against the §6 matrix, and the SoD risk acceptance should be recorded by whoever approves the Phase 4 PR. |
| **CR-09** | Questionnaire collection must strictly begin at the screening visit | ✅ Resolved — no code change required | Study team (OQ-3): the SoA already places a questionnaire (CAT) at Screening; CR-09 is satisfied by that, and **CAT itself does not count toward the compliance %** because it is an eligibility assessment, not a compliance questionnaire. No conflict with the PSB-anchored daily-ePRO schedule remains — the daily instruments (DTQ/E-RS/WURSS) still start at PSB Day 1 per SoA; only CAT was ever the "at screening" item, and it's excluded from the % by design. Encoded in `QUESTIONNAIRE_EXCLUDED_CODES` (`lib/compliance.ts`). |
| **CR-10** | Rescue Inhaler strictly excluded from compliance % | 🟢 Implemented (Phase 2) | `QUESTIONNAIRE_EXCLUDED_CODES` includes `PRN`, weight 0 in both numerator and denominator, plus the seed-data fix (see CR-03). Regression-guarded: CMP-006.4. |

---

## 4. Compliance engine redesign (three domains, deterministic denominators)

The compliance-calculation safeguards forbid a universal denominator and demand mathematical
determinism. The following separates the three domains with **phase-specific** denominators built
**only** from predictably-scheduled ePROs.

### 4.1 The questionnaire allow-list (the crux of CR-01/02/03/10)
Questionnaire compliance must be defined by an **explicit protocol ePRO set**, computed in code —
**not** by the `tasks.q` array (which is unreliable, per CR-03 evidence) and **not** by the SoA
`category === 'Q'` (which includes non-scoring items). Proposed classification, each line traceable to
the SoA:

| Code | In questionnaire compliance? | Reason (source) |
|------|------------------------------|-----------------|
| `DTQ` | **Yes** — daily, PSB | Protocol finding: DTQ daily in Asymptomatic Phase; `timeline.ts:100`. CR-02. |
| `ERS` (E-RS/PGIS) | **Yes** — daily | `timeline.ts:102-103`. Increment on E-RS submission (safeguard: *do not* wait on the conditionally-spawned Rescue Inhaler — see §4.4). |
| `WURSS` | **Yes** — daily D1→D28 only | `timeline.ts:104-105`; terminal at D28, does **not** extend to D42. |
| `SGRQ` | **Yes** — periodic only | Own schedule; **must not** be grouped with weekly ePROs (protocol finding). Counts only in months where it is scheduled. |
| `CAT` | **Open** (OQ-3) | Screening/Rescreening only (`timeline.ts:96-97`). Relevant to CR-09's "begins at screening." |
| `PRN` (Rescue Inhaler) | **No — weight 0** | Conditional PRN triggered by E-RS; excluded from numerator **and** denominator (CR-10, protocol finding). |
| `HVIR` (Home Virology) | **No** | Conditional, post-DTQ-positive collection (`timeline.ts:106-107`) — same non-determinism class as PRN. Flagged (OQ-4). |
| `IC` (Informed Consent) | **No** | Administrative attestation, not an ePRO. |

### 4.2 Payment compliance denominator — **per phase, per defined month**
Deterministic count of **scheduled** protocol ePROs from the active SoA phase within the month:

- **Asymptomatic (PSB):** `DTQ_days + ERS_days + WURSS_days + SGRQ_due_in_month`, where the daily
  counts derive from `psbStartDate` and the month window (fully deterministic). **Exclude** PRN, HVIR.
- **Treatment/Follow-up (RV):** `ERS_days (D1..D28) + WURSS_days (D1..D28) + SGRQ@D28`. ⚠ The E-RS
  **D28→D42 extension is conditional** on the patient not having returned to PSB baseline
  (`timeline.ts:103,384-386`) → **non-deterministic** unless the extension is gated on the recorded
  resolution state. Must be handled explicitly (OQ-5).
- **Screening:** only `CAT` is scheduled → see CR-09 / OQ-3 before assigning any monthly denominator here.

### 4.3 Task compliance (CR-04) — independent
Keep `countTasks` (`data.ts:604`) as the **operational** task-completion metric, **renamed** away from
"compliance," surfaced separately, and **never** feeding the questionnaire or payment metrics.

### 4.4 Idempotency safeguard for E-RS → Rescue Inhaler
Per the safeguard rule: **E-RS submission increments compliance immediately**, without awaiting the
conditionally-spawned Rescue Inhaler module. The Rescue Inhaler contributes **weight 0** to both
numerator and denominator, guaranteeing the calculation is a pure function of scheduled ePROs
(idempotent: same inputs → same output regardless of PRN state).

### 4.5 Clinical eligibility — independent of payment
Clinical eligibility must **not** be derived from the 80% payment threshold. The existing
DTQ-positive workflow already encodes protocol-defined eligibility windows — PSB validation = mean E-RS
over **−35 to −6 days**, **≥ 3 records** (`WZ_STEPS` step 4, `data.ts:586`; `I_RV_ONSET`/`PSB_CALC`,
`timeline.ts:267-273`) and the 48 h + 6 h randomisation window. These remain the eligibility source;
payment compliance is a parallel, non-authoritative view.

---

## 5. Timeline auditability redesign (CR-06 / CR-07)

Required properties (timeline_requirements): retrospective correction, no destruction of history,
traceability, preservation of {original, corrected, user, timestamp, reason}, no physical deletion of
regulated records, reconstructible original state.

**Gap:** none of these are met today (§2.5). **Design direction (for Phase 3):**

1. **Persist a correctable timeline fact** rather than deriving everything from anchor dates. Anchor-date
   edits (`screeningDate`, `psbStartDate`, `rvInfectionDate`, `randomizationDate`) currently mutate the
   `Patient` in place (`savePatient`, `db.ts:108-113`) — this destroys the prior value.
2. **Correction envelope** (new record type), e.g. `{ id, entityRef, field, originalValue, correctedValue,
   userId, timestamp (ISO, contemporaneous), reason }` — append-only, never overwriting the prior record.
3. **Tamper-evidence:** replace the mocked audit array (`ManagerDashboard.tsx:286`) with a real
   **hash-chained append-only ledger** (`prevHash → hash`) using the existing SHA-256 primitive
   (`crypto.ts`), so original-state reconstruction is provable to a monitor (CFR Part 11 / ALCOA+).
4. **No physical delete:** corrections supersede; the superseded record is retained (mirror the
   `AmendmentStatus: 'superseded'` pattern already in `data.ts:105-111`).

---

## 6. Permission consolidation (CR-08) — matrix first, merge later

Per role_consolidation rules: **do not** assume removal of existing roles; **do not** perform
destructive DB-role merges without a gap analysis guaranteeing zero privilege-escalation risk; build the
matrix first. Below is the **as-is** matrix extracted from code/manuals; a Navigator role must be
defined as a **capability set**, not a `UNION(coordinator, manager)`.

| Capability | Coordinator (today) | Manager (today) | Evidence | Merge risk |
|---|:---:|:---:|---|---|
| Complete / toggle clinical tasks | ✅ | ❌ (read-only) | `page.tsx:1425,1429` | — |
| Task override w/ justification | ✅ | — | `PatientDetail.tsx:445`, `MANUAL_CRC.md §5.3` | — |
| View single site | ✅ | ✅ | manuals | — |
| Cross-site / all-site view | ❌ | ✅ | `MANUAL_MANAGER.md §4` | Confidentiality (site blinding) |
| Author protocol amendments (SoA/rules) | ❌ | ✅ | `VisualProtocolEditor.tsx`, `MANUAL_MANAGER.md §8.1` | **High** — self-authored rules governing own task completion |
| Generate site activation codes | ❌ | ✅ | `security.ts:92-110`, `MANUAL_MANAGER.md §8.2` | **High** — device/site onboarding control |
| Import crypto keypairs / master secret | ❌ | ✅ | `MANUAL_MANAGER.md §2, §8.2` | **High** — key custody |
| Data export / backup / sync | ❌ | ✅ | `ComplianceVault.tsx:224`, `MANUAL_MANAGER.md §9` | PHI egress |
| Acknowledge / flag risk & queries | ❌ | ✅ | `MANUAL_MANAGER.md §5, §7` | Monitoring independence |

**Separation-of-duties conflicts to document before any merge:** (1) a user who can both **author** the
protocol and **complete** the tasks it defines can self-approve deviations; (2) a user who can generate
**activation codes** and hold **key custody** while also performing data entry collapses the operator /
administrator boundary. Recommendation: model **Navigator = Coordinator capabilities + explicitly
enumerated Manager capabilities that pass the SoD gap analysis**, keep the privileged capabilities behind
a distinct grant (retain, don't delete, the underlying roles).

---

## 7. Impact analysis (required review axes)

| Axis | Impact |
|---|---|
| **Protocol** | CR-09 resolved without contradiction (§8, OQ-3). Payment compliance still introduces a business rule (80% monthly) that must be traced to an approved source (OQ-1, still pending). |
| **SoA** | Questionnaire allow-list (§4.1, implemented §12) ratified against the study team's answers. SGRQ schedule corrected to `{1,8,16,24,32,40,48,56,64}` (`timeline.ts`) per OQ-6 — 8-week cadence restored. |
| **Database** | Payment-period compliance snapshot, timeline-correction envelope, hash-chained audit entry remain future work (Phases 3/CR-05). PRN mis-bucketing fixed at the seed-data root (`data.ts`, see §12) — no longer an open item. |
| **API** | New pure calculators (questionnaire compliance, payment eligibility) mirroring the pure/idempotent style of `compliance.ts`/`operations.ts`. New capture path for corrections. All must be side-effect-free and unit-testable. |
| **UI** | Relabel "Compliance Index" → separate **Questionnaire compliance**, **Task completion**, **Payment eligibility** tiles (`Dashboard.tsx`, `ManagerDashboard.tsx`, `StatsScreen.tsx`). Correction UI with mandatory reason. Role-gated controls if Navigator ships. |
| **Reporting** | CSV/KPI export (`operations.ts:691-757`) gains payment-eligibility and questionnaire-compliance columns; must retain null-guarding (no `#DIV/0!`). Compliance figures in monitor exports must cite denominator basis. |
| **Audit trail** | Replace mocked ledger with real append-only hash chain; every correction and every compliance-threshold crossing must be attributable + contemporaneous (ALCOA+). |
| **Security** | CR-08 is the dominant risk (privilege escalation / SoD). Key custody + activation-code generation must not be silently granted to task-entry users. |
| **Open questions** | §8. |
| **Implementation risks** | §9. |

---

## 8. Open questions register

| # | Question | Blocks | Status | Resolution |
|---|---|---|---|---|
| **OQ-1** | Is the **80% payment threshold** an approved business rule, and what is its documented source? | CR-05 | 🔴 **Pending** — elevated to study team | — |
| **OQ-2** | "Within a specific **calendar or study month**" — which? | CR-05 | 🔴 **Pending** — elevated to study team | — |
| **OQ-3** | CR-09: does "questionnaire collection begins at screening" refer to **CAT only**, or move daily ePRO accrual earlier? | CR-01/09 | ✅ **Resolved** (2026-08-10) | Study team: documented rationale exists for the earlier start; **CAT is excluded from the % — it is an eligibility assessment, not compliance.** Implemented in §12; no SoA schedule change was required (see CR-09 verdict above). |
| **OQ-4** | Should **HVIR (Home Virology)** be excluded from questionnaire compliance the same way PRN is? | CR-03/10 | ✅ **Resolved** (2026-08-10) | Study team: **Yes** — "compliance is only for the questionnaires, to make sure they are completing them as much as they can." HVIR (a conditional diagnostic self-collection, not a patient-reported instrument) is excluded. Implemented in §12. |
| **OQ-5** | For Treatment/FU, how is the **E-RS D28→D42 conditional extension** counted in the denominator? | CR-05 | 🔴 **Pending** — elevated to study team | — |
| **OQ-6** | Is the SGRQ schedule `{1,8,16,24,32,40,48,64}` correct (note the W48→W64 gap)? | CR-05 (SGRQ) | ✅ **Resolved** (2026-08-10) | Study team: **Week 56 also required.** `PSB_SGRQ_WEEKS` corrected to `{1,8,16,24,32,40,48,56,64}` in `lib/timeline.ts`, restoring the 8-week cadence. |
| **OQ-7** | Is a merged **Navigator** intended to hold Manager privileges, or only Coordinator + read-only Manager visibility? | CR-08 | ✅ **Resolved** (2026-08-10) | Study team: **Full Manager privileges** ("we will be the ones using the app"). This is a knowing acceptance of the SoD risk in §6 by the party who will hold the elevated access. **Not yet implemented** — scoped to Phase 4, to be built against the §6 permission matrix so the acceptance is traceable in that PR. |

CR-05 (payment eligibility) remains blocked in full: OQ-1, OQ-2, and OQ-5 are all still pending and are
all load-bearing for a deterministic monthly denominator. Do not approximate a payment percentage from
the questionnaire-compliance engine in §12 — that engine is explicitly scoped to the current-visit
snapshot, not a calendar/study-month window, and mixing the two would fabricate precision the app does
not have (violates the determinism/idempotency quality gate).

---

## 9. Implementation risks

- **R1 — Silent compliance regression.** Relabeling/decoupling the "Compliance Index" without care will
  change numbers on manager dashboards mid-study. Mitigation: land the new metrics *alongside* the old
  number first, diff them, then switch. Guard with new unit tests in the `soa-compliance.test.ts` style.
- **R2 — Denominator drift / non-idempotency.** Conditional items (PRN, HVIR, E-RS D28→D42) leaking into
  a denominator make the same patient-day yield different results. Mitigation: allow-list + explicit
  conditional gates + property tests asserting idempotency.
- **R3 — Data-quality landmine (PRN mis-bucketing). ✅ Mitigated (Phase 2, §12).** `tasks.q` could not be
  trusted as "the questionnaires." Fixed at the root (seed data corrected) and defended in code (explicit
  allow-list independent of array placement) with a standing regression test (CMP-006.8) asserting
  PRN ∉ `tasks.q` for every seeded patient.
- **R4 — Destructive correction.** Any correction path built on the current in-place `savePatient`
  destroys the original value → ALCOA+ violation. Mitigation: append-only envelope before any correction
  UI ships.
- **R5 — Privilege escalation via role merge.** Highest-severity. Mitigation: matrix-driven capability
  model, retain underlying roles, SoD sign-off.
- **R6 — Payment ≠ clinical eligibility bleed.** Must keep clinical eligibility independent of the 80%
  threshold (clinical_eligibility rules). Mitigation: separate modules, explicit test that neither imports
  the other's threshold.

---

## 10. Phased delivery plan

| Phase | Scope | Entry criteria | Exit criteria (quality gate) |
|---|---|---|---|
| **1 — Requirement validation & gap analysis** ✅ Done | *This document.* | — | Stakeholder answers to OQ-1…OQ-7; CR-09 protocol reconciliation. |
| **2 — Compliance engine redesign** 🟡 Partial (§12) | Questionnaire allow-list; three domains; deterministic denominators; E-RS-immediate/PRN-weight-0 idempotency. | OQ-1,2,4,5,6 resolved. | **Questionnaire-compliance portion done** (OQ-3,4,6 resolved). **Payment-eligibility portion still blocked** — OQ-1, OQ-2, OQ-5 pending. |
| **3 — Timeline auditability** ⬜ Not started | Correction envelope; append-only hash-chained ledger; non-destructive anchor edits. | Correction fields + retention rules approved. | Original-state reconstruction demonstrated; physical delete impossible; ALCOA+ fields enforced. |
| **4 — Permission consolidation** ⬜ Not started (direction confirmed) | Navigator capability model from the §6 matrix; SoD sign-off. | OQ-7 resolved ✅. | No privilege escalation vs as-is; underlying roles retained; documented conflicts resolved; SoD acceptance recorded in the implementing PR. |
| **5 — UI & reporting** ⬜ Not started | Split tiles (Questionnaire / Task / Payment); correction UI; export columns. | Phases 2–4 merged. | No metric mislabeled "compliance"; exports null-guarded and denominator-annotated. |
| **6 — Regression testing** 🟡 Ongoing | Extend `soa-compliance.test.ts` + add compliance/idempotency/audit suites. | Phases 2–5 code-complete. | All existing tests green; new determinism & SoD tests green; zero silent regressions. CMP-006 added this pass (§12); full suite green (322/322). |
| **7 — Validation & release readiness** ⬜ Not started | Traceability matrix (CR → code → test), GxP review, monitor walkthrough. | Phase 6 green. | Quality gate §11 fully satisfied and signed. |

---

## 11. Quality-gate attestation for this deliverable

| Requirement | Status in this document |
|---|---|
| Zero undocumented assumptions | ✅ OQ-1,2,5 remain open and are **not** approximated; OQ-3,4,6,7 resolved by explicit stakeholder answer, quoted in §8. |
| Zero protocol contradictions | ✅ CR-09 reconciled without contradicting the SoA (§8, §3). Remaining architecture gaps (CR-06/07) and RBAC change (CR-08) are flagged, not built around a guess. |
| Zero silent regressions | ✅ Full suite green (322/322, 18 files) after Phase 2 changes; new CMP-006 suite added; existing `soa-compliance.test.ts` unaffected. |
| Mathematical determinism in denominators (idempotency) | ✅ Questionnaire-compliance allow-list is a closed set, immune to task-array placement (§12); PRN and HVIR are weight-0 by construction, not by data hygiene alone. Payment-domain determinism remains blocked pending OQ-1/2/5 — **not attempted** rather than approximated. |
| Explicit identification of unknowns | ✅ §8, kept current with resolution dates and quoted answers. |
| Protocol evidence over stakeholder interpretation | ✅ CR-09's resolution keeps the SoA's PSB-anchored daily-ePRO schedule unchanged; only the already-SoA-compliant CAT-at-screening item was in question. |

> **Handoff note:** Phase 1 (this document) is complete. Phase 2 is **partially** implemented: the
> questionnaire-compliance engine (CR-01/02/03/04(engine)/09/10) is done and tested; the payment-eligibility
> engine (CR-05) remains blocked on OQ-1/2/5. No timeline-audit (Phase 3), RBAC (Phase 4), or UI (Phase 5)
> code has been written — CR-06/07/08 direction is recorded but not implemented. See §12 for the exact diff.

---

## 12. Phase 2 implementation log (this pass)

Scope of this pass: build the **questionnaire-compliance** portion of the engine using the study team's
resolved open questions (OQ-3, OQ-4, OQ-6, and — for scoping purposes only — OQ-7). Payment eligibility
(CR-05) was **not** touched: OQ-1, OQ-2, OQ-5 are still pending and are load-bearing for a deterministic
monthly denominator, so nothing was built that would require guessing them.

### 12.1 `lib/compliance.ts` — new questionnaire-compliance calculator

Added `QUESTIONNAIRE_CODES` (`DTQ`, `ERS`, `WURSS`, `SGRQ`), `QUESTIONNAIRE_EXCLUDED_CODES` (`PRN`,
`HVIR`, `CAT`, `IC`), and `computeQuestionnaireCompliance(patient)`, which returns `{ done, total, pct }`
over the confirmed allow-list only, scanning **all** of `patient.tasks` (`q`/`pr`/`l`/`ad`) rather than
trusting the `q` array — this is what makes the exclusion of PRN/CAT/HVIR/IC hold even though they are
(or, for PRN, previously were) present under a `Q`-labelled task. `pct` is `null`, never a fabricated `0`,
when no in-scope questionnaire is present in the current snapshot — consistent with the null-guarding
convention already used by `deriveCumulativeAdherence` and `safeAverage`/`safeRatio` in `operations.ts`.

**Explicit scope boundary:** this function is the **current-visit-snapshot** questionnaire completion —
it mirrors how `countTasks` already scopes "task completion" in this app (today's task list, not a
longitudinal record). It is **not** the CR-05 payment-eligibility percentage, which needs a per-day
submission history and a defined calendar/study-month window that do not exist yet. The two must not be
conflated; doing so would fabricate the precision the determinism/idempotency quality gate forbids.

### 12.2 `lib/data.ts` — PRN seed-data correction (CR-03/CR-10 root cause)

`PRN` ("COPD PRN Inhaler Use") was present inside `tasks.q` for three seeded patients — HMC-012, CUN-023,
CUN-058 — while the canonical SoA matrix classifies it `AD` (`ALL_MATRIX_ROWS`, `lib/timeline.ts`). Moved
to `tasks.ad` for all three, matching the other six patients and the canonical classification. This is a
root-cause fix, not just a code-side workaround; §12.1's allow-list is a second, independent layer that
holds even if a similar miscategorization is reintroduced.

### 12.3 `lib/timeline.ts` — SGRQ Week 56 (OQ-6)

`PSB_SGRQ_WEEKS` changed from `{1,8,16,24,32,40,48,64}` to `{1,8,16,24,32,40,48,56,64}` per the study
team's confirmation, restoring the every-8-week cadence between Week 48 and Week 64.

### 12.4 Tests

`tests/unit/compliance.test.ts` gained suite `CMP-006` (8 cases): allow-list/exclusion-set content,
PR/L/AD never counted (CR-03), PRN excluded even when placed in `tasks.q` (CR-10 regression guard), CAT/
HVIR/IC excluded despite being category `Q` in the SoA, `pct: null` on an empty in-scope set, a 100%
happy path, and a standing regression assertion that no seeded patient has `PRN` in `tasks.q` (CMP-006.8
— fails immediately if §12.2's fix is ever reverted or reintroduced elsewhere).

### 12.5 Verification

- `npx vitest run` — **322/322 tests passing, 18/18 files**, including the unmodified
  `tests/unit/soa-compliance.test.ts` regression suite (confirms the SGRQ/PRN changes did not disturb
  existing SoA contract tests).
- `npx tsc --noEmit` — no new type errors. The only errors present (`crypto-001-003.test.ts`,
  `audit-004-db-007.test.ts`) are pre-existing and in files untouched by this pass (confirmed by scope —
  neither file was edited).

### 12.6 What was deliberately NOT done in this pass

- **CR-05 (payment eligibility):** no code. OQ-1/2/5 pending.
- **CR-04 UI relabeling, CR-01 UI surfacing:** the calculators exist and are tested; wiring them into
  `Dashboard.tsx` / `ManagerDashboard.tsx` / `StatsScreen.tsx` (and relabeling "Compliance Index") is
  Phase 5, scoped separately so the UI redesign (which must also decide how "Task completion" is
  presented, per CR-04) can be done as one coherent, reviewable change rather than piecemeal.
- **CR-06/07 (timeline auditability):** Phase 3, unstarted, independent of today's answers.
- **CR-08 (Navigator role merge):** OQ-7 is now resolved (full Manager privileges), but **no RBAC code
  was changed**. This is explicitly Phase 4 and was kept out of this pass because it is a security-
  sensitive, separately-reviewable change (§6) — bundling an SoD-risk-accepting role merge into the same
  commit as compliance-calculation logic would make both harder to review and harder to roll back
  independently.
