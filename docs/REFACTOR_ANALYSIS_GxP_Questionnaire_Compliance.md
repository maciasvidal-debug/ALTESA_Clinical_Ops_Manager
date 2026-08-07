# GxP Refactor Analysis — Questionnaire Compliance, Timeline Auditability & Role Consolidation

**Study:** ALTESA Clinical Ops Manager
**Scope:** Change requests CR-01 … CR-10
**Author role:** Senior GxP software architect / protocol analyst / compliance reviewer / refactoring strategist
**Document type:** Phase 1 deliverable — Requirement validation & gap analysis (Phases 2–7 planned, not yet executed)
**Status:** Draft for stakeholder review. **No production code has been changed by this analysis.**

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
| **CR-01** | Display questionnaire-only compliance | 🟠 Gap | No questionnaire-only metric exists. The displayed "Compliance Index" is all-category `countTasks` (§2.1). Requires a new metric restricted to the `Q`-category **protocol ePROs**. |
| **CR-02** | Questionnaire compliance must include DTQ | 🟠 Gap | DTQ is a `Q` item (`lib/timeline.ts:100`, daily in PSB) but is in **no** compliance calculation today (§2.2 uses E-RS only). Must be added to the questionnaire denominator/numerator. |
| **CR-03** | Non-questionnaire activities must not affect questionnaire compliance | 🔴 Contradiction (data) | Two concrete defects: (a) the displayed metric mixes PR/L/AD into "compliance" (§2.1); (b) **PRN (Rescue Inhaler) is mis-bucketed into the `q` array** for HMC-012 (`lib/data.ts:295`), CUN-023 (`:322`), CUN-058 (`:417`) while the canonical matrix classes PRN as `AD` (`lib/timeline.ts:151`). Any "category `q`" definition of questionnaire compliance would silently count the Rescue Inhaler for those patients. Must be resolved by **code = a curated questionnaire allow-list**, not by trusting `tasks.q`. |
| **CR-04** | Display task completion percentage independently | 🟠 Gap | `countTasks` exists and is the right primitive, but it is currently **labeled** "Compliance." CR-04 = keep the number, **rename/relocate** it as "Task completion," and stop calling it compliance. Low risk once §2.1 is decoupled. |
| **CR-05** | Display participant payment eligibility | 🟠 Gap (greenfield) | **No payment concept exists anywhere** (only a `payment=()` Permissions-Policy header, `next.config.ts:55`). Entire `payment_compliance` domain (≥80% of protocol-required questionnaires within a defined month, PRN weight 0) is new. Blocked on Open Questions OQ-1/OQ-2. |
| **CR-06** | Enable retrospective timeline corrections | 🔴 Contradiction (architecture) | The timeline is **derived, not stored** (§2.5). "Correcting" it today means mutating anchor dates on the `Patient` record **in place**, with no historical record. No correction data model exists. Requires a new stored, versioned correction envelope. |
| **CR-07** | Timeline corrections must satisfy ALCOA+ | 🔴 Contradiction (architecture) | No correction preserves {original, corrected, user, timestamp, reason} today (`LogEntry` lacks these fields, `lib/data.ts:34-44`); the "immutable audit ledger" is mocked UI state (`ManagerDashboard.tsx:286`). Physical overwrite is currently possible → violates "historical records must never be destroyed." Requires append-only, hash-chained audit + correction schema. |
| **CR-08** | Merge Coordinator + Manager into one Navigator role | 🔴 Contradiction (security) | Coordinator (task mutation) and Manager (protocol authoring, key/activation-code generation, master password — `lib/security.ts:92-110`, `MANUAL_MANAGER.md`) are **separation-of-duties boundaries**. A naive union grants every Navigator the ability to author protocol amendments *and* complete the very tasks those amendments govern — a self-approval / privilege-escalation path. Requires a permission matrix and gap analysis (role_consolidation rules) **before** any merge. Note the label "Navigator" already exists in-code (§2.4). |
| **CR-09** | Questionnaire collection must strictly begin at the screening visit | 🔴 Contradiction (SoA) | Per the SoA as encoded: the daily ePRO questionnaires (**DTQ, E-RS/PGIS, WURSS**) begin at **PSB Day 1 = `psbStartDate`** (`lib/timeline.ts:211-220`, `buildPSBVisitDefs`), which is ~3 weeks **after** screening (`lib/data.ts:277` "PSB Start (Theoretical)"). Only **CAT** is a Screening/Rescreening questionnaire (`lib/timeline.ts:96-97`). Taking CR-09 literally would start daily ePRO accrual before the protocol schedules it, inflating denominators. **Higher-priority source (SoA) wins** pending clarification — see OQ-3. |
| **CR-10** | Rescue Inhaler strictly excluded from compliance % | ✅ Aligned (intent) / 🔴 (data) | Matches the protocol finding (PRN is a conditional PRN event, weight 0). The **intent** is correct and consistent; the **blocker** is the same mis-bucketing as CR-03 — PRN sits in `tasks.q` for three patients. Exclusion must be enforced by an explicit exclusion set keyed on code `'PRN'` (and any future PRN/conditional codes), independent of which array the seed data happens to use. |

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
| **Protocol** | CR-09 conflicts with the protocol's PSB-anchored ePRO start (§CR-09). No other CR changes protocol *rules*, but payment compliance introduces a business rule (80% monthly) that must be traced to an approved source (OQ-1). |
| **SoA** | Questionnaire allow-list (§4.1) must be ratified against Table 1/Table 2. SGRQ schedule set `{1,8,16,24,32,40,48,64}` (`timeline.ts:534`) breaks the every-8-week cadence between W48→W64 (16-week gap) — reconcile before SGRQ enters any denominator (OQ-6). |
| **Database** | New record types: payment-period compliance snapshot, timeline-correction envelope, hash-chained audit entry. `Patient` anchor-date edits must stop being destructive (`db.ts:108`). `Task.subcat`/category cleanup for PRN mis-bucketing (`data.ts:295,322,417`). |
| **API** | New pure calculators (questionnaire compliance, payment eligibility) mirroring the pure/idempotent style of `compliance.ts`/`operations.ts`. New capture path for corrections. All must be side-effect-free and unit-testable. |
| **UI** | Relabel "Compliance Index" → separate **Questionnaire compliance**, **Task completion**, **Payment eligibility** tiles (`Dashboard.tsx`, `ManagerDashboard.tsx`, `StatsScreen.tsx`). Correction UI with mandatory reason. Role-gated controls if Navigator ships. |
| **Reporting** | CSV/KPI export (`operations.ts:691-757`) gains payment-eligibility and questionnaire-compliance columns; must retain null-guarding (no `#DIV/0!`). Compliance figures in monitor exports must cite denominator basis. |
| **Audit trail** | Replace mocked ledger with real append-only hash chain; every correction and every compliance-threshold crossing must be attributable + contemporaneous (ALCOA+). |
| **Security** | CR-08 is the dominant risk (privilege escalation / SoD). Key custody + activation-code generation must not be silently granted to task-entry users. |
| **Open questions** | §8. |
| **Implementation risks** | §9. |

---

## 8. Open questions register (must be answered before the dependent phase builds)

| # | Question | Blocks | Why it cannot be assumed |
|---|---|---|---|
| **OQ-1** | Is the **80% payment threshold** an approved business rule, and what is its documented source? | CR-05 | The 0.8 constant exists for *ePRO adherence* (`compliance.ts:31`), not for payment. Reusing it for payment is an assumption. |
| **OQ-2** | "Within a specific **calendar or study month**" — which? Calendar month, 28-day study month, or PSB-month from `psbStartDate`? | CR-05 | Denominator determinism depends on the exact window; the phrasing is ambiguous. |
| **OQ-3** | CR-09: does "questionnaire collection begins at screening" refer to **CAT only**, or is it a request to move daily ePRO accrual earlier than the SoA schedules it? | CR-01/09 | SoA starts daily ePRO at PSB Day 1 (`timeline.ts:211-220`). Literal reading contradicts SoA. |
| **OQ-4** | Should **HVIR (Home Virology)**, being conditional post-DTQ+, be excluded from questionnaire compliance the same way PRN is? | CR-03/10 | It is `category 'Q'` but conditional; treating it either way is a rule, not a given. |
| **OQ-5** | For Treatment/FU, how is the **E-RS D28→D42 conditional extension** counted in the denominator (resolution-gated)? | CR-05 | The extension is conditional (`timeline.ts:103`); leaving it implicit breaks determinism. |
| **OQ-6** | Is the SGRQ schedule `{1,8,16,24,32,40,48,64}` correct (note the W48→W64 gap)? | CR-05 (SGRQ) | The set breaks its own every-8-week pattern; a periodic denominator must be exact. |
| **OQ-7** | Is a merged **Navigator** intended to hold Manager privileges (protocol authoring, key/activation custody), or only Coordinator + read-only Manager visibility? | CR-08 | Determines whether SoD boundaries are crossed. |

---

## 9. Implementation risks

- **R1 — Silent compliance regression.** Relabeling/decoupling the "Compliance Index" without care will
  change numbers on manager dashboards mid-study. Mitigation: land the new metrics *alongside* the old
  number first, diff them, then switch. Guard with new unit tests in the `soa-compliance.test.ts` style.
- **R2 — Denominator drift / non-idempotency.** Conditional items (PRN, HVIR, E-RS D28→D42) leaking into
  a denominator make the same patient-day yield different results. Mitigation: allow-list + explicit
  conditional gates + property tests asserting idempotency.
- **R3 — Data-quality landmine (PRN mis-bucketing).** `tasks.q` cannot be trusted as "the
  questionnaires" (`data.ts:295,322,417`). Mitigation: never derive scoring membership from the seed
  array; also fix the seed and add a test asserting PRN ∉ questionnaire set for all patients.
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
| **1 — Requirement validation & gap analysis** | *This document.* | — | Stakeholder answers to OQ-1…OQ-7; CR-09 protocol reconciliation. |
| **2 — Compliance engine redesign** | Questionnaire allow-list; three domains; deterministic denominators; E-RS-immediate/PRN-weight-0 idempotency. | OQ-1,2,4,5,6 resolved. | Pure, idempotent calculators + unit tests; old vs new diff report; zero protocol contradictions. |
| **3 — Timeline auditability** | Correction envelope; append-only hash-chained ledger; non-destructive anchor edits. | Correction fields + retention rules approved. | Original-state reconstruction demonstrated; physical delete impossible; ALCOA+ fields enforced. |
| **4 — Permission consolidation** | Navigator capability model from the §6 matrix; SoD sign-off. | OQ-7 resolved; matrix approved. | No privilege escalation vs as-is; underlying roles retained; documented conflicts resolved. |
| **5 — UI & reporting** | Split tiles (Questionnaire / Task / Payment); correction UI; export columns. | Phases 2–4 merged. | No metric mislabeled "compliance"; exports null-guarded and denominator-annotated. |
| **6 — Regression testing** | Extend `soa-compliance.test.ts` + add compliance/idempotency/audit suites. | Phases 2–5 code-complete. | All existing tests green; new determinism & SoD tests green; zero silent regressions. |
| **7 — Validation & release readiness** | Traceability matrix (CR → code → test), GxP review, monitor walkthrough. | Phase 6 green. | Quality gate §11 fully satisfied and signed. |

---

## 11. Quality-gate attestation for this deliverable

| Requirement | Status in this document |
|---|---|
| Zero undocumented assumptions | ✅ All unknowns raised as OQ-1…OQ-7, none resolved silently. |
| Zero protocol contradictions | ✅ Contradictions (CR-06/07/08/09, PRN data) are **flagged**, not baked in. |
| Zero silent regressions | ✅ Old-vs-new diff + regression-suite extension mandated (Phases 2, 6; R1). |
| Mathematical determinism in denominators (idempotency) | ✅ Allow-list + per-phase denominators + conditional-item gates specified (§4). |
| Explicit identification of unknowns | ✅ §8. |
| Protocol evidence over stakeholder interpretation | ✅ Higher-priority SoA wins on CR-09; all claims cite file/line or SoA. |

> **Handoff note:** This is the Phase 1 analysis only. No compliance formula, role change, timeline
> mutation, or schema change has been implemented. Phases 2–7 are gated on the Open Questions above.
