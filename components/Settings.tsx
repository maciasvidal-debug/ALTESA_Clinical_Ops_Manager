import React, { useState, useEffect } from 'react';
import { Shield, Key, Download, Upload, Trash2, CheckCircle2, AlertTriangle, User, HelpCircle, ChevronRight } from 'lucide-react';
import { encryptAndSign, verifyAndDecrypt } from '@/lib/crypto';
import { Patient } from '@/lib/data';

interface SettingsProps {
  patients: Patient[];
  onClose: () => void;
  onImportQueries: (queries: any[]) => void;
}

export function Settings({ patients, onClose, onImportQueries }: SettingsProps) {
  const [managerKey, setManagerKey] = useState<string>('');
  const [crcKeys, setCrcKeys] = useState<{publicKey: string, privateKey: string, signPublicKey: string, signPrivateKey: string, encPublicKey: string, encPrivateKey: string} | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [importedKeyName, setImportedKeyName] = useState<string | null>(null);

  useEffect(() => {
    // Initialize CRC keys
    const initKeys = async () => {
      const stored = localStorage.getItem('altesa_crc_keys');
      if (stored) {
        setCrcKeys(JSON.parse(stored));
      } else {
        const { generateCRCKeys } = await import('@/lib/crypto');
        const keys = await generateCRCKeys();
        localStorage.setItem('altesa_crc_keys', JSON.stringify(keys));
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
      if (!managerKey) alert("Please import the Manager Key to continue the tour.");
      else setTourStep(2);
    } else if (tourStep === 2) {
      setTourStep(3);
    } else {
      setTourStep(0);
    }
  };

  const handleDownloadPackage = async () => {
    if (!managerKey && !importedKeyName) {
      alert("Please import a Manager Public Key first.");
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
      console.error(e);
      alert(`Encryption failed: ${e.message}`);
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
      alert(`Successfully loaded ${data.length} queries.`);
      if (tourStep === 3) setTourStep(0);
    } catch (err: any) {
      console.error("Query import failed:", err);
      alert(`Failed to load queries: ${err.message}`);
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
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A', margin: '0 0 8px 0' }}>Settings & Security</h1>
            <p style={{ color: '#64748B', margin: 0 }}>Manage offline data transfer and local security policies.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={startTour}
              style={{ padding: '8px 16px', background: '#E0E7FF', color: '#4338CA', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <HelpCircle size={16} /> Guide Me
            </button>
            <button onClick={onClose} style={{ padding: '8px 16px', background: '#E2E8F0', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }}>Close</button>
          </div>
        </div>

        {/* Identity */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Identity</h2>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px' }}>
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 500, marginBottom: '4px' }}>Coordinator ID</div>
            <div style={{ fontSize: '16px', color: '#0F172A', fontWeight: 600, marginBottom: '8px' }}>CRA-001</div>
            <div style={{ fontSize: '12px', color: '#94A3B8' }}>Set during initial setup. Appears in all activity log entries.</div>
          </div>
        </div>

        {/* Security */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Security</h2>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
            
            <div style={{ padding: '20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#0F172A', fontWeight: 600, marginBottom: '4px' }}>Encryption</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>AES-256-GCM · PBKDF2-SHA256 · 800,000 iterations · HKDF key derivation</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontSize: '12px', fontWeight: 600, border: '1px solid #10B981', padding: '4px 8px', borderRadius: '4px' }}>
                <CheckCircle2 size={14} /> Active
              </div>
            </div>

            <div style={{ padding: '20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#0F172A', fontWeight: 600, marginBottom: '4px' }}>Session Timeout</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>Auto-locks after 30 minutes of inactivity (GCP/ICH E6 R3)</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontSize: '12px', fontWeight: 600, border: '1px solid #10B981', padding: '4px 8px', borderRadius: '4px' }}>
                <CheckCircle2 size={14} /> 30 min
              </div>
            </div>

            <div style={{ padding: '20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#0F172A', fontWeight: 600, marginBottom: '4px' }}>PII Filter</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>Blocks DNI/RUT/CPF/CURP/SSN/NIF/NINO/email/phone in study notes</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontSize: '12px', fontWeight: 600, border: '1px solid #10B981', padding: '4px 8px', borderRadius: '4px' }}>
                <CheckCircle2 size={14} /> Active
              </div>
            </div>

            <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#0F172A', fontWeight: 600, marginBottom: '4px' }}>Offline Capability</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>Service Worker cache · No data sent to servers · IndexedDB local storage</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontSize: '12px', fontWeight: 600, border: '1px solid #10B981', padding: '4px 8px', borderRadius: '4px' }}>
                <CheckCircle2 size={14} /> Active
              </div>
            </div>

          </div>
        </div>

        {/* Data Transfer */}
        <div style={{ marginBottom: '32px' }}>
          
          {/* Step 2: Download Data */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '16px', position: 'relative', zIndex: tourStep === 2 ? 1000 : 1, boxShadow: tourStep === 2 ? '0 0 0 4px rgba(59, 130, 246, 0.5)' : 'none' }}>
            {tourStep === 2 && (
              <div style={{ position: 'absolute', top: '-80px', left: '0', background: '#1E3A8A', color: '#fff', padding: '16px', borderRadius: '8px', width: '320px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#93C5FD', marginBottom: '4px' }}>STEP 2 OF 3</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Export Secure Package</div>
                <div style={{ fontSize: '13px', color: '#DBEAFE', marginBottom: '12px' }}>Now that you have the Manager&apos;s key, you can generate an encrypted package. PII is automatically filtered.</div>
                <button onClick={nextTourStep} style={{ background: '#3B82F6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>Next <ChevronRight size={14} /></button>
              </div>
            )}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#0F172A' }}>
              <Download size={16} color="#3B82F6" /> Send Data to Manager
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>Generate a secure data package containing all site activities. Send this file to your Clinical Manager for oversight.</p>
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
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '16px', position: 'relative', zIndex: tourStep === 3 ? 1000 : 1, boxShadow: tourStep === 3 ? '0 0 0 4px rgba(139, 92, 246, 0.5)' : 'none' }}>
            {tourStep === 3 && (
              <div style={{ position: 'absolute', top: '-80px', left: '0', background: '#4C1D95', color: '#fff', padding: '16px', borderRadius: '8px', width: '320px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#C4B5FD', marginBottom: '4px' }}>STEP 3 OF 3</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Receive Manager Queries</div>
                <div style={{ fontSize: '13px', color: '#EDE9FE', marginBottom: '12px' }}>When the Manager reviews your data, they will send back an encrypted query package. Load it here.</div>
                <button onClick={nextTourStep} style={{ background: '#8B5CF6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>Finish Tour <CheckCircle2 size={14} /></button>
              </div>
            )}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#0F172A' }}>
              <Upload size={16} color="#8B5CF6" /> Receive Manager Queries
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>Load a query package provided by your Manager. This will highlight patients that need data correction.</p>
              <label style={{ display: 'block', width: '100%', padding: '12px', background: '#F1F5F9', color: '#0F172A', border: '1px solid #E2E8F0', borderRadius: '6px', fontWeight: 600, cursor: loadingQueries ? 'not-allowed' : 'pointer', textAlign: 'center', opacity: loadingQueries ? 0.7 : 1 }}>
                {loadingQueries ? 'Loading...' : 'Load Query Package'}
                <input type="file" accept=".enc" style={{ display: 'none' }} onChange={handleLoadQueries} disabled={loadingQueries} />
              </label>
            </div>
          </div>

          {/* Step 1: Import Key */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', position: 'relative', zIndex: tourStep === 1 ? 1000 : 1, boxShadow: tourStep === 1 ? '0 0 0 4px rgba(245, 158, 11, 0.5)' : 'none' }}>
            {tourStep === 1 && (
              <div style={{ position: 'absolute', top: '-80px', left: '0', background: '#78350F', color: '#fff', padding: '16px', borderRadius: '8px', width: '320px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#FCD34D', marginBottom: '4px' }}>STEP 1 OF 3</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Import Manager Key</div>
                <div style={{ fontSize: '13px', color: '#FEF3C7', marginBottom: '12px' }}>To securely send data, you first need the Manager&apos;s Public Key. Ask your Manager to export it from their dashboard.</div>
                <button onClick={nextTourStep} style={{ background: '#F59E0B', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>Next <ChevronRight size={14} /></button>
              </div>
            )}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#0F172A' }}>
              <Key size={16} color="#F59E0B" /> Import Manager Key
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>Import the public key provided by your Manager to enable secure data encryption.</p>
              <label style={{ display: 'block', width: '100%', padding: '12px', background: '#F1F5F9', color: '#0F172A', border: '1px solid #E2E8F0', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                {importedKeyName ? `Key Loaded: ${importedKeyName}` : 'Import Manager Key (.txt)'}
                <input type="file" accept=".txt" style={{ display: 'none' }} onChange={handleImportKey} />
              </label>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#DC2626' }}>
            <AlertTriangle size={16} /> Danger Zone
          </div>
          <div style={{ padding: '20px' }}>
            <p style={{ fontSize: '13px', color: '#DC2626', marginBottom: '16px' }}>Erasing data will permanently remove all patients, activity logs, and settings from this device. This action cannot be undone.</p>
            <button style={{ width: '100%', padding: '12px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
              Erase All Data from This Device
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
