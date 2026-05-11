'use client';

import { useState, useRef } from 'react';
import { Upload, FilePlus, AlertTriangle, FileText, FileCheck, Download, Trash2 } from 'lucide-react';
import { getToday, fmtISO, fmtHuman, type Patient } from '@/lib/data';
import { DLPWrapper } from './DLPWrapper';

interface PatientDocumentsProps {
  patient: Patient;
  onUpdate: (docs: any[]) => void;
  onDLPViolation: (action: string) => void;
}

export const PatientDocuments = ({ patient, onUpdate, onDLPViolation }: PatientDocumentsProps) => {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    
    // Simulate upload
    setTimeout(() => {
      const newDocs = Array.from(files).map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        name: f.name,
        category: (f.name.toLowerCase().includes('consent') || f.name.toLowerCase().includes('icf')) ? 'ICF' : 'OTHER' as any,
        extension: f.name.split('.').pop()?.toUpperCase() || 'FILE',
        uploadDate: fmtISO(getToday()),
        url: '#',
        size: `${(f.size / 1024).toFixed(1)} KB`,
        critical: f.name.toLowerCase().includes('consent') || f.name.toLowerCase().includes('icf')
      }));
      
      onUpdate([...patient.documents, ...newDocs]);
      setUploading(false);
    }, 1500);
  };

  const removeDoc = (id: string) => {
    onUpdate(patient.documents.filter(d => d.id !== id));
  };

  const criticalMissing = !patient.documents.some(d => d.critical && (d.name.toLowerCase().includes('consent') || d.name.toLowerCase().includes('icf')));

  return (
    <div className="card">
      <div className="card-hdr">
        <div>
          <div className="card-title">Patient Documentation</div>
          <div className="card-sub">Manage informed consents, lab results, and other study records</div>
        </div>
        <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
          <FilePlus size={14} style={{marginRight: '8px'}} />
          Add Document
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          multiple 
          onChange={(e) => handleUpload(e.target.files)} 
        />
      </div>

      {criticalMissing && (
        <div className="doc-missing-alert">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>CRITICAL DOCUMENT MISSING</div>
              <div style={{ opacity: 0.9, fontSize: '12px' }}>Informed Consent Form (ICF) has not been uploaded for this patient.</div>
            </div>
          </div>
          <button className="btn" style={{ background: '#fff', color: 'var(--red)', border: 'none' }} onClick={() => fileInputRef.current?.click()}>
            Upload ICF Now
          </button>
        </div>
      )}

      <div 
        className={`upload-zone ${dragActive ? 'active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <div style={{ textAlign: 'center' }}>
            <div className="crit-pulse" style={{ margin: '0 auto 12px' }}></div>
            <div style={{ fontWeight: 600, color: 'var(--blue)' }}>Uploading documents...</div>
            <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '4px' }}>Encrypting and storing in secure vault</div>
          </div>
        ) : (
          <>
            <div className="upload-icon"><Upload size={24} /></div>
            <div className="upload-text">Drag & drop files here or <span>browse</span></div>
            <div className="upload-sub">PDF, PNG, JPG up to 10MB · HIPAA & GDPR Compliant</div>
          </>
        )}
      </div>

      <div className="doc-grid">
        {patient.documents.map(doc => (
          <div key={doc.id} className="doc-card">
            <div className="doc-icon">
              {doc.extension === 'PDF' ? <FileText size={20} /> : <FileCheck size={20} />}
            </div>
            <div className="doc-info">
              <div className="doc-name">
                <DLPWrapper onViolation={onDLPViolation}>{doc.name}</DLPWrapper>
                {doc.critical && <span className="doc-crit-badge">CRITICAL</span>}
              </div>
              <div className="doc-meta">
                {doc.category} · {doc.extension} · {doc.size} · Uploaded {fmtHuman(doc.uploadDate)}
              </div>
            </div>
            <div className="doc-actions">
              <button className="ibtn" title="Download"><Download size={14} /></button>
              <button className="ibtn" title="Delete" onClick={(e) => { e.stopPropagation(); removeDoc(doc.id); }}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {patient.documents.length === 0 && !uploading && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--t3)', border: '1px dashed var(--border)', borderRadius: '8px' }}>
            <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <div style={{ fontWeight: 600 }}>No documents uploaded yet</div>
            <div style={{ fontSize: '12px' }}>Start by dragging files to the upload zone above</div>
          </div>
        )}
      </div>
    </div>
  );
};
