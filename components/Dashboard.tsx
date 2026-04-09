'use client';

import React, { useState } from 'react';
import { 
  Search, Bell, HelpCircle, UserPlus, Lock, 
  AlertTriangle, Check, Phone, Activity, 
  ChevronRight, ClipboardList, User, Settings as SettingsIcon,
  LayoutGrid, List, Calendar as CalendarIcon
} from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { 
  type Patient, type Notification, 
  fmtHuman, fmtISO, getTodayPct, countTasks, TODAY 
} from '@/lib/data';
import { DLPWrapper } from '@/components/DLPWrapper';

interface DashboardProps {
  patients: Patient[];
  notifications: Notification[];
  dashFilter: 'all' | 'crit' | 'warn' | 'routine';
  setDashFilter: (f: 'all' | 'crit' | 'warn' | 'routine') => void;
  onOpenSearch: () => void;
  onOpenBriefing: () => void;
  onOpenNotif: () => void;
  onOpenHelp: () => void;
  onOpenAddPatient: () => void;
  onOpenSettings: () => void;
  onLock: () => void;
  onOpenPatient: (id: string) => void;
  onDLPViolation: (action: string) => void;
}

export const Dashboard = ({ 
  patients, notifications, dashFilter, setDashFilter, 
  onOpenSearch, onOpenBriefing, onOpenNotif, onOpenHelp, 
  onOpenAddPatient, onOpenSettings, onLock, onOpenPatient, onDLPViolation 
}: DashboardProps) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'calendar'>('grid');

  const crits = patients.filter(p => p.alert === 'DTQ_POSITIVE');
  const warns = patients.filter(p => p.alert && p.alert !== 'DTQ_POSITIVE');
  const clinicToday = patients.filter(p => p.loc.includes('CLINIC'));

  const filterMap: Record<string, (p: Patient) => boolean> = {
    all: () => true,
    crit: p => p.alert === 'DTQ_POSITIVE',
    warn: p => p.alert !== null && p.alert !== 'DTQ_POSITIVE',
    routine: p => !p.alert,
  };

  const visible = patients.filter(filterMap[dashFilter] || filterMap.all)
    .sort((a, b) => {
      const r = (p: Patient) => p.alert === 'DTQ_POSITIVE' ? 0 : p.alert ? 1 : 2;
      return r(a) - r(b) || a.id.localeCompare(b.id);
    });

  return (
    <div className="screen">
      {crits.length > 0 && (
        <div className="crit-banner">
          <div className="crit-pulse"></div>
          <div className="crit-text"><strong>RV Protocol Active:</strong> {crits.map(p => <DLPWrapper key={p.id} onViolation={onDLPViolation}>{p.id}</DLPWrapper>).reduce((prev, curr) => [prev, ', ', curr] as any)} — DTQ Positive · 48 h + 6 h window running</div>
          <button className="crit-action" onClick={() => onOpenPatient(crits[0].id)}>Open Patient <ChevronRight size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/></button>
        </div>
      )}
      {warns.filter(p => p.alert === 'MONTHLY_CALL').length > 0 && (
        <div className="warn-banner">
          <strong>Monthly call due:</strong> {warns.filter(p => p.alert === 'MONTHLY_CALL').map(p => <span key={p.id}><DLPWrapper onViolation={onDLPViolation}>{p.id}</DLPWrapper> (±5 days)</span>).reduce((prev, curr) => [prev, ', ', curr] as any)}
        </div>
      )}
      <div className="hdr">
        <div className="hdr-left">
          <div className="wordmark">ALTE<em>SA</em></div>
          <span className="hdr-context">Coordinator Dashboard</span>
        </div>
        <div className="hdr-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="nav-group" style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="ibtn" onClick={onOpenBriefing} title="Daily Briefing"><ClipboardList size={16} style={{marginRight: '6px'}} /> Briefing</button>
            <button type="button" className="ibtn relative" onClick={onOpenNotif} title="Notifications">
              <Bell size={16} />
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
              )}
            </button>
          </div>
          <div style={{ width: '1px', height: '24px', background: '#E2E8F0' }}></div>
          <div className="nav-group" style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="ibtn" onClick={onOpenHelp} title="Help & Glossary"><HelpCircle size={16} /></button>
            <button type="button" className="ibtn" onClick={onOpenSettings} title="Settings & Security"><SettingsIcon size={16} /></button>
            <button type="button" className="ibtn" onClick={onLock} title="Lock Session"><Lock size={16} /></button>
          </div>
        </div>
      </div>
      <div className="dash">
        <div className="summary">
          <div className="sum-cell"><div className="sum-v">{patients.length}</div><div className="sum-l">Active Patients</div></div>
          <div className="sum-cell alert"><div className="sum-v">{crits.length}</div><div className="sum-l"><abbr title="Daily Trigger Questionnaire (Positive)" className="help-term">DTQ+</abbr> Alerts</div></div>
          <div className="sum-cell warn"><div className="sum-v">{warns.length}</div><div className="sum-l">Pending Actions</div></div>
          <div className="sum-cell"><div className="sum-v">{clinicToday.length}</div><div className="sum-l">Clinic Visits Today</div></div>
        </div>

        {/* Toolbar: Filters, Search, View Toggle, Add Patient */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', background: '#fff', padding: '12px 16px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div className="filter-tabs" style={{ margin: 0, padding: 0, border: 'none', background: 'transparent' }}>
            <button className={`ftab ${dashFilter === 'all' ? 'active' : ''}`} onClick={() => setDashFilter('all')}>All ({patients.length})</button>
            <button className={`ftab tab-crit ${dashFilter === 'crit' ? 'active' : ''}`} onClick={() => setDashFilter('crit')}><AlertTriangle size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Critical ({crits.length})</button>
            <button className={`ftab tab-warn ${dashFilter === 'warn' ? 'active' : ''}`} onClick={() => setDashFilter('warn')}><AlertTriangle size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Action needed ({warns.length})</button>
            <button className={`ftab tab-ok ${dashFilter === 'routine' ? 'active' : ''}`} onClick={() => setDashFilter('routine')}><Check size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Routine ({patients.length - crits.length - warns.length})</button>
          </div>
          
          <div style={{ flex: 1, maxWidth: '400px', margin: '0 24px' }}>
            <button className="search-trigger" onClick={onOpenSearch} style={{ width: '100%', margin: 0 }}>
              <Search size={14} />
              <span>Search patients, tasks...</span>
              <span className="search-shortcut">⌘K</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', background: '#F1F5F9', padding: '4px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <button onClick={() => setViewMode('grid')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: viewMode === 'grid' ? '#fff' : 'transparent', color: viewMode === 'grid' ? '#0F172A' : '#64748B', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500 }}><LayoutGrid size={14} /> Grid</button>
              <button onClick={() => setViewMode('list')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: viewMode === 'list' ? '#fff' : 'transparent', color: viewMode === 'list' ? '#0F172A' : '#64748B', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500 }}><List size={14} /> List</button>
              <button onClick={() => setViewMode('calendar')} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: viewMode === 'calendar' ? '#fff' : 'transparent', color: viewMode === 'calendar' ? '#0F172A' : '#64748B', boxShadow: viewMode === 'calendar' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500 }}><CalendarIcon size={14} /> Calendar</button>
            </div>
            <button type="button" className="btn btn-primary" style={{ minHeight: '36px', padding: '8px 16px' }} onClick={onOpenAddPatient} title="Add Patient"><UserPlus size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight: '6px'}}/> Add Patient</button>
          </div>
        </div>
        <div className="sec-hdr">
          <div className="sec-title">{visible.length} patient{visible.length !== 1 ? 's' : ''} — sorted by urgency</div>
          <div className="sec-date">{fmtHuman(TODAY)}, {fmtISO(TODAY)}</div>
        </div>
        {viewMode === 'grid' && (
          <div className="pt-list">
            {visible.length > 0 ? visible.map(p => {
              const { done, total } = countTasks(p);
              const isCrit = p.alert === 'DTQ_POSITIVE';
              const isWarn = p.alert && !isCrit;
              const urgClass = isCrit ? 'crit' : isWarn ? 'warn' : done === total && total > 0 ? 'ok' : 'info';
              const urgText = isCrit ? <><AlertTriangle size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> DTQ+ — Act now</> : isWarn ? p.alert === 'MONTHLY_CALL' ? <><Phone size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Call due</> : <><Activity size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Rescreening</> : done === total && total > 0 ? <><Check size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> All done</> : 'In progress';
              const phBadge = { scr: 'pb-scr', psb: 'pb-psb', tx: 'pb-tx', fu: 'pb-fu' }[p.phaseCode] || 'pb-psb';
              return (
                <div key={p.id} className={`pt-row ${isCrit ? 'is-crit' : isWarn ? 'is-warn' : ''}`}
                  tabIndex={0} role="button" aria-label={`Open ${p.id} — ${p.phaseLabel}`}
                  onClick={() => onOpenPatient(p.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPatient(p.id); } }}>
                  <div className="pt-meta">
                    <div className="pt-id">
                      <DLPWrapper onViolation={onDLPViolation}>{p.id}</DLPWrapper>
                    </div>
                    <div className="pt-name" style={{fontSize:'11px', color:'var(--t3)', marginTop:'2px'}}>
                      <DLPWrapper onViolation={onDLPViolation}>{p.name}</DLPWrapper>
                    </div>
                    <div className="pt-phase-lbl">
                      <span className={`phase-badge ${phBadge}`} style={{ padding: '1px 7px', fontSize: '10px' }}>{p.phaseLabel.split('·')[0].trim()}</span>
                    </div>
                    <div className="pt-progress-container" title={`${done}/${total} tasks completed`}>
                      <div className={`pt-progress-fill ${done === total && total > 0 ? 'done' : ''}`} style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}></div>
                    </div>
                    <div className="pt-loc">{p.loc.includes('CLINIC') ? '🏥' : '🏠'} {p.loc}</div>
                  </div>
                  <div className="pt-tl-cell">
                    <div className="mini-tl">
                      <div className="mini-tl-bar">
                        <div className="tl-seg s-scr" title="Screening / Rescreening"><span>SCR</span></div>
                        <div className="tl-seg s-psb" title="Pre-Symptomatic Baseline (Asymptomatic Phase)"><span className="help-term">{p.phaseCode === 'psb' ? 'PSB W' + Math.floor((p.studyDay || 0) / 7) : 'PSB'}</span></div>
                        <div className="tl-seg s-rv" title="RV Infection — Randomisation window"></div>
                        <div className="tl-seg s-tx" title="Treatment Period D1–D14"><span>{p.phaseCode === 'tx' ? 'Tx D' + (p.studyDay || 0) : 'TX'}</span></div>
                        <div className="tl-seg s-fu" title="Follow-up Period D14–D42"><span>FUP</span></div>
                        <div className="tl-now-label" style={{ left: `${getTodayPct(p).toFixed(1)}%` }}>Today</div>
                        <div className="tl-now-marker" style={{ left: `${getTodayPct(p).toFixed(1)}%` }}></div>
                      </div>
                      <div className="tl-label-row">
                        <div className="tl-lbl" style={{ flex: '0 0 10%' }}>Scr</div>
                        <div className="tl-lbl" style={{ flex: '0 0 60%', color: 'var(--blue)' }}>Asymptomatic Phase (up to 68 weeks)</div>
                        <div className="tl-lbl" style={{ flex: '0 0 2%' }}></div>
                        <div className="tl-lbl" style={{ flex: '0 0 12%' }}>Treatment</div>
                        <div className="tl-lbl" style={{ flex: '0 0 16%' }}>FUP</div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-action">
                    <div className={`pt-urgency ${urgClass}`}>{urgText}</div>
                    <div className="pt-tasks-count"><strong>{done}</strong>/{total} tasks</div>
                    <div className="pt-next" title={fmtISO(p.nextVisit)}>{fmtHuman(p.nextVisit)}</div>
                    <div className="pt-chevron"><ChevronRight size={16} /></div>
                  </div>
                </div>
              );
            }) : (
              <div className="empty-state-card">
                <div className="empty-icon"><UserPlus size={32} /></div>
                <h3>Welcome to ALTESA Study Tracker</h3>
                <p>Your dashboard is currently empty. Get started by adding your first patient or reviewing the study quick guide.</p>
                <div className="empty-actions">
                  <button className="btn btn-primary" onClick={onOpenAddPatient}><UserPlus size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Add First Patient</button>
                  <button className="btn btn-ghost" onClick={onOpenHelp}><HelpCircle size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Read Quick Guide</button>
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'list' && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{ display: 'flex', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '13px' }}>
              <div style={{ padding: '12px 16px', fontWeight: 600, flex: 2 }}>Patient ID</div>
              <div style={{ padding: '12px 16px', fontWeight: 600, flex: 3 }}>Name</div>
              <div style={{ padding: '12px 16px', fontWeight: 600, flex: 2 }}>Phase</div>
              <div style={{ padding: '12px 16px', fontWeight: 600, flex: 2 }}>Location</div>
              <div style={{ padding: '12px 16px', fontWeight: 600, flex: 2 }}>Tasks</div>
              <div style={{ padding: '12px 16px', fontWeight: 600, flex: 2 }}>Status</div>
            </div>
            {visible.length > 0 ? (
              <Virtuoso
                style={{ height: Math.min(visible.length * 53, 500), width: '100%' }}
                totalCount={visible.length}
                itemContent={(index) => {
                  const p = visible[index];
                  const { done, total } = countTasks(p);
                  const isCrit = p.alert === 'DTQ_POSITIVE';
                  const isWarn = p.alert && !isCrit;
                  const urgClass = isCrit ? 'crit' : isWarn ? 'warn' : done === total && total > 0 ? 'ok' : 'info';
                  const urgText = isCrit ? <><AlertTriangle size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> DTQ+</> : isWarn ? p.alert === 'MONTHLY_CALL' ? <><Phone size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Call due</> : <><Activity size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Rescreening</> : done === total && total > 0 ? <><Check size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Done</> : 'In progress';
                  const phBadge = { scr: 'pb-scr', psb: 'pb-psb', tx: 'pb-tx', fu: 'pb-fu' }[p.phaseCode] || 'pb-psb';
                  
                  return (
                    <div
                      key={p.id}
                      style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #E2E8F0', cursor: 'pointer', background: isCrit ? '#FEF2F2' : isWarn ? '#FFFBEB' : '#fff', minHeight: '53px' }}
                      onClick={() => onOpenPatient(p.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPatient(p.id); } }}
                      tabIndex={0}
                      role="row"
                    >
                      <div style={{ padding: '12px 16px', fontWeight: 600, color: '#0F172A', flex: 2 }}><DLPWrapper onViolation={onDLPViolation}>{p.id}</DLPWrapper></div>
                      <div style={{ padding: '12px 16px', color: '#475569', flex: 3 }}><DLPWrapper onViolation={onDLPViolation}>{p.name}</DLPWrapper></div>
                      <div style={{ padding: '12px 16px', flex: 2 }}><span className={`phase-badge ${phBadge}`} style={{ padding: '2px 8px', fontSize: '11px' }}>{p.phaseLabel.split('·')[0].trim()}</span></div>
                      <div style={{ padding: '12px 16px', color: '#475569', flex: 2 }}>{p.loc.includes('CLINIC') ? '🏥' : '🏠'} {p.loc}</div>
                      <div style={{ padding: '12px 16px', flex: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '60px', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: done === total && total > 0 ? '#10B981' : '#3B82F6', width: `${total > 0 ? (done / total) * 100 : 0}%` }}></div>
                          </div>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>{done}/{total}</span>
                        </div>
                      </div>
                      <div style={{ padding: '12px 16px', flex: 2 }}>
                        <div className={`urg-badge ${urgClass}`} style={{ display: 'inline-flex', padding: '4px 8px' }}>{urgText}</div>
                      </div>
                    </div>
                  );
                }}
              />
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>No patients found.</div>
            )}
          </div>
        )}

        {viewMode === 'calendar' && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', margin: 0 }}>Upcoming Schedule</h3>
              <div style={{ fontSize: '14px', color: '#64748B' }}>{fmtHuman(TODAY)}</div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px' }}>
              {[0, 1, 2, 3, 4, 5, 6].map(offset => {
                const date = new Date(TODAY);
                date.setDate(date.getDate() + offset);
                const isToday = offset === 0;
                
                // Mock logic to distribute patients across days for the calendar view
                const dayPatients = visible.filter((p, i) => (i % 7) === offset);
                
                return (
                  <div key={offset} style={{ border: `1px solid ${isToday ? '#3B82F6' : '#E2E8F0'}`, borderRadius: '8px', padding: '12px', background: isToday ? '#EFF6FF' : '#fff', minHeight: '150px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: isToday ? '#1E3A8A' : '#64748B', marginBottom: '4px', textTransform: 'uppercase' }}>
                      {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: isToday ? '#1E3A8A' : '#0F172A', marginBottom: '12px' }}>
                      {date.getDate()}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {dayPatients.slice(0, 3).map(p => {
                        const isCrit = p.alert === 'DTQ_POSITIVE';
                        return (
                          <div 
                            key={p.id} 
                            onClick={() => onOpenPatient(p.id)}
                            style={{ padding: '6px 8px', background: isCrit ? '#FEF2F2' : '#F1F5F9', borderLeft: `3px solid ${isCrit ? '#EF4444' : '#3B82F6'}`, borderRadius: '4px', fontSize: '11px', cursor: 'pointer', color: isCrit ? '#991B1B' : '#334155', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            title={p.name}
                          >
                            {p.id} {isCrit && '⚠️'}
                          </div>
                        );
                      })}
                      {dayPatients.length > 3 && (
                        <div style={{ fontSize: '11px', color: '#64748B', textAlign: 'center', marginTop: '4px' }}>+{dayPatients.length - 3} more</div>
                      )}
                      {dayPatients.length === 0 && (
                        <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>No tasks</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
