'use client';

import React, { useState } from 'react';
import { HelpCircle, X, Home, User, AlertTriangle, Shield, FileText, Key } from 'lucide-react';

export function HelpModal({ onClose, initialTab = 'guide' }: { onClose: () => void, initialTab?: string }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="modal-overlay" style={{ zIndex: 900 }}>
      <div className="modal-card" style={{ maxWidth: '600px', padding: 0 }}>
        <div className="modal-hdr" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HelpCircle size={18} color="var(--blue)" /> 
            Help &amp; Learning Centre
          </div>
          <button className="ibtn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', overflowX: 'auto' }}>
            <button className={`tab-btn ${tab === 'guide' ? 'active' : ''}`} onClick={() => setTab('guide')} style={{ padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === 'guide' ? 'var(--blue)' : 'transparent'}`, fontSize: '13px', fontWeight: 600, color: tab === 'guide' ? 'var(--blue)' : 'var(--t2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Quick Guide</button>
            <button className={`tab-btn ${tab === 'security' ? 'active' : ''}`} onClick={() => setTab('security')} style={{ padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === 'security' ? 'var(--blue)' : 'transparent'}`, fontSize: '13px', fontWeight: 600, color: tab === 'security' ? 'var(--blue)' : 'var(--t2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Security & Sync</button>
            <button className={`tab-btn ${tab === 'glossary' ? 'active' : ''}`} onClick={() => setTab('glossary')} style={{ padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === 'glossary' ? 'var(--blue)' : 'transparent'}`, fontSize: '13px', fontWeight: 600, color: tab === 'glossary' ? 'var(--blue)' : 'var(--t2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Glossary</button>
            <button className={`tab-btn ${tab === 'shortcuts' ? 'active' : ''}`} onClick={() => setTab('shortcuts')} style={{ padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === 'shortcuts' ? 'var(--blue)' : 'transparent'}`, fontSize: '13px', fontWeight: 600, color: tab === 'shortcuts' ? 'var(--blue)' : 'var(--t2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Shortcuts</button>
          </div>
          <div style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto', fontSize: '13px', lineHeight: '1.6', color: 'var(--t2)' }}>
            {tab === 'guide' && (
              <div>
                <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', color: 'var(--t1)' }}>Welcome to the ALTESA Coordination Platform!</h3>
                <p style={{ marginBottom: '16px' }}>This platform is designed to help you manage patients through the different phases of the VPV study. Here is a summary of how to use the main features:</p>
                
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: '6px' }}><Home size={14} /> 1. Dashboard</h4>
                  <p style={{ margin: 0 }}>The main dashboard shows all your active patients. Pay special attention to the <strong>Alerts</strong> at the top. Patients with a <strong>Positive DTQ</strong> alert require immediate action (within the next 48 hours).</p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: '6px' }}><User size={14} /> 2. Patient View and Tasks</h4>
                  <p style={{ marginBottom: '8px' }}>By clicking on a patient, you will see their detailed timeline and task list. Tasks are grouped by category (Questionnaires, Procedures, Laboratories, Administrative).</p>
                  <ul style={{ paddingLeft: '20px', margin: 0 }}>
                    <li style={{ marginBottom: '6px' }}><strong>Complete Tasks:</strong> Click the circle next to a task to mark it as completed.</li>
                    <li style={{ marginBottom: '6px' }}><strong>Dependencies:</strong> Some tasks depend on others. Look for the <span style={{ background: 'var(--amber-bg)', color: 'var(--amber)', padding: '2px 4px', borderRadius: '4px', fontSize: '10px' }}>PREREQUISITE</span> and <span style={{ background: 'var(--blue-bg)', color: 'var(--blue)', padding: '2px 4px', borderRadius: '4px', fontSize: '10px' }}>DEPENDENT</span> tags. Click &quot;Trace Flow&quot; to see visual lines connecting the tasks.</li>
                    <li style={{ marginBottom: '6px' }}><strong>Due Dates:</strong> Tasks with a red dot are overdue or due today.</li>
                  </ul>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> 3. The RV Protocol (Positive DTQ)</h4>
                  <p style={{ margin: 0 }}>If a patient reports new symptoms (DTQ task), the system will ask if the result is Positive or Negative. A <strong>Positive</strong> result triggers the RV Protocol Wizard, which will guide you through the critical steps before randomisation.</p>
                </div>
              </div>
            )}
            {tab === 'security' && (
              <div>
                <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', color: 'var(--t1)' }}>Offline Security & Data Sync Workflow</h3>
                <p style={{ marginBottom: '16px' }}>ALTESA uses a military-grade, offline-first security architecture. Data is never sent to a central server. Instead, it is transferred securely between Coordinators and Managers using encrypted packages.</p>
                
                <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: '6px' }}><Key size={14} color="#F59E0B" /> 1. Manager Key Exchange</h4>
                  <p style={{ margin: 0 }}>Before data can be shared, the Manager must export their <strong>Public Key</strong> from their dashboard and share it with the Coordinator. The Coordinator imports this key in the <strong>Settings</strong> menu.</p>
                </div>

                <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: '6px' }}><Shield size={14} color="#3B82F6" /> 2. Exporting Data (Coordinator)</h4>
                  <p style={{ margin: 0 }}>In <strong>Settings</strong>, the Coordinator clicks <strong>Download Data Package</strong>. The system automatically filters PII (emails, phones, SSN) and encrypts the data using AES-256-GCM and the Manager&apos;s Public Key. It also signs the package to prevent tampering.</p>
                </div>

                <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={14} color="#10B981" /> 3. Importing Data (Manager)</h4>
                  <p style={{ margin: 0 }}>The Manager receives the <code>.enc</code> file and uses the <strong>Data Sync</strong> button in their dashboard to import it. The system verifies the signature and decrypts the payload locally.</p>
                </div>
              </div>
            )}
            {tab === 'glossary' && (
              <div>
                <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', color: 'var(--t1)' }}>Study Terms Glossary</h3>
                <div style={{ display: 'grid', gap: '16px' }}>
                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--t1)', marginBottom: '4px' }}>PSB (Pre-Symptomatic Baseline)</div>
                    <div>The phase where patients report daily symptoms via ePRO. We need at least 3 records to establish a baseline before any infection.</div>
                  </div>
                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--t1)', marginBottom: '4px' }}>DTQ (Daily Trigger Questionnaire)</div>
                    <div>A daily questionnaire asking if the patient has new respiratory symptoms. A positive response triggers the RV Protocol.</div>
                  </div>
                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--t1)', marginBottom: '4px' }}>RV Protocol (Rhinovirus)</div>
                    <div>The time-critical phase (48h + 6h window) starting from symptom onset, leading to randomisation and treatment.</div>
                  </div>
                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--t1)', marginBottom: '4px' }}>E-RS / PGIS</div>
                    <div>Evaluating Respiratory Symptoms scales. Used to calculate the PSB and track symptom resolution during treatment.</div>
                  </div>
                </div>
              </div>
            )}
            {tab === 'shortcuts' && (
              <div>
                <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', color: 'var(--t1)' }}>Keyboard Shortcuts</h3>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <kbd style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontFamily: 'var(--fm)', fontSize: '11px', color: 'var(--t1)', boxShadow: '0 1px 1px rgba(0,0,0,0.05)' }}>⌘ + K</kbd>
                    <span>Open Quick Search / Command Palette</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <kbd style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontFamily: 'var(--fm)', fontSize: '11px', color: 'var(--t1)', boxShadow: '0 1px 1px rgba(0,0,0,0.05)' }}>Esc</kbd>
                    <span>Close modals or search</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <kbd style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontFamily: 'var(--fm)', fontSize: '11px', color: 'var(--t1)', boxShadow: '0 1px 1px rgba(0,0,0,0.05)' }}>Space</kbd> <span style={{ fontSize: '11px' }}>or</span> <kbd style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontFamily: 'var(--fm)', fontSize: '11px', color: 'var(--t1)', boxShadow: '0 1px 1px rgba(0,0,0,0.05)' }}>Enter</kbd>
                    <span>Check/uncheck focused task</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer" style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '16px 24px' }}>
          <button className="btn btn-primary w-full" style={{ width: '100%', justifyContent: 'center' }} onClick={onClose}>Understood!</button>
        </div>
      </div>
    </div>
  );
}
