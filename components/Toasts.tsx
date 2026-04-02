'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, ShieldAlert, Info } from 'lucide-react';

export function Toasts({ toasts }: { toasts: any[] }) {
  return (
    <div id="toasts">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.type === 'ok' ? <CheckCircle2 size={14} color="var(--green)" /> :
           t.type === 'err' ? <AlertTriangle size={14} color="var(--red)" /> :
           t.type === 'dlp-alert' ? <ShieldAlert size={14} color="var(--blue)" /> :
           <Info size={14} color="var(--blue)" />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}
