'use client';

import { useState } from 'react';
import { X, User, UserPlus, Info, AlertTriangle, Globe, Building2 } from 'lucide-react';
import type { AmendmentStatus, ProtocolAmendment } from '@/lib/data';

interface AddPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Called with all 6 required fields once the user submits the form.
   * Signature matches handleAddPatient in page.tsx.
   */
  onAdd: (
    id:              string,
    siteId:          string,
    name:            string,
    lang:            string,
    consentDate:     Date,
    protocolVersion: string,
  ) => void;
  protocolVersions: Pick<ProtocolAmendment, 'id' | 'label' | 'status'>[];
}

export const AddPatientModal = ({
  isOpen,
  onClose,
  onAdd,
  protocolVersions,
}: AddPatientModalProps) => {
  const activeVersionId =
    protocolVersions.find(v => v.status === 'active')?.id ?? '';

  const [id,             setId]             = useState('');
  const [siteId,         setSiteId]         = useState('');
  const [name,           setName]           = useState('');
  const [lang,           setLang]           = useState('English');
  const [consentDateStr, setConsentDateStr] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [protocolVersion, setProtocolVersion] = useState(activeVersionId);
  const [err, setErr] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !siteId.trim() || !name.trim() || !protocolVersion) {
      setErr('Please fill in all required fields.');
      return;
    }
    onAdd(
      id.trim(),
      siteId.trim().toUpperCase(),
      name.trim(),
      lang,
      new Date(consentDateStr + 'T00:00:00'),
      protocolVersion,
    );
    // Reset form
    setId('');
    setSiteId('');
    setName('');
    setLang('English');
    setProtocolVersion(activeVersionId);
    setConsentDateStr(new Date().toISOString().split('T')[0]);
    setErr('');
  };

  /** Human-readable label for a status value in the version selector. */
  const statusLabel = (status: AmendmentStatus): string => {
    const map: Record<AmendmentStatus, string> = {
      active:     'Current',
      draft:      'Draft',
      submitted:  'Submitted',
      approved:   'Approved',
      superseded: 'Superseded',
      legacy:     'Legacy',
    };
    return map[status] ?? status;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-title">Add New Patient</div>
          <button type="button" className="ibtn" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">

            {/* Inline validation error */}
            {err && (
              <div style={{
                marginBottom: '16px', padding: '10px 12px',
                background: 'var(--red-bg)', border: '1px solid var(--red-mid)',
                borderRadius: 'var(--r1)', color: 'var(--red)',
                fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <AlertTriangle size={14} aria-hidden="true" /> {err}
              </div>
            )}

            {/* Patient ID */}
            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="ap-patient-id" className="modal-label">
                <User size={12} aria-hidden="true" /> Patient Identifier
                <span style={{ color: 'var(--red)', marginLeft: 4 }} aria-hidden="true">*</span>
              </label>
              <input
                id="ap-patient-id"
                autoFocus
                type="text"
                className="modal-input"
                value={id}
                onChange={e => setId(e.target.value)}
                placeholder="e.g. ALTESA-002"
                required
                autoComplete="off"
              />
              <div className="modal-help">
                <Info size={14} aria-hidden="true" />
                <span>Use the standardized study format (SITE-XXX). This ID drives all regulatory tracking.</span>
              </div>
            </div>

            {/* Site ID */}
            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="ap-site-id" className="modal-label">
                <Building2 size={12} aria-hidden="true" /> Site ID
                <span style={{ color: 'var(--red)', marginLeft: 4 }} aria-hidden="true">*</span>
              </label>
              <input
                id="ap-site-id"
                type="text"
                className="modal-input"
                value={siteId}
                onChange={e => setSiteId(e.target.value.toUpperCase())}
                placeholder="e.g. FALP-CL, HMC, SITE-A"
                required
                autoComplete="off"
              />
              <div className="modal-help">
                <Info size={14} aria-hidden="true" />
                <span>Clinical site where the patient is enrolled. Required for multi-site Navigator tracking.</span>
              </div>
            </div>

            {/* Full Name */}
            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="ap-name" className="modal-label">
                <User size={12} aria-hidden="true" /> Full Name
                <span style={{ color: 'var(--red)', marginLeft: 4 }} aria-hidden="true">*</span>
              </label>
              <input
                id="ap-name"
                type="text"
                className="modal-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. John Doe"
                required
                autoComplete="off"
              />
              <div className="modal-help">
                <Info size={14} aria-hidden="true" />
                <span>Legal name as it appears on study documents.</span>
              </div>
            </div>

            {/* Primary Language */}
            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="ap-lang" className="modal-label">
                <Globe size={12} aria-hidden="true" /> Primary Language
              </label>
              <select
                id="ap-lang"
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
                <Info size={14} aria-hidden="true" />
                <span>Default language for ePRO questionnaires and patient-facing materials.</span>
              </div>
            </div>

            {/* Consent Date */}
            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="ap-consent-date" className="modal-label">
                Consent Date (Screening Start)
                <span style={{ color: 'var(--red)', marginLeft: 4 }} aria-hidden="true">*</span>
              </label>
              <input
                id="ap-consent-date"
                type="date"
                className="modal-input"
                value={consentDateStr}
                onChange={e => setConsentDateStr(e.target.value)}
                required
              />
              <div className="modal-help">
                <Info size={14} aria-hidden="true" />
                <span>Date the Informed Consent Form was signed — marks the start of the Screening period.</span>
              </div>
            </div>

            {/* Protocol Version */}
            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="ap-protocol" className="modal-label">
                Protocol Amendment Version
                <span style={{ color: 'var(--red)', marginLeft: 4 }} aria-hidden="true">*</span>
              </label>
              <select
                id="ap-protocol"
                className="modal-input"
                value={protocolVersion}
                onChange={e => setProtocolVersion(e.target.value)}
              >
                {protocolVersions.map(pv => (
                  <option key={pv.id} value={pv.id}>
                    {pv.id} — {pv.label} ({statusLabel(pv.status)})
                  </option>
                ))}
              </select>
              <div className="modal-help">
                <Info size={14} aria-hidden="true" />
                <span>Protocol version the patient is consented under. Determines their Schedule of Assessments.</span>
              </div>
            </div>

          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!id.trim() || !siteId.trim() || !name.trim()}
            >
              <UserPlus size={14} style={{ marginRight: '6px', display: 'inline' }} aria-hidden="true" />
              Add Patient
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
