'use client';

import React from 'react';

export function Sparkline({ scores, psb, w = 264, h = 72 }: { scores: number[], psb: number | null, w?: number, h?: number }) {
  if (!scores || !scores.length) return <p style={{ textAlign: 'center', color: 'var(--t3)', fontSize: '11px', padding: '16px 0' }}>No E-RS data</p>;
  const n = Math.min(30, scores.length);
  const pts = scores.slice(-n);
  const mx = Math.max(...pts, psb || 0) + 2;
  const mn = Math.max(0, Math.min(...pts, psb || 0) - 2);
  const rng = mx - mn || 1;
  const x = (i: number) => (i / (n - 1)) * w;
  const y = (v: number) => h - ((v - mn) / rng) * h;
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${h} ${line} ${x(n - 1).toFixed(1)},${h}`;
  const py = psb ? y(psb) : null;
  
  return (
    <svg className="ers-svg" viewBox={`0 0 ${w} ${h}`} style={{ height: `${h}px` }}>
      <defs>
        <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--blue)" stopOpacity=".25"/>
          <stop offset="100%" stopColor="var(--blue)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {psb && py !== null && (
        <>
          <line x1="0" y1={py.toFixed(1)} x2={w} y2={py.toFixed(1)} stroke="var(--amber)" strokeWidth="1.5" strokeDasharray="4,3"/>
          <text x={w - 2} y={(py - 4).toFixed(1)} textAnchor="end" fontSize="8" fill="var(--amber)" fontFamily="var(--fm)">PSB {psb}</text>
        </>
      )}
      <polygon points={area} fill="url(#eg)"/>
      <polyline points={line} fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={x(n - 1).toFixed(1)} cy={y(pts[n - 1]).toFixed(1)} r="4" fill="var(--blue)"/>
    </svg>
  );
}
