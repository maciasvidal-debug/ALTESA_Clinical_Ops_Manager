'use client';

import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { WZ_STEPS } from '@/lib/data';

const renderSafeHTML = (text: string) => {
  const parts = text.split(/(<strong>.*?<\/strong>)/g);
  return parts.map((part, i) => {
    if (part.startsWith('<strong>') && part.endsWith('</strong>')) {
      return <strong key={i}>{part.slice(8, -9)}</strong>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
};

export function Wizard({ patientId, step, setStep, chks, setChks, cdStart, onClose, onRandomise, onToggleChk, onAbort }: any) {
  const [cdStr, setCdStr] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  useEffect(() => {
    const tick = () => {
      const rem = Math.max(0, (48 + 6) * 3600000 - (Date.now() - (cdStart || Date.now())));
      const h = Math.floor(rem / 3600000);
      const m = Math.floor((rem % 3600000) / 60000);
      const s = Math.floor((rem % 60000) / 1000);
      setCdStr(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      setUrgent(rem < 6 * 3600000);
    };
    tick();
    const int = setInterval(tick, 1000);
    return () => clearInterval(int);
  }, [cdStart]);

  const currentStep = WZ_STEPS[step];
  const currentChks = chks[step] || new Set();
  const allDone = currentStep.checks.every((_: any, i: number) => currentChks.has(i));
  const isLast = step === WZ_STEPS.length - 1;
  const missCount = currentStep.checks.filter((_: any, i: number) => !currentChks.has(i)).length;

  const toggleChk = (i: number) => {
    if (onToggleChk) {
      onToggleChk(step, i);
    } else {
      setChks((prev: any) => {
        const next = { ...prev };
        if (!next[step]) next[step] = new Set();
        const s = new Set(next[step]);
        if (s.has(i)) s.delete(i); else s.add(i);
        next[step] = s;
        return next;
      });
    }
  };

  if (showAbortConfirm) {
    return (
      <div className="wz-overlay" onClick={() => setShowAbortConfirm(false)}>
        <div className="wz-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
          <div className="wz-top">
            <div className="wz-heading">Abort RV Protocol</div>
            <button aria-label="Close" className="wz-close-btn" onClick={() => setShowAbortConfirm(false)}><X size={14} aria-hidden="true" /></button>
          </div>
          <div className="wz-body" style={{ padding: '24px' }}>
            <p style={{ fontSize: '14px', color: 'var(--t2)', marginBottom: '16px' }}>
              Are you sure you want to abort the RV Protocol for <strong>{patientId}</strong>?
            </p>
            <p style={{ fontSize: '13px', color: 'var(--t3)' }}>
              This will mark the randomization as failed (e.g., window expired or criteria not met) and return the patient to the Asymptomatic Phase.
            </p>
          </div>
          <div className="wz-foot" style={{ justifyContent: 'flex-end', gap: '12px' }}>
            <button className="btn btn-ghost" onClick={() => setShowAbortConfirm(false)}>Cancel</button>
            <button className="btn" style={{ background: 'var(--red)', color: 'white' }} onClick={onAbort}>Confirm Abort</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wz-overlay" onClick={() => onClose(false)}>
      <div className="wz-card" onClick={e => e.stopPropagation()}>
        <div className="wz-top">
          <div>
            <div className="wz-heading">RV Protocol — {patientId}</div>
            <div className="wz-heading-sub">Step {step + 1} of {WZ_STEPS.length} · {currentStep.title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <div style={{ textAlign: 'right' }}>
              <div className={`cd ${urgent ? 'urgent' : ''}`}>{cdStr}</div>
              <div className="cd-lbl">Window remaining</div>
            </div>
            <button aria-label="Close (progress saved)" className="wz-close-btn" onClick={() => onClose(false)} title="Close (progress saved)"><X size={14} aria-hidden="true" /></button>
          </div>
        </div>
        <div className="wz-stepper">
          {WZ_STEPS.map((_, i) => (
            <div key={i} className={`step-dot ${i < step ? 'done' : i === step ? 'active' : ''}`}></div>
          ))}
        </div>
        <div className="wz-body">
          <div className="wz-step-n">Step {step + 1} of {WZ_STEPS.length}</div>
          <div className="wz-step-title">{currentStep.title}</div>
          <div className="wz-step-desc">{renderSafeHTML(currentStep.body)}</div>
          {currentStep.checks.map((c: string, i: number) => (
            <div key={i} className={`wz-chk-item ${currentChks.has(i) ? 'checked' : ''}`}
              tabIndex={0} role="checkbox" aria-checked={currentChks.has(i)}
              onClick={() => toggleChk(i)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleChk(i); } }}>
              <div className={`chkbox ${currentChks.has(i) ? 'checked' : ''}`} style={{ flexShrink: 0 }}></div>
              <span>{renderSafeHTML(c)}</span>
            </div>
          ))}
        </div>
        <div className="wz-foot">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-ghost" onClick={() => step === 0 ? onClose(false) : setStep(step - 1)}>
              {step === 0 ? <><X size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Close</> : <><ArrowLeft size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Back</>}
            </button>
            <button className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={() => setShowAbortConfirm(true)}>
              Abort Protocol
            </button>
          </div>
          <div className={`wz-missing-badge ${allDone ? 'none' : ''}`}>
            {missCount > 0 ? `${missCount} item${missCount > 1 ? 's' : ''} to confirm` : ''}
          </div>
          <button className={`btn ${isLast ? 'btn-success' : 'btn-primary'}`} disabled={!allDone} onClick={() => isLast ? onRandomise() : setStep(step + 1)}>
            {isLast ? <><Check size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Randomise</> : <>Next <ArrowRight size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/></>}
          </button>
        </div>
      </div>
    </div>
  );
}
