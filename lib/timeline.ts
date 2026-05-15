/**
 * Pure, read-only timeline query module — ALTESA bidirectional visit navigator.
 *
 * All exports are deterministic and free of side effects.
 * No IndexedDB access. No mutations. Idempotent: same input → same output.
 *
 * Retrospective: protocol-required assessments for past visits.
 * Current visit: real-time task completion from patient.tasks.
 * Prospective:   projected assessments for future visits with coordination notes.
 */

import { addDays, diffDays, getToday, type Document, type Patient, type Task } from './data';

// ─── Core types ───────────────────────────────────────────────────────────────

export type AssessmentCategory = 'Q' | 'PR' | 'L' | 'AD';

/** A single assessment row as defined in the SoA for a specific visit. */
export type SoAItem = {
  code: string;
  label: string;
  category: AssessmentCategory;
  /** Protocol instruction shown in the Assessments detail tab. */
  note?: string;
  /** Sequence requirement — must precede other assessments. */
  seq?: boolean;
  /** High-priority clinical flag. */
  critical?: boolean;
};

/** Protocol-canonical visit column definition (derived from the approved SoA). */
export type VisitDef = {
  key: string;
  /** Full label e.g. "Treatment Day 7 (±1)" */
  label: string;
  /** Chip label e.g. "D7" */
  shortLabel: string;
  phase: 'scr' | 'psb' | 'rv' | 'tx' | 'fu' | 'rescr';
  /** ±days visit window tolerance */
  window?: number;
  items: SoAItem[];
  /** Coordination preparation notes shown in the Coordination tab. */
  coordinationNotes?: string[];
};

export type VisitStatus = 'past' | 'current' | 'future';

/** Per-assessment result for a given visit snapshot. */
export type AssessmentResult = {
  code: string;
  label: string;
  category: AssessmentCategory;
  note?: string;
  seq?: boolean;
  critical?: boolean;
  required: boolean;
  /**
   * true  = confirmed complete  (current visit, task.done === true)
   * false = confirmed pending   (current visit, task.done === false)
   * null  = not tracked         (past/future — no per-visit historical store)
   */
  completed: boolean | null;
};

/** Full read-only snapshot of a protocol visit for a specific patient. */
export type VisitSnapshot = {
  def: VisitDef;
  status: VisitStatus;
  estimatedDate: Date | null;
  /** True when clinical evidence (anchor dates) confirms the visit occurred. */
  occurred: boolean;
  assessments: AssessmentResult[];
};

// ─── Canonical matrix row definitions ────────────────────────────────────────
// Ordered: Q → PR → L → AD, matching clinical SoA convention.

export type MatrixRowDef = {
  code: string;
  label: string;         // Short label for matrix cell tooltip
  fullLabel: string;     // Full name for detail panel
  category: AssessmentCategory;
  note: string;          // General protocol note shown in all visit detail panels
};

export const ALL_MATRIX_ROWS: readonly MatrixRowDef[] = [
  // Questionnaires & ePRO
  { code: 'IC',       category: 'Q',  label: 'Informed Consent',    fullLabel: 'Informed Consent',
    note: 'New ICF required only if an updated version is available. Confirm willingness to comply (fn. a).' },
  { code: 'CAT',      category: 'Q',  label: 'CAT',                 fullLabel: 'COPD Assessment Test (CAT)',
    note: 'Screening and Rescreening visits only (Table 1).' },
  { code: 'SGRQ',     category: 'Q',  label: 'SGRQ',               fullLabel: "Saint George's Respiratory Questionnaire (SGRQ)",
    note: 'Administered at Weeks 8, 16, 24, 32, 40, 48, 64 during PSB and at Day 28 FUP (Table 2, fn. i).' },
  { code: 'DTQ',      category: 'Q',  label: 'DTQ',                 fullLabel: 'Daily Trigger Questionnaire (DTQ)',
    note: 'Daily during PSB. Positive result triggers RV Protocol — the 48h + 6h randomisation window starts immediately.' },
  { code: 'ERS',      category: 'Q',  label: 'E-RS/PGIS',           fullLabel: 'E-RS / PGIS (EXACT)',
    note: 'Daily D1 → D28; extends to D42 if patient has not returned to PSB by D28. PGIS collected at each E-RS administration (fn. i).' },
  { code: 'WURSS',    category: 'Q',  label: 'WURSS-11',            fullLabel: 'WURSS-11',
    note: 'Daily through Day 28 ONLY — does NOT continue to D42 (fn. i).' },
  { code: 'HVIR',     category: 'Q',  label: 'Home Virology',       fullLabel: 'Home Self-Collect Virology (COVID-19 / Flu)',
    note: 'Patient may self-collect at home if unwilling to attend site. ePRO will prompt after positive DTQ (fn. h).' },
  // Procedures & Examinations
  { code: 'PE',       category: 'PR', label: 'Physical Exam',       fullLabel: 'Physical Examination',
    note: 'Height measured at initial Screening ONLY. Subsequent visits: limited, symptom-directed, include weight (fn. c).' },
  { code: 'VS',       category: 'PR', label: 'Vital Signs',         fullLabel: 'Vital Signs (BP, HR, Temp, RR)',
    note: 'Patient must be seated ≥ 5 min before measurement. Document BP, HR, body temperature, respiratory rate (fn. d).' },
  { code: 'OSC',      category: 'PR', label: 'Oscillometry',        fullLabel: 'Oscillometry (IOS)',
    note: '⚡ SEQUENCE: Perform BEFORE spirometry at ALL visits where both are scheduled (fn. f).' },
  { code: 'SPI',      category: 'PR', label: 'Spirometry',          fullLabel: 'Spirometry (PRE & POST)',
    note: 'Washout required: short-acting BD 4–6 h · BID 12 h · QD 24 h prior. Perform AFTER Oscillometry (fn. f).' },
  { code: 'ECG',      category: 'PR', label: 'ECG (12-lead)',        fullLabel: 'ECG — 12-lead',
    note: '⚡ Collect PRIOR to blood draw at all applicable visits (fn. e).' },
  { code: 'CVC',      category: 'PR', label: 'Virology Swab',       fullLabel: 'Central Virology Collection (CVC)',
    note: 'Mid-turbinate nasal swab — EACH nostril. qRT-PCR, susceptibility, resistance, genotyping (fn. g).' },
  { code: 'PK',       category: 'PR', label: 'Sparse PK',           fullLabel: 'Sparse PK Sampling',
    note: 'Document BOTH sample collection time AND drug administration time. Pre-dose D1; ~24h after last dose at D3 (fn. j).' },
  { code: 'DRUG',     category: 'PR', label: 'Study Drug',          fullLabel: 'Study Drug Dosing',
    note: 'Once daily. Document exact date, time, and lot number in eCRF.' },
  { code: 'PSB_CALC', category: 'PR', label: 'PSB Validation',      fullLabel: 'Validate PSB Value & Eligibility',
    note: 'PSB = mean E-RS from −35 to −6 days before RV onset. Minimum 3 records required. Full randomisation eligibility checklist.' },
  // Laboratory
  { code: 'CSL',      category: 'L',  label: 'Safety Labs',         fullLabel: 'Central Safety Labs (Chemistry / Haematology / UA)',
    note: 'Full panel at Screening and Rescreening. Chemistry/Haem at D1, D3, D7, D28 FUP. Urinalysis: Screening only; subsequent visits only if clinically indicated.' },
  { code: 'PT',       category: 'L',  label: 'Pregnancy Test',      fullLabel: 'Pregnancy Test (WOCBP only)',
    note: 'Blood at Screening, Rescreening, Day 28 FUP. Urine at Day 1 Pre-Dose (fn. a). WOCBP only.' },
  // Administrative & Regulatory
  { code: 'DEMO',     category: 'AD', label: 'Demographics',        fullLabel: 'Demographics',
    note: 'Collect at Screening; verify and update at Rescreening.' },
  { code: 'MSH',      category: 'AD', label: 'Med/Smoke Hx',        fullLabel: 'Medical & Smoking History',
    note: 'Document as medical history until Day 1 dosing. COPD exacerbations: separate eCRF page (fn. b).' },
  { code: 'ELG',      category: 'AD', label: 'Eligibility',         fullLabel: 'Eligibility Criteria Assessment',
    note: 'Inclusion + Exclusion at Screening. Exclusion criteria only (+ willingness to comply) at Rescreening and Randomisation (fn. a).' },
  { code: 'COPH',     category: 'AD', label: 'COPD History',        fullLabel: 'COPD History & Medications',
    note: 'Document COPD history, all current COPD medications and any changes since last visit.' },
  { code: 'CMED',     category: 'AD', label: 'ConMeds',             fullLabel: 'Concomitant Medications',
    note: 'Reviewed by medically qualified investigator at Screening and Rescreening. Record new/changed ConMeds at all subsequent visits (fn. l).' },
  { code: 'TRAIN',    category: 'AD', label: 'Training',            fullLabel: 'Train / Re-train Participant on Study Procedures',
    note: 'Covers ePRO, DTQ questionnaire, home virology self-collection instructions. Reinforce compliance at Rescreening (fn. h).' },
  { code: 'MC',       category: 'AD', label: 'Monthly Call',        fullLabel: 'Monthly Phone / Telehealth Call',
    note: 'Window: ±5 days. Topics: comorbidities, COPD medications, infections, hospitalisations. Document contact time (fn. m).' },
  { code: 'HOSP',     category: 'AD', label: 'Hospitalisations',    fullLabel: 'COPD-related Hospitalisations',
    note: 'COPD-related hospitalisations since last visit — enter on separate eCRF page.' },
  { code: 'AE',       category: 'AD', label: 'Adverse Events',      fullLabel: 'Adverse Events',
    note: 'Collected from first dose through Day 42 Visit. After Day 42 EOS visit: SAEs only (fn. k).' },
  { code: 'PRN',      category: 'AD', label: 'PRN Inhaler',         fullLabel: 'COPD PRN Inhaler Use (puffs/day)',
    note: 'Collected daily alongside E-RS eDiary entry.' },
] as const;

// ─── SoA Item banks ───────────────────────────────────────────────────────────
// Notes are visit-specific; general notes come from ALL_MATRIX_ROWS above.

const I_SCR: SoAItem[] = [
  { code: 'IC',    label: 'Informed Consent',                        category: 'Q' },
  { code: 'CAT',   label: 'COPD Assessment Test (CAT)',               category: 'Q' },
  { code: 'PE',    label: 'Physical Exam (incl. height)',             category: 'PR',
    note: 'Height measured at initial Screening ONLY (fn. c).' },
  { code: 'VS',    label: 'Vital Signs',                             category: 'PR' },
  { code: 'OSC',   label: 'Oscillometry',                            category: 'PR', seq: true,
    note: 'Perform BEFORE spirometry (fn. f).' },
  { code: 'SPI',   label: 'Spirometry (PRE & POST)',                 category: 'PR',
    note: 'Pre- and post-SABD at Screening. Washout: short-acting BD 4–6 h · BID 12 h · QD 24 h (fn. f).' },
  { code: 'ECG',   label: 'ECG (12-lead)',                           category: 'PR',
    note: 'Single ECG at Screening. Collect PRIOR to blood draw (fn. e).' },
  { code: 'CSL',   label: 'Central Safety Labs (Chem / Haem / UA)', category: 'L',
    note: 'Full panel including Urinalysis at Screening.' },
  { code: 'PT',    label: 'Pregnancy Test (blood — WOCBP only)',     category: 'L' },
  { code: 'DEMO',  label: 'Demographics',                            category: 'AD' },
  { code: 'MSH',   label: 'Medical & Smoking History',               category: 'AD' },
  { code: 'ELG',   label: 'Eligibility Criteria (Incl. + Excl.)',   category: 'AD' },
  { code: 'COPH',  label: 'COPD History & Medications',             category: 'AD' },
  { code: 'CMED',  label: 'Concomitant Medications',                category: 'AD',
    note: 'Reviewed by medically qualified investigator (fn. l).' },
  { code: 'TRAIN', label: 'Train Participant on Study Procedures',   category: 'AD' },
];

const I_RESCR: SoAItem[] = [
  { code: 'IC',    label: 'Informed Consent — Re-confirm',           category: 'Q' },
  { code: 'CAT',   label: 'COPD Assessment Test (CAT)',               category: 'Q' },
  { code: 'PE',    label: 'Physical Exam (limited, include weight)',  category: 'PR',
    note: 'Height NOT re-measured; include weight and symptom-directed exam (fn. c).' },
  { code: 'VS',    label: 'Vital Signs',                             category: 'PR' },
  { code: 'OSC',   label: 'Oscillometry',                            category: 'PR', seq: true,
    note: 'Perform BEFORE spirometry (fn. f).' },
  { code: 'SPI',   label: 'Spirometry (PRE & POST)',                 category: 'PR',
    note: 'Washout: short-acting BD 4–6 h · BID 12 h · QD 24 h (fn. f).' },
  { code: 'ECG',   label: 'ECG (12-lead)',                           category: 'PR',
    note: 'Single ECG at Rescreening. Collect PRIOR to blood draw (fn. e).' },
  { code: 'CSL',   label: 'Central Safety Labs (Chem / Haem / UA)', category: 'L',
    note: 'Urinalysis only if clinically indicated at Rescreening (fn. c).' },
  { code: 'PT',    label: 'Pregnancy Test (blood — WOCBP only)',     category: 'L' },
  { code: 'DEMO',  label: 'Demographics — verify/update',            category: 'AD' },
  { code: 'MSH',   label: 'Medical & Smoking History — update',      category: 'AD',
    note: 'Any new medical conditions or COPD exacerbations since last visit (fn. b).' },
  { code: 'ELG',   label: 'Eligibility — Exclusion criteria only',  category: 'AD',
    note: 'Only Exclusion criteria and willingness to comply are re-assessed at Rescreening (fn. a).' },
  { code: 'COPH',  label: 'COPD History & Medications — update',    category: 'AD' },
  { code: 'CMED',  label: 'Concomitant Medications',                category: 'AD',
    note: 'Reviewed by medically qualified investigator (fn. l).' },
  { code: 'TRAIN', label: 'Re-train Participant (refresher)',        category: 'AD',
    note: 'Reinforce ePRO, DTQ, home virology testing compliance.' },
];

const I_PSB_MONTHLY: SoAItem[] = [
  { code: 'DTQ',  label: 'Daily Trigger Questionnaire',              category: 'Q',
    note: 'Confirm answer is NO (negative). Any positive answer requires immediate escalation to RV Protocol.' },
  { code: 'ERS',  label: 'E-RS / PGIS',                             category: 'Q' },
  { code: 'WURSS',label: 'WURSS-11',                                category: 'Q' },
  { code: 'MC',   label: 'Monthly Phone/Telehealth Call',           category: 'AD',
    note: 'Contact within ±5 day window. Topics: comorbidities, COPD meds, infections, hospitalisations (fn. m).' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                    category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications — any changes',   category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',           category: 'AD' },
];

const I_PSB_SGRQ: SoAItem[] = [
  { code: 'SGRQ', label: "Saint George's Respiratory Questionnaire (SGRQ)", category: 'Q',
    note: 'Must be completed by the patient at the clinic visit before leaving.' },
  { code: 'DTQ',  label: 'Daily Trigger Questionnaire',              category: 'Q',
    note: 'Confirm answer is NO (negative). Any positive answer requires immediate escalation.' },
  { code: 'ERS',  label: 'E-RS / PGIS',                             category: 'Q' },
  { code: 'WURSS',label: 'WURSS-11',                                category: 'Q' },
  { code: 'VS',   label: 'Vital Signs',                             category: 'PR' },
  { code: 'MC',   label: 'Monthly Call / Clinic Visit',             category: 'AD',
    note: 'SGRQ clinic visit — patient attends in person. Contact 48h in advance to confirm.' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                    category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications — any changes',   category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',           category: 'AD' },
];

const I_RV_ONSET: SoAItem[] = [
  { code: 'DTQ',      label: 'DTQ Positive — RV Onset Confirmed', category: 'Q',  critical: true,
    note: 'Document exact date AND time of symptom onset. The 48h + 6h randomisation window starts now.' },
  { code: 'HVIR',     label: 'Home Self-Collect Virology (if applicable)', category: 'Q',
    note: 'If patient cannot attend site, may self-collect home virology (COVID-19/Flu). ePRO will prompt (fn. h).' },
  { code: 'PSB_CALC', label: 'Validate PSB Value & Eligibility',   category: 'PR', critical: true,
    note: 'PSB window: −35 to −6 days before RV onset. Confirm ≥ 3 E-RS records. Assess full randomisation checklist.' },
  { code: 'CMED',     label: 'Concomitant Medications Review',      category: 'AD' },
];

const I_RV_D1: SoAItem[] = [
  { code: 'ERS',  label: 'E-RS / PGIS',                             category: 'Q' },
  { code: 'WURSS',label: 'WURSS-11',                                category: 'Q' },
  { code: 'PE',   label: 'Physical Exam (limited, include weight)', category: 'PR' },
  { code: 'VS',   label: 'Vital Signs',                             category: 'PR' },
  { code: 'ECG',  label: 'ECG (12-lead) — Pre-dose',               category: 'PR', critical: true,
    note: '⚡ Collect PRIOR to blood draw. Must complete before first dose (fn. e).' },
  { code: 'OSC',  label: 'Oscillometry',                            category: 'PR', seq: true,
    note: 'Perform BEFORE spirometry — sufficient time needed for both (fn. f).' },
  { code: 'CVC',  label: 'Central Virology Collection',             category: 'PR',
    note: 'Mid-turbinate nasal swab EACH nostril. Baseline susceptibility and genotyping.' },
  { code: 'PK',   label: 'Sparse PK Sampling — Pre-dose D1',       category: 'PR',
    note: 'Pre-dose sample. Document exact sample collection time (fn. j).' },
  { code: 'DRUG', label: 'Study Drug Dosing — Day 1 (first dose)', category: 'PR', critical: true,
    note: 'Randomise in IWRS before dosing. Document exact time, date, lot number.' },
  { code: 'CSL',  label: 'Central Safety Labs (Chem / Haem / UA)', category: 'L',
    note: 'Full panel including Urinalysis at Day 1 Pre-Dose.' },
  { code: 'PT',   label: 'Pregnancy Test (urine — WOCBP only)',    category: 'L',
    note: 'Urine sample at Day 1 Pre-Dose (fn. a).' },
  { code: 'ELG',  label: 'Randomisation Eligibility Check',        category: 'AD', critical: true,
    note: 'Complete randomisation eligibility checklist before IWRS entry.' },
  { code: 'CMED', label: 'Concomitant Medications',                category: 'AD' },
  { code: 'AE',   label: 'Adverse Events (collection begins)',     category: 'AD',
    note: 'AE collection is active from first dose through Day 42 Visit (fn. k).' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',          category: 'AD' },
];

const I_RV_D3: SoAItem[] = [
  { code: 'ERS',  label: 'E-RS / PGIS',                             category: 'Q' },
  { code: 'WURSS',label: 'WURSS-11',                                category: 'Q' },
  { code: 'VS',   label: 'Vital Signs',                             category: 'PR' },
  { code: 'OSC',  label: 'Oscillometry',                            category: 'PR', seq: true },
  { code: 'CVC',  label: 'Central Virology Collection',             category: 'PR' },
  { code: 'PK',   label: 'Sparse PK Sampling (~24h after D2 dose)', category: 'PR',
    note: '~24h after last (Day 2) dose. Document BOTH sample time AND last drug administration time (fn. j).' },
  { code: 'DRUG', label: 'Study Drug Dosing — Day 3',              category: 'PR',
    note: 'Once daily. Document exact administration time.' },
  { code: 'CSL',  label: 'Central Safety Labs (Chem / Haem)',      category: 'L',
    note: 'Urinalysis only if clinically indicated at D3.' },
  { code: 'AE',   label: 'Adverse Events',                         category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications — any changes',  category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',          category: 'AD' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                   category: 'AD' },
];

const I_RV_D7: SoAItem[] = [
  { code: 'ERS',  label: 'E-RS / PGIS',                             category: 'Q' },
  { code: 'WURSS',label: 'WURSS-11',                                category: 'Q' },
  { code: 'VS',   label: 'Vital Signs',                             category: 'PR' },
  { code: 'ECG',  label: 'ECG (12-lead)',                           category: 'PR',
    note: 'Day 7 ECG. Collect PRIOR to blood draw (fn. e).' },
  { code: 'OSC',  label: 'Oscillometry',                            category: 'PR', seq: true,
    note: 'Perform BEFORE spirometry (fn. f).' },
  { code: 'SPI',  label: 'Spirometry',                             category: 'PR',
    note: 'Washout: short-acting BD 4–6 h · BID 12 h · QD 24 h (fn. f).' },
  { code: 'CVC',  label: 'Central Virology Collection',             category: 'PR' },
  { code: 'DRUG', label: 'Study Drug Dosing — Day 7',              category: 'PR',
    note: 'Once daily. Document exact administration time.' },
  { code: 'CSL',  label: 'Central Safety Labs (Chem / Haem)',      category: 'L',
    note: 'Urinalysis only if clinically indicated at D7.' },
  { code: 'AE',   label: 'Adverse Events',                         category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications — any changes',  category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',          category: 'AD' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                   category: 'AD' },
];

const I_RV_D14: SoAItem[] = [
  { code: 'ERS',  label: 'E-RS / PGIS',                             category: 'Q' },
  { code: 'WURSS',label: 'WURSS-11',                                category: 'Q' },
  { code: 'VS',   label: 'Vital Signs',                             category: 'PR' },
  { code: 'OSC',  label: 'Oscillometry',                            category: 'PR', seq: true,
    note: 'Perform BEFORE spirometry (fn. f).' },
  { code: 'SPI',  label: 'Spirometry',                             category: 'PR',
    note: 'Washout required (fn. f). No Central Safety Labs at D14 per SoA Table 1.' },
  { code: 'CVC',  label: 'Central Virology Collection',             category: 'PR' },
  { code: 'AE',   label: 'Adverse Events',                         category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications — any changes',  category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',          category: 'AD' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                   category: 'AD' },
];

const I_RV_D28: SoAItem[] = [
  { code: 'SGRQ', label: "Saint George's Respiratory Questionnaire (SGRQ)", category: 'Q',
    note: 'Must be completed at the Day 28 FUP clinic visit (Table 1, fn. i).' },
  { code: 'ERS',  label: 'E-RS / PGIS',                             category: 'Q' },
  { code: 'WURSS',label: 'WURSS-11 (FINAL collection)',             category: 'Q',
    note: 'Day 28 is the terminal WURSS-11 collection. Does NOT continue to Day 42 (fn. i).' },
  { code: 'PE',   label: 'Physical Exam (limited, include weight)', category: 'PR' },
  { code: 'VS',   label: 'Vital Signs',                             category: 'PR' },
  { code: 'OSC',  label: 'Oscillometry',                            category: 'PR', seq: true,
    note: 'Perform BEFORE spirometry (fn. f).' },
  { code: 'SPI',  label: 'Spirometry',                             category: 'PR',
    note: 'Washout required (fn. f).' },
  { code: 'CVC',  label: 'Central Virology Collection',             category: 'PR' },
  { code: 'CSL',  label: 'Central Safety Labs (Chem / Haem)',      category: 'L',
    note: 'Urinalysis only if clinically indicated at D28.' },
  { code: 'PT',   label: 'Pregnancy Test (blood — WOCBP only)',    category: 'L',
    note: 'Blood sample at Day 28 FUP (fn. a).' },
  { code: 'AE',   label: 'Adverse Events',                         category: 'AD' },
  { code: 'CMED', label: 'Concomitant Medications',                category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations',          category: 'AD' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                   category: 'AD' },
];

const I_RV_D42: SoAItem[] = [
  { code: 'ERS',  label: 'E-RS / PGIS (FINAL)',                    category: 'Q',
    note: 'Final E-RS collection at Day 42 EOS (extends to D42 if not returned to PSB by D28, fn. i).' },
  { code: 'VS',   label: 'Vital Signs',                             category: 'PR' },
  { code: 'OSC',  label: 'Oscillometry',                            category: 'PR', seq: true,
    note: 'Perform BEFORE spirometry (fn. f).' },
  { code: 'SPI',  label: 'Spirometry',                             category: 'PR',
    note: 'Washout required (fn. f).' },
  { code: 'AE',   label: 'Adverse Events — FINAL collection',      category: 'AD', critical: true,
    note: 'Final AE collection at Day 42 EOS. After this visit: SAEs only (fn. k). Verify all eCRF entries complete.' },
  { code: 'CMED', label: 'Concomitant Medications — Final',        category: 'AD' },
  { code: 'HOSP', label: 'COPD-related Hospitalisations — Final',  category: 'AD' },
  { code: 'PRN',  label: 'COPD PRN Inhaler Use',                   category: 'AD' },
];

// ─── Static visit definitions ─────────────────────────────────────────────────

export const VISIT_SCR: VisitDef = {
  key: 'SCR', label: 'Screening (Day 0)', shortLabel: 'SCR',
  phase: 'scr', items: I_SCR,
  coordinationNotes: [
    'Patient must provide written informed consent BEFORE any study procedures commence.',
    'Height measurement at Screening ONLY — use for BSA calculations.',
    'Sequence: Oscillometry → Spirometry (OSC must precede SPI, fn. f).',
    'ECG must be collected PRIOR to all blood draws (fn. e).',
    'Labs after ECG; Urinalysis included in full panel at Screening.',
    'Train patient on ePRO, DTQ questionnaire, and home virology kit (fn. h).',
    'Schedule PSB Start appointment (~3 weeks after Screening) before patient leaves.',
  ],
};

export const VISIT_RESCR: VisitDef = {
  key: 'RESCR', label: 'Rescreening (Week 48 / 68)', shortLabel: 'Re-SCR',
  phase: 'rescr', window: 7, items: I_RESCR,
  coordinationNotes: [
    'Confirm whether an updated ICF version is available — obtain new consent if applicable.',
    'Only Exclusion criteria and willingness to comply are re-assessed (not full Inclusion checklist, fn. a).',
    'Sequence: Oscillometry → Spirometry. ECG prior to blood draw.',
    'Urinalysis only if clinically indicated (not mandatory at Rescreening).',
    'Reinforce ePRO, DTQ, home virology compliance — patient has been in PSB a long time.',
    'This visit resets the eligibility clock. Ensure COPD history and ConMeds are fully updated.',
  ],
};

export const VISIT_RV_ONSET: VisitDef = {
  key: 'RV_ONSET', label: 'RV Onset — DTQ Positive', shortLabel: 'RV+',
  phase: 'rv', items: I_RV_ONSET,
  coordinationNotes: [
    '🚨 TIME-CRITICAL: The 48h + 6h randomisation window starts at symptom onset.',
    'Document the exact date AND time of symptom onset in the eCRF immediately.',
    'Contact participant immediately to arrange same-day or next-day clinic visit.',
    'Instruct patient: do NOT self-medicate (decongestants, antivirals, OTC cold remedies) before clinic.',
    'Validate PSB: mean E-RS from −35 to −6 days, minimum 3 records required.',
    'If patient is unable to attend: home virology self-collection is permitted (COVID-19/Flu, fn. h).',
    'Book the Day 1 Randomisation appointment — must be within the 48h + 6h window.',
  ],
};

export const VISIT_D1: VisitDef = {
  key: 'RV_D1', label: 'Randomisation / Day 1 Pre-Dose', shortLabel: 'D1',
  phase: 'tx', items: I_RV_D1,
  coordinationNotes: [
    '🚨 ALL pre-dose assessments must complete BEFORE first drug administration.',
    'Mandatory sequence: ECG → Blood draw (ECG first, fn. e).',
    'Mandatory sequence: Oscillometry → Spirometry (OSC first, fn. f).',
    'Randomise in IWRS — obtain randomisation number BEFORE drug dispensing.',
    'Pregnancy test: urine sample at Day 1 Pre-Dose (not blood — see fn. a).',
    'PK Pre-dose sample: document exact collection time (fn. j).',
    'Activate ePRO: E-RS/PGIS and WURSS-11 to begin today.',
    'Counsel patient on at-home dosing (Days 2–6) and daily ePRO completion.',
    'Schedule Day 3 clinic visit (±1 day) before patient leaves.',
  ],
};

export const VISIT_D3: VisitDef = {
  key: 'RV_D3', label: 'Treatment Day 3 (±1)', shortLabel: 'D3',
  phase: 'tx', window: 1, items: I_RV_D3,
  coordinationNotes: [
    'PK ~24h after Day 2 dose — document BOTH sample collection time AND last drug admin time (fn. j).',
    'Confirm patient compliance with at-home dosing on Days 2 and 3.',
    'Study drug: once daily; document exact administration time.',
    'No spirometry required at Day 3.',
    'Review AEs and ConMeds since Day 1 dosing.',
    'Schedule Day 7 clinic visit (±1 day) before patient leaves.',
  ],
};

export const VISIT_D7: VisitDef = {
  key: 'RV_D7', label: 'Treatment Day 7 (±1)', shortLabel: 'D7',
  phase: 'tx', window: 1, items: I_RV_D7,
  coordinationNotes: [
    'ECG required at Day 7 — collect PRIOR to blood draw (fn. e).',
    'Sequence: ECG → Blood draw; Oscillometry → Spirometry.',
    'Washout for spirometry: short-acting BD 4–6 h · BID 12 h · QD 24 h (fn. f).',
    'Last study drug dose in clinic — document exact administration time.',
    'Schedule Day 14 Follow-up visit (±2 days) before patient leaves.',
    'Remind patient to continue daily E-RS/PGIS and WURSS-11 eDiary.',
  ],
};

export const VISIT_D14: VisitDef = {
  key: 'RV_D14', label: 'Follow-up Day 14 (±2)', shortLabel: 'D14',
  phase: 'fu', window: 2, items: I_RV_D14,
  coordinationNotes: [
    'No Central Safety Labs at Day 14 per SoA Table 1 (unless clinically indicated).',
    'Sequence: Oscillometry → Spirometry. Washout required.',
    'Monitor for clinical resolution: 3 consecutive E-RS days ≤ PSB value triggers resolution.',
    'Resolution status: note whether E-RS has returned to PSB baseline.',
    'Schedule Day 28 Follow-up visit (±3 days) before patient leaves.',
    'Remind patient: WURSS-11 continues through Day 28 only.',
  ],
};

export const VISIT_D28: VisitDef = {
  key: 'RV_D28', label: 'Follow-up Day 28 (±3)', shortLabel: 'D28',
  phase: 'fu', window: 3, items: I_RV_D28,
  coordinationNotes: [
    'SGRQ must be completed by the patient IN CLINIC before leaving (Table 1, fn. i).',
    'WURSS-11: Day 28 is the FINAL collection — does NOT continue to Day 42.',
    'E-RS: continues to Day 42 if patient has not returned to PSB baseline by Day 28.',
    'Pregnancy test: blood sample required at Day 28 FUP (fn. a).',
    'Sequence: ECG → Blood draw; Oscillometry → Spirometry.',
    'Schedule Day 42 / EOS visit (±3 days) before patient leaves.',
    'If E-RS has returned to PSB: Day 42 is still required for AE/ConMed/EOS procedures.',
  ],
};

export const VISIT_D42: VisitDef = {
  key: 'RV_D42', label: 'End of Study / Day 42 (±3)', shortLabel: 'EOS',
  phase: 'fu', window: 3, items: I_RV_D42,
  coordinationNotes: [
    'Final Adverse Events collection — document all outstanding AEs through today.',
    'After EOS: only SAEs require ongoing reporting (fn. k).',
    'Sequence: Oscillometry → Spirometry. Washout required.',
    'Verify ALL eCRF pages are complete and queries resolved before patient leaves.',
    'Confirm study completion in IWRS.',
    'Retain patient contact for any post-study SAE follow-up per protocol.',
  ],
};

// ─── Dynamic PSB visit generation ────────────────────────────────────────────

const PSB_SGRQ_WEEKS = new Set([8, 16, 24, 32, 40, 48, 64]);

/** Generates PSB visit defs up to maxWeeks. Pure function. */
export function buildPSBVisitDefs(maxWeeks: number): VisitDef[] {
  const visits: VisitDef[] = [];
  const totalMonths = Math.ceil(maxWeeks / 4);
  for (let m = 1; m <= totalMonths; m++) {
    const weekNum = m * 4;
    if (weekNum > maxWeeks) break;
    const hasSGRQ = PSB_SGRQ_WEEKS.has(weekNum);
    visits.push({
      key: `PSB_M${m}`,
      label: `PSB Month ${m} — Week ${weekNum}${hasSGRQ ? ' (SGRQ Clinic Visit)' : ' (Monthly Call)'}`,
      shortLabel: `W${weekNum}`,
      phase: 'psb',
      window: 5,
      items: hasSGRQ ? I_PSB_SGRQ : I_PSB_MONTHLY,
      coordinationNotes: hasSGRQ
        ? [
            `SGRQ Clinic Visit — patient must attend in person (Table 2).`,
            'Contact patient ≥ 48h in advance to confirm clinic attendance.',
            'SGRQ questionnaire completed by patient IN CLINIC before leaving.',
            'Vital Signs collected at this SGRQ visit.',
            'Review DTQ answers, E-RS trend, ConMeds, hospitalisations.',
            `Next SGRQ clinic visit: approximately Week ${weekNum + 8}.`,
          ]
        : [
            `Monthly call — contact within ±5 day window of Week ${weekNum}.`,
            'Review DTQ: confirm NO positive answers since last contact.',
            'Topics: comorbidities, COPD medications, infections, hospitalisations (fn. m).',
            'Record contact date and time in eCRF.',
            'Document any new or changed ConMeds.',
            'Enquire about COPD-related hospitalisations since last call.',
          ],
    });
  }
  return visits;
}

// ─── Helper: visit date window ────────────────────────────────────────────────

/** Returns the ±window date range for filtering logs/documents to a visit. */
export function getVisitDateWindow(
  snapshot: VisitSnapshot,
): { from: Date; to: Date } {
  const center = snapshot.estimatedDate ?? getToday();
  const halfWindow = snapshot.def.window ?? 7;
  return {
    from: addDays(center, -halfWindow),
    to:   addDays(center,  halfWindow),
  };
}

/** Filters patient documents to those uploaded within a visit's date window. */
export function getDocumentsForVisit(
  patient: Patient,
  snapshot: VisitSnapshot,
): Document[] {
  const { from, to } = getVisitDateWindow(snapshot);
  return patient.documents.filter(doc => {
    const d = new Date(doc.uploadDate);
    return d >= from && d <= to;
  });
}

/** Returns true if the assessment code is required at the given visit. */
export function isRequiredAt(def: VisitDef, code: string): boolean {
  return def.items.some(i => i.code === code);
}

/** Returns the SoAItem for a given code at a visit, or undefined. */
export function getItemAt(def: VisitDef, code: string): SoAItem | undefined {
  return def.items.find(i => i.code === code);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

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
    case 'SCR':      return !!screeningDate && screeningDate <= today;
    case 'RESCR':    return patient.phaseCode === 'rescr';
    case 'RV_ONSET': return !!rvInfectionDate;
    case 'RV_D1':   return !!randomizationDate;
    case 'RV_D3':   return !!randomizationDate && diffDays(randomizationDate, today) > 3;
    case 'RV_D7':   return !!randomizationDate && diffDays(randomizationDate, today) > 7;
    case 'RV_D14':  return !!randomizationDate && diffDays(randomizationDate, today) > 14;
    case 'RV_D28':  return !!randomizationDate && diffDays(randomizationDate, today) > 28;
    case 'RV_D42':  return (
      !!resolution || (!!randomizationDate && diffDays(randomizationDate, today) > 42)
    );
    default: break;
  }
  if (def.key.startsWith('PSB_M')) {
    const idx = psbVisitDefs.findIndex(v => v.key === def.key);
    if (idx < 0) return false;
    const ref = psbStartDate ?? screeningDate;
    if (!ref) return false;
    return addDays(ref, (idx + 1) * 28) <= today;
  }
  return false;
}

// ─── Current visit key resolution ─────────────────────────────────────────────

/** Returns the visit key matching the patient's current study position. */
export function getCurrentVisitKey(patient: Patient): string {
  const { phaseCode, dtqPos, randomizationDate, rvInfectionDate, psbStartDate, screeningDate } = patient;
  if (phaseCode === 'scr')   return 'SCR';
  if (phaseCode === 'rescr') return 'RESCR';
  if (phaseCode === 'psb') {
    if (dtqPos && !randomizationDate) return 'RV_ONSET';
    const ref = psbStartDate ?? screeningDate;
    const days = ref ? diffDays(ref, getToday()) : 0;
    return `PSB_M${Math.max(1, Math.ceil(days / 28))}`;
  }
  const ref = randomizationDate ?? rvInfectionDate;
  if (!ref) return 'RV_D1';
  const d = diffDays(ref, getToday());
  if (d <= 1)  return 'RV_D1';
  if (d <= 5)  return 'RV_D3';
  if (d <= 10) return 'RV_D7';
  if (d <= 20) return 'RV_D14';
  if (d <= 35) return 'RV_D28';
  return 'RV_D42';
}

// ─── Main timeline builder ────────────────────────────────────────────────────

/**
 * Builds the full chronological VisitSnapshot array for a patient.
 * Read-only. Idempotent. No side effects.
 */
export function buildPatientTimeline(patient: Patient): VisitSnapshot[] {
  const today = getToday();
  const { phaseCode, psbStartDate, screeningDate } = patient;
  const currentKey = getCurrentVisitKey(patient);

  const psbRef = psbStartDate ?? screeningDate;
  const daysSincePsb = psbRef ? diffDays(psbRef, today) : 0;
  const currentPSBWeek = Math.ceil(daysSincePsb / 7);
  const psbMaxWeeks = Math.min(68, Math.max(currentPSBWeek + 8, 16));
  const psbVisitDefs = buildPSBVisitDefs(psbMaxWeeks);

  const allDefs: VisitDef[] = [VISIT_SCR];

  if (['psb', 'rescr', 'rv', 'tx', 'fu'].includes(phaseCode)) {
    allDefs.push(...psbVisitDefs);
  }
  if (phaseCode === 'rescr') {
    allDefs.push(VISIT_RESCR);
  }

  const hasRV = patient.dtqPos || !!patient.rvInfectionDate || ['tx', 'fu'].includes(phaseCode);
  if (hasRV) {
    allDefs.push(VISIT_RV_ONSET, VISIT_D1, VISIT_D3, VISIT_D7, VISIT_D14, VISIT_D28, VISIT_D42);
  }

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
        completed = task != null ? task.done : null;
      }
      return {
        code: item.code,
        label: item.label,
        category: item.category,
        note: item.note,
        seq: item.seq,
        critical: item.critical,
        required: true,
        completed,
      };
    });

    return { def, status, estimatedDate, occurred, assessments };
  });
}

/** Targeted single-visit snapshot. Returns undefined if visit not in patient's path. */
export function getVisitSnapshot(
  patient: Patient,
  visitKey: string,
): VisitSnapshot | undefined {
  return buildPatientTimeline(patient).find(s => s.def.key === visitKey);
}
