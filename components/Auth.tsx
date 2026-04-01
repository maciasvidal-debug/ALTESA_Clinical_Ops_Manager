'use client';

import { Delete, ArrowRight } from 'lucide-react';

interface AuthProps {
  pin: string;
  pinErr: string;
  onPin: (k: string) => void;
}

export const Auth = ({ pin, pinErr, onPin }: AuthProps) => {
  return (
    <div className="screen auth-wrap">
      <div className="auth-card">
        <div className="auth-wordmark">ALTE<em>SA</em></div>
        <div className="auth-sub">VPV Study · Coordinator Platform<br/>PBKDF2-SHA256 · AES-256-GCM · No backend</div>
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
        <div className="auth-note">
          <strong>Prototype mode</strong> — any PIN of ≥ 4 digits unlocks the demo.
          Production: 310,000-iteration PBKDF2 key derivation + 8 single-use recovery codes.
        </div>
      </div>
    </div>
  );
};
