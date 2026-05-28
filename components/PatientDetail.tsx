'use client';

import { useState, useRef } from 'react';
import {
  ArrowLeft, Edit3, Trash2, CheckCircle2, Circle, Clock,
  AlertTriangle, Info, ChevronRight, FileText, LayoutGrid,
  ListTodo, Calendar, Phone, Activity, Search, Check, Heart, Lock, Unlock,
  Stethoscope, Syringe, Pill, Hospital, Beaker, ClipboardList, GraduationCap,
  Bug, Droplet, User, BadgeCheck, Bell, Wind, CalendarDays
} from 'lucide-react';
import {
  type Patient, type Task, type Document, type LogEntry,
  fmtHuman, fmtISO, countTasks
} from '@/lib/data';
import {
  getTimelineMarkerPct, getProtocolDayLabel, getStudyDay,
} from '@/lib/temporal';
import { DependencyLines } from './DependencyLines';
import { DLPWrapper } from '@/components/DLPWrapper';
import { NavigatorLog } from '@/components/NavigatorLog';
import { TimelineNavigator } from '@/components/TimelineNavigator';
import { WorkloadLogger } from '@/components/WorkloadLogger';

const LungIcon = ({ size = 16, color = "currentColor", strokeWidth = 2, ...props }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2v5" />
    <path d="M12 7c-2.5 0-4.5 2-4.5 4.5v5c0 1.5-1 2.5-2.5 2.5S2 18 2 16.5v-3C2 12 4 10 6.5 10c1.5 0 2.5 1 2.5 2.5v1" />
    <path d="M12 7c2.5 0 4.5 2 4.5 4.5v5c0 1.5 1 2.5 2.5 2.5S22 18 22 16.5v-3c0-2-2-4-4.5-4-1.5 0-2.5 1-2.5 2.5v1" />
  </svg>
);

const getTaskIcon = (t: Task, size = 16, strokeWidth = 2) => {
  switch (t.code) {
    case 'ECG': return <Heart size={size} strokeWidth={strokeWidth} />;
    case 'SPI': 
    case 'OSC': return <LungIcon size={size} strokeWidth={strokeWidth} />;
    case 'CSL': 
    case 'PT': return <Beaker size={size} strokeWidth={strokeWidth} />;
    case 'CVC': return <Bug size={size} strokeWidth={strokeWidth} />;
    case 'PK': return <Droplet size={size} strokeWidth={strokeWidth} />;
    case 'PE': 
    case 'VS': return <Stethoscope size={size} strokeWidth={strokeWidth} />;
    case 'CMED': 
    case 'DRUG': return <Pill size={size} strokeWidth={strokeWidth} />;
    case 'PRN': return <Wind size={size} strokeWidth={strokeWidth} />;
    case 'DEMO': return <User size={size} strokeWidth={strokeWidth} />;
    case 'ELG': return <BadgeCheck size={size} strokeWidth={strokeWidth} />;
    case 'TRAIN': return <GraduationCap size={size} strokeWidth={strokeWidth} />;
    case 'HOSP': return <Hospital size={size} strokeWidth={strokeWidth} />;
    case 'DTQ': return <Bell size={size} strokeWidth={strokeWidth} />;
    case 'MC': return <Phone size={size} strokeWidth={strokeWidth} />;
    case 'ERS': 
    case 'WURSS': 
    case 'SGRQ': 
    case 'CAT': return <ClipboardList size={size} strokeWidth={strokeWidth} />;
    case 'MSH': 
    case 'COPH': 
    case 'IC': return <FileText size={size} strokeWidth={strokeWidth} />;
    default: 
      // If none match, use the string they had before, or fallback Activity
      return <Activity size={size} strokeWidth={strokeWidth} />;
  }
};

interface PatientDetailProps {
  patient: Patient;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleTask: (code: string) => void;
  onUpdateDocs: (docs: Document[]) => void;
  onOpenWizard: () => void;
  onOpenScreeningOutcome: () => void;
  isChecked: (code: string) => boolean;
  onDLPViolation: (action: string) => void;
  onNewReminder: (entry: LogEntry) => void;
}

export const PatientDetail = ({ 
  patient, onBack, onEdit, onDelete, onToggleTask, 
  onUpdateDocs, onOpenWizard, onOpenScreeningOutcome, isChecked, onDLPViolation,
  onNewReminder,
}: PatientDetailProps) => {
  const [activeTrace, setActiveTrace] = useState<string | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [workloadLogOpen, setWorkloadLogOpen] = useState(false);
  const taskListRef = useRef<HTMLDivElement>(null);

  const [overrideModalCode, setOverrideModalCode] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overriddenTasks, setOverriddenTasks] = useState<Record<string, {reason: string, date: string, by: string}>>({});

  const { done, total } = countTasks(patient);
  
  const displayPhaseCode = patient.dtqPos && !patient.randomizationDate ? 'rv' : patient.phaseCode;
  const displayPhaseLabel = patient.dtqPos && !patient.randomizationDate ? 'RV Protocol Active' : patient.phaseLabel;
  const phBadge = { scr: 'pb-scr', psb: 'pb-psb', rv: 'pb-rv', tx: 'pb-tx', fu: 'pb-fu' }[displayPhaseCode] || 'pb-psb';

  const handleOverrideSubmit = () => {
    if (!overrideModalCode || !overrideReason.trim()) return;
    setOverriddenTasks(prev => ({
      ...prev,
      [overrideModalCode]: {
        reason: overrideReason,
        date: new Date().toLocaleDateString(),
        by: 'Current User'
      }
    }));
    setOverrideModalCode(null);
    setOverrideReason("");
  };

  const renderTask = (t: Task) => {
    const isOverridden = !!overriddenTasks[t.code];
    const checked = isChecked(t.code) || isOverridden;
    const unmetDeps = t.dependsOn?.filter(code => !isChecked(code) && !overriddenTasks[code]) || [];
    const locked = unmetDeps.length > 0 && !isOverridden;
    const isCrit = t.code === 'RV_ONSET';
    const blockedTitle = locked ? `Blocked by: ${unmetDeps.join(', ')}. Click to override.` : undefined;

    const handleToggle = () => {
      if (!checked && locked) {
        setOverrideModalCode(t.code);
      } else if (isOverridden) {
        const next = { ...overriddenTasks };
        delete next[t.code];
        setOverriddenTasks(next);
      } else {
        onToggleTask(t.code);
      }
    };

    return (
      <div 
        key={t.code} 
        data-code={t.code}
        className={`task-card ${checked ? 'checked' : ''} ${locked ? 'locked' : ''} ${isCrit ? 'crit' : ''} ${activeTrace === t.code ? 'tracing' : ''}`}
        onClick={handleToggle}
        onMouseEnter={() => setActiveTrace(t.code)}
        onMouseLeave={() => setActiveTrace(null)}
        style={{ cursor: 'pointer' }}
        title={blockedTitle}
      >
        <div className="task-check">
          {checked ? <CheckCircle2 size={18} color="var(--blue)" /> : locked ? <Lock size={18} color="var(--t3)" /> : <Circle size={18} color="var(--t3)" />}
        </div>
        <div className="task-body">
          <div className="task-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '15px', display: 'flex', alignItems: 'center', color: 'var(--t2)' }}>
              {getTaskIcon(t, 16, 2.5)}
            </span>
            {t.label}
            {isCrit && <span className="task-crit-badge">CRITICAL</span>}
          </div>
          <div className="task-sub"><DLPWrapper onViolation={onDLPViolation}>{t.note}</DLPWrapper></div>
          {checked && (t.attested || t.dataValue || isOverridden) && (
            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--green)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {t.attested && <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={12} /> Attested</div>}
              {t.dataValue && <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> {t.requiresData?.label}: {t.dataValue}</div>}
              {isOverridden && (
                <div style={{ color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Unlock size={12} color="var(--amber)" /> Overridden: {overriddenTasks[t.code]?.reason}
                </div>
              )}
            </div>
          )}
          {t.dependsOn && (
            <div className="task-deps">
              <span style={{ opacity: 0.6 }}>Requires:</span> {t.dependsOn.join(', ')}
            </div>
          )}
        </div>
        {locked && <div className="task-lock-icon" title={blockedTitle}><Lock size={12} /></div>}
      </div>
    );
  };

  return (
    <div className="screen">
      <div className="hdr">
        <div className="hdr-left">
          <button className="ibtn" onClick={onBack} title="Back to Dashboard"><ArrowLeft size={18} /></button>
          <div className="hdr-sep"></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className="pt-id-lg">
                <DLPWrapper onViolation={onDLPViolation}>{patient.id}</DLPWrapper>
              </h1>
              {patient.siteId && (
                <span style={{ fontSize: '11px', fontWeight: 700, background: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.05em', border: '1px solid #BAE6FD' }}>
                  {patient.siteId}
                </span>
              )}
              <span className={`phase-badge ${phBadge}`}>{displayPhaseLabel}</span>
              <div className={`progress-pill ${done === total && total > 0 ? 'done' : ''}`} style={{ marginLeft: '8px' }}>
                {done}/{total} Tasks ({total > 0 ? Math.round((done / total) * 100) : 0}%)
              </div>
            </div>
            <div className="pt-name-lg">
              <DLPWrapper onViolation={onDLPViolation}>{patient.name}</DLPWrapper> · {patient.lang}
            </div>
          </div>
        </div>
        <div className="hdr-right">
          <button
            className="ibtn"
            onClick={() => setTimelineOpen(true)}
            title="Open Protocol Timeline Navigator"
            style={{ color: 'var(--blue)' }}
          >
            <CalendarDays size={14} /> Timeline
          </button>
          <button
            className="ibtn"
            onClick={() => setWorkloadLogOpen(true)}
            title="Log off-platform time"
          >
            <Clock size={14} /> Log Time
          </button>
          <button className="ibtn" onClick={onEdit} title="Edit Patient"><Edit3 size={14} /> Edit</button>
          <button className="ibtn" onClick={onDelete} title="Delete Patient" style={{ color: 'var(--red)' }}><Trash2 size={14} /> Delete</button>
        </div>
      </div>

      <div className="pt-detail-grid">
        <div className="pt-main">
          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-hdr">
              <div className="card-title">Study Timeline</div>
              <div className="card-sub">Current progress through the ALTESA protocol</div>
            </div>
            <div className="tl-wrap">
              <div className="tl-main">
                <div className="tl-bar">
                  <div className="tl-seg s-scr" style={{ flex: '0 0 10%' }}><span>SCR</span></div>
                  <div className="tl-seg s-psb" style={{ flex: '0 0 60%' }}><span>ASYMPTOMATIC PHASE (PSB)</span></div>
                  <div className="tl-seg s-rv" style={{ flex: '0 0 2%' }}></div>
                  <div className="tl-seg s-tx" style={{ flex: '0 0 4.6%' }}><span>TREATMENT</span></div>
                  <div className="tl-seg s-fu" style={{ flex: '0 0 23.4%' }}><span>FOLLOW-UP</span></div>
                  <div className="tl-now-marker" style={{ left: `${getTimelineMarkerPct(patient).toFixed(1)}%` }}></div>
                  <div className="tl-now-label" style={{ left: `${getTimelineMarkerPct(patient).toFixed(1)}%` }}>Today ({getProtocolDayLabel(patient)})</div>
                </div>
                <div className="tl-labels">
                  <div style={{ flex: '0 0 10%' }}>Screening</div>
                  <div style={{ flex: '0 0 60%' }}>Weeks 1–68</div>
                  <div style={{ flex: '0 0 2%' }}>RV</div>
                  <div style={{ flex: '0 0 4.6%' }}>Day 1–7</div>
                  <div style={{ flex: '0 0 23.4%' }}>Day 8–42 (EOS)</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ position: 'relative' }}>
            <div className="card-hdr">
              <div>
                <div className="card-title">Protocol Checklist</div>
                <div className="card-sub">Required assessments for the current study phase</div>
              </div>
              <div className="pt-progress-ring">
                <svg width="40" height="40" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="18" fill="none" stroke="var(--border)" strokeWidth="4" />
                  <circle cx="20" cy="20" r="18" fill="none" stroke="var(--blue)" strokeWidth="4" strokeDasharray={`${(done / total) * 113} 113`} strokeDashoffset="0" transform="rotate(-90 20 20)" />
                </svg>
                <div className="pt-progress-val">{Math.round((done / total) * 100)}%</div>
              </div>
            </div>

            {patient.alert === 'DTQ_POSITIVE' && (
              <div className="crit-alert-box">
                <div className="crit-alert-hdr">
                  <AlertTriangle size={18} />
                  <span>RV PROTOCOL TRIGGERED</span>
                </div>
                <div className="crit-alert-body">
                  Patient reported new symptoms. The 48h randomisation window is active.
                </div>
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }} onClick={onOpenWizard}>
                  Start RV Wizard <ChevronRight size={14} />
                </button>
              </div>
            )}

            <div className="task-list" ref={taskListRef}>
              <DependencyLines activeTrace={activeTrace} p={patient} taskListRef={taskListRef} />
              
              <div className="task-sec">
                <div className="task-sec-title">Daily ePRO & Monitoring</div>
                {patient.tasks.q.map(renderTask)}
              </div>
              
              <div className="task-sec">
                <div className="task-sec-title">RV Onset & Randomisation</div>
                {patient.tasks.pr.map(renderTask)}
              </div>
              
              <div className="task-sec">
                <div className="task-sec-title">Laboratory & Samples</div>
                {patient.tasks.l.map(renderTask)}
              </div>
              
              <div className="task-sec">
                <div className="task-sec-title">Administration</div>
                {patient.tasks.ad.map(renderTask)}
              </div>
            </div>
          </div>
        </div>

        <div className="pt-side">
          <div className="card">
            <div className="card-hdr"><div className="card-title">Patient Info</div></div>
            <div className="info-list">
              <div className="info-item"><div className="info-l">Status</div><div className="info-v"><span className={`phase-badge ${phBadge}`}>{displayPhaseLabel}</span></div></div>
              <div className="info-item"><div className="info-l">Location</div><div className="info-v">{patient.loc}</div></div>
              <div className="info-item"><div className="info-l">Language</div><div className="info-v">{patient.lang}</div></div>
              <div className="info-item"><div className="info-l">Study Day</div><div className="info-v">Day {getStudyDay(patient) ?? '—'} · {getProtocolDayLabel(patient)}</div></div>
              <div className="info-item"><div className="info-l">Next Visit</div><div className="info-v">{fmtHuman(patient.nextVisit)}</div></div>
            </div>
          </div>

          <div className="card">
            <div className="card-hdr"><div className="card-title">Timeline & Next Steps</div></div>
            <div style={{ padding: '4px 16px 12px 16px', display: 'flex', flexDirection: 'column', gap: '0' }}>
              {[
                  patient.screeningDate && { label: 'Screening', date: patient.screeningDate, status: 'done' },
                  patient.consentDate && { label: 'Consent', date: patient.consentDate, status: 'done' },
                  patient.psbStartDate && { label: 'PSB Start', date: patient.psbStartDate, status: 'done' },
                  patient.rvInfectionDate && { label: 'RV Onset', date: patient.rvInfectionDate, status: 'done' },
                  patient.randomizationDate && { label: 'Randomisation', date: patient.randomizationDate, status: 'done' },
                  patient.resolution && { label: 'Resolution', date: patient.resolution, status: 'done' },
                ]
                .filter((ev): ev is { label: string; date: Date; status: string } => Boolean(ev))
                .sort((a, b) => a.date.getTime() - b.date.getTime())
                .concat(patient.nextVisit ? [{ label: patient.nextVisitLabel || 'Next Visit', date: patient.nextVisit, status: 'pending' }] : [])
                .map((ev, i, arr) => (
                  <div key={i} style={{ display: 'flex', gap: '12px', position: 'relative' }}>
                    {i < arr.length - 1 && (
                      <div style={{ position: 'absolute', left: '7px', top: '16px', bottom: '-4px', width: '2px', background: ev.status === 'done' && arr[i+1]?.status === 'done' ? 'var(--blue)' : 'var(--blue-bg)' }}></div>
                    )}
                    <div style={{ width: '16px', flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: '6px', zIndex: 2 }}>
                       <div style={{ 
                         width: '10px', height: '10px', borderRadius: '50%', 
                         background: ev.status === 'done' ? 'var(--blue)' : '#fff', 
                         border: ev.status === 'done' ? '2px solid var(--blue)' : '2px solid var(--blue)' 
                       }}></div>
                    </div>
                    <div style={{ paddingBottom: '16px', flex: 1, paddingTop: '2px' }}>
                      <div style={{ fontSize: '13px', fontWeight: ev.status === 'pending' ? 600 : 500, color: ev.status === 'pending' ? 'var(--t1)' : 'var(--t2)' }}>
                        {ev.label}
                      </div>
                      <div style={{ fontSize: '11px', color: ev.status === 'pending' ? 'var(--blue)' : 'var(--t3)', marginTop: '2px', fontWeight: ev.status === 'pending' ? 500 : 400 }}>
                        {fmtHuman(ev.date)}
                      </div>
                    </div>
                  </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-hdr"><div className="card-title">Quick Actions</div></div>
            <div className="action-stack">
              {patient.phaseCode === 'scr' && (
                <button className="act-btn" onClick={onOpenScreeningOutcome} style={{ color: 'var(--blue)', fontWeight: 500 }}>
                  <CheckCircle2 size={14} /> Record Screening Outcome
                </button>
              )}
              <button className="act-btn"><Phone size={14} /> Call Participant</button>
              <button className="act-btn"><Calendar size={14} /> Schedule Visit</button>
              <button className="act-btn"><FileText size={14} /> Generate Report</button>
            </div>
          </div>

          <div className="card">
            <div className="card-hdr"><div className="card-title">Protocol Reminders</div></div>
            <div className="rem-list">
              {patient.alert === 'DTQ_POSITIVE' && (
                <div className="rem-item">
                  <AlertTriangle size={14} color="var(--red)" style={{ flexShrink: 0 }} />
                  <span><strong>Randomisation Window Active:</strong> Must randomize within 48h of symptom onset.</span>
                </div>
              )}
              {patient.phaseCode === 'scr' && (
                <>
                  <div className="rem-item">
                    <Info size={14} color="var(--blue)" style={{ flexShrink: 0 }} />
                    <span>Confirm proper washout period for prohibited medications.</span>
                  </div>
                  <div className="rem-item">
                    <Info size={14} color="var(--blue)" style={{ flexShrink: 0 }} />
                    <span>Spirometry requires 6h washout of SABA.</span>
                  </div>
                </>
              )}
              {patient.phaseCode === 'psb' && (
                <div className="rem-item">
                  <Info size={14} color="var(--blue)" style={{ flexShrink: 0 }} />
                  <span>Remind patient to complete daily E-RS diary to establish baseline.</span>
                </div>
              )}
              {(patient.phaseCode === 'rv' || patient.dtqPos) && (
                <>
                  <div className="rem-item">
                    <Info size={14} color="var(--blue)" style={{ flexShrink: 0 }} />
                    <span>ECG must be collected <strong>prior</strong> to any blood draws.</span>
                  </div>
                  <div className="rem-item">
                    <Info size={14} color="var(--blue)" style={{ flexShrink: 0 }} />
                    <span>Confirm Virology (COVID-19/Flu) swab is negative before proceeding.</span>
                  </div>
                </>
              )}
              {patient.phaseCode === 'tx' && (
                <div className="rem-item">
                  <Info size={14} color="var(--blue)" style={{ flexShrink: 0 }} />
                  <span>Monitor for AEs closely during the 7-day treatment course.</span>
                </div>
              )}
              {patient.phaseCode === 'fu' && (
                <div className="rem-item">
                  <Info size={14} color="var(--blue)" style={{ flexShrink: 0 }} />
                  <span>Safety follow-up assessments required. Do not skip ECG.</span>
                </div>
              )}
            </div>
          </div>

          {/* Navigator Daily Log — bottom-right, below Protocol Reminders */}
          <NavigatorLog patient={patient} onNewReminder={onNewReminder} />
        </div>
      </div>

      {overrideModalCode && (
        <div className="modal-overlay" style={{ zIndex: 900 }}>
          <div className="modal-card" style={{ maxWidth: '400px', padding: 0 }}>
            <div className="modal-hdr" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={20} color="var(--amber)" />
                Override Blocked Task
              </div>
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              <p style={{ fontSize: '13px', color: 'var(--t2)', marginBottom: '16px' }}>
                This task has unmet dependencies. Please provide a justification for manual override. This action will be recorded in the audit trail.
              </p>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--t3)', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Justification / Protocol Exception
                </label>
                <textarea
                  className="modal-input"
                  style={{ height: '80px', resize: 'none' }}
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  placeholder="E.g., Approved by PI Dr. Jenkins on 2026-05-01 due to..."
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer" style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '16px 24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="ibtn" onClick={() => setOverrideModalCode(null)}>Cancel</button>
              <button 
                className="btn" 
                style={{ background: 'var(--amber)', color: '#fff' }}
                onClick={handleOverrideSubmit}
                disabled={!overrideReason.trim()}
              >
                Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}

      {timelineOpen && (
        <TimelineNavigator
          patient={patient}
          onClose={() => setTimelineOpen(false)}
        />
      )}

      {workloadLogOpen && (
        <WorkloadLogger
          userId="local_user"
          onClose={() => setWorkloadLogOpen(false)}
        />
      )}
    </div>
  );
};
