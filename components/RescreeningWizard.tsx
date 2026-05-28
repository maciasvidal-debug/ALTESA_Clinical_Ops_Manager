'use client';

import React from 'react';
import { X, Check, User, CheckCircle2, Microscope, Calendar, Flag, AlertTriangle } from 'lucide-react';
import { fmtISO } from '@/lib/data';
import { getPSBWeek } from '@/lib/temporal';

export const RescreeningWizard = ({ 
  patient, 
  step, 
  setStep, 
  chks, 
  onToggleChk, 
  onClose, 
  onComplete 
}: { 
  patient: any, 
  step: number, 
  setStep: (s: number) => void, 
  chks: Record<number, Set<number>>, 
  onToggleChk: (step: number, i: number) => void, 
  onClose: () => void, 
  onComplete: () => void 
}) => {
  const steps = [
    { title: 'Patient Re-identification', icon: <User size={18} /> },
    { title: 'Eligibility Re-evaluation', icon: <CheckCircle2 size={18} /> },
    { title: 'Baseline Assessments', icon: <Microscope size={18} /> },
    { title: 'Review & Schedule', icon: <Calendar size={18} /> }
  ];

  const eligibilityItems = [
    'Confirm Informed Consent is still valid (or re-sign if updated)',
    'Re-verify Inclusion Criteria (COPD diagnosis, age, etc.)',
    'Re-verify Exclusion Criteria (no new comorbidities, no prohibited meds)',
    'Update Medical & Smoking History (eCRF page updated)',
    'Review Concomitant Medications with Investigator'
  ];

  const assessmentItems = [
    'CAT — COPD Assessment Test performed',
    'Oscillometry performed BEFORE spirometry',
    'Spirometry (Pre & Post SABD) completed',
    '12-lead ECG collected (prior to blood draw)',
    'Vital Signs (seated ≥ 5 min) recorded',
    'Central Safety Labs (Chemistry/Haematology) collected',
    'Pregnancy Test (WOCBP only) performed'
  ];

  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <div className="wz-step-body">
            <div className="wz-step-title">Patient Re-identification</div>
            <div className="wz-step-desc">Confirm the identity of the patient being rescreened. Data is pre-populated from the study record.</div>
            <div className="wz-form-grid">
              <div className="wz-form-item"><label>Patient ID</label><input type="text" value={patient.id} disabled /></div>
              <div className="wz-form-item"><label>Full Name</label><input type="text" value={patient.name} disabled /></div>
              <div className="wz-form-item"><label>Current Phase</label><input type="text" value={patient.phaseLabel} disabled /></div>
              <div className="wz-form-item"><label>Original Screening Date</label><input type="text" value={fmtISO(patient.screeningDate)} disabled /></div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="wz-step-body">
            <div className="wz-step-title">Eligibility Re-evaluation</div>
            <div className="wz-step-desc">In accordance with SoA Table 1, re-verify that the patient still meets all study criteria.</div>
            <div className="wz-chk-list">
              {eligibilityItems.map((item, i) => (
                <div key={i} className={`wz-chk-item ${chks[2]?.has(i) ? 'on' : ''}`} onClick={() => onToggleChk(2, i)}>
                  <div className="wz-chk-box">{chks[2]?.has(i) && <Check size={14} />}</div>
                  <div className="wz-chk-text">{item}</div>
                </div>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="wz-step-body">
            <div className="wz-step-title">Baseline Assessments</div>
            <div className="wz-step-desc">Update baseline clinical data. These assessments are required every 6 months during the Asymptomatic Phase.</div>
            <div className="wz-chk-list">
              {assessmentItems.map((item, i) => (
                <div key={i} className={`wz-chk-item ${chks[3]?.has(i) ? 'on' : ''}`} onClick={() => onToggleChk(3, i)}>
                  <div className="wz-chk-box">{chks[3]?.has(i) && <Check size={14} />}</div>
                  <div className="wz-chk-text">{item}</div>
                </div>
              ))}
            </div>
          </div>
        );
      case 4:
        const allDone = (chks[2]?.size === eligibilityItems.length) && (chks[3]?.size === assessmentItems.length);
        return (
          <div className="wz-step-body">
            <div className="wz-step-title">Review & Schedule</div>
            <div className="wz-step-desc">Review all rescreening data and schedule the next monthly call.</div>
            <div style={{ padding: '16px', background: 'var(--bg)', borderRadius: '8px', marginTop: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Rescreening Summary</div>
              <div style={{ fontSize: '11px', color: 'var(--t2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>Eligibility: <strong>{chks[2]?.size || 0}/{eligibilityItems.length}</strong></div>
                <div>Assessments: <strong>{chks[3]?.size || 0}/{assessmentItems.length}</strong></div>
                <div>Status: <span style={{ color: allDone ? 'var(--green)' : 'var(--amber)' }}>{allDone ? 'Ready to Complete' : 'Incomplete'}</span></div>
              </div>
            </div>
            {!allDone && (
              <div style={{ marginTop: '12px', padding: '10px', background: 'var(--amber-bg)', color: 'var(--amber)', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--amber-mid)' }}>
                <AlertTriangle size={12} style={{ display: 'inline', marginRight: '6px' }} />
                All eligibility and assessment items must be checked to complete rescreening.
              </div>
            )}
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="wz-overlay" style={{ zIndex: 600 }}>
      <div className="wz-card" style={{ maxWidth: '700px' }}>
        <div className="wz-hdr">
          <div className="wz-hdr-left">
            <div className="wz-icon-circle" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}><Flag size={20} /></div>
            <div>
              <div className="wz-title">Rescreening Workflow</div>
              <div className="wz-sub">ALTESA Study · {patient.id} · PSB Week {getPSBWeek(patient) ?? '—'}</div>
            </div>
          </div>
          <button aria-label="Close" className="wz-close" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="wz-stepper">
          {steps.map((s, i) => (
            <div key={i} className={`wz-step ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`} onClick={() => setStep(i + 1)}>
              <div className="wz-step-icon">{step > i + 1 ? <Check size={14} /> : s.icon}</div>
              <div className="wz-step-label">{s.title}</div>
              {i < steps.length - 1 && <div className="wz-step-line"></div>}
            </div>
          ))}
        </div>
        <div className="wz-content">{renderStep()}</div>
        <div className="wz-footer">
          <button className="btn btn-ghost" onClick={() => step > 1 ? setStep(step - 1) : onClose()}>
            {step === 1 ? 'Cancel' : 'Previous'}
          </button>
          {step < 4 ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Next Step</button>
          ) : (
            <button 
              className="btn btn-success" 
              disabled={!(chks[2]?.size === eligibilityItems.length && chks[3]?.size === assessmentItems.length)}
              onClick={onComplete}
            >
              Complete Rescreening
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

