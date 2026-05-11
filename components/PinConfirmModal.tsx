import React, { useState } from 'react';
import { Lock } from 'lucide-react';

interface PinConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  message: string;
}

export function PinConfirmModal({ onConfirm, onCancel, message }: PinConfirmModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (!pin) {
      setError('Required');
      return;
    }
    const { configStore, keysStore } = await import('@/lib/db');
    const { derivePINHash } = await import('@/lib/crypto');

    // Try CRC PIN (PBKDF2)
    const storedHash = await configStore.getItem<string>('altesa_crc_pin_hash');
    const storedSalt = await configStore.getItem<string>('altesa_crc_pin_salt');
    if (storedHash && storedSalt) {
      const inputHash = await derivePINHash(pin, storedSalt);
      if (inputHash === storedHash) {
        onConfirm();
        return;
      }
    }

    // Try Manager passphrase (PBKDF2)
    if (pin.length >= 12) {
      const managerStored = await keysStore.getItem<{ hash: string; salt: string } | null>('altesa_manager_pass_hash');
      if (managerStored) {
        const managerHash = await derivePINHash(pin, managerStored.salt);
        if (managerHash === managerStored.hash) {
          onConfirm();
          return;
        }
      }
    }

    setError('Invalid PIN or Passphrase');
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '32px 24px',
          width: '360px',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div style={{ background: '#FEE2E2', width: '48px', height: '48px', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#DC2626' }}>
          <Lock size={24} />
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--t1)' }}>Security Confirmation</h3>
        <p style={{ fontSize: '14px', color: 'var(--t3)', marginBottom: '24px', lineHeight: 1.5 }}>{message}</p>
        <input
          type="password"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
          }}
          placeholder="Enter PIN or Master Passphrase"
          style={{
            width: '100%',
            padding: '12px',
            border: error ? '1px solid #EF4444' : '1px solid var(--border)',
            borderRadius: '8px',
            marginBottom: '8px',
            fontSize: '14px',
            textAlign: 'center',
            letterSpacing: pin.length > 0 ? '4px' : 'normal',
          }}
          autoFocus
        />
        {error && <div style={{ color: '#EF4444', fontSize: '13px', marginBottom: '16px', fontWeight: 500 }}>{error}</div>}
        <div style={{ display: 'flex', gap: '12px', marginTop: error ? '0' : '24px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px',
              background: '#F1F5F9',
              color: '#475569',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'var(--border)'}
            onMouseOut={(e) => e.currentTarget.style.background = '#F1F5F9'}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex: 1,
              padding: '12px',
              background: '#DC2626',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#B91C1C'}
            onMouseOut={(e) => e.currentTarget.style.background = '#DC2626'}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
