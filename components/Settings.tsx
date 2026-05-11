import React, { useState, useEffect } from 'react';
import { Shield, Key, Download, Upload, Trash2, CheckCircle2, AlertTriangle, User, HelpCircle, ChevronRight, HardDrive } from 'lucide-react';
import { encryptAndSign, verifyAndDecrypt } from '@/lib/crypto';
import { Patient } from '@/lib/data';
import { PinConfirmModal } from '@/components/PinConfirmModal';

interface SettingsProps {
  patients: Patient[];
  onClose: () => void;
  onImportQueries: (queries: any[]) => void;
  onImportAmendments: (amendments: any[]) => void;
}

export function Settings({ patients, onClose, onImportQueries, onImportAmendments }: SettingsProps) {
  const [managerKey, setManagerKey] = useState<string>('');
  const [crcKeys, setCrcKeys] = useState<{publicKey: string, privateKey: string, signPublicKey: string, signPrivateKey: string, encPublicKey: string, encPrivateKey: string} | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [importedKeyName, setImportedKeyName] = useState<string | null>(null);
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);

  /**
   * SRE-001: Storage quota monitoring.
   * Loaded once on mount; refreshed after wipe.
   */
  const [storageInfo, setStorageInfo] = useState<{
    usedMB: string; quotaMB: string; usedPct: number;
  } | null>(null);

  const refreshStorageInfo = async () => {
    const { getStorageEstimate } = await import('@/lib/db');
    const estimate = await getStorageEstimate();
    if (estimate) setStorageInfo(estimate);
  };

  useEffect(() => { refreshStorageInfo(); }, []);

  /**
   * Inline operation status — replaces all alert() calls.
   * SbD: user sees a safe, generic, actionable message. No err.message or
   * internal details ever reach the UI. Auto-dismisses after 4 s.
   */
  const [opStatus, setOpStatus] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  useEffect(() => {
    if (!opStatus) return;
    const t = setTimeout(() => setOpStatus(null), 4000);
    return () => clearTimeout(t);
  }, [opStatus]);

  useEffect(() => {
    // Initialize CRC keys
    const initKeys = async () => {
      const { keysStore } = await import('@/lib/db');
      const stored = await keysStore.getItem<{publicKey: string, privateKey: string, signPublicKey: string, signPrivateKey: string, encPublicKey: string, encPrivateKey: string}>('crc_keys');
      if (stored) {
        setCrcKeys(stored);
      } else {
        const { generateCRCKeys } = await import('@/lib/crypto');
        const keys = await generateCRCKeys();
        await keysStore.setItem('crc_keys', keys);
        setCrcKeys(keys);
      }
    };
    initKeys();
  }, []);

  // Tour State
  const [tourStep, setTourStep] = useState<number>(0); // 0 = off, 1 = Import Key, 2 = Download Data, 3 = Upload Queries

  const startTour = () => {
    if (!managerKey) setTourStep(1);
    else setTourStep(2);
  };

  const nextTourStep = () => {
    if (tourStep === 1) {
      if (!managerKey) setOpStatus({ type: 'error', msg: 'Import the Manager Key before continuing the tour.' });
      else setTourStep(2);
    } else if (tourStep === 2) {
      setTourStep(3);
    } else {
      setTourStep(0);
    }
  };

  const handleDownloadPackage = async () => {
    if (!managerKey && !importedKeyName) {
      setOpStatus({ type: 'error', msg: 'Import a Manager Public Key before downloading a data package.' });
      if (tourStep === 0) setTourStep(1);
      return;
    }
    
    setDownloading(true);
    try {
      if (!crcKeys) throw new Error("CRC keys not initialized.");
      let mgrEncKey = managerKey;
      try {
        const parsed = JSON.parse(managerKey);
        if (parsed.encPublicKey) mgrEncKey = parsed.encPublicKey;
      } catch(e) {}
      
      const pkg = await encryptAndSign(patients, mgrEncKey, crcKeys.signPrivateKey);
      
      // Trigger download
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ALTESA_DataPackage_${new Date().toISOString().split('T')[0]}.enc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      if (tourStep === 2) setTourStep(3);
    } catch (e: any) {
      // SbD: log operation context only — never log the error object (may expose crypto internals).
      console.error('[ALTESA:Settings] Package encryption failed.');
      setOpStatus({ type: 'error', msg: 'Package encryption failed. Verify the Manager Key format and try again.' });
    } finally {
      setDownloading(false);
    }
  };

  const handleImportKey = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setManagerKey(content);
      setImportedKeyName(file.name);
      if (tourStep === 1) setTourStep(2);
    };
    reader.readAsText(file);
  };

  const handleLoadQueries = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadingQueries(true);
    try {
      if (!crcKeys) throw new Error("CRC keys not initialized.");
      const text = await file.text();
      const pkg = JSON.parse(text);
      
      // Decrypt using CRC's private key and verify Manager's signature
      let mgrSignKey = managerKey;
      try {
        const parsed = JSON.parse(managerKey);
        if (parsed.signPublicKey) mgrSignKey = parsed.signPublicKey;
      } catch(e) {}
      
      const data = await verifyAndDecrypt(pkg, crcKeys.encPrivateKey, mgrSignKey);
      
      onImportQueries(data);
      setOpStatus({ type: 'success', msg: `${data.length} ${data.length === 1 ? 'query' : 'queries'} loaded successfully.` });
      if (tourStep === 3) setTourStep(0);
    } catch (err: any) {
      // SbD: log operation context only — never log the error object (may expose crypto or key details).
      console.error('[ALTESA:Settings] Query package decryption/import failed.');
      setOpStatus({ type: 'error', msg: 'Query import failed. Verify the encrypted package and Manager Key, then try again.' });
    } finally {
      setLoadingQueries(false);
    }
  };

  return (
    <div className="screen" style={{ background: '#F8FAFC', minHeight: '100vh', padding: '40px 20px', position: 'relative' }}>
      
      {/* Tour Overlay (Focus State Dimming) */}
      {tourStep > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', zIndex: 900, backdropFilter: 'blur(2px)' }} onClick={() => setTourStep(0)} />
      )}

      <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--t1)', margin: '0 0 8px 0' }}>Settings & Security</h1>
            <p style={{ color: 'var(--t3)', margin: 0 }}>Manage data transfer, local security policies, and device configuration.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={startTour}
              style={{ padding: '8px 16px', background: '#E0E7FF', color: '#4338CA', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <HelpCircle size={16} /> Guide Me
            </button>
            <button onClick={onClose} style={{ padding: '8px 16px', background: 'var(--border)', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }}>Close</button>
          </div>
        </div>

        {/* Operation status banner — replaces alert() modals.
            Shown for both errors and success confirmations.
            Auto-dismisses after 4 s; also manually dismissible. */}
        {opStatus && (
          <div
            role={opStatus.type === 'error' ? 'alert' : 'status'}
            aria-live={opStatus.type === 'error' ? 'assertive' : 'polite'}
            style={{
            marginBottom: '20px', padding: '12px 16px', borderRadius: '8px',
            background: opStatus.type === 'error' ? '#FEF2F2' : '#F0FDF4',
            border: `1px solid ${opStatus.type === 'error' ? '#FECACA' : '#BBF7D0'}`,
            color: opStatus.type === 'error' ? '#991B1B' : '#166534',
            display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 500,
          }}>
            {opStatus.type === 'error'
              ? <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              : <CheckCircle2 size={16} style={{ flexShrink: 0 }} />}
            <span style={{ flex: 1 }}>{opStatus.msg}</span>
            <button
              onClick={() => setOpStatus(null)}
              aria-label="Dismiss"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 4px', fontSize: '16px', lineHeight: 1 }}
            >×</button>
          </div>
        )}

        {/* Identity */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Identity</h2>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
            <div style={{ fontSize: '13px', color: 'var(--t3)', fontWeight: 500, marginBottom: '4px' }}>Coordinator ID</div>
            <div style={{ fontSize: '16px', color: 'var(--t1)', fontWeight: 600, marginBottom: '8px' }}>CRA-001</div>
            <div style={{ fontSize: '12px', color: '#94A3B8' }}>Set during initial setup. Appears in all activity log entries.</div>
          </div>
        </div>

        {/* Security */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Security</h2>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '8px' }}>
            
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', color: 'var(--t1)', fontWeight: 600, marginBottom: '4px' }}>Encryption</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>AES-256-GCM · PBKDF2-SHA256 · 800,000 iterations · HKDF key derivation</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontSize: '12px', fontWeight: 600, border: '1px solid #10B981', padding: '4px 8px', borderRadius: '4px' }}>
                <CheckCircle2 size={14} /> Active
              </div>
            </div>

            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', color: 'var(--t1)', fontWeight: 600, marginBottom: '4px' }}>Session Timeout</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>Auto-locks after 30 minutes of inactivity (GCP/ICH E6 R3)</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontSize: '12px', fontWeight: 600, border: '1px solid #10B981', padding: '4px 8px', borderRadius: '4px' }}>
                <CheckCircle2 size={14} /> 30 min
              </div>
            </div>

            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', color: 'var(--t1)', fontWeight: 600, marginBottom: '4px' }}>PII Filter</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>Blocks DNI/RUT/CPF/CURP/SSN/NIF/NINO/email/phone in study notes</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontSize: '12px', fontWeight: 600, border: '1px solid #10B981', padding: '4px 8px', borderRadius: '4px' }}>
                <CheckCircle2 size={14} /> Active
              </div>
            </div>

            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', color: 'var(--t1)', fontWeight: 600, marginBottom: '4px' }}>Identity Provider</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>Firebase Authentication (email/password) · altesa-clinical-ops · No PHI in cloud</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontSize: '12px', fontWeight: 600, border: '1px solid #10B981', padding: '4px 8px', borderRadius: '4px' }}>
                <CheckCircle2 size={14} /> Firebase
              </div>
            </div>

            <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', color: 'var(--t1)', fontWeight: 600, marginBottom: '4px' }}>Offline Capability</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>Service Worker cache · IndexedDB local storage · Firebase only contacted for auth</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontSize: '12px', fontWeight: 600, border: '1px solid #10B981', padding: '4px 8px', borderRadius: '4px' }}>
                <CheckCircle2 size={14} /> Active
              </div>
            </div>

            {/* SRE-001: Storage quota monitoring row */}
            {storageInfo && (
              <div style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '14px', color: 'var(--t1)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <HardDrive size={14} aria-hidden="true" /> Local Storage Usage
                  </div>
                  <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                    {storageInfo.usedMB} MB used of ~{storageInfo.quotaMB} MB available (IndexedDB + Cache)
                  </div>
                  {/* Progress bar — turns amber at 70%, red at 90% */}
                  <div style={{ marginTop: '8px', width: '240px', height: '4px', background: '#E2E8F0', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '2px',
                      width: `${Math.min(storageInfo.usedPct, 100)}%`,
                      background: storageInfo.usedPct >= 90 ? '#EF4444'
                               : storageInfo.usedPct >= 70 ? '#F59E0B'
                               : '#10B981',
                      transition: 'width 0.4s ease',
                    }} role="presentation" />
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '12px', fontWeight: 600, padding: '4px 8px', borderRadius: '4px',
                  border: `1px solid ${storageInfo.usedPct >= 90 ? '#EF4444' : storageInfo.usedPct >= 70 ? '#F59E0B' : '#10B981'}`,
                  color: storageInfo.usedPct >= 90 ? '#EF4444' : storageInfo.usedPct >= 70 ? '#F59E0B' : '#10B981',
                }}>
                  {storageInfo.usedPct >= 90
                    ? <><AlertTriangle size={14} /> {storageInfo.usedPct}% — Critical</>
                    : storageInfo.usedPct >= 70
                    ? <><AlertTriangle size={14} /> {storageInfo.usedPct}% — Warning</>
                    : <><CheckCircle2 size={14} /> {storageInfo.usedPct}% OK</>}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Data Transfer */}
        <div style={{ marginBottom: '32px' }}>
          
          {/* Step 2: Download Data */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '16px', position: 'relative', zIndex: tourStep === 2 ? 1000 : 1, boxShadow: tourStep === 2 ? '0 0 0 4px rgba(59, 130, 246, 0.5)' : 'none' }}>
            {tourStep === 2 && (
              <div style={{ position: 'absolute', top: '-80px', left: '0', background: '#1E3A8A', color: '#fff', padding: '16px', borderRadius: '8px', width: '320px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#93C5FD', marginBottom: '4px' }}>STEP 2 OF 3</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Export Secure Package</div>
                <div style={{ fontSize: '13px', color: '#DBEAFE', marginBottom: '12px' }}>Now that you have the Manager&apos;s key, you can generate an encrypted package. PII is automatically filtered.</div>
                <button onClick={nextTourStep} style={{ background: '#3B82F6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>Next <ChevronRight size={14} /></button>
              </div>
            )}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: 'var(--t1)' }}>
              <Download size={16} color="#3B82F6" /> Send Data to Manager
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--t3)', marginBottom: '16px' }}>Generate a secure data package containing all site activities. Send this file to your Clinical Manager for oversight.</p>
              <button 
                onClick={handleDownloadPackage}
                disabled={downloading}
                style={{ width: '100%', padding: '12px', background: '#1E3A8A', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.7 : 1 }}
              >
                {downloading ? 'Encrypting...' : 'Download Data Package'}
              </button>
            </div>
          </div>

          {/* Step 3: Upload Queries */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '16px', position: 'relative', zIndex: tourStep === 3 ? 1000 : 1, boxShadow: tourStep === 3 ? '0 0 0 4px rgba(139, 92, 246, 0.5)' : 'none' }}>
            {tourStep === 3 && (
              <div style={{ position: 'absolute', top: '-80px', left: '0', background: '#4C1D95', color: '#fff', padding: '16px', borderRadius: '8px', width: '320px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#C4B5FD', marginBottom: '4px' }}>STEP 3 OF 3</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Receive Manager Queries</div>
                <div style={{ fontSize: '13px', color: '#EDE9FE', marginBottom: '12px' }}>When the Manager reviews your data, they will send back an encrypted query package. Load it here.</div>
                <button onClick={nextTourStep} style={{ background: '#8B5CF6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>Finish Tour <CheckCircle2 size={14} /></button>
              </div>
            )}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: 'var(--t1)' }}>
              <Upload size={16} color="#8B5CF6" /> Receive Manager Queries
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--t3)', marginBottom: '16px' }}>Load a query package provided by your Manager. This will highlight patients that need data correction.</p>
              <label style={{ display: 'block', width: '100%', padding: '12px', background: '#F1F5F9', color: 'var(--t1)', border: '1px solid var(--border)', borderRadius: '6px', fontWeight: 600, cursor: loadingQueries ? 'not-allowed' : 'pointer', textAlign: 'center', opacity: loadingQueries ? 0.7 : 1 }}>
                {loadingQueries ? 'Loading...' : 'Load Query Package'}
                <input type="file" accept=".enc" style={{ display: 'none' }} onChange={handleLoadQueries} disabled={loadingQueries} />
              </label>
            </div>
          </div>

          {/* Step 1: Import Key */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', position: 'relative', zIndex: tourStep === 1 ? 1000 : 1, boxShadow: tourStep === 1 ? '0 0 0 4px rgba(245, 158, 11, 0.5)' : 'none' }}>
            {tourStep === 1 && (
              <div style={{ position: 'absolute', top: '-80px', left: '0', background: '#78350F', color: '#fff', padding: '16px', borderRadius: '8px', width: '320px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#FCD34D', marginBottom: '4px' }}>STEP 1 OF 3</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Import Manager Key</div>
                <div style={{ fontSize: '13px', color: '#FEF3C7', marginBottom: '12px' }}>To send encrypted data packages, you need the Manager&apos;s Public Key. This is separate from Firebase login — it&apos;s used only for clinical data encryption, not authentication.</div>
                <button onClick={nextTourStep} style={{ background: '#F59E0B', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>Next <ChevronRight size={14} /></button>
              </div>
            )}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: 'var(--t1)' }}>
              <Key size={16} color="#F59E0B" /> Import Manager Key
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--t3)', marginBottom: '16px' }}>Import the public key provided by your Manager to enable secure data encryption.</p>
              <label style={{ display: 'block', width: '100%', padding: '12px', background: '#F1F5F9', color: 'var(--t1)', border: '1px solid var(--border)', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                {importedKeyName ? `Key Loaded: ${importedKeyName}` : 'Import Manager Key (.txt)'}
                <input type="file" accept=".txt" style={{ display: 'none' }} onChange={handleImportKey} />
              </label>
            </div>
          </div>
        </div>

        {/* Step 4: Import Protocol Amendments */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: 'var(--t1)' }}>
            <Upload size={16} color="#EC4899" /> Import Protocol Amendments
          </div>
          <div style={{ padding: '20px' }}>
            <p style={{ fontSize: '13px', color: 'var(--t3)', marginBottom: '16px' }}>Load the protocol amendments JSON provided by your Manager to synchronize the protocol structure.</p>
            <label style={{ display: 'block', width: '100%', padding: '12px', background: '#F1F5F9', color: 'var(--t1)', border: '1px solid var(--border)', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
              Load Protocol Amendments JSON
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (evt) => {
                    try {
                      const imported = JSON.parse(evt.target?.result as string);
                      if (Array.isArray(imported)) {
                        onImportAmendments(imported);
                        setOpStatus({ type: 'success', msg: 'Protocol amendments updated successfully.' });
                      } else {
                        setOpStatus({ type: 'error', msg: 'Invalid amendments file. Expected a JSON array — verify the file and try again.' });
                      }
                    } catch {
                      // SbD: log operation context only — no err.message exposed to the UI.
                      console.error('[ALTESA:Settings] Protocol amendments JSON parse failed.');
                      setOpStatus({ type: 'error', msg: 'Failed to read amendments file. Ensure it is valid JSON and try again.' });
                    }
                  };
                  reader.readAsText(file);
                }
              }} />
            </label>
          </div>
        </div>

        {/* Danger Zone */}
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#DC2626' }}>
            <AlertTriangle size={16} /> Danger Zone
          </div>
          <div style={{ padding: '20px' }}>
            <p style={{ fontSize: '13px', color: '#DC2626', marginBottom: '16px' }}>Erasing data will permanently remove all patients, activity logs, and settings from this device. This action cannot be undone.</p>
            <button 
              onClick={() => setShowEraseConfirm(true)}
              style={{ width: '100%', padding: '12px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
            >
              Erase All Data from This Device
            </button>
          </div>
        </div>

      </div>

      {showEraseConfirm && (
        <PinConfirmModal
          message="Are you sure you want to permanently erase ALL data? This action cannot be undone."
          onCancel={() => setShowEraseConfirm(false)}
          onConfirm={async () => {
            const { wipeAllData } = await import('@/lib/db');
            await wipeAllData('WIPE_CONFIRMED');
            await refreshStorageInfo(); // update quota display before reload
            localStorage.clear();
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
