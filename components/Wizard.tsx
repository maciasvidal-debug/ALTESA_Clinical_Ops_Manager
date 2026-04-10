'use client';

import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { WZ_STEPS } from '@/lib/data';

export function Wizard({ step, setStep, chks, setChks, cdStart, onClose, onRandomise, onToggleChk, patientId, onEarlyTermination }: any) {
  const [cdStr, setCdStr] = useState('');
  const [urgent, setUrgent] = useState(false);

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

  return (
    <div className="wz-overlay" onClick={() => onClose(false)}>
      <div className="wz-card" onClick={e => e.stopPropagation()}>
        <div className="wz-top">
          <div>
            <div className="wz-heading">RV Protocol — {patientId || 'ALTESA-047'}</div>
            <div className="wz-heading-sub">Step {step + 1} of {WZ_STEPS.length} · {currentStep.title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <div style={{ textAlign: 'right' }}>
              <div className={`cd ${urgent ? 'urgent' : ''}`}>{cdStr}</div>
              <div className="cd-lbl">Window remaining</div>
            </div>
            <button className="wz-close-btn" onClick={() => onClose(false)} title="Close (progress saved)"><X size={14} /></button>
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
          <div className="wz-step-desc" dangerouslySetInnerHTML={{ __html: currentStep.body }}></div>
          {currentStep.checks.map((c: string, i: number) => (
            <div key={i} className={`wz-chk-item ${currentChks.has(i) ? 'checked' : ''}`}
              tabIndex={0} role="checkbox" aria-checked={currentChks.has(i)}
              onClick={() => toggleChk(i)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleChk(i); } }}>
              <div className={`chkbox ${currentChks.has(i) ? 'checked' : ''}`} style={{ flexShrink: 0 }}></div>
              <span dangerouslySetInnerHTML={{ __html: c }}></span>
            </div>
          ))}
        </div>
        <div className="wz-foot" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-ghost" onClick={() => step === 0 ? onClose(false) : setStep(step - 1)}>
              {step === 0 ? <><X size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Close</> : <><ArrowLeft size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Back</>}
            </button>
            <button className="btn btn-danger" onClick={() => { if(window.confirm('Are you sure you want to mark this patient as Early Termination? This action is irreversible.')) onEarlyTermination(); }}>
              Fail / Early Terminate
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className={`wz-missing-badge ${allDone ? 'none' : ''}`}>
              {missCount > 0 ? `${missCount} item${missCount > 1 ? 's' : ''} to confirm` : ''}
            </div>
            <button className={`btn ${isLast ? 'btn-success' : 'btn-primary'}`} disabled={!allDone} onClick={() => isLast ? onRandomise() : setStep(step + 1)}>
              {isLast ? <><Check size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Randomise</> : <>Next <ArrowRight size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
