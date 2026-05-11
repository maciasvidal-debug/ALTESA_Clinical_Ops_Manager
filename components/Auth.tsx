'use client';

import { Delete, ArrowRight, LifeBuoy, X, Shield, Key, Lock, RefreshCw, LogIn } from 'lucide-react';
import { useState } from 'react';

interface AuthProps {
  pin: string;
  pinErr: string;
  onPin: (k: string) => void;
  onFirebaseLogin: (email: string, password: string, role: 'coordinator' | 'manager') => Promise<{ success: boolean; error?: string }>;
  onRecovery: (email: string, password: string) => Promise<boolean>;
  hasPin: boolean;
  onSetupPin: (newPin: string) => Promise<boolean>;
  isStudyInit: boolean;
}

export const Auth = ({ pin, pinErr, onPin, onFirebaseLogin, onRecovery, hasPin, onSetupPin, isStudyInit }: AuthProps) => {
  const [mode, setMode] = useState<'firebase_login' | 'setup' | 'login' | 'recovery'>(
    !isStudyInit ? 'firebase_login' : (!hasPin ? 'setup' : 'login')
  );

  const [prevInit, setPrevInit] = useState(isStudyInit);
  const [prevPin, setPrevPin]   = useState(hasPin);
  if (isStudyInit !== prevInit || hasPin !== prevPin) {
    setPrevInit(isStudyInit);
    setPrevPin(hasPin);
    setMode(!isStudyInit ? 'firebase_login' : (!hasPin ? 'setup' : 'login'));
  }

  const [fbRole, setFbRole]       = useState<'coordinator' | 'manager'>('coordinator');
  const [fbEmail, setFbEmail]     = useState('');
  const [fbPass, setFbPass]       = useState('');
  const [fbErr, setFbErr]         = useState('');
  const [fbLoading, setFbLoading] = useState(false);

  const [passphrase, setPassphrase] = useState('');

  const [setupPin, setSetupPin]         = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupErr, setSetupErr]         = useState('');

  const [rcEmail, setRcEmail]     = useState('');
  const [rcPass, setRcPass]       = useState('');
  const [rcErr, setRcErr]         = useState('');
  const [rcLoading, setRcLoading] = useState(false);

  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(1);

  const handleFirebaseSubmit = async () => {
    if (!fbEmail || !fbPass) return;
    setFbLoading(true);
    setFbErr('');
    const result = await onFirebaseLogin(fbEmail.trim(), fbPass, fbRole);
    setFbLoading(false);
    if (!result.success) setFbErr(result.error || 'Authentication failed.');
  };

  const handleSetupSubmit = async () => {
    if (setupPin !== setupConfirm) { setSetupErr('PINs do not match.'); return; }
    if (setupPin.length < 4)       { setSetupErr('PIN must be at least 4 digits.'); return; }
    const success = await onSetupPin(setupPin);
    if (success) { setMode('login'); setSetupPin(''); setSetupConfirm(''); setSetupErr(''); }
    else setSetupErr('Could not save PIN. Try again.');
  };

  const handleRecoverySubmit = async () => {
    if (!rcEmail || !rcPass) return;
    setRcLoading(true);
    setRcErr('');
    const success = await onRecovery(rcEmail.trim(), rcPass);
    setRcLoading(false);
    if (success) { onPin('reset_pin'); setMode('setup'); setRcEmail(''); setRcPass(''); }
    else setRcErr('Invalid credentials. Use the site shared account.');
  };

  const handleManagerUnlock = () => {
    if (passphrase.trim().length >= 12) onPin('manager_unlock:' + passphrase.trim());
  };

  // ── Firebase Login ─────────────────────────────────────────────────────────
  if (mode === 'firebase_login') {
    return (
      <div className="screen auth-wrap">
        <div className="auth-card" style={{ width: '420px' }}>
          <div className="auth-wordmark">ALTE<em>SA</em></div>
          <div className="auth-sub">LOGIN WITH SHARED SITE CREDENTIALS</div>

          <div style={{ display: 'flex', gap: '8px', margin: '24px 0 20px', background: '#F1F5F9', padding: '4px', borderRadius: '8px' }}>
            {(['coordinator', 'manager'] as const).map(r => (
              <button key={r} onClick={() => setFbRole(r)} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', background: fbRole === r ? '#fff' : 'transparent', color: fbRole === r ? 'var(--t1)' : 'var(--t3)', boxShadow: fbRole === r ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ textAlign: 'left' }}>
            <label htmlFor="auth-email" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: '8px' }}>SITE EMAIL</label>
            <input id="auth-email" type="email" className="modal-input" placeholder="altesa.siteA@hospital.com" value={fbEmail} onChange={e => setFbEmail(e.target.value)} style={{ marginBottom: '16px' }} onKeyDown={e => e.key === 'Enter' && handleFirebaseSubmit()} autoComplete="email" />
            <label htmlFor="auth-password" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: '8px' }}>PASSWORD</label>
            <input id="auth-password" type="password" className="modal-input" placeholder="••••••••" value={fbPass} onChange={e => setFbPass(e.target.value)} style={{ marginBottom: '8px' }} onKeyDown={e => e.key === 'Enter' && handleFirebaseSubmit()} autoComplete="current-password" />
            {fbErr && <div style={{ color: '#EF4444', fontSize: '12px', margin: '8px 0', textAlign: 'center' }}>{fbErr}</div>}
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} disabled={!fbEmail || !fbPass || fbLoading} onClick={handleFirebaseSubmit}>
              {fbLoading ? <><RefreshCw size={14} /> Authenticating…</> : <><LogIn size={14} /> Sign In</>}
            </button>
          </div>

          <button onClick={() => setTourOpen(true)} style={{ marginTop: '20px', background: 'transparent', border: 'none', color: '#0EA5E9', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', margin: '20px auto 0' }}>
            <Shield size={16} /> How does security work?
          </button>
          <div style={{ marginTop: '16px', fontSize: '11px', color: '#94A3B8', lineHeight: 1.5, textAlign: 'center' }}>
            Credentials managed by Study Administrator. No PHI transmitted to cloud.
          </div>
        </div>

        {tourOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
            <div style={{ background: '#fff', width: '400px', borderRadius: '16px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', position: 'relative' }}>
              <button onClick={() => setTourOpen(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={20} /></button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', background: '#F0F9FF', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                  {tourStep === 1 && <Shield size={32} color="#0EA5E9" />}
                  {tourStep === 2 && <Key size={32} color="#0EA5E9" />}
                  {tourStep === 3 && <Lock size={32} color="#0EA5E9" />}
                  {tourStep === 4 && <RefreshCw size={32} color="#0EA5E9" />}
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--t1)', marginBottom: '12px' }}>
                  {['Hybrid Security','Site Credentials','Coordinator PIN','Instant Revocation'][tourStep - 1]}
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--t3)', lineHeight: 1.6, marginBottom: '24px' }}>
                  {tourStep === 1 && "ALTESA uses a Hybrid model: Firebase Auth as a cloud gatekeeper, with all cryptographic keys derived locally. No clinical data ever leaves this device."}
                  {tourStep === 2 && "Each site has a shared email/password managed by the Study Administrator. These credentials activate the local app. Revoking them blocks access immediately."}
                  {tourStep === 3 && "After the first login, Coordinators set a local PIN for daily use. Firebase is only required for initial activation and PIN recovery."}
                  {tourStep === 4 && "If a team member leaves, the Administrator changes the site password in the Firebase console. The next activation or PIN recovery attempt will be blocked."}
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '24px' }}>
                  {[1,2,3,4].map(s => <div key={s} style={{ width: '8px', height: '8px', borderRadius: '50%', background: s === tourStep ? '#0EA5E9' : 'var(--border)' }} />)}
                </div>
                <button className="btn btn-primary" style={{ width: '100%', padding: '12px' }} onClick={() => tourStep < 4 ? setTourStep(tourStep + 1) : setTourOpen(false)}>
                  {tourStep < 4 ? 'Next' : 'Got it!'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── PIN Setup ──────────────────────────────────────────────────────────────
  if (mode === 'setup') {
    return (
      <div className="screen auth-wrap">
        <div className="auth-card" style={{ width: '400px' }}>
          <div className="auth-wordmark">ALTE<em>SA</em></div>
          <div className="auth-sub">COORDINATOR PIN SETUP</div>
          <div style={{ marginTop: '24px', textAlign: 'left' }}>
            <label htmlFor="setup-pin" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: '8px' }}>NEW PIN (4–8 DIGITS)</label>
            <input id="setup-pin" type="password" className="modal-input" placeholder="••••" value={setupPin} onChange={e => setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 8))} style={{ marginBottom: '16px', textAlign: 'center', fontSize: '24px', letterSpacing: '8px' }} autoComplete="new-password" />
            <label htmlFor="setup-pin-confirm" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: '8px' }}>CONFIRM PIN</label>
            <input id="setup-pin-confirm" type="password" className="modal-input" placeholder="••••" value={setupConfirm} onChange={e => setSetupConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))} style={{ marginBottom: '16px', textAlign: 'center', fontSize: '24px', letterSpacing: '8px' }} autoComplete="new-password" />
            {setupErr && <div style={{ color: '#EF4444', fontSize: '12px', marginBottom: '16px', textAlign: 'center' }}>{setupErr}</div>}
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px' }} disabled={setupPin.length < 4 || setupPin !== setupConfirm} onClick={handleSetupSubmit}>
              Save PIN &amp; Enter
            </button>
          </div>
          <div style={{ marginTop: '16px', fontSize: '11px', color: '#94A3B8', textAlign: 'center', lineHeight: 1.5 }}>
            Session authorized by Firebase. PIN encrypted locally with PBKDF2-SHA256.
          </div>
        </div>
      </div>
    );
  }

  // ── Daily Login ────────────────────────────────────────────────────────────
  const isManagerTab = passphrase.trim().length > 0 || passphrase === ' ';

  return (
    <div className="screen auth-wrap">
      <div className="auth-card">
        <div className="auth-wordmark">ALTE<em>SA</em></div>
        <div className="auth-sub">VPV Study · {isManagerTab ? 'Manager' : 'Coordinator'} Platform<br/>PBKDF2-SHA256 · AES-256-GCM · Hybrid-Auth</div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: '#F1F5F9', padding: '4px', borderRadius: '8px' }}>
          <button onClick={() => setPassphrase('')} style={{ flex: 1, padding: '8px', border: 'none', background: !isManagerTab ? '#fff' : 'transparent', color: !isManagerTab ? 'var(--t1)' : 'var(--t3)', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', boxShadow: !isManagerTab ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>Coordinator</button>
          <button onClick={() => setPassphrase(' ')} style={{ flex: 1, padding: '8px', border: 'none', background: isManagerTab ? '#fff' : 'transparent', color: isManagerTab ? 'var(--t1)' : 'var(--t3)', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', boxShadow: isManagerTab ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>Manager</button>
        </div>

        {!isManagerTab ? (
          mode === 'recovery' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t3)', marginBottom: '12px' }}>PIN RECOVERY — RE-AUTHENTICATE</div>
              <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '16px', lineHeight: 1.5 }}>Enter the site shared credentials to reset your PIN.</div>
              <input type="email" className="modal-input" placeholder="Site email" value={rcEmail} onChange={e => setRcEmail(e.target.value)} style={{ marginBottom: '12px' }} />
              <input type="password" className="modal-input" placeholder="Password" value={rcPass} onChange={e => setRcPass(e.target.value)} style={{ marginBottom: '8px' }} onKeyDown={e => e.key === 'Enter' && handleRecoverySubmit()} />
              {rcErr && <div style={{ color: 'var(--red)', fontSize: '12px', marginBottom: '12px' }}>{rcErr}</div>}
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button className="btn btn-ghost" onClick={() => setMode('login')} style={{ flex: 1 }}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} disabled={!rcEmail || !rcPass || rcLoading} onClick={handleRecoverySubmit}>
                  {rcLoading && <RefreshCw size={14} />} Verify &amp; Reset
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="pin-track">
                {Array(8).fill(0).map((_, i) => <div key={i} className={`pin-dot ${i < pin.length ? 'on' : ''}`} />)}
              </div>
              {pinErr
                ? <div className="pin-hint err">{pinErr}</div>
                : pin.length > 0 && pin.length < 4
                  ? <div className="pin-hint ok">{4 - pin.length} more digit{4 - pin.length === 1 ? '' : 's'} needed</div>
                  : <div className="pin-hint ok">Enter your coordinator PIN</div>}
              <div className="keypad">
                {[1,2,3,4,5,6,7,8,9,'','0','⌫'].map((k, i) => {
                  if (k === '') return <div key={i} />;
                  if (k === '⌫') return <button key={i} className="kk del" onClick={() => onPin('del')}><Delete size={16} style={{ display:'inline', verticalAlign:'text-bottom' }} /> Del</button>;
                  return <button key={i} className="kk" onClick={() => onPin(k.toString())}>{k}</button>;
                })}
              </div>
              <button className="kk go" onClick={() => onPin('go')} disabled={pin.length < 4}>
                Unlock <ArrowRight size={14} style={{ display:'inline', verticalAlign:'text-bottom' }} />
              </button>
              <button onClick={() => setMode('recovery')} style={{ marginTop: '16px', background: 'transparent', border: 'none', color: 'var(--t3)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', margin: '16px auto 0' }}>
                <LifeBuoy size={14} /> Forgot PIN?
              </button>
            </>
          )
        ) : (
          <div style={{ textAlign: 'left' }}>
            <label htmlFor="manager-passphrase" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: '8px' }}>MANAGER PASSPHRASE</label>
            <input id="manager-passphrase" type="password" className="modal-input" placeholder="Enter manager passphrase…" value={passphrase.trim()} onChange={e => setPassphrase(e.target.value)} style={{ marginBottom: '12px' }} onKeyDown={e => e.key === 'Enter' && handleManagerUnlock()} autoComplete="current-password" />
            <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '20px', lineHeight: 1.4 }}>Min 12 characters. Registered on first use (TOFU).</div>
            <button className="kk go" style={{ width: '100%' }} disabled={passphrase.trim().length < 12} onClick={handleManagerUnlock}>
              Unlock Dashboard <ArrowRight size={14} style={{ display:'inline', verticalAlign:'text-bottom' }} />
            </button>
          </div>
        )}

        <div className="auth-note">
          <strong>Security:</strong> All keys derived locally. Identity governed by Firebase Auth.
        </div>
      </div>
    </div>
  );
};
