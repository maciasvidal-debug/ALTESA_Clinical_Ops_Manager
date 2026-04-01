'use client';

import { 
  Search, Bell, HelpCircle, UserPlus, Lock, 
  AlertTriangle, Check, Phone, Activity, 
  ChevronRight, ClipboardList, User
} from 'lucide-react';
import { 
  type Patient, type Notification, 
  fmtHuman, fmtISO, getTodayPct, countTasks, TODAY 
} from '@/lib/data';

interface DashboardProps {
  patients: Patient[];
  notifications: Notification[];
  dashFilter: string;
  setDashFilter: (f: string) => void;
  onOpenSearch: () => void;
  onOpenBriefing: () => void;
  onOpenNotif: () => void;
  onOpenHelp: () => void;
  onOpenAddPatient: () => void;
  onLock: () => void;
  onOpenPatient: (id: string) => void;
}

export const Dashboard = ({ 
  patients, notifications, dashFilter, setDashFilter, 
  onOpenSearch, onOpenBriefing, onOpenNotif, onOpenHelp, 
  onOpenAddPatient, onLock, onOpenPatient 
}: DashboardProps) => {
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
          <div className="crit-text"><strong>RV Protocol Active:</strong> {crits.map(p => p.id).join(', ')} — DTQ Positive · 48 h + 6 h window running</div>
          <button className="crit-action" onClick={() => onOpenPatient(crits[0].id)}>Open Patient <ChevronRight size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/></button>
        </div>
      )}
      {warns.filter(p => p.alert === 'MONTHLY_CALL').length > 0 && (
        <div className="warn-banner">
          <strong>Monthly call due:</strong> {warns.filter(p => p.alert === 'MONTHLY_CALL').map(p => `${p.id} (±5 days)`).join(', ')}
        </div>
      )}
      <div className="hdr">
        <div className="hdr-left">
          <div className="wordmark">ALTE<em>SA</em></div>
          <span className="hdr-context">VPV Study</span>
        </div>
        <div className="hdr-center">
          <button className="search-trigger" onClick={onOpenSearch}>
            <Search size={14} />
            <span>Search patients, tasks, or glossary...</span>
            <span className="search-shortcut">⌘K</span>
          </button>
        </div>
        <div className="hdr-right">
          <div className="nav-group">
            <button type="button" className="ibtn" onClick={onOpenBriefing} title="Daily Briefing"><ClipboardList size={14} /> Briefing</button>
            <button type="button" className="ibtn relative" onClick={onOpenNotif} title="Notifications">
              <Bell size={14} />
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
              )}
            </button>
            <button type="button" className="ibtn" onClick={onOpenHelp} title="Help & Glossary"><HelpCircle size={14} /> Help</button>
          </div>
          <button type="button" className="btn btn-primary" style={{ minHeight: '36px', padding: '8px 16px' }} onClick={onOpenAddPatient} title="Add Patient"><UserPlus size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Add Patient</button>
          <button type="button" className="ibtn" style={{ border: 'none', background: 'transparent' }} onClick={onLock} title="Lock Session"><Lock size={14} /></button>
        </div>
      </div>
      <div className="dash">
        <div className="summary">
          <div className="sum-cell"><div className="sum-v">{patients.length}</div><div className="sum-l">Active Patients</div></div>
          <div className="sum-cell alert"><div className="sum-v">{crits.length}</div><div className="sum-l"><abbr title="Daily Trigger Questionnaire (Positive)" className="help-term">DTQ+</abbr> Alerts</div></div>
          <div className="sum-cell warn"><div className="sum-v">{warns.length}</div><div className="sum-l">Pending Actions</div></div>
          <div className="sum-cell"><div className="sum-v">{clinicToday.length}</div><div className="sum-l">Clinic Visits Today</div></div>
        </div>
        <div className="filter-tabs">
          <button className={`ftab ${dashFilter === 'all' ? 'active' : ''}`} onClick={() => setDashFilter('all')}>All ({patients.length})</button>
          <button className={`ftab tab-crit ${dashFilter === 'crit' ? 'active' : ''}`} onClick={() => setDashFilter('crit')}><AlertTriangle size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Critical ({crits.length})</button>
          <button className={`ftab tab-warn ${dashFilter === 'warn' ? 'active' : ''}`} onClick={() => setDashFilter('warn')}><AlertTriangle size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Action needed ({warns.length})</button>
          <button className={`ftab tab-ok ${dashFilter === 'routine' ? 'active' : ''}`} onClick={() => setDashFilter('routine')}><Check size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Routine ({patients.length - crits.length - warns.length})</button>
        </div>
        <div className="sec-hdr">
          <div className="sec-title">{visible.length} patient{visible.length !== 1 ? 's' : ''} — sorted by urgency</div>
          <div className="sec-date">{fmtHuman(TODAY)}, {fmtISO(TODAY)}</div>
        </div>
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
                  <div className="pt-id">{p.id}</div>
                  <div className="pt-name" style={{fontSize:'11px', color:'var(--t3)', marginTop:'2px'}}>{p.name}</div>
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
                      <div className="tl-seg s-tx" title="Treatment Period D1–D42"><span>{p.phaseCode === 'tx' ? 'Tx D' + (p.studyDay || 0) : 'TX'}</span></div>
                      <div className="tl-seg s-fu" title="Follow-up Period"><span>FUP</span></div>
                      <div className="tl-seg s-fut" title="End of Study / future"></div>
                      <div className="tl-now-label" style={{ left: `${getTodayPct(p).toFixed(1)}%` }}>Today</div>
                      <div className="tl-now-marker" style={{ left: `${getTodayPct(p).toFixed(1)}%` }}></div>
                    </div>
                    <div className="tl-label-row">
                      <div className="tl-lbl" style={{ flex: '0 0 4%' }}>Scr</div>
                      <div className="tl-lbl" style={{ flex: '0 0 45%', color: 'var(--blue)' }}>Asymptomatic Phase (up to 68 weeks)</div>
                      <div className="tl-lbl" style={{ flex: '0 0 3%' }}></div>
                      <div className="tl-lbl" style={{ flex: '0 0 12%' }}>Treatment</div>
                      <div className="tl-lbl" style={{ flex: '0 0 8%' }}>FUP</div>
                      <div className="tl-lbl" style={{ flex: 1 }}></div>
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
      </div>
    </div>
  );
};
