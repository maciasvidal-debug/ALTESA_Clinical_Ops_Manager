'use client';

import { X, Bell, Mail, AlertTriangle, Clock } from 'lucide-react';
import { fmtHuman } from '@/lib/data';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'critical' | 'overdue' | 'info';
  timestamp: Date;
  read: boolean;
  patientId?: string;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkAllRead: () => void;
  onRead: (id: string) => void;
  emailEnabled: boolean;
  onToggleEmail: (enabled: boolean) => void;
}

export const NotificationCenter = ({ 
  isOpen, 
  onClose, 
  notifications, 
  onMarkAllRead, 
  onRead, 
  emailEnabled, 
  onToggleEmail 
}: NotificationCenterProps) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 800 }} onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-title">Notification Centre</div>
          <button className="ibtn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ padding: '0' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)' }}>
              {notifications.length} Notifications
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                className="ibtn" 
                style={{ fontSize: '11px', padding: '4px 8px' }}
                onClick={onMarkAllRead}
              >
                Mark all read
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                <input type="checkbox" checked={emailEnabled} onChange={e => onToggleEmail(e.target.checked)} />
                <Mail size={12} /> Email Alerts
              </label>
            </div>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t3)' }}>
                <Bell size={32} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
                <p>No active notifications</p>
              </div>
            ) : (
              notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).map(n => (
                <div 
                  key={n.id} 
                  className={`notif-item ${n.read ? 'read' : 'unread'}`}
                  style={{ 
                    padding: '16px 20px', 
                    borderBottom: '1px solid var(--border)', 
                    cursor: 'pointer',
                    background: n.read ? 'transparent' : 'var(--blue-bg)',
                    position: 'relative'
                  }}
                  onClick={() => onRead(n.id)}
                >
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ marginTop: '2px' }}>
                      {n.type === 'critical' ? <AlertTriangle size={16} color="var(--red)" /> :
                       n.type === 'overdue' ? <Clock size={16} color="var(--amber)" /> :
                       <Bell size={16} color="var(--blue)" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', marginBottom: '2px' }}>{n.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: '1.5' }}>{n.message}</div>
                      <div style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '6px' }}>{fmtHuman(n.timestamp)}</div>
                    </div>
                    {!n.read && (
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--blue)', position: 'absolute', right: '20px', top: '20px' }}></div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
