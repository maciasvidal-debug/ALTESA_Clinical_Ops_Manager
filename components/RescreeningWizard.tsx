'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { X, Check, User, CheckCircle2, Microscope, Calendar, Flag, AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';
import { fmtISO, type Patient } from '@/lib/data';
import { getPSBWeek } from '@/lib/temporal';

type StepNum = 1 | 2 | 3 | 4;

interface RescreeningWizardProps {
  patient: Patient;
  step: number;
  setStep: (s: number) => void;
  chks: Record<number, Set<number>>;
  onToggleChk: (step: number, i: number) => void;
  onClose: () => void;
  onComplete: () => void;
}

// Static step metadata — declared once so the array identity is stable across
// renders and React's diffing stays cheap.
const STEPS = [
  { title: 'Patient Re-identification', icon: User },
  { title: 'Eligibility Re-evaluation', icon: CheckCircle2 },
  { title: 'Baseline Assessments',      icon: Microscope },
  { title: 'Review & Schedule',         icon: Calendar },
] as const;

const ELIGIBILITY_ITEMS = [
  'Confirm Informed Consent is still valid (or re-sign if updated)',
  'Re-verify Inclusion Criteria (COPD diagnosis, age, etc.)',
  'Re-verify Exclusion Criteria (no new comorbidities, no prohibited meds)',
  'Update Medical & Smoking History (eCRF page updated)',
  'Review Concomitant Medications with Investigator',
];

const ASSESSMENT_ITEMS = [
  'CAT — COPD Assessment Test performed',
  'Oscillometry performed BEFORE spirometry',
  'Spirometry (Pre & Post SABD) completed',
  '12-lead ECG collected (prior to blood draw)',
  'Vital Signs (seated ≥ 5 min) recorded',
  'Central Safety Labs (Chemistry/Haematology) collected',
  'Pregnancy Test (WOCBP only) performed',
];

export const RescreeningWizard = ({
  patient, step, setStep, chks, onToggleChk, onClose, onComplete,
}: RescreeningWizardProps) => {
  const safeStep = Math.min(Math.max(step, 1), STEPS.length) as StepNum;

  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Esc-to-close + initial focus management. Idempotent — listener cleanup
  // guaranteed by the effect's return so re-mounts don't stack handlers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const eligibilityDone = chks[2]?.size ?? 0;
  const assessmentsDone = chks[3]?.size ?? 0;
  const allDone = eligibilityDone === ELIGIBILITY_ITEMS.length
              && assessmentsDone === ASSESSMENT_ITEMS.length;

  const psbWeek = useMemo(() => getPSBWeek(patient), [patient]);

  const renderChecklist = (items: readonly string[], stepKey: 2 | 3) => (
    <>
      {items.map((item, i) => {
        const checked = chks[stepKey]?.has(i) ?? false;
        return (
          <div
            key={i}
            className={`wz-chk-item ${checked ? 'checked' : ''}`}
            tabIndex={0}
            role="checkbox"
            aria-checked={checked}
            onClick={() => onToggleChk(stepKey, i)}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onToggleChk(stepKey, i);
              }
            }}
          >
            <div className={`chkbox ${checked ? 'checked' : ''}`} style={{ flexShrink: 0 }} />
            <span>{item}</span>
          </div>
        );
      })}
    </>
  );

  const renderStep = () => {
    switch (safeStep) {
      case 1:
        return (
          <>
            <div className="wz-step-n">Step 1 of {STEPS.length}</div>
            <div className="wz-step-title">Patient Re-identification</div>
            <div className="wz-step-desc">
              Confirm the identity of the patient being rescreened. Data is pre-populated from the study record.
            </div>
            <div className="wz-field-grid">
              <div className="wz-field">
                <label htmlFor="rescr-pid">Patient ID</label>
                <input id="rescr-pid" type="text" value={patient.id} disabled readOnly />
              </div>
              <div className="wz-field">
                <label htmlFor="rescr-name">Full Name</label>
                <input id="rescr-name" type="text" value={patient.name} disabled readOnly />
              </div>
              <div className="wz-field">
                <label htmlFor="rescr-phase">Current Phase</label>
                <input id="rescr-phase" type="text" value={patient.phaseLabel ?? '—'} disabled readOnly />
              </div>
              <div className="wz-field">
                <label htmlFor="rescr-scr">Original Screening Date</label>
                <input
                  id="rescr-scr"
                  type="text"
                  value={patient.screeningDate ? fmtISO(patient.screeningDate) : '—'}
                  disabled
                  readOnly
                />
              </div>
            </div>
          </>
        );

      case 2:
        return (
          <>
            <div className="wz-step-n">Step 2 of {STEPS.length}</div>
            <div className="wz-step-title">Eligibility Re-evaluation</div>
            <div className="wz-step-desc">
              In accordance with SoA Table 1, re-verify that the patient still meets all study criteria.
            </div>
            {renderChecklist(ELIGIBILITY_ITEMS, 2)}
          </>
        );

      case 3:
        return (
          <>
            <div className="wz-step-n">Step 3 of {STEPS.length}</div>
            <div className="wz-step-title">Baseline Assessments</div>
            <div className="wz-step-desc">
              Update baseline clinical data. These assessments are required at each rescreening milestone during the Asymptomatic Phase.
            </div>
            {renderChecklist(ASSESSMENT_ITEMS, 3)}
          </>
        );

      case 4:
        return (
          <>
            <div className="wz-step-n">Step 4 of {STEPS.length}</div>
            <div className="wz-step-title">Review &amp; Schedule</div>
            <div className="wz-step-desc">
              Review all rescreening data and schedule the next monthly call.
            </div>

            <div
              style={{
                padding: '14px 16px', background: 'var(--bg)',
                border: '1px solid var(--border)', borderRadius: 'var(--r2)',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '10px' }}>
                Rescreening Summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', fontSize: '12.5px', color: 'var(--t2)' }}>
                <div>
                  Eligibility&nbsp;
                  <strong style={{ color: 'var(--t1)' }}>{eligibilityDone}/{ELIGIBILITY_ITEMS.length}</strong>
                </div>
                <div>
                  Assessments&nbsp;
                  <strong style={{ color: 'var(--t1)' }}>{assessmentsDone}/{ASSESSMENT_ITEMS.length}</strong>
                </div>
                <div>
                  Status&nbsp;
                  <strong style={{ color: allDone ? 'var(--green)' : 'var(--amber)' }}>
                    {allDone ? 'Ready to Complete' : 'Incomplete'}
                  </strong>
                </div>
              </div>
            </div>

            {!allDone && (
              <div
                style={{
                  marginTop: '8px', padding: '10px 12px',
                  background: 'var(--amber-bg)', color: 'var(--amber)',
                  border: '1px solid var(--amber-mid)',
                  borderRadius: 'var(--r1)',
                  fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                <AlertTriangle size={14} aria-hidden="true" />
                <span>All eligibility and assessment items must be checked to complete rescreening.</span>
              </div>
            )}
          </>
        );
    }
  };

  const isLast = safeStep === STEPS.length;

  return (
    <div
      className="wz-overlay"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ zIndex: 600 }}
    >
      <div
        className="wz-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rescr-wz-title"
        style={{ maxWidth: '720px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="wz-top">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
            <div
              aria-hidden="true"
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--amber-bg)', color: 'var(--amber)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Flag size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div id="rescr-wz-title" className="wz-heading">Rescreening Workflow</div>
              <div className="wz-heading-sub">
                ALTESA Study · {patient.id} · PSB Week {psbWeek ?? '—'}
              </div>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            aria-label="Close rescreening wizard"
            className="wz-close-btn"
            onClick={onClose}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* ── Labeled stepper ───────────────────────────────────────── */}
        <nav className="wz-lstepper" aria-label="Rescreening steps">
          {STEPS.map((s, i) => {
            const num = (i + 1) as StepNum;
            const state = num === safeStep ? 'active' : num < safeStep ? 'done' : '';
            const Icon = s.icon;
            return (
              <React.Fragment key={s.title}>
                <button
                  type="button"
                  className={`wz-lstep ${state}`}
                  onClick={() => setStep(num)}
                  aria-current={state === 'active' ? 'step' : undefined}
                  title={s.title}
                >
                  <span className="wz-lstep-icon">
                    {state === 'done' ? <Check size={14} aria-hidden="true" /> : <Icon size={14} aria-hidden="true" />}
                  </span>
                  <span className="wz-lstep-label">{s.title}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <span className={`wz-lstep-line ${num < safeStep ? 'done' : ''}`} aria-hidden="true" />
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* ── Body ──────────────────────────────────────────────────── */}
        <div className="wz-body">{renderStep()}</div>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div className="wz-foot">
          <button
            className="btn btn-ghost"
            onClick={() => (safeStep > 1 ? setStep(safeStep - 1) : onClose())}
          >
            {safeStep === 1
              ? (<><X size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} aria-hidden="true" /> Cancel</>)
              : (<><ArrowLeft size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} aria-hidden="true" /> Previous</>)}
          </button>

          {!isLast ? (
            <button className="btn btn-primary" onClick={() => setStep(safeStep + 1)}>
              Next Step <ArrowRight size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} aria-hidden="true" />
            </button>
          ) : (
            <button
              className="btn btn-success"
              disabled={!allDone}
              onClick={onComplete}
            >
              <Check size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} aria-hidden="true" /> Complete Rescreening
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
