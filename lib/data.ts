export const getToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
export const pad = (n: number) => String(n).padStart(2, '0');
export const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
export const diffDays = (a: Date, b: Date) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
export const fmtISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function fmtHuman(d: Date) {
  const today = getToday();
  const diff = diffDays(today, d);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff <= 6) return `in ${diff} days`;
  if (diff < -1 && diff >= -6) return `${Math.abs(diff)} days ago`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}${d.getFullYear() !== today.getFullYear() ? ', ' + d.getFullYear() : ''}`;
}

export function getTodayPct(p: any) {
  const SCR_PCT = 10.0;
  const PSB_PCT = 60.0;
  const RV_PCT = 2.0;
  const TX_PCT = 4.6;
  const FUP_PCT = 23.4;
  const today = getToday();

  if (p.phaseCode === 'scr') {
    const days = Math.max(0, diffDays(p.screeningDate, today));
    return Math.min(SCR_PCT, (days / 42) * SCR_PCT);
  }
  // Rescreening occurs at Week 48 or Week 68 of PSB — position must reflect
  // elapsed PSB time, not screening time. Using the same formula as 'psb'.
  if (p.phaseCode === 'rescr') {
    const days = Math.max(0, diffDays(p.psbStartDate || p.screeningDate, today));
    return SCR_PCT + Math.min(PSB_PCT, (days / 476) * PSB_PCT);
  }
  else if (p.phaseCode === 'tx') {
    const days = Math.max(0, diffDays(p.randomizationDate || p.rvInfectionDate || today, today));
    return SCR_PCT + PSB_PCT + RV_PCT + Math.min(TX_PCT, (days / 7) * TX_PCT);
  }
  else if (p.phaseCode === 'fu') {
    const days = Math.max(0, diffDays(p.randomizationDate || p.rvInfectionDate || today, today) - 7);
    return SCR_PCT + PSB_PCT + RV_PCT + TX_PCT + Math.min(FUP_PCT, (days / 35) * FUP_PCT);
  }
  else if (p.dtqPos && !p.randomizationDate) {
    // RV phase
    return SCR_PCT + PSB_PCT + (RV_PCT / 2);
  }
  else if (p.phaseCode === 'psb') {
    const days = Math.max(0, diffDays(p.psbStartDate || p.screeningDate, today));
    return SCR_PCT + Math.min(PSB_PCT, (days / 476) * PSB_PCT);
  }

  return 100;
}

/**
 * Returns a concise study-position label for the timeline marker.
 * Never returns "Day undefined" — falls back to phase label if anchor dates
 * are unavailable.
 */
export function getTodayLabel(p: any): string {
  const today = getToday();
  if (p.phaseCode === 'scr') {
    const d = Math.max(0, diffDays(p.screeningDate, today)) + 1;
    return `Day ${d}`;
  }
  if (p.phaseCode === 'psb' || p.phaseCode === 'rescr') {
    const ref = p.psbStartDate || p.screeningDate;
    if (ref) {
      const days = Math.max(0, diffDays(ref, today));
      const week = Math.max(1, Math.floor(days / 7) + 1);
      return `Week ${week}`;
    }
  }
  if (p.phaseCode === 'tx' || p.phaseCode === 'fu' || (p.dtqPos && !p.randomizationDate)) {
    const ref = p.randomizationDate || p.rvInfectionDate;
    if (ref) {
      const d = Math.max(1, diffDays(ref, today) + 1);
      return `Day ${d}`;
    }
  }
  if (p.studyDay != null) return `Day ${p.studyDay}`;
  return 'Today';
}

export type LogEntry = {
  id: string;              // `${patientId}_${Date.now()}`
  patientId: string;
  siteId?: string;
  text: string;            // raw text entered by Navigator
  timestamp: string;       // ISO string — ALCOA+ (Attributable, Legible, Contemporaneous)
  type: 'note' | 'reminder';
  reminderDate?: string;   // ISO date string extracted by Regex engine
  reminderText?: string;   // distilled reminder action from text
  done: boolean;           // for reminders: has been actioned
};

export type Notification = {
  id: string;
  type: 'critical' | 'alert' | 'overdue' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  patientId?: string;
  link?: string;
};

export type Task = {
  code: string;
  label: string;
  icon: string;
  done: boolean;
  urgNote?: string;
  note?: string;
  critical?: boolean;
  seq?: boolean;
  periodic?: boolean;
  regulatory?: boolean;
  urgent?: boolean;
  dueDate?: Date;
  subcat?: 'screening' | 'fup' | 'general';
  dependsOn?: string[];
  attestation?: string;
  requiresData?: {
    label: string;
    type: 'time' | 'number' | 'text';
    placeholder?: string;
  };
  dataValue?: string;
  attested?: boolean;
};

export type Document = {
  id: string;
  name: string;
  category: 'ICF' | 'LAB' | 'ECG' | 'IMG' | 'OTHER';
  extension: string;
  uploadDate: Date;
  visitId?: string;
  url: string;
  size: string;
  critical?: boolean;
};

/**
 * Regulatory lifecycle for a protocol amendment.
 * Follows ICH E6(R3) Section 4 — Site Management.
 *
 * draft      → being prepared by the site, not yet submitted to IRB/EC
 * submitted  → submitted to IRB/EC, awaiting approval
 * approved   → IRB/EC approval received, not yet operationally effective at site
 * active     → currently in use; all new patients enrolled under this version
 * superseded → replaced by a newer amendment; patients enrolled remain tracked
 * legacy     → alias for superseded (backward compat with persisted records)
 */
export type AmendmentStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'active'
  | 'superseded'
  | 'legacy';   // kept for backward compat with IndexedDB records

/**
 * Snapshot of rule and SoA edits captured by the VisualProtocolEditor.
 * Stored alongside the amendment so the editor can reload the state on next open.
 */
export type AmendmentEditorState = {
  /** ruleId → currentValue (e.g. 'spiro_washout' → '6 hours') */
  rules: Record<string, string>;
  /** taskId → { phase → enabled } (e.g. 'spiro' → { d14: false }) */
  soa: Record<string, Record<string, boolean>>;
  rationale: string;
};

export type ProtocolAmendment = {
  id: string;
  label: string;
  /** ISO date: when the Sponsor issued / released the amendment document. */
  releaseDate: string;
  /** ISO date: when the site became operationally effective (CRC trained, tools updated). */
  effectiveDate?: string;
  status: AmendmentStatus;
  /** Justification for the amendment — required by ICH E6(R3) §4.5.3. */
  rationale?: string;
  /** IRB/IEC approval number or regulatory submission reference. */
  approvalReference?: string;
  /** Protocol sections affected (e.g. ["5.2 Eligibility", "Appendix A – SoA"]). */
  amendedSections?: string[];
  /** Snapshot from the last VisualProtocolEditor save — enables state rehydration. */
  editorState?: AmendmentEditorState;
};

export const PROTOCOL_AMENDMENTS: ProtocolAmendment[] = [
  {
    id: 'v1.0',
    label: 'Initial Protocol',
    releaseDate: '2025-01-10',
    effectiveDate: '2025-01-10',
    status: 'superseded',
    rationale: 'Initial approved protocol version.',
    approvalReference: 'IRB-2025-001',
  },
  {
    id: 'v2.0',
    label: 'Amendment 1 — Extended Timeline',
    releaseDate: '2026-04-20',
    effectiveDate: '2026-04-20',
    status: 'active',
    rationale: 'Extended observation window from 14 to 28 days per Sponsor request SR-2026-004. Updated SAE reporting window.',
    approvalReference: 'IRB-2026-045',
    amendedSections: ['5.2 Inclusion/Exclusion', 'Appendix A – SoA'],
  },
];

export type Patient = {
  id: string;
  siteId?: string;         // Explicit site identifier — required for Navigator multi-site tracking
  name: string;
  phase: string;
  phaseCode: string;
  phaseLabel: string;
  studyDay?: number;
  loc: string;
  lang: string;
  alert: string | null;
  dtqPos?: boolean;
  nextVisitWindow?: number;
  screeningDate: Date;
  screeningOutcome?: 'success' | 'failure';
  screeningFailureReason?: string;
  psbStartDate?: Date;
  rvInfectionDate?: Date;
  randomizationDate?: Date;
  consentDate?: Date;
  monthlyCallDue?: Date;
  resolution?: Date;
  tasks: {
    q: Task[];
    pr: Task[];
    l: Task[];
    ad: Task[];
  };
  ers: number[];
  psb: number | null;
  psbRecords: number;
  nextVisit: Date;
  nextVisitLabel: string;
  labNote?: string;
  documents: Document[];
  protocolVersion?: string;
};

/**
 * Returns the canonical site identifier for a patient.
 * Prefers the explicit `siteId` field (set for patients enrolled via Hybrid-Auth).
 * Falls back to the legacy convention of deriving the site from the patient ID prefix
 * (e.g. "HMC-047" → "HMC") for backward compatibility with existing records.
 */
export const getSiteId = (p: Patient): string =>
  p.siteId || (p.id.includes('-') ? p.id.split('-')[0] : 'UNKNOWN');

export const PATIENTS: Patient[] = [
  {
    id: 'HMC-047', siteId: 'HMC', name: 'Elena Rodriguez', phase: 'PSB', phaseCode: 'psb',
    phaseLabel: 'Asymptomatic Phase · Week 45', protocolVersion: 'v1.0',
    loc: 'HOME→CLINIC', lang: 'English', alert: 'DTQ_POSITIVE', dtqPos: true,
    screeningDate: addDays(getToday(), -329), psbStartDate: addDays(getToday(), -315),
    tasks: {
      q: [
        { code: 'DTQ', label: 'Daily Trigger Questionnaire', icon: 'Bell', done: true, urgNote: 'crit-note', note: '⚠ POSITIVE — RV symptom onset confirmed. RV Protocol activated.', critical: true, dueDate: addDays(getToday(), -1) },
        { code: 'HVIR', label: 'Home Self-Collect Virology — COVID-19/Flu', icon: 'Home', done: false, urgNote: 'warn-note', note: 'Patient may self-collect at home if unwilling to attend site. ePRO will prompt after positive DTQ (fn. h)', dueDate: getToday() },
        { code: 'ERS', label: 'E-RS / PGIS (EXACT)', icon: 'ClipboardList', done: true, note: 'Daily during PSB. PGIS at each E-RS administration (fn. i)', dueDate: getToday() },
        { code: 'WURSS', label: 'WURSS-11', icon: 'ClipboardList', done: true, note: 'Daily during PSB (fn. i)', dueDate: getToday() },
      ],
      pr: [], l: [],
      ad: [
        { code: 'PRN', label: 'COPD PRN Inhaler Use (puffs/day)', icon: 'Wind', done: true, note: 'Collected with E-RS', dueDate: getToday(), subcat: 'general' },
        { code: 'CMED', label: 'Concomitant Medications — record any changes', icon: 'Pill', done: false, note: 'Document new/changed ConMeds since last contact (fn. l)', dueDate: addDays(getToday(), 1), subcat: 'fup' },
      ]
    },
    ers: [7, 6, 8, 7, 9, 8, 7, 6, 5, 7, 8, 7, 6, 8, 9, 10, 9, 8, 7, 6, 7, 8, 9, 11, 10, 9, 8, 7, 8, 9],
    psb: 7.4, psbRecords: 94,
    nextVisit: getToday(), nextVisitLabel: 'RV Clinic Visit (URGENT)',
    documents: [
      { id: 'd1', name: 'Informed Consent v2.0', category: 'ICF', extension: 'PDF', uploadDate: addDays(getToday(), -329), url: '#', size: '1.2 MB', critical: true },
      { id: 'd2', name: 'Screening Spirometry', category: 'LAB', extension: 'PDF', uploadDate: addDays(getToday(), -329), url: '#', size: '450 KB' },
    ]
  },
  {
    id: 'CUN-001', siteId: 'CUN', name: 'James Wilson', phase: 'SCREENING', phaseCode: 'scr',
    phaseLabel: 'Screening · Day 0', protocolVersion: 'v2.0',
    loc: 'CLINIC', lang: 'English', alert: null,
    screeningDate: getToday(),
    consentDate: getToday(),
    tasks: {
      q: [
        { code: 'CAT', label: 'CAT — COPD Assessment Test', icon: '📋', done: true, note: 'Screening and Rescreening visits only (Table 1)' },
        { code: 'IC', label: 'Informed Consent', icon: '📝', done: true, note: 'New ICF required only if updated version available (fn. a)' },
      ],
      pr: [
        { code: 'OSC', label: 'Oscillometry', icon: '🫁', done: true, seq: true, note: 'Perform BEFORE spirometry at all visits with both (fn. f)' },
        { code: 'SPI', label: 'Spirometry (PRE & POST)', icon: '🫁', done: false, note: 'Washout: short-acting BD 4–6 h · BID 12 h · QD 24 h (fn. f). Pre- and post-SABD at Screening.', dependsOn: ['OSC'], attestation: 'I confirm that the patient has completed the required washout period (short-acting BD 4–6 h · BID 12 h · QD 24 h) prior to this assessment.' },
        { code: 'ECG', label: 'ECG (12-lead)', icon: '🫀', done: false, note: 'Single ECG at Screening. Collect PRIOR to blood draw (fn. e)' },
        { code: 'VS', label: 'Vital Signs', icon: '🩺', done: false, note: 'BP, HR, body temp, respiratory rate. Seated ≥ 5 min (fn. d)' },
        { code: 'PE', label: 'Physical Exam (incl. height — Screening only)', icon: '🩺', done: false, note: 'Full exam including height (Screening only). Subsequent: limited, symptom-directed, include weight (fn. c)' },
      ],
      l: [
        { code: 'CSL', label: 'Central Safety Labs — Chemistry / Haematology / Urinalysis', icon: '🧪', done: false, note: 'Full panel at Screening. Urinalysis: Screening only; subsequent visits: only if clinically indicated', dependsOn: ['ECG'] },
        { code: 'PT', label: 'Pregnancy Test (blood — WOCBP only)', icon: '🧪', done: false, note: 'Blood at Screening. Urine at Day 1 Pre-Dose. Blood at Day 28 FUP (fn. a)' },
      ],
      ad: [
        { code: 'DEMO', label: 'Demographics', icon: '📄', done: true, subcat: 'screening' },
        { code: 'MSH', label: 'Medical & Smoking History', icon: '📄', done: false, note: 'Document as medical history until Day 1 dosing. COPD exacerbations: separate eCRF page (fn. b)', subcat: 'screening' },
        { code: 'ELG', label: 'Assess Eligibility Criteria', icon: '✅', done: false, note: 'Inclusion and Exclusion. Rescreening: Exclusion criteria only (fn. a)', subcat: 'screening' },
        { code: 'COPH', label: 'COPD History & Medications', icon: '📄', done: false, subcat: 'screening' },
        { code: 'CMED', label: 'Concomitant Medications', icon: '💊', done: false, note: 'Reviewed by medically qualified investigator at Screening (fn. l)', subcat: 'screening' },
        { code: 'TRAIN', label: 'Train Participant on Study Procedures', icon: '🎓', done: false, note: 'Includes ePRO, DTQ, home virology testing instructions', subcat: 'screening' },
      ]
    },
    ers: [], psb: null, psbRecords: 0,
    nextVisit: addDays(getToday(), 21), nextVisitLabel: 'PSB Start (Theoretical)',
    nextVisitWindow: undefined,
    documents: [
      { id: 'd3', name: 'Informed Consent v2.0', category: 'ICF', extension: 'PDF', uploadDate: getToday(), url: '#', size: '1.2 MB', critical: true },
    ]
  },
  {
    id: 'HMC-012', siteId: 'HMC', name: 'Maria Garcia', phase: 'PSB', phaseCode: 'psb',
    phaseLabel: 'Asymptomatic Phase · Week 8', protocolVersion: 'v1.0',
    loc: 'HOME', lang: 'Spanish', alert: 'MONTHLY_CALL',
    screeningDate: addDays(getToday(), -70), psbStartDate: addDays(getToday(), -56),
    monthlyCallDue: addDays(getToday(), -1),
    tasks: {
      q: [
        { code: 'DTQ', label: 'Daily Trigger Questionnaire', icon: '🔔', done: true, note: 'Answer: NO' },
        { code: 'ERS', label: 'E-RS / PGIS (EXACT)', icon: '📋', done: false, note: 'Daily — record in eDiary' },
        { code: 'WURSS', label: 'WURSS-11', icon: '📋', done: false, note: 'Daily — record in eDiary' },
        { code: 'SGRQ', label: "SGRQ — Saint George's Respiratory Questionnaire", icon: '📋', done: false, periodic: true, note: '⚠ DUE: Day 56 (Week 8) — per Table 2. Next: approx. every 2 months during Asymptomatic Phase' },
        { code: 'PRN', label: 'COPD PRN Inhaler Use', icon: '💨', done: true, note: 'Collected with E-RS' },
      ],
      pr: [], l: [],
      ad: [
        { code: 'MC', label: 'Monthly Phone/Telehealth Call', icon: '📞', done: false, urgent: true, note: '⚠ Due: Week 8 (Day 56-58) ± 5-day window. Discuss: comorbidities, COPD meds, infections, hospitalisations (fn. m)', subcat: 'fup' },
        { code: 'CMED', label: 'Concomitant Medications — any changes since last call', icon: '💊', done: false, note: 'Collected during monthly call (fn. l)', subcat: 'fup' },
        { code: 'HOSP', label: 'COPD-related Hospitalisations', icon: '🏥', done: false, subcat: 'fup' },
      ]
    },
    ers: [5, 4, 6, 5, 4, 5, 6, 5, 4, 3, 5, 4, 5, 6, 5, 4, 5, 6, 5, 4, 5, 4, 5, 6, 5, 4, 5, 6, 5, 5],
    psb: 4.9, psbRecords: 30,
    nextVisit: addDays(getToday(), 2), nextVisitLabel: 'Monthly call ±5d (Day 56-58)',
    nextVisitWindow: 5,
    documents: [
      { id: 'd4', name: 'Informed Consent v1.0', category: 'ICF', extension: 'PDF', uploadDate: addDays(getToday(), -70), url: '#', size: '1.1 MB', critical: true },
    ]
  },
  {
    id: 'CUN-023', siteId: 'CUN', name: 'Robert Chen', phase: 'PSB', phaseCode: 'psb',
    phaseLabel: 'Asymptomatic Phase · Week 32', protocolVersion: 'v1.0',
    loc: 'HOME', lang: 'English', alert: null,
    screeningDate: addDays(getToday(), -238), psbStartDate: addDays(getToday(), -224),
    tasks: {
      q: [
        { code: 'DTQ', label: 'Daily Trigger Questionnaire', icon: '🔔', done: false },
        { code: 'ERS', label: 'E-RS / PGIS (EXACT)', icon: '📋', done: false, note: 'Daily' },
        { code: 'WURSS', label: 'WURSS-11', icon: '📋', done: false, note: 'Daily' },
        { code: 'PRN', label: 'COPD PRN Inhaler Use', icon: '💨', done: false, note: 'Collected with E-RS' },
      ],
      pr: [], l: [],
      ad: [
        { code: 'CMED', label: 'Concomitant Medications — record any changes', icon: '💊', done: false, note: 'Document new/changed ConMeds since last contact (fn. l)', subcat: 'fup' },
        { code: 'HOSP', label: 'COPD-related Hospitalisations', icon: '🏥', done: false, subcat: 'fup' },
      ]
    },
    ers: [6, 5, 7, 6, 5, 6, 7, 5, 4, 6, 7, 6, 5, 6, 7, 8, 6, 5, 6, 7, 6, 5, 4, 6, 7, 6, 5, 6, 7, 6],
    psb: 5.8, psbRecords: 156,
    nextVisit: addDays(getToday(), 112), nextVisitLabel: 'Rescreening Clinic (Week 48)',
    nextVisitWindow: 7,
    documents: []
  },
  {
    id: 'HMC-031', siteId: 'HMC', name: 'Sarah Miller', phase: 'TREATMENT', phaseCode: 'tx',
    phaseLabel: 'Treatment Period · Day 3 (±1)', protocolVersion: 'v1.0',
    loc: 'CLINIC', lang: 'English', alert: null,
    screeningDate: addDays(getToday(), -137), psbStartDate: addDays(getToday(), -123),
    rvInfectionDate: addDays(getToday(), -4), randomizationDate: addDays(getToday(), -3),
    tasks: {
      q: [
        { code: 'ERS', label: 'E-RS / PGIS (EXACT)', icon: '📋', done: true, note: 'Daily D1→D28. Continues to D42 if not returned to PSB by D28 (fn. i)' },
        { code: 'WURSS', label: 'WURSS-11', icon: '📋', done: true, note: 'Daily through Day 28 ONLY — does not continue to D42 (fn. i)' },
      ],
      pr: [
        { code: 'VS', label: 'Vital Signs', icon: '🩺', done: true, note: 'Seated ≥ 5 min (fn. d)' },
        { code: 'CVC', label: 'Central Virology Collection', icon: '🦠', done: false, note: 'Mid-turbinate nasal swab each nostril — qRT-PCR, susceptibility, resistance, genotyping (fn. g)' },
        { code: 'PK', label: 'Sparse PK Sampling — PRIOR to Day 3 dosing', icon: '🩸', done: false, note: '~24 h after last (Day 2) dose. Document sample time AND drug administration time (fn. j)' },
        { code: 'DRUG', label: 'Study Drug Dosing — Day 3', icon: '💊', done: false, note: 'Once daily', dependsOn: ['CVC', 'PK'], requiresData: { label: 'Time of Dose', type: 'time' } },
      ],
      l: [
        { code: 'CSL', label: 'Central Safety Labs — Chemistry / Haematology', icon: '🧪', done: false, note: 'Urinalysis only if clinically indicated at this visit (Table 1)' },
      ],
      ad: [
        { code: 'AE', label: 'Adverse Events', icon: '⚠️', done: true, regulatory: true, note: 'Collected from first dose through Day 42 Visit (fn. k)', subcat: 'fup' },
        { code: 'CMED', label: 'Concomitant Medications', icon: '💊', done: false, note: 'Record any changes (fn. l)', subcat: 'fup' },
        { code: 'HOSP', label: 'COPD-related Hospitalisations', icon: '🏥', done: false, subcat: 'fup' },
        { code: 'PRN', label: 'COPD PRN Inhaler Use', icon: '💨', done: false, note: 'Collected with E-RS', subcat: 'general' },
      ]
    },
    ers: [8, 7, 9, 10, 11, 12, 11, 10, 9, 8, 9, 10, 11, 12, 11, 10, 9, 10, 11, 12, 11, 10, 9, 8, 9, 10, 11, 12, 11, 13],
    psb: 8.3, psbRecords: 89,
    nextVisit: addDays(getToday(), 4), nextVisitLabel: 'Treatment Day 7 (±1) — Clinic',
    nextVisitWindow: 1,
    documents: [
      { id: 'd5', name: 'Informed Consent v2.0', category: 'ICF', extension: 'PDF', uploadDate: addDays(getToday(), -137), url: '#', size: '1.2 MB', critical: true },
      { id: 'd6', name: 'Day 1 ECG', category: 'ECG', extension: 'PDF', uploadDate: addDays(getToday(), -3), url: '#', size: '890 KB' },
    ]
  },
  {
    id: 'HMC-039', siteId: 'HMC', name: 'Antonio Lopez', phase: 'FOLLOWUP', phaseCode: 'fu',
    phaseLabel: 'Follow-up · Day 14 (±2)',
    loc: 'CLINIC', lang: 'Spanish', alert: null,
    screeningDate: addDays(getToday(), -148), psbStartDate: addDays(getToday(), -134),
    rvInfectionDate: addDays(getToday(), -15), randomizationDate: addDays(getToday(), -14),
    tasks: {
      q: [
        { code: 'ERS', label: 'E-RS / PGIS (EXACT)', icon: '📋', done: false, note: 'Resolution check ongoing. PSB = 9.1. 3 consecutive days ≤ PSB triggers resolution.' },
        { code: 'WURSS', label: 'WURSS-11', icon: '📋', done: false, note: 'Day 14 of 28. Through Day 28 only (fn. i)' },
      ],
      pr: [
        { code: 'VS', label: 'Vital Signs', icon: '🩺', done: false, note: 'Seated ≥ 5 min (fn. d)' },
        { code: 'OSC', label: 'Oscillometry', icon: '🫁', done: false, seq: true, note: 'Perform BEFORE spirometry (fn. f)' },
        { code: 'SPI', label: 'Spirometry', icon: '🫁', done: false, note: 'Washout: short-acting BD 4–6 h · BID 12 h · QD 24 h (fn. f)', dependsOn: ['OSC'], attestation: 'I confirm that the patient has completed the required washout period (short-acting BD 4–6 h · BID 12 h · QD 24 h) prior to this assessment.' },
        { code: 'CVC', label: 'Central Virology Collection', icon: '🦠', done: false, note: 'Mid-turbinate nasal swab each nostril (fn. g)' },
      ],
      l: [],
      ad: [
        { code: 'AE', label: 'Adverse Events', icon: '⚠️', done: false, regulatory: true, note: 'D1 Dose through D42 (fn. k)', subcat: 'fup' },
        { code: 'CMED', label: 'Concomitant Medications', icon: '💊', done: false, subcat: 'fup' },
        { code: 'HOSP', label: 'COPD-related Hospitalisations', icon: '🏥', done: false, subcat: 'fup' },
        { code: 'PRN', label: 'COPD PRN Inhaler Use', icon: '💨', done: false, subcat: 'general' },
      ]
    },
    ers: [9, 8, 10, 11, 12, 13, 12, 11, 10, 9, 10, 11, 10, 9, 8, 7, 8, 9, 8, 7, 7, 8, 9, 8, 7, 7, 8, 8, 8, 7],
    psb: 9.1, psbRecords: 102,
    nextVisit: addDays(getToday(), 14), nextVisitLabel: 'Treatment Day 28 (±3) — Clinic',
    nextVisitWindow: 3,
    labNote: 'No Central Safety Labs at Day 14 (SoA Table 1). Labs scheduled at: Scr, Re-Scr, D1-PreDose, D3, D7, D28-FUP.',
    documents: [
      { id: 'd7', name: 'Informed Consent v2.0', category: 'ICF', extension: 'PDF', uploadDate: addDays(getToday(), -148), url: '#', size: '1.2 MB', critical: true },
    ]
  },
  {
    id: 'CUN-058', siteId: 'CUN', name: 'Linda Thompson', phase: 'PSB', phaseCode: 'psb',
    phaseLabel: 'Asymptomatic Phase · Week 65',
    loc: 'HOME', lang: 'English', alert: 'RESCREENING',
    screeningDate: addDays(getToday(), -469), psbStartDate: addDays(getToday(), -455),
    tasks: {
      q: [
        { code: 'DTQ', label: 'Daily Trigger Questionnaire', icon: '🔔', done: true, note: 'Answer: NO' },
        { code: 'ERS', label: 'E-RS / PGIS (EXACT)', icon: '📋', done: true },
        { code: 'WURSS', label: 'WURSS-11', icon: '📋', done: true },
        { code: 'PRN', label: 'COPD PRN Inhaler Use', icon: '💨', done: true },
      ],
      pr: [], l: [],
      ad: [
        { code: 'MC', label: 'Monthly Call', icon: '📞', done: true, note: 'Week 65 call completed', subcat: 'fup' },
        { code: 'CMED', label: 'Concomitant Medications', icon: '💊', done: true, subcat: 'fup' },
      ]
    },
    ers: [4, 3, 5, 4, 3, 4, 5, 4, 3, 4, 5, 4, 3, 4, 5, 3, 4, 5, 4, 3, 4, 5, 4, 3, 4, 5, 4, 3, 4, 4],
    psb: 3.8, psbRecords: 315,
    nextVisit: addDays(getToday(), 21), nextVisitLabel: 'Rescreening Clinic (Week 68)',
    nextVisitWindow: 7,
    documents: [
      { id: 'd8', name: 'Informed Consent v1.0', category: 'ICF', extension: 'PDF', uploadDate: addDays(getToday(), -469), url: '#', size: '1.1 MB', critical: true },
    ]
  },
  {
    id: 'HMC-067', siteId: 'HMC', name: 'Michael Brown', phase: 'FOLLOWUP', phaseCode: 'fu',
    phaseLabel: 'Follow-up · Day 28 (±3)',
    loc: 'CLINIC', lang: 'English', alert: null,
    screeningDate: addDays(getToday(), -202), psbStartDate: addDays(getToday(), -188),
    rvInfectionDate: addDays(getToday(), -29), randomizationDate: addDays(getToday(), -28),
    resolution: addDays(getToday(), -14),
    tasks: {
      q: [
        { code: 'SGRQ', label: "SGRQ — Saint George's Respiratory Questionnaire", icon: '📋', done: false, periodic: true, note: 'Administered at Day 28 Follow-up visit (Table 1, fn. i)' },
        { code: 'ERS', label: 'E-RS / PGIS — resolution confirmed', icon: '📋', done: true, note: 'Resolved Day 14 post-dose. Continued to D28 per protocol.' },
        { code: 'WURSS', label: 'WURSS-11 — final collection', icon: '📋', done: false, note: 'Day 28 is the terminal WURSS-11 collection. Daily through Day 28 ONLY — does not extend to D42 (fn. i)' },
      ],
      pr: [
        { code: 'PE', label: 'Physical Exam — limited (include weight)', icon: '🩺', done: true, note: 'Symptom-directed. Include weight (fn. c)' },
        { code: 'VS', label: 'Vital Signs', icon: '🩺', done: true, note: 'Seated ≥ 5 min (fn. d)' },
        { code: 'OSC', label: 'Oscillometry', icon: '🫁', done: true, seq: true, note: 'Perform BEFORE spirometry (fn. f)' },
        { code: 'SPI', label: 'Spirometry', icon: '🫁', done: false, note: 'Washout required (fn. f)', dependsOn: ['OSC'], attestation: 'I confirm that the patient has completed the required washout period (short-acting BD 4–6 h · BID 12 h · QD 24 h) prior to this assessment.' },
        { code: 'CVC', label: 'Central Virology Collection', icon: '🦠', done: true, note: 'Day 28 (fn. g)' },
      ],
      l: [
        { code: 'CSL', label: 'Central Safety Labs — Chemistry / Haematology', icon: '🧪', done: false, note: 'Urinalysis only if clinically indicated' },
        { code: 'PT', label: 'Pregnancy Test (blood — WOCBP only)', icon: '🧪', done: true, note: 'Blood at Day 28 FUP. (Urine was at Day 1 Pre-Dose) (fn. a)' },
      ],
      ad: [
        { code: 'AE', label: 'Adverse Events', icon: '⚠️', done: false, regulatory: true, note: 'Through D42 (fn. k)', subcat: 'fup' },
        { code: 'CMED', label: 'Concomitant Medications', icon: '💊', done: false, subcat: 'fup' },
        { code: 'HOSP', label: 'COPD-related Hospitalisations', icon: '🏥', done: false, subcat: 'fup' },
        { code: 'PRN', label: 'COPD PRN Inhaler Use', icon: '💨', done: false, note: 'Collected with E-RS', subcat: 'general' },
      ]
    },
    ers: [9, 8, 10, 11, 12, 13, 12, 11, 10, 9, 10, 9, 8, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7],
    psb: 9.1, psbRecords: 102,
    nextVisit: addDays(getToday(), 14), nextVisitLabel: 'Day 42 / EOS (±3) — Clinic',
    nextVisitWindow: 3,
    documents: [
      { id: 'd9', name: 'Informed Consent v2.0', category: 'ICF', extension: 'PDF', uploadDate: addDays(getToday(), -202), url: '#', size: '1.2 MB', critical: true },
    ]
  },
  {
    id: 'FALP-003', siteId: 'FALP-CL', name: 'Carmen Vidal', phase: 'RESCREENING', phaseCode: 'rescr',
    phaseLabel: 'Rescreening · Week 48 Visit', protocolVersion: 'v2.0',
    loc: 'CLINIC', lang: 'Spanish', alert: 'RESCREENING',
    screeningDate: addDays(getToday(), -336), psbStartDate: addDays(getToday(), -322),
    tasks: {
      q: [
        { code: 'CAT', label: 'CAT — COPD Assessment Test', icon: '📋', done: false, note: 'Screening and Rescreening visits only (Table 1)' },
        { code: 'IC', label: 'Informed Consent — Re-confirm', icon: '📝', done: true, note: 'New ICF only required if an updated version is available. Confirm willingness to comply (fn. a)' },
      ],
      pr: [
        { code: 'OSC', label: 'Oscillometry', icon: '🫁', done: false, seq: true, note: 'Perform BEFORE spirometry at all visits with both (fn. f)' },
        { code: 'SPI', label: 'Spirometry (PRE & POST)', icon: '🫁', done: false, note: 'Washout: short-acting BD 4–6 h · BID 12 h · QD 24 h (fn. f)', dependsOn: ['OSC'], attestation: 'I confirm that the patient has completed the required washout period (short-acting BD 4–6 h · BID 12 h · QD 24 h) prior to this assessment.' },
        { code: 'ECG', label: 'ECG (12-lead)', icon: '🫀', done: false, note: 'Single ECG at Rescreening. Collect PRIOR to blood draw (fn. e)' },
        { code: 'VS', label: 'Vital Signs', icon: '🩺', done: true, note: 'BP, HR, body temp, respiratory rate. Seated ≥ 5 min (fn. d)' },
        { code: 'PE', label: 'Physical Exam (limited — include weight, no height)', icon: '🩺', done: false, note: 'Height measured at initial Screening only. Subsequent visits: limited, symptom-directed, include weight (fn. c)' },
      ],
      l: [
        { code: 'CSL', label: 'Central Safety Labs — Chemistry / Haematology / Urinalysis', icon: '🧪', done: false, note: 'Full Chemistry/Haem panel. Urinalysis only if clinically indicated (fn. c)', dependsOn: ['ECG'] },
        { code: 'PT', label: 'Pregnancy Test (blood — WOCBP only)', icon: '🧪', done: false, note: 'Blood at Rescreening (fn. a)' },
      ],
      ad: [
        { code: 'DEMO', label: 'Demographics — verify/update', icon: '📄', done: true, subcat: 'screening' },
        { code: 'MSH', label: 'Medical & Smoking History — update', icon: '📄', done: false, note: 'Any new medical conditions since last visit. COPD exacerbations: separate eCRF page (fn. b)', subcat: 'screening' },
        { code: 'ELG', label: 'Assess Eligibility Criteria — Exclusion & Safety only', icon: '✅', done: false, note: 'Rescreening: only Exclusion/Safety criteria and willingness to comply are re-assessed (fn. a)', subcat: 'screening' },
        { code: 'COPH', label: 'COPD History & Medications — update', icon: '📄', done: false, note: 'Update any changes to COPD medications or history since last visit', subcat: 'screening' },
        { code: 'CMED', label: 'Concomitant Medications', icon: '💊', done: false, note: 'Reviewed by medically qualified investigator (fn. l)', subcat: 'screening' },
        { code: 'TRAIN', label: 'Re-train Participant on Study Procedures', icon: '🎓', done: false, note: 'Refresher: ePRO, DTQ, home virology testing. Reinforce compliance', subcat: 'screening' },
      ]
    },
    ers: [4, 3, 5, 4, 3, 4, 5, 4, 3, 4, 5, 4, 3, 4, 5, 3, 4, 5, 4, 3, 4, 5, 4, 3, 4, 5, 4, 3, 4, 4],
    psb: 3.9, psbRecords: 224,
    nextVisit: addDays(getToday(), 7), nextVisitLabel: 'Continue Asymptomatic Phase — Week 49',
    nextVisitWindow: 7,
    documents: [
      { id: 'd10', name: 'Informed Consent v1.0', category: 'ICF', extension: 'PDF', uploadDate: addDays(getToday(), -336), url: '#', size: '1.1 MB', critical: true },
    ]
  },
  {
    id: 'HMC-055', siteId: 'HMC', name: 'David Park', phase: 'TREATMENT', phaseCode: 'tx',
    phaseLabel: 'Treatment Period · Day 7 (±1)', protocolVersion: 'v2.0',
    loc: 'CLINIC', lang: 'English', alert: null,
    screeningDate: addDays(getToday(), -146), psbStartDate: addDays(getToday(), -132),
    rvInfectionDate: addDays(getToday(), -8), randomizationDate: addDays(getToday(), -7),
    tasks: {
      q: [
        { code: 'ERS', label: 'E-RS / PGIS (EXACT)', icon: '📋', done: false, note: 'Daily D1→D28. Extends to D42 if not returned to PSB (fn. i)' },
        { code: 'WURSS', label: 'WURSS-11', icon: '📋', done: false, note: 'Daily through Day 28 ONLY (fn. i)' },
      ],
      pr: [
        { code: 'VS', label: 'Vital Signs', icon: '🩺', done: false, note: 'Seated ≥ 5 min (fn. d)' },
        { code: 'ECG', label: 'ECG (12-lead)', icon: '🫀', done: false, note: 'Day 7 ECG. Collect PRIOR to blood draw (fn. e). May also be done at investigator request based on symptoms.' },
        { code: 'OSC', label: 'Oscillometry', icon: '🫁', done: false, seq: true, note: 'Perform BEFORE spirometry (fn. f)' },
        { code: 'SPI', label: 'Spirometry', icon: '🫁', done: false, note: 'Washout: short-acting BD 4–6 h · BID 12 h · QD 24 h (fn. f)', dependsOn: ['OSC'], attestation: 'I confirm that the patient has completed the required washout period (short-acting BD 4–6 h · BID 12 h · QD 24 h) prior to this assessment.' },
        { code: 'CVC', label: 'Central Virology Collection', icon: '🦠', done: false, note: 'Mid-turbinate nasal swab each nostril — qRT-PCR, susceptibility, resistance, genotyping (fn. g)' },
        { code: 'DRUG', label: 'Study Drug Dosing — Day 7', icon: '💊', done: false, note: 'Once daily', requiresData: { label: 'Time of Dose', type: 'time' } },
      ],
      l: [
        { code: 'CSL', label: 'Central Safety Labs — Chemistry / Haematology', icon: '🧪', done: false, note: 'Urinalysis only if clinically indicated (Table 1)', dependsOn: ['ECG'] },
      ],
      ad: [
        { code: 'AE', label: 'Adverse Events', icon: '⚠️', done: false, regulatory: true, note: 'Collected from first dose through Day 42 (fn. k)', subcat: 'fup' },
        { code: 'CMED', label: 'Concomitant Medications', icon: '💊', done: false, note: 'Record any changes (fn. l)', subcat: 'fup' },
        { code: 'HOSP', label: 'COPD-related Hospitalisations', icon: '🏥', done: false, subcat: 'fup' },
        { code: 'PRN', label: 'COPD PRN Inhaler Use', icon: '💨', done: false, note: 'Collected with E-RS', subcat: 'general' },
      ]
    },
    ers: [8, 9, 11, 13, 14, 13, 12, 11, 10, 9, 10, 11, 12, 11, 10, 9, 8, 9, 10, 11, 10, 9, 8, 9, 10, 11, 10, 9, 9, 10],
    psb: 7.6, psbRecords: 98,
    nextVisit: addDays(getToday(), 7), nextVisitLabel: 'Follow-up Day 14 (±2) — Clinic',
    nextVisitWindow: 2,
    documents: [
      { id: 'd11', name: 'Informed Consent v2.0', category: 'ICF', extension: 'PDF', uploadDate: addDays(getToday(), -146), url: '#', size: '1.2 MB', critical: true },
      { id: 'd12', name: 'Day 1 ECG', category: 'ECG', extension: 'PDF', uploadDate: addDays(getToday(), -7), url: '#', size: '875 KB' },
    ]
  },
  {
    id: 'CUN-074', siteId: 'CUN', name: 'Yuki Tanaka', phase: 'FOLLOWUP', phaseCode: 'fu',
    phaseLabel: 'Follow-up · Day 42 / EOS (±3)',
    loc: 'CLINIC', lang: 'English', alert: null,
    screeningDate: addDays(getToday(), -216), psbStartDate: addDays(getToday(), -202),
    rvInfectionDate: addDays(getToday(), -43), randomizationDate: addDays(getToday(), -42),
    resolution: addDays(getToday(), -28),
    tasks: {
      q: [
        { code: 'ERS', label: 'E-RS / PGIS — Final', icon: '📋', done: false, note: 'Day 42 / End of Study. Extends to D42 because not returned to PSB by D28 (fn. i)' },
      ],
      pr: [
        { code: 'VS', label: 'Vital Signs', icon: '🩺', done: false, note: 'Seated ≥ 5 min (fn. d)' },
        { code: 'OSC', label: 'Oscillometry', icon: '🫁', done: false, seq: true, note: 'Perform BEFORE spirometry (fn. f)' },
        { code: 'SPI', label: 'Spirometry', icon: '🫁', done: false, note: 'Washout: short-acting BD 4–6 h · BID 12 h · QD 24 h (fn. f)', dependsOn: ['OSC'], attestation: 'I confirm that the patient has completed the required washout period (short-acting BD 4–6 h · BID 12 h · QD 24 h) prior to this assessment.' },
      ],
      l: [],
      ad: [
        { code: 'AE', label: 'Adverse Events — Final Collection', icon: '⚠️', done: false, regulatory: true, note: 'Final AE collection through Day 42 / EOS. After this visit, only SAEs need to be reported (fn. k)', subcat: 'fup' },
        { code: 'CMED', label: 'Concomitant Medications — Final', icon: '💊', done: false, subcat: 'fup' },
        { code: 'HOSP', label: 'COPD-related Hospitalisations — Final', icon: '🏥', done: false, subcat: 'fup' },
        { code: 'PRN', label: 'COPD PRN Inhaler Use', icon: '💨', done: false, note: 'Collected with E-RS', subcat: 'general' },
      ]
    },
    ers: [9, 8, 8, 8, 8, 8, 8, 8, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7],
    psb: 7.9, psbRecords: 118,
    nextVisit: addDays(getToday(), 0), nextVisitLabel: 'End of Study — Study Complete',
    nextVisitWindow: 3,
    documents: [
      { id: 'd13', name: 'Informed Consent v2.0', category: 'ICF', extension: 'PDF', uploadDate: addDays(getToday(), -216), url: '#', size: '1.2 MB', critical: true },
    ]
  },
];

export const WZ_STEPS = [
  { title: 'Confirm DTQ Positive', body: 'Patient reported new respiratory symptoms. The <strong>48 h + 6 h randomisation window</strong> is now running. Time-critical.', checks: ['DTQ positive answer documented in eCRF — exact date and time recorded', 'Symptom onset time confirmed with participant', 'PSB eligibility validated: ≥ 3 E-RS records in −35 to −6 day window'] },
  { title: 'Contact Participant & Book Clinic', body: 'The participant <strong>must attend clinic within 24 h of symptom onset</strong>. Absolute maximum: <strong>48 h + 6 h</strong>. If unwilling to attend, may self-collect home virology (COVID-19/Flu) and notify site (fn. h).', checks: ['Participant contacted by phone — call time documented', 'Clinic appointment booked within the randomisation window', 'Participant instructed: do not self-medicate prior to clinic visit'] },
  { title: 'POC Test on Site — Before Randomisation', body: 'Perform the <strong>Point-of-Care (POC) RV test using an FDA-cleared diagnostic</strong> prior to randomisation and dosing (fn. g). Also test COVID-19 and Flu.', checks: ['POC RV nasal swab collected and tested on site', 'COVID-19 and Flu status confirmed', 'All POC results documented in eCRF'] },
  { title: 'Validate PSB & Eligibility', body: 'PSB = <strong>mean of E-RS scores collected −35 to −6 days</strong> before RV onset. Minimum 3 records required. Then assess full randomisation eligibility.', checks: ['PSB window verified: days −35 to −6 before onset', 'PSB value calculated and valid', 'Medical & Smoking History reviewed and updated (fn. b)', 'COPD History & Medications updated', 'Eligibility Criteria assessed — Randomisation checklist completed'] },
  { title: 'Full Pre-Dose Assessments — Day 1', body: 'Complete all Day 1 Pre-Dose clinical assessments per Table 1. ECG must be collected <strong>prior to blood draw</strong>. Vital Signs after seated ≥ 5 min.', checks: ['Physical Exam (limited, include weight — fn. c)', 'Vital Signs: BP, HR, temp, RR — seated ≥ 5 min (fn. d)', 'ECG — PRIOR to blood draw (fn. e)', 'Oscillometry — BEFORE all blood draws; prior to blood draw (fn. f)', 'Home virology testing training reviewed (fn. h)'] },
  { title: 'Sample Collection — Pre-Dose', body: 'Collect all biological samples <strong>before</strong> first dose. Central Virology: <strong>mid-turbinate nasal swab each nostril</strong> (fn. g). PK is pre-dose.', checks: ['Central Virology Collection — nasal swab each nostril ✓', 'Baseline susceptibility and genotyping samples labelled and shipped', 'Sparse PK Sampling — Day 1 Pre-Dose (fn. j)', 'Central Safety Labs: Chemistry / Haematology / Urinalysis', 'Pregnancy Test — URINE sample (WOCBP only, fn. a)', 'Concomitant Medications reviewed by qualified investigator (fn. l)'] },
  { title: 'Randomise & Administer First Dose', body: 'All assessments complete. Randomise and administer first dose. Document the <strong>exact time of dosing</strong>. Activate daily ePRO monitoring.', checks: ['Randomisation completed in IWRS — number assigned', 'Study drug administered — date, time, lot number in eCRF', 'Participant instructed on at-home daily dosing (D2–D6)', 'ePRO activated: E-RS/PGIS and WURSS-11 daily from today', 'Day 3 clinic visit (±1 day) scheduled', 'Adverse Events collection active (fn. k)'] },
];

export const GLOSSARY = [
  { term: 'PSB', def: 'Pre-Symptomatic Baseline. The phase where patients report daily symptoms before infection.' },
  { term: 'DTQ', def: 'Daily Trigger Questionnaire. Asks if the patient has new respiratory symptoms.' },
  { term: 'RV', def: 'Rhinovirus. The protocol triggered after a positive DTQ.' },
  { term: 'E-RS', def: 'Evaluating Respiratory Symptoms scales.' },
  { term: 'ePRO', def: 'Electronic Patient-Reported Outcomes.' },
  { term: 'WURSS', def: 'Wisconsin Upper Respiratory Symptom Survey.' },
  { term: 'SABD', def: 'Short-Acting Bronchodilator.' },
  { term: 'WOCBP', def: 'Women of Childbearing Potential.' },
  { term: 'SoA', def: 'Schedule of Assessments. The protocol-defined timing for all study procedures.' }
];

export function countTasks(p: Patient) {
  const all = Object.values(p.tasks).flat();
  return {
    done: all.filter(t => t.done).length,
    total: all.length
  };
}
