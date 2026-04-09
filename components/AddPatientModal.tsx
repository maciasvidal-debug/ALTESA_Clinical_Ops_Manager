'use client';

import { useState } from 'react';
import { X, User, UserPlus, Info, AlertTriangle, Globe } from 'lucide-react';

interface AddPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (id: string, name: string, lang: string) => void;
}

export const AddPatientModal = ({ isOpen, onClose, onAdd }: AddPatientModalProps) => {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [lang, setLang] = useState('English');
  const [err, setErr] = useState('');

  if (!isOpen) return null;

  // Default format but configurable, e.g. "^[A-Z]{3}-\\d{3}$" could be passed via settings.
  // We use a robust default that ensures structure if not overridden.
  const ID_REGEX = /^[A-Z]{6}-\d{3}$/;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !name.trim()) {
      setErr('Please fill in all required fields.');
      return;
    }

    // Strict Enrolment Validation (Six Sigma - Defect Reduction)
    if (!ID_REGEX.test(id.trim())) {
      setErr('Invalid format. ID must follow the sponsor nomenclature (e.g., ALTESA-002).');
      return;
    }

    onAdd(id.trim(), name.trim(), lang);
    setId('');
    setName('');
    setLang('English');
    setErr('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-title">Add New Patient</div>
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
              <label className="modal-label"><User size={12} /> Patient Identifier</label>
              <input 
                autoFocus
                type="text" 
                className="modal-input"
                value={id} 
                onChange={e => setId(e.target.value)} 
                placeholder="e.g. ALTESA-002"
                required
              />
              <div className="modal-help">
                <Info size={14} />
                <span>Use the standardized study format (SITE-XXX). This ID will be used for all regulatory tracking.</span>
              </div>
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label className="modal-label"><User size={12} /> Full Name</label>
              <input 
                type="text" 
                className="modal-input"
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="e.g. John Doe"
                required
              />
              <div className="modal-help">
                <Info size={14} />
                <span>Enter the patient&apos;s legal name as it appears on study documents.</span>
              </div>
            </div>
            <div>
              <label className="modal-label"><Globe size={12} /> Primary Language</label>
              <select 
                className="modal-input"
                value={lang} 
                onChange={e => setLang(e.target.value)}
              >
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
              </select>
              <div className="modal-help">
                <Info size={14} />
                <span>Sets the default language for ePRO questionnaires and patient-facing materials.</span>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!id.trim()}>
              <UserPlus size={14} style={{ marginRight: '6px', display: 'inline' }} />
              Add Patient
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
