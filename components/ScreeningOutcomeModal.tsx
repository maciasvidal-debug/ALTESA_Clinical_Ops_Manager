'use client';

import { useState } from 'react';
import { X, CheckCircle, XCircle, Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
import { Patient, fmtISO, addDays, diffDays, TODAY } from '@/lib/data';

interface ScreeningOutcomeModalProps {
  patient: Patient;
  isOpen: boolean;
  onClose: () => void;
  onOutcome: (outcome: 'success' | 'failure', icfDate: Date, psbStartDate?: Date, reason?: string) => void;
}

export const ScreeningOutcomeModal = ({ patient, isOpen, onClose, onOutcome }: ScreeningOutcomeModalProps) => {
  const [outcome, setOutcome] = useState<'success' | 'failure' | null>(null);
  const [icfDateStr, setIcfDateStr] = useState(fmtISO(patient.screeningDate || TODAY));
  const [psbStartDateStr, setPsbStartDateStr] = useState(fmtISO(addDays(new Date(icfDateStr + 'T00:00:00'), 1)));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');

    if (!outcome) {
      setErr('Please select an outcome.');
      return;
    }

    const icfDate = new Date(icfDateStr + 'T00:00:00');
    
    if (outcome === 'success') {
      const psbDate = new Date(psbStartDateStr + 'T00:00:00');
      const daysDiff = diffDays(icfDate, psbDate);
      if (daysDiff < 1 || daysDiff > 21) {
        setErr('PSB Start Date must be between 1 and 21 days after the ICF (Screening) Date.');
        return;
      }
      onOutcome('success', icfDate, psbDate);
    } else {
      if (!reason.trim()) {
        setErr('Please provide a reason for screen failure.');
        return;
      }
      onOutcome('failure', icfDate, undefined, reason);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-hdr">
          <div className="modal-title">Record Screening Outcome</div>
          <button type="button" className="ibtn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {err && (
              <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-mid)', borderRadius: 'var(--r1)', color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={14} /> {err}
              </div>
            )}
            
            <div style={{ marginBottom: '24px' }}>
              <label className="modal-label"><CalendarIcon size={12} /> ICF Signed Date (Screening Start)</label>
              <input 
                type="date" 
                className="modal-input"
                value={icfDateStr} 
                onChange={e => {
                  setIcfDateStr(e.target.value);
                  setPsbStartDateStr(fmtISO(addDays(new Date(e.target.value + 'T00:00:00'), 1)));
                }}
                required
                max={fmtISO(TODAY)}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label className="modal-label">Screening Outcome</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  type="button"
                  onClick={() => setOutcome('success')}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: outcome === 'success' ? '2px solid var(--blue)' : '1px solid var(--border)', background: outcome === 'success' ? '#EFF6FF' : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                >
                  <CheckCircle size={24} color={outcome === 'success' ? 'var(--blue)' : 'var(--text-light)'} />
                  <span style={{ fontWeight: 500, color: outcome === 'success' ? 'var(--blue)' : 'var(--text)' }}>Eligible (Start PSB)</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setOutcome('failure')}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: outcome === 'failure' ? '2px solid var(--red)' : '1px solid var(--border)', background: outcome === 'failure' ? 'var(--red-bg)' : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                >
                  <XCircle size={24} color={outcome === 'failure' ? 'var(--red)' : 'var(--text-light)'} />
                  <span style={{ fontWeight: 500, color: outcome === 'failure' ? 'var(--red)' : 'var(--text)' }}>Screen Failure</span>
                </button>
              </div>
            </div>

            {outcome === 'success' && (
              <div style={{ marginBottom: '16px', padding: '16px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <label className="modal-label"><CalendarIcon size={12} /> PSB Phase Start Date (Week 1, Day 1)</label>
                <input 
                  type="date" 
                  className="modal-input"
                  value={psbStartDateStr} 
                  onChange={e => setPsbStartDateStr(e.target.value)}
                  required
                  min={fmtISO(addDays(new Date(icfDateStr + 'T00:00:00'), 1))}
                  max={fmtISO(addDays(new Date(icfDateStr + 'T00:00:00'), 21))}
                />
                <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '8px' }}>
                  Must be within 21 days of the ICF date.
                </div>
              </div>
            )}

            {outcome === 'failure' && (
              <div style={{ marginBottom: '16px', padding: '16px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <label className="modal-label">Reason for Failure</label>
                <textarea 
                  className="modal-input"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Failed inclusion criteria #3 (FEV1 < 30%)"
                  rows={3}
                  required
                />
              </div>
            )}

          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!outcome}>
              Save Outcome
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
