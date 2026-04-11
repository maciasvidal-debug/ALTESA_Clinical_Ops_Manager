'use client';

import { Delete, ArrowRight, LifeBuoy, X, HelpCircle, Info, CheckCircle2, Shield, Key, Cpu, Lock } from 'lucide-react';
import { useState, useEffect } from 'react';

interface AuthProps {
  pin: string;
  pinErr: string;
  onPin: (k: string) => void;
  onRecovery: (challenge: string, response: string) => Promise<boolean>;
  isActivated: boolean;
  onActivate: (siteId: string, activationCode: string) => Promise<boolean>;
  hasPin: boolean;
  onSetupPin: (newPin: string, response: string, challenge: string) => Promise<boolean>;
  isStudyInit: boolean;
  onInitStudy: (config: string) => Promise<boolean>;
}

export const Auth = ({ pin, pinErr, onPin, onRecovery, isActivated, onActivate, hasPin, onSetupPin, isStudyInit, onInitStudy }: AuthProps) => {
  const [mode, setMode] = useState<'login' | 'recovery' | 'activation' | 'setup' | 'init'>(
    !isStudyInit ? 'init' : (!isActivated ? 'activation' : (!hasPin ? 'setup' : 'login'))
  );

  useEffect(() => {
    setMode(!isStudyInit ? 'init' : (!isActivated ? 'activation' : (!hasPin ? 'setup' : 'login')));
  }, [isStudyInit, isActivated, hasPin]);
  const [authRole, setAuthRole] = useState<'coordinator' | 'manager'>('coordinator');
  const [passphrase, setPassphrase] = useState('');
  
  const [challenge, setChallenge] = useState('');
  const [responseInput, setResponseInput] = useState('');
  const [recoveryErr, setRecoveryErr] = useState('');

  // Setup State
  const [setupPin, setSetupPin] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupChallenge, setSetupChallenge] = useState('');
  const [setupResponse, setSetupResponse] = useState('');
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [setupErr, setSetupErr] = useState('');

  // Activation State
  const [siteId, setSiteId] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [activationErr, setActivationErr] = useState('');
  const [deviceId, setDeviceId] = useState('');

  // Tour State
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(1);

  // Init State
  const [configInput, setConfigInput] = useState('');
  const [initErr, setInitErr] = useState('');
  const [showManagerLogin, setShowManagerLogin] = useState(false);

  const handleInitSubmit = async () => {
    const success = await onInitStudy(configInput);
    if (success) {
      setMode(!isActivated ? 'activation' : (!hasPin ? 'setup' : 'login'));
    } else {
      setInitErr('Invalid Study Configuration. Check the file content.');
    }
  };

  useEffect(() => {
    if (!isActivated) {
      import('@/lib/security').then(m => setDeviceId(m.getHardwareFingerprint()));
    }
  }, [isActivated]);

  const handleActivationSubmit = async () => {
    const success = await onActivate(siteId, activationCode);
    if (success) {
      setMode(!hasPin ? 'setup' : 'login');
    } else {
      setActivationErr('Invalid Activation Code for this Device/Site.');
    }
  };

  const startSetupChallenge = () => {
    if (setupPin !== setupConfirm) {
      setSetupErr('PINs do not match.');
      return;
    }
    if (setupPin.length < 4) {
      setSetupErr('PIN must be at least 4 digits.');
      return;
    }
    const newChallenge = Math.floor(100000 + Math.random() * 900000).toString();
    setSetupChallenge(newChallenge);
    setSetupStep(2);
    setSetupErr('');
  };

  const handleSetupSubmit = async () => {
    const success = await onSetupPin(setupPin, setupResponse, setupChallenge);
    if (success) {
      setMode('login');
      setSetupStep(1);
      setSetupPin('');
      setSetupConfirm('');
    } else {
      setSetupErr('Invalid Activation Response. Contact Manager.');
    }
  };

  const startRecovery = () => {
    const newChallenge = Math.floor(100000 + Math.random() * 900000).toString();
    setChallenge(newChallenge);
    setMode('recovery');
    setResponseInput('');
    setRecoveryErr('');
  };

  const handleRecoverySubmit = async () => {
    const success = await onRecovery(challenge, responseInput);
    if (success) {
      setMode('login');
      onPin('reset_pin'); // Signal to reset PIN state
    } else {
      setRecoveryErr('Invalid Response Code. Contact Manager.');
    }
  };

  const handleManagerUnlock = (e: React.MouseEvent) => {
    e.preventDefault();
    if (passphrase.length >= 12) {
      onPin('manager_unlock:' + passphrase);
    }
  };

  if (mode === 'init') {
    return (
      <div className="screen auth-wrap">
        <div className="auth-card" style={{ width: '480px' }}>
          <div className="auth-wordmark">ALTE<em>SA</em></div>
          <div className="auth-sub">{showManagerLogin ? 'MANAGER ADMINISTRATIVE ACCESS' : 'STUDY INITIALIZATION REQUIRED'}</div>
          
          <div style={{ marginTop: '24px', textAlign: 'left' }}>
            {!showManagerLogin ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', padding: '16px', background: '#F0F9FF', borderRadius: '12px', border: '1px solid #BAE6FD' }}>
                  <Shield size={24} color="#0284C7" />
                  <div style={{ fontSize: '13px', color: '#0369A1', lineHeight: 1.4 }}>
                    <strong>Manager Action Required:</strong> This application instance is not bound to a study. Please load your <strong>Master Key File</strong> content.
                  </div>
                </div>

                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '8px' }}>STUDY CONFIGURATION (JSON)</label>
                <textarea 
                  className="modal-input" 
                  placeholder='{"studyId": "...", "secret": "..."}'
                  value={configInput}
                  onChange={(e) => setConfigInput(e.target.value)}
                  style={{ height: '120px', fontSize: '12px', fontFamily: 'monospace', paddingTop: '12px' }}
                />
                {initErr && <div style={{ color: '#EF4444', fontSize: '12px', marginTop: '8px', textAlign: 'center' }}>{initErr}</div>}
                
                <div style={{ marginTop: '24px' }}>
                  <button 
                    className="btn btn-primary" 
                    style={{ width: '100%', padding: '12px' }} 
                    disabled={!configInput}
                    onClick={handleInitSubmit}
                  >Initialize Study</button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'left' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '8px' }}>MANAGER PASSPHRASE</label>
                <input 
                  type="password" 
                  className="modal-input" 
                  placeholder="Enter study master passphrase..."
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  style={{ marginBottom: '12px' }}
                />
                <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '20px', lineHeight: 1.4 }}>
                  Enter your 12+ character passphrase to access the administrative dashboard and generate keys.
                </div>
                <button 
                  className="kk go" 
                  style={{ width: '100%' }} 
                  disabled={passphrase.length < 12}
                  onClick={(e) => handleManagerUnlock(e)}
                >
                  Unlock Dashboard <ArrowRight size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/>
                </button>
                <button 
                  onClick={() => setShowManagerLogin(false)}
                  style={{ width: '100%', marginTop: '12px', background: 'transparent', border: 'none', color: '#64748B', fontSize: '13px', cursor: 'pointer' }}
                >
                  Back to Initialization
                </button>
              </div>
            )}
          </div>

          {!showManagerLogin && (
            <>
              <button 
                onClick={() => setTourOpen(true)}
                style={{ marginTop: '16px', background: 'transparent', border: 'none', color: '#0EA5E9', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', margin: '16px auto 0 auto' }}
              >
                <HelpCircle size={16} /> New here? Start Security Tour
              </button>

              <div style={{ marginTop: '24px', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                <button 
                  onClick={() => setShowManagerLogin(true)}
                  style={{ background: 'transparent', border: 'none', color: '#64748B', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Manager Login (Bypass Initialization)
                </button>
              </div>
              
              <div style={{ marginTop: '16px', fontSize: '11px', color: '#94A3B8', lineHeight: 1.5, textAlign: 'center' }}>
                The Master Key File is provided by the Study Administrator. 
                It contains the cryptographic seeds for this specific project.
              </div>
            </>
          )}
        </div>

        {tourOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
            <div style={{ background: '#fff', width: '400px', borderRadius: '16px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', position: 'relative' }}>
              <button onClick={() => setTourOpen(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={20} /></button>
              
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', background: '#F0F9FF', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto' }}>
                  {tourStep === 1 && <Shield size={32} color="#0EA5E9" />}
                  {tourStep === 2 && <Key size={32} color="#0EA5E9" />}
                  {tourStep === 3 && <Cpu size={32} color="#0EA5E9" />}
                  {tourStep === 4 && <Lock size={32} color="#0EA5E9" />}
                </div>

                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' }}>
                  {tourStep === 1 && "Serverless Security"}
                  {tourStep === 2 && "Master Key File"}
                  {tourStep === 3 && "Site Activation"}
                  {tourStep === 4 && "Coordinator PIN"}
                </h3>

                <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6, marginBottom: '24px' }}>
                  {tourStep === 1 && "ALTESA uses a 'Zero-Backend' security model. All keys are derived locally in your browser. No passwords or clinical data ever leave this device."}
                  {tourStep === 2 && "The Manager must load a Master Key File first. This file 'binds' the app to the study and contains the mathematical seeds for all validations."}
                  {tourStep === 3 && "Each device has a unique Hardware ID. The Manager must authorize this ID to activate the site before any data can be entered."}
                  {tourStep === 4 && "Coordinators set their own PIN, but it must be activated by a Manager via a Challenge-Response code to prevent unauthorized registrations."}
                </p>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '24px' }}>
                  {[1, 2, 3, 4].map(s => (
                    <div key={s} style={{ width: '8px', height: '8px', borderRadius: '50%', background: s === tourStep ? '#0EA5E9' : '#E2E8F0' }}></div>
                  ))}
                </div>

                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%', padding: '12px' }}
                  onClick={() => {
                    if (tourStep < 4) setTourStep(tourStep + 1);
                    else setTourOpen(false);
                  }}
                >
                  {tourStep < 4 ? "Next Step" : "Got it!"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'activation') {
    return (
      <div className="screen auth-wrap">
        <div className="auth-card" style={{ width: '440px' }}>
          <div className="auth-wordmark">ALTE<em>SA</em></div>
          <div className="auth-sub">SITE ACTIVATION REQUIRED</div>
          
          <div style={{ marginTop: '24px', textAlign: 'left' }}>
            <div style={{ padding: '12px', background: '#F1F5F9', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>DEVICE HARDWARE ID</div>
              <div style={{ fontSize: '14px', fontFamily: 'monospace', color: '#0F172A' }}>{deviceId}</div>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>Send this ID to your Manager to receive an Activation Code.</div>
            </div>

            <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '8px' }}>SITE ID</label>
            <input 
              type="text" 
              className="modal-input" 
              placeholder="e.g. SITE-A"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value.toUpperCase())}
              style={{ marginBottom: '16px' }}
            />

            <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '8px' }}>ACTIVATION CODE</label>
            <input 
              type="text" 
              className="modal-input" 
              placeholder="Enter 12-character code"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
              style={{ fontFamily: 'monospace', letterSpacing: '1px' }}
            />
            {activationErr && <div style={{ color: '#EF4444', fontSize: '12px', marginTop: '8px', textAlign: 'center' }}>{activationErr}</div>}
          </div>

          <div style={{ marginTop: '24px' }}>
            <button 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '12px' }} 
              disabled={!siteId || activationCode.length < 12}
              onClick={handleActivationSubmit}
            >Activate Instance</button>
          </div>

          <div style={{ marginTop: '16px', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
            <button 
              onClick={() => { setAuthRole('manager'); setMode('login'); }}
              style={{ background: 'transparent', border: 'none', color: '#64748B', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Manager Login (Bypass Activation)
            </button>
          </div>
          
          <div style={{ marginTop: '16px', fontSize: '11px', color: '#94A3B8', lineHeight: 1.5 }}>
            This instance must be cryptographically bound to this hardware and site. 
            Activation is permanent for this browser profile.
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'setup') {
    return (
      <div className="screen auth-wrap">
        <div className="auth-card" style={{ width: '400px' }}>
          <div className="auth-wordmark">ALTE<em>SA</em></div>
          <div className="auth-sub">COORDINATOR PIN SETUP</div>

          {setupStep === 1 ? (
            <div style={{ marginTop: '24px', textAlign: 'left' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '8px' }}>NEW PIN (4-8 DIGITS)</label>
              <input 
                type="password" 
                className="modal-input" 
                placeholder="••••"
                value={setupPin}
                onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                style={{ marginBottom: '16px', textAlign: 'center', fontSize: '24px', letterSpacing: '8px' }}
              />
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '8px' }}>CONFIRM PIN</label>
              <input 
                type="password" 
                className="modal-input" 
                placeholder="••••"
                value={setupConfirm}
                onChange={(e) => setSetupConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                style={{ marginBottom: '16px', textAlign: 'center', fontSize: '24px', letterSpacing: '8px' }}
              />
              {setupErr && <div style={{ color: '#EF4444', fontSize: '12px', marginBottom: '16px', textAlign: 'center' }}>{setupErr}</div>}
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '12px' }} 
                disabled={setupPin.length < 4 || setupPin !== setupConfirm}
                onClick={startSetupChallenge}
              >Continue to Activation</button>
            </div>
          ) : (
            <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', marginBottom: '16px' }}>PIN ACTIVATION REQUIRED</div>
              <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>CHALLENGE CODE</div>
                <div style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '4px', color: '#0EA5E9' }}>{setupChallenge}</div>
              </div>
              <input 
                type="text" 
                className="modal-input" 
                placeholder="Enter response from manager"
                value={setupResponse}
                onChange={(e) => setSetupResponse(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ textAlign: 'center', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}
              />
              {setupErr && <div style={{ color: '#EF4444', fontSize: '12px', marginBottom: '16px' }}>{setupErr}</div>}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-ghost" onClick={() => setSetupStep(1)} style={{ flex: 1 }}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={setupResponse.length < 6} onClick={handleSetupSubmit}>Activate PIN</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen auth-wrap">
      <div className="auth-card">
        <div className="auth-wordmark">ALTE<em>SA</em></div>
        <div className="auth-sub">VPV Study · {authRole === 'coordinator' ? 'Coordinator' : 'Manager'} Platform<br/>PBKDF2-SHA256 · AES-256-GCM · No backend</div>
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: '#F1F5F9', padding: '4px', borderRadius: '8px' }}>
          <button 
            onClick={() => { setAuthRole('coordinator'); setMode('login'); }}
            style={{ flex: 1, padding: '8px', border: 'none', background: authRole === 'coordinator' ? '#fff' : 'transparent', color: authRole === 'coordinator' ? '#0F172A' : '#64748B', borderRadius: '4px', fontWeight: 600, boxShadow: authRole === 'coordinator' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer' }}
          >
            Coordinator
          </button>
          <button 
            onClick={() => { setAuthRole('manager'); setMode('login'); }}
            style={{ flex: 1, padding: '8px', border: 'none', background: authRole === 'manager' ? '#fff' : 'transparent', color: authRole === 'manager' ? '#0F172A' : '#64748B', borderRadius: '4px', fontWeight: 600, boxShadow: authRole === 'manager' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer' }}
          >
            Manager
          </button>
        </div>

        {authRole === 'coordinator' ? (
          mode === 'recovery' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '16px' }}>PIN RECOVERY MODE</div>
              <div style={{ padding: '16px', background: 'var(--bg)', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>CHALLENGE CODE</div>
                <div style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '4px', color: 'var(--primary)' }}>{challenge}</div>
              </div>
              <input 
                type="text" 
                className="modal-input" 
                placeholder="Enter 6-digit response"
                value={responseInput}
                onChange={(e) => setResponseInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ textAlign: 'center', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}
              />
              {recoveryErr && <div style={{ color: 'var(--red)', fontSize: '12px', marginBottom: '16px' }}>{recoveryErr}</div>}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-ghost" onClick={() => setMode('login')} style={{ flex: 1 }}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={responseInput.length < 6} onClick={handleRecoverySubmit}>Verify</button>
              </div>
            </div>
          ) : (
            <>
              <div className="pin-track">
                {Array(8).fill(0).map((_, i) => (
                  <div key={i} className={`pin-dot ${i < pin.length ? 'on' : ''}`}></div>
                ))}
              </div>
              {pinErr ? <div className="pin-hint err">{pinErr}</div> :
               pin.length > 0 && pin.length < 4 ? <div className="pin-hint ok">{4 - pin.length} more digit{4 - pin.length === 1 ? '' : 's'} needed</div> :
               <div className="pin-hint ok">Enter your coordinator PIN</div>}
              <div className="keypad">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', '0', '⌫'].map((k, i) => {
                  if (k === '') return <div key={i}></div>;
                  if (k === '⌫') return <button key={i} className="kk del" onClick={() => onPin('del')}><Delete size={16} style={{display:'inline', verticalAlign:'text-bottom'}}/> Del</button>;
                  return <button key={i} className="kk" onClick={() => onPin(k.toString())}>{k}</button>;
                })}
              </div>
              <button className="kk go" onClick={() => onPin('go')} disabled={pin.length < 4}>Unlock <ArrowRight size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/></button>
              <button onClick={startRecovery} style={{ marginTop: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', margin: '16px auto 0 auto' }}><LifeBuoy size={14} /> Forgot PIN?</button>
            </>
          )
        ) : (
          <div style={{ textAlign: 'left' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '8px' }}>MANAGER PASSPHRASE</label>
            <input 
              type="password" 
              className="modal-input" 
              placeholder="Enter study master passphrase..."
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              style={{ marginBottom: '12px' }}
            />
            <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '20px', lineHeight: 1.4 }}>
              Requires a high-entropy passphrase (min 12 chars). This passphrase derives the key to decrypt the local Manager Vault.
            </div>
            <button 
              className="kk go" 
              style={{ width: '100%' }} 
              disabled={passphrase.length < 12}
              onClick={(e) => handleManagerUnlock(e)}
            >
              Unlock Dashboard <ArrowRight size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/>
            </button>
          </div>
        )}
        
        <div className="auth-note">
          <strong>Security:</strong> All keys are derived locally. No data ever leaves this browser profile.
        </div>
      </div>
    </div>
  );
};
