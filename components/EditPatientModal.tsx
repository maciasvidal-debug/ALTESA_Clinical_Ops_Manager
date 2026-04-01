'use client';

import { useState, useEffect } from 'react';
import { X, User, Globe, Hospital, AlertTriangle } from 'lucide-react';
import { type Patient } from '@/lib/data';

interface EditPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  onUpdate: (data: Partial<Patient>) => void;
}

export const EditPatientModal = ({ isOpen, onClose, patient, onUpdate }: EditPatientModalProps) => {
  const [data, setData] = useState<Partial<Patient>>({});
  const [err, setErr] = useState('');
  const [prevPatientId, setPrevPatientId] = useState<string | null>(null);

  if (patient && patient.id !== prevPatientId) {
    setPrevPatientId(patient.id);
    setData({
      name: patient.name,
      lang: patient.lang,
      loc: patient.loc
    });
  }

  if (!isOpen || !patient) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.name?.trim()) {
      setErr('Name is required.');
      return;
    }
    onUpdate(data);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-title">Edit Patient Details</div>
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
              <label className="modal-label"><User size={12} /> Full Name</label>
              <input 
                autoFocus
                type="text" 
                className="modal-input"
                value={data.name || ''} 
                onChange={e => setData({ ...data, name: e.target.value })} 
                placeholder="e.g. John Doe"
                required
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label className="modal-label"><Globe size={12} /> Primary Language</label>
              <select 
                className="modal-input"
                value={data.lang || ''} 
                onChange={e => setData({ ...data, lang: e.target.value })}
              >
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Mandarin">Mandarin</option>
              </select>
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label className="modal-label"><Hospital size={12} /> Current Location</label>
              <select 
                className="modal-input"
                value={data.loc || ''} 
                onChange={e => setData({ ...data, loc: e.target.value })}
              >
                <option value="CLINIC">CLINIC</option>
                <option value="HOME">HOME</option>
                <option value="HOME→CLINIC">HOME→CLINIC</option>
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
};
