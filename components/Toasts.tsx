'use client';

import React from 'react';

export function Toasts({ toasts }: { toasts: any[] }) {
  return (
    <div id="toasts">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}
