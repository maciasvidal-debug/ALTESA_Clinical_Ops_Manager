'use client';

import { useState, useRef } from 'react';
import { 
  ArrowLeft, Edit3, Trash2, CheckCircle2, Circle, Clock, 
  AlertTriangle, Info, ChevronRight, FileText, LayoutGrid, 
  ListTodo, Calendar, Phone, Activity, Search
} from 'lucide-react';
import { 
  type Patient, type Task, type Document, 
  fmtHuman, fmtISO, getTodayPct, countTasks 
} from '@/lib/data';
import { DependencyLines } from './DependencyLines';
import { PatientDocuments } from './PatientDocuments';

interface PatientDetailProps {
  patient: Patient;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleTask: (code: string) => void;
  onUpdateDocs: (docs: Document[]) => void;
  onOpenWizard: () => void;
  isChecked: (code: string) => boolean;
}

export const PatientDetail = ({ 
  patient, onBack, onEdit, onDelete, onToggleTask, 
  onUpdateDocs, onOpenWizard, isChecked 
}: PatientDetailProps) => {
  const [activeTab, setActiveTab] = useState<'checklist' | 'documents'>('checklist');
  const [activeTrace, setActiveTrace] = useState<string | null>(null);
  const taskListRef = useRef<HTMLDivElement>(null);

  const { done, total } = countTasks(patient);
  const phBadge = { scr: 'pb-scr', psb: 'pb-psb', tx: 'pb-tx', fu: 'pb-fu' }[patient.phaseCode] || 'pb-psb';

  const renderTask = (t: Task) => {
    const checked = isChecked(t.code);
    const locked = t.dependsOn?.some(code => !isChecked(code));
    const isCrit = t.code === 'RV_ONSET';

    return (
      <div 
        key={t.code} 
        data-code={t.code}
        className={`task-card ${checked ? 'checked' : ''} ${locked ? 'locked' : ''} ${isCrit ? 'crit' : ''} ${activeTrace === t.code ? 'tracing' : ''}`}
        onClick={() => !locked && onToggleTask(t.code)}
        onMouseEnter={() => setActiveTrace(t.code)}
        onMouseLeave={() => setActiveTrace(null)}
      >
        <div className="task-check">
          {checked ? <CheckCircle2 size={18} color="var(--blue)" /> : locked ? <Clock size={18} color="var(--t3)" /> : <Circle size={18} color="var(--t3)" />}
        </div>
        <div className="task-body">
          <div className="task-title">
            {t.label}
            {isCrit && <span className="task-crit-badge">CRITICAL</span>}
          </div>
          <div className="task-sub">{t.note}</div>
          {t.dependsOn && (
            <div className="task-deps">
              <span style={{ opacity: 0.6 }}>Requires:</span> {t.dependsOn.join(', ')}
            </div>
          )}
        </div>
        {locked && <div className="task-lock-icon"><Clock size={12} /></div>}
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
              <h1 className="pt-id-lg">{patient.id}</h1>
              <span className={`phase-badge ${phBadge}`}>{patient.phaseLabel}</span>
            </div>
            <div className="pt-name-lg">{patient.name} · {patient.lang}</div>
          </div>
        </div>
        <div className="hdr-right">
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
                  <div className="tl-seg s-scr" style={{ flex: '0 0 4%' }}><span>SCR</span></div>
                  <div className="tl-seg s-psb" style={{ flex: '0 0 45%' }}><span>PSB PHASE</span></div>
                  <div className="tl-seg s-rv" style={{ flex: '0 0 3%' }}></div>
                  <div className="tl-seg s-tx" style={{ flex: '0 0 12%' }}><span>TREATMENT</span></div>
                  <div className="tl-seg s-fu" style={{ flex: '0 0 8%' }}><span>FUP</span></div>
                  <div className="tl-seg s-fut" style={{ flex: 1 }}></div>
                  <div className="tl-now-marker" style={{ left: `${getTodayPct(patient).toFixed(1)}%` }}></div>
                  <div className="tl-now-label" style={{ left: `${getTodayPct(patient).toFixed(1)}%` }}>Today (Day {patient.studyDay})</div>
                </div>
                <div className="tl-labels">
                  <div style={{ flex: '0 0 4%' }}>D-42</div>
                  <div style={{ flex: '0 0 45%' }}>D1 (Baseline)</div>
                  <div style={{ flex: '0 0 3%' }}>RV</div>
                  <div style={{ flex: '0 0 12%' }}>D42</div>
                  <div style={{ flex: '0 0 8%' }}>D90</div>
                  <div style={{ flex: 1 }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="tab-nav">
            <button className={`tab-btn ${activeTab === 'checklist' ? 'active' : ''}`} onClick={() => setActiveTab('checklist')}>
              <ListTodo size={14} /> Study Checklist
            </button>
            <button className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>
              <FileText size={14} /> Documentation
            </button>
          </div>

          {activeTab === 'checklist' ? (
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
          ) : (
            <PatientDocuments patient={patient} onUpdate={onUpdateDocs} />
          )}
        </div>

        <div className="pt-side">
          <div className="card">
            <div className="card-hdr"><div className="card-title">Patient Info</div></div>
            <div className="info-list">
              <div className="info-item"><div className="info-l">Status</div><div className="info-v"><span className={`phase-badge ${phBadge}`}>{patient.phaseLabel}</span></div></div>
              <div className="info-item"><div className="info-l">Location</div><div className="info-v">{patient.loc}</div></div>
              <div className="info-item"><div className="info-l">Language</div><div className="info-v">{patient.lang}</div></div>
              <div className="info-item"><div className="info-l">Study Day</div><div className="info-v">Day {patient.studyDay}</div></div>
              <div className="info-item"><div className="info-l">Next Visit</div><div className="info-v">{fmtHuman(patient.nextVisit)}</div></div>
            </div>
          </div>

          <div className="card">
            <div className="card-hdr"><div className="card-title">Quick Actions</div></div>
            <div className="action-stack">
              <button className="act-btn"><Phone size={14} /> Call Participant</button>
              <button className="act-btn"><Calendar size={14} /> Schedule Visit</button>
              <button className="act-btn"><FileText size={14} /> Generate Report</button>
            </div>
          </div>

          <div className="card">
            <div className="card-hdr"><div className="card-title">Protocol Reminders</div></div>
            <div className="rem-list">
              <div className="rem-item">
                <Info size={14} color="var(--blue)" />
                <span>ECG must be collected <strong>prior</strong> to any blood draws.</span>
              </div>
              <div className="rem-item">
                <Info size={14} color="var(--blue)" />
                <span>Spirometry requires 6h washout of SABA.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
