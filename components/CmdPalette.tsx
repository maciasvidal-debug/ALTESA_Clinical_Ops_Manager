'use client';

import React from 'react';
import { Search, ClipboardList, BarChart2, Pill, Activity, User, AlertTriangle, Clock, ArrowUpDown } from 'lucide-react';
import { Patient } from '@/lib/data';

export function CmdPalette({ q, setQ, onClose, onSelect, patients, recentIds = [] }: any) {
  const fuzzyMatch = (str: string, query: string) => {
    if (!query) return true;
    const s = str.toLowerCase();
    const qry = query.toLowerCase();
    let i = 0, j = 0;
    while (i < s.length && j < qry.length) {
      if (s[i] === qry[j]) j++;
      i++;
    }
    return j === qry.length;
  };

  const all = patients.filter((p: Patient) => 
    !q || 
    fuzzyMatch(p.id, q) || 
    fuzzyMatch(p.name, q) || 
    fuzzyMatch(p.phaseLabel, q) || 
    fuzzyMatch(p.loc, q)
  );

  const recents = patients.filter((p: Patient) => recentIds.includes(p.id))
    .sort((a: Patient, b: Patient) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));

  const crits = all.filter((p: Patient) => p.alert === 'DTQ_POSITIVE');
  const warns = all.filter((p: Patient) => p.alert && p.alert !== 'DTQ_POSITIVE');
  const routine = all.filter((p: Patient) => !p.alert);
  const icons: any = { SCREENING: <ClipboardList size={14} />, PSB: <BarChart2 size={14} />, TREATMENT: <Pill size={14} />, FOLLOWUP: <Activity size={14} /> };

  const renderSection = (title: string, pts: any[], icon?: any) => {
    if (!pts.length) return null;
    return (
      <React.Fragment key={title}>
        <div className="cmd-section-hdr">{icon && <span style={{marginRight:'6px'}}>{icon}</span>}{title}</div>
        {pts.slice(0, 5).map(p => (
          <div key={p.id} className="cmd-item" onClick={() => onSelect(p.id)}>
            <div className="cmd-item-icon">{icons[p.phase] || <User size={14} />}{p.alert === 'DTQ_POSITIVE' ? <AlertTriangle size={14} style={{display:'inline', verticalAlign:'text-bottom', color:'var(--red)'}}/> : ''}</div>
            <div>
              <div className="cmd-item-main">{p.id} <span style={{color:'var(--t3)', fontWeight:400, fontSize:'11px', marginLeft:'4px'}}>{p.name}</span></div>
              <div className="cmd-item-sub">{p.phaseLabel} · {p.loc}</div>
            </div>
          </div>
        ))}
      </React.Fragment>
    );
  };

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-box" onClick={e => e.stopPropagation()}>
        <div className="cmd-input-row">
          <span className="cmd-icon"><Search size={16} /></span>
          <input autoFocus className="cmd-input" placeholder="Search patient ID, name, phase…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onClose(); }} />
        </div>
        <div className="cmd-results">
          {!q && renderSection('Recently Accessed', recents, <Clock size={10} />)}
          {renderSection('Critical', crits)}
          {renderSection('Action Needed', warns)}
          {renderSection('Routine', routine)}
          <div className="cmd-section-hdr">Navigation</div>
          <div className="cmd-item" onClick={() => onSelect('dashboard')}>
            <div className="cmd-item-icon">🏠</div>
            <div><div className="cmd-item-main">Dashboard</div><div className="cmd-item-sub">All patients — sorted by urgency</div></div>
          </div>
        </div>
        <div className="cmd-footer"><ArrowUpDown size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> navigate · Enter to select · Esc to close</div>
      </div>
    </div>
  );
}
