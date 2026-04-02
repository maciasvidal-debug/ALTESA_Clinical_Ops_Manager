'use client';

import React from 'react';
import { Calendar, Clock, AlertTriangle, ChevronRight, CheckCircle2, Hospital } from 'lucide-react';
import { fmtHuman, fmtISO, TODAY, diffDays, type Patient } from '@/lib/data';
import { DLPWrapper } from '@/components/DLPWrapper';

export function DailyBriefing({ patients, onClose, onSelectPatient, onDLPViolation }: { patients: Patient[], onClose: () => void, onSelectPatient: (id: string) => void, onDLPViolation: (action: string) => void }) {
  const crits = patients.filter(p => p.alert === 'DTQ_POSITIVE');
  const overdueTasks: any[] = [];
  const clinicToday = patients.filter(p => p.loc.includes('CLINIC'));
  
  patients.forEach(p => {
    const allTasks = [...(p.tasks.q || []), ...(p.tasks.pr || []), ...(p.tasks.l || []), ...(p.tasks.ad || [])];
    allTasks.forEach(t => {
      if (!t.done && t.dueDate) {
        const diff = diffDays(TODAY, t.dueDate);
        if (diff < 0) {
          overdueTasks.push({ pid: p.id, task: t, diff: Math.abs(diff) });
        }
      }
    });
  });

  return (
    <div className="briefing-overlay">
      <div className="briefing-card">
        <div className="briefing-hdr">
          <div className="briefing-title">Good morning, Coordinator</div>
          <div className="briefing-sub">
            <Calendar size={14} /> {fmtHuman(TODAY)}, {fmtISO(TODAY)}
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <Clock size={14} /> Shift Summary
          </div>
        </div>
        <div className="briefing-body">
          <div className="brief-sec">
            <div className="brief-sec-title"><AlertTriangle size={14} /> Critical Actions Required</div>
            {crits.length > 0 ? crits.map(p => (
              <div key={p.id} className="brief-item crit" onClick={() => onSelectPatient(p.id)}>
                <div className="brief-icon"><AlertTriangle size={20} /></div>
                <div className="brief-content">
                  <div className="brief-pt-id">
                    <DLPWrapper onViolation={onDLPViolation}>{p.id}</DLPWrapper> — <DLPWrapper onViolation={onDLPViolation}>{p.name}</DLPWrapper>
                  </div>
                  <div className="brief-msg">RV Protocol Active: Randomisation window is running</div>
                  <div className="brief-meta">Symptom onset reported. Action required within 48h+6h window.</div>
                </div>
                <ChevronRight size={16} color="var(--t4)" />
              </div>
            )) : (
              <div style={{ padding: '16px', background: 'var(--green-bg)', color: 'var(--green)', borderRadius: 'var(--r2)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} /> No patients currently in the critical RV window.
              </div>
            )}
          </div>

          <div className="briefing-grid">
            <div className="brief-sec">
              <div className="brief-sec-title"><Hospital size={14} /> Clinic Visits Today</div>
              {clinicToday.length > 0 ? clinicToday.map(p => (
                <div key={p.id} className="brief-item today" onClick={() => onSelectPatient(p.id)}>
                  <div className="brief-icon"><Hospital size={18} /></div>
                  <div className="brief-content">
                    <div className="brief-pt-id">
                      <DLPWrapper onViolation={onDLPViolation}>{p.id}</DLPWrapper>
                    </div>
                    <div className="brief-msg">{p.phaseLabel.split('·')[0]} Visit</div>
                    <div className="brief-meta">Scheduled for today in clinic.</div>
                  </div>
                </div>
              )) : (
                <div style={{ fontSize: '13px', color: 'var(--t3)', padding: '8px 0' }}>No clinic visits scheduled for today.</div>
              )}
            </div>

            <div className="brief-sec">
              <div className="brief-sec-title"><Clock size={14} /> Overdue Tasks</div>
              {overdueTasks.length > 0 ? overdueTasks.slice(0, 4).map((item, i) => (
                <div key={i} className="brief-item warn" onClick={() => onSelectPatient(item.pid)}>
                  <div className="brief-icon"><Clock size={18} /></div>
                  <div className="brief-content">
                    <div className="brief-pt-id">
                      <DLPWrapper onViolation={onDLPViolation}>{item.pid}</DLPWrapper>
                    </div>
                    <div className="brief-msg">{item.task.label}</div>
                    <div className="brief-meta">Overdue by {item.diff} day{item.diff !== 1 ? 's' : ''}.</div>
                  </div>
                </div>
              )) : (
                <div style={{ fontSize: '13px', color: 'var(--green)', padding: '8px 0' }}>All tasks are up to date.</div>
              )}
              {overdueTasks.length > 4 && (
                <div style={{ fontSize: '11px', color: 'var(--t3)', textAlign: 'center', marginTop: '8px' }}>
                  + {overdueTasks.length - 4} more overdue tasks
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="brief-footer">
          <button className="btn btn-primary" style={{ padding: '12px 32px' }} onClick={onClose}>Start My Shift</button>
        </div>
      </div>
    </div>
  );
}
