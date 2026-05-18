'use client';

/**
 * TimelineNavigator — Clinical-grade bidirectional SoA query panel.
 *
 * READ-ONLY. No patient state mutations. No DB writes. Idempotent.
 *
 * Layout (constrained modal, not full-screen):
 *   ① Blurred backdrop — patient record remains visible underneath
 *   ② Card (max 980px / 86vh) — consistent with app's modal design language
 *   ③ Compact SoA matrix strip (200px) — visit selection via column click
 *   ④ Visit detail panel — 4 tabs: Assessments · Coordination · Log · Documents
 *
 * Past:    CONSOLIDATED — protocol-required items per approved SoA
 * Active:  ACTIVE VISIT — live task completion from patient.tasks
 * Future:  PROJECTED    — requirements for visit coordination/planning
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, CheckCircle2, Circle, MinusCircle,
  Clock, CalendarDays, AlertTriangle, History, Telescope, Activity,
  StickyNote, FolderOpen, ListChecks, FileText, Info, BadgeAlert,
} from 'lucide-react';
import {
  buildPatientTimeline,
  getCurrentVisitKey,
  isRequiredAt,
  getVisitDateWindow,
  getDocumentsForVisit,
  ALL_MATRIX_ROWS,
  type VisitSnapshot,
  type AssessmentCategory,
  type AssessmentResult,
} from '@/lib/timeline';
import { type Patient, type LogEntry, fmtISO } from '@/lib/data';

// ─── Category metadata ────────────────────────────────────────────────────────

const CAT_LABEL: Record<AssessmentCategory, string> = {
  Q:  'Questionnaires & ePRO',
  PR: 'Procedures & Examinations',
  L:  'Laboratory Assessments',
  AD: 'Administrative & Regulatory',
};
const CAT_COLOR: Record<AssessmentCategory, { text: string; bg: string; border: string; bar: string }> = {
  Q:  { text: '#0369A1', bg: '#E0F2FE', border: '#BAE6FD', bar: '#0EA5E9' },
  PR: { text: '#065F46', bg: '#D1FAE5', border: '#6EE7B7', bar: '#10B981' },
  L:  { text: '#7C3AED', bg: '#EDE9FE', border: '#C4B5FD', bar: '#A855F7' },
  AD: { text: '#92400E', bg: '#FEF3C7', border: '#FDE68A', bar: '#F59E0B' },
};
const CAT_ORDER: AssessmentCategory[] = ['Q', 'PR', 'L', 'AD'];

// ─── Phase colours ────────────────────────────────────────────────────────────

const PHASE_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  scr:   { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6' },
  rescr: { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA', dot: '#F97316' },
  psb:   { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
  rv:    { bg: '#FFF1F2', text: '#BE123C', border: '#FECDD3', dot: '#F43F5E' },
  tx:    { bg: '#FDF4FF', text: '#7E22CE', border: '#E9D5FF', dot: '#A855F7' },
  fu:    { bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD', dot: '#0EA5E9' },
};
const phStyle = (ph: string) =>
  PHASE_STYLE[ph] ?? { bg: '#F9FAFB', text: '#374151', border: '#E5E7EB', dot: '#9CA3AF' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return fmtISO(new Date(d));
}

function fmtLogDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function groupAssessments(
  assessments: AssessmentResult[],
): Partial<Record<AssessmentCategory, AssessmentResult[]>> {
  const out: Partial<Record<AssessmentCategory, AssessmentResult[]>> = {};
  for (const a of assessments) {
    if (!out[a.category]) out[a.category] = [];
    out[a.category]!.push(a);
  }
  return out;
}

// ─── Matrix cell state ────────────────────────────────────────────────────────

type CellState = 'required-past' | 'required-future' | 'completed' | 'pending' | 'not-required';

function matrixCellState(snap: VisitSnapshot, code: string): CellState {
  if (!isRequiredAt(snap.def, code)) return 'not-required';
  if (snap.status === 'past')   return 'required-past';
  if (snap.status === 'future') return 'required-future';
  const a = snap.assessments.find(x => x.code === code);
  if (a?.completed === true)  return 'completed';
  if (a?.completed === false) return 'pending';
  return 'required-future';
}

function MatrixCell({ state, dot }: { state: CellState; dot: string }) {
  const s: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', height: '20px',
  };
  if (state === 'not-required')
    return <div style={s}><span style={{ color: '#D1D5DB', fontSize: '11px' }}>—</span></div>;
  if (state === 'completed')
    return <div style={s}><CheckCircle2 size={12} color="var(--green)" strokeWidth={2.5} /></div>;
  if (state === 'pending')
    return <div style={s}><Circle size={12} color="var(--amber)" strokeWidth={2} /></div>;
  if (state === 'required-past')
    return <div style={s}><div style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #9CA3AF' }} /></div>;
  return (
    <div style={s}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, opacity: 0.65 }} />
    </div>
  );
}

// ─── Assessment detail row ────────────────────────────────────────────────────

function AssessmentDetailRow({ item, status }: { item: AssessmentResult; status: 'past' | 'current' | 'future' }) {
  const isCurrent = status === 'current';
  let icon: React.ReactNode;
  let labelColor = 'var(--t1)';

  if (isCurrent) {
    if (item.completed === true)  icon = <CheckCircle2 size={15} color="var(--green)" strokeWidth={2.5} />;
    else if (item.completed === false) { icon = <Circle size={15} color="var(--amber)" strokeWidth={2} />; labelColor = 'var(--t2)'; }
    else { icon = <MinusCircle size={15} color="var(--t3)" strokeWidth={1.5} />; labelColor = 'var(--t2)'; }
  } else if (status === 'past') {
    icon = <div style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid #9CA3AF', flexShrink: 0 }} />;
    labelColor = 'var(--t3)';
  } else {
    icon = <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#818CF8', opacity: 0.55, flexShrink: 0 }} />;
    labelColor = 'var(--t2)';
  }

  return (
    <div className="a-item" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '7px 14px', borderBottom: '1px solid rgba(0,0,0,.04)' }}>
      <div style={{ marginTop: '2px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '12.5px', fontWeight: 500, color: labelColor, display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
          {item.label}
          {item.critical && <span className="a-badge regulatory">CRITICAL</span>}
          {item.seq      && <span className="a-badge seq">SEQUENCE</span>}
          {isCurrent && item.completed === false && (
            <span style={{ fontSize: '10.5px', color: 'var(--amber)', fontWeight: 400 }}>pending</span>
          )}
        </div>
        {item.note && (
          <div className="a-note" style={{ marginTop: '2px' }}>{item.note}</div>
        )}
      </div>
    </div>
  );
}

// ─── Log row ──────────────────────────────────────────────────────────────────

function LogRow({ entry }: { entry: LogEntry }) {
  const isReminder = entry.type === 'reminder';
  return (
    <div style={{
      padding: '10px 14px', borderBottom: '1px solid var(--border)',
      background: isReminder && !entry.done ? 'var(--amber-bg)' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <span className={isReminder ? 'a-badge periodic' : 'a-badge seq'} style={{ fontSize: '9px' }}>
          {isReminder ? 'REMINDER' : 'NOTE'}
        </span>
        {isReminder && entry.done && <CheckCircle2 size={11} color="var(--green)" />}
        <span style={{ fontSize: '10.5px', color: 'var(--t3)', marginLeft: 'auto' }}>{fmtLogDate(entry.timestamp)}</span>
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--t2)', lineHeight: 1.5 }}>{entry.text}</div>
      {entry.reminderText && entry.reminderText !== entry.text && (
        <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '3px', fontStyle: 'italic' }}>→ {entry.reminderText}</div>
      )}
    </div>
  );
}

// ─── Visit status badge ───────────────────────────────────────────────────────

function VisitStatusBadge({ status }: { status: 'past' | 'current' | 'future' }) {
  if (status === 'past')
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#F3F4F6', color: '#6B7280', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 7px', fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.04em' }}>
        <History size={9} /> CONSOLIDATED
      </span>
    );
  if (status === 'current')
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-mid)', borderRadius: '4px', padding: '2px 7px', fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.04em' }}>
        <Activity size={9} /> ACTIVE VISIT
      </span>
    );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-mid)', borderRadius: '4px', padding: '2px 7px', fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.04em' }}>
      <Telescope size={9} /> PROJECTED
    </span>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = 'assessments' | 'coordination' | 'log' | 'documents';

const TAB_DEFS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'assessments',  label: 'Assessments',  icon: <ListChecks size={12} /> },
  { id: 'coordination', label: 'Coordination', icon: <CalendarDays size={12} /> },
  { id: 'log',          label: 'Notes & Log',  icon: <StickyNote size={12} /> },
  { id: 'documents',    label: 'Documents',    icon: <FolderOpen size={12} /> },
];

function TabBar({ active, onChange, logCount, docCount }: {
  active: Tab; onChange: (t: Tab) => void; logCount: number; docCount: number;
}) {
  const badge = (id: Tab) => {
    if (id === 'log') return logCount || 0;
    if (id === 'documents') return docCount || 0;
    return 0;
  };
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
      {TAB_DEFS.map(t => {
        const isActive = active === t.id;
        const cnt = badge(t.id);
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '8px 14px', fontSize: '11.5px',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? 'var(--blue)' : 'var(--t2)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: isActive ? '2px solid var(--blue)' : '2px solid transparent',
              whiteSpace: 'nowrap', flexShrink: 0, transition: 'color 0.15s',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {t.icon} {t.label}
            {cnt > 0 && (
              <span style={{
                background: isActive ? 'var(--blue)' : 'var(--t3)', color: '#fff',
                borderRadius: '10px', fontSize: '9px', fontWeight: 700, padding: '1px 5px',
              }}>
                {cnt}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── PSB helpers ─────────────────────────────────────────────────────────────

function getPSBDayLabel(def: import('@/lib/timeline').VisitDef): string {
  if (def.dayRange) return `Days ${def.dayRange[0]}–${def.dayRange[1]}`;
  if (def.key === 'PSB_W1_D7') return 'Day 7';
  const m = def.key.match(/^PSB_W(\d+)$/);
  if (m) return `Day ${parseInt(m[1], 10) * 7}`;
  return '';
}

// ─── Cycle Overview card ──────────────────────────────────────────────────────
// Shows a compact summary of all visits in the same 4-week PSB cycle.

function CycleOverviewCard({
  cycleVisits,
  selectedKey,
  onSelectVisit,
}: {
  cycleVisits: VisitSnapshot[];
  selectedKey: string;
  onSelectVisit: (key: string) => void;
}) {
  if (cycleVisits.length === 0) return null;
  const first = cycleVisits[0];
  const range = first.def.cycleRange;
  const cycleLabel = range ? `Weeks ${range[0]}–${range[1]}` : 'This Cycle';

  return (
    <div className="scard" style={{ marginBottom: '12px', overflow: 'hidden' }}>
      <div className="scard-hdr" style={{
        fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase',
        background: 'var(--green-bg)', color: 'var(--green)',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        <CalendarDays size={12} />
        Cycle Overview — {cycleLabel}
        <span style={{ marginLeft: 'auto', fontSize: '9px', opacity: 0.7, textTransform: 'none', letterSpacing: 0 }}>
          Click a row to navigate
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {['Week', 'Day(s)', 'Est. Date', 'Key Assessments', 'Status'].map(h => (
              <th key={h} style={{
                padding: '5px 10px', textAlign: 'left', fontSize: '9px',
                fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.04em',
                borderBottom: '1px solid var(--border)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cycleVisits.map(cv => {
            const isSelected = cv.def.key === selectedKey;
            const ps2 = phStyle(cv.def.phase);
            const dayLabel = getPSBDayLabel(cv.def);
            const codes = cv.def.items.slice(0, 4).map(i => i.code).join(', ');
            const extra = cv.def.items.length > 4 ? ` +${cv.def.items.length - 4}` : '';
            let statusEl: React.ReactNode;
            if (cv.status === 'past') {
              statusEl = <span style={{ color: '#9CA3AF', fontSize: '10px' }}>Completed</span>;
            } else if (cv.status === 'current') {
              statusEl = (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                  background: 'var(--blue-bg)', color: 'var(--blue)',
                  borderRadius: '3px', padding: '1px 5px', fontSize: '9px', fontWeight: 700,
                }}>
                  ● Active
                </span>
              );
            } else {
              statusEl = (
                <span style={{ color: 'var(--t3)', fontSize: '10px' }}>
                  {fmtDate(cv.estimatedDate)}
                </span>
              );
            }
            return (
              <tr
                key={cv.def.key}
                onClick={() => onSelectVisit(cv.def.key)}
                style={{
                  cursor: 'pointer',
                  background: isSelected ? `${ps2.bg}BB` : 'transparent',
                  borderLeft: isSelected ? `3px solid ${ps2.dot}` : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', fontWeight: isSelected ? 700 : 400, color: isSelected ? ps2.text : 'var(--t1)' }}>
                  {cv.def.shortLabel}
                </td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', color: 'var(--t2)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  {dayLabel}
                </td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', color: 'var(--t2)', whiteSpace: 'nowrap' }}>
                  {cv.status !== 'future' ? fmtDate(cv.estimatedDate) : (
                    <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>
                      Est. {fmtDate(cv.estimatedDate)}
                    </span>
                  )}
                  {cv.def.window != null && (
                    <span style={{ fontSize: '9.5px', color: 'var(--t3)', marginLeft: '4px' }}>±{cv.def.window}d</span>
                  )}
                </td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', color: 'var(--t3)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {codes}{extra}
                </td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
                  {statusEl}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TimelineNavigatorProps {
  patient: Patient;
  onClose: () => void;
}

export function TimelineNavigator({ patient, onClose }: TimelineNavigatorProps) {
  // ── Data ─────────────────────────────────────────────────────────────────
  const timeline   = useMemo(() => buildPatientTimeline(patient), [patient]);
  const defaultKey = useMemo(() => getCurrentVisitKey(patient), [patient]);

  // ── State ─────────────────────────────────────────────────────────────────
  const [selectedKey, setSelectedKey] = useState<string>(defaultKey);
  const [activeTab,   setActiveTab]   = useState<Tab>('assessments');
  const [logs,        setLogs]        = useState<LogEntry[]>([]);

  const matrixScrollRef  = useRef<HTMLDivElement>(null);
  const selectedColRef   = useRef<HTMLTableCellElement>(null);

  // ── Async log load (read-only) ────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    import('@/lib/db').then(({ logsStore }) =>
      logsStore.getItem<LogEntry[]>(`logs_${patient.id}`)
        .then(stored => { if (alive) setLogs(stored ?? []); })
        .catch(() => {})
    );
    return () => { alive = false; };
  }, [patient.id]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedIdx = useMemo(
    () => timeline.findIndex(s => s.def.key === selectedKey),
    [timeline, selectedKey],
  );
  const snap = timeline[selectedIdx] ?? timeline[0];

  const goTo = useCallback((idx: number) => {
    if (idx >= 0 && idx < timeline.length) {
      setSelectedKey(timeline[idx].def.key);
      setActiveTab('assessments');
    }
  }, [timeline]);

  const matrixRows = useMemo(() => {
    const used = new Set(timeline.flatMap(s => s.def.items.map(i => i.code)));
    return ALL_MATRIX_ROWS.filter(r => used.has(r.code));
  }, [timeline]);

  const visitLogs = useMemo(() => {
    if (!snap) return [];
    const { from, to } = getVisitDateWindow(snap);
    return logs
      .filter(e => { const t = new Date(e.timestamp); return t >= from && t <= to; })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [logs, snap]);

  const visitDocs = useMemo(() => snap ? getDocumentsForVisit(patient, snap) : [], [patient, snap]);

  const completionSummary = useMemo(() => {
    if (!snap || snap.status !== 'current') return null;
    const total = snap.assessments.length;
    const done  = snap.assessments.filter(a => a.completed === true).length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [snap]);

  const groupedAssessments = useMemo(() => snap ? groupAssessments(snap.assessments) : {}, [snap]);

  // ── PSB cycle support ─────────────────────────────────────────────────────
  // All visits in the same 4-week cycle as the currently selected visit.
  const cycleVisits = useMemo(() => {
    if (!snap?.def.visitGroup) return null;
    return timeline.filter(s => s.def.visitGroup === snap.def.visitGroup);
  }, [timeline, snap]);

  // Cycle group spans for the matrix header (used to paint cycle separators).
  const cycleGroupSpans = useMemo(() => {
    type Span = { key: string; label: string; colSpan: number; firstVisitKey: string; status: 'past' | 'current' | 'future' };
    const spans: Span[] = [];
    let i = 0;
    while (i < timeline.length) {
      const s = timeline[i];
      const group = s.def.visitGroup;
      if (!group) {
        spans.push({ key: s.def.key, label: '', colSpan: 1, firstVisitKey: s.def.key, status: s.status });
        i++;
      } else {
        let j = i;
        while (j < timeline.length && timeline[j].def.visitGroup === group) j++;
        const groupSnaps = timeline.slice(i, j);
        const range = s.def.cycleRange;
        const label = range ? `W${range[0]}–W${range[1]}` : group;
        const hasCurrent = groupSnaps.some(gs => gs.status === 'current');
        const allPast    = groupSnaps.every(gs => gs.status === 'past');
        const groupStatus: Span['status'] = hasCurrent ? 'current' : allPast ? 'past' : 'future';
        spans.push({ key: group, label, colSpan: j - i, firstVisitKey: s.def.key, status: groupStatus });
        i = j;
      }
    }
    return spans;
  }, [timeline]);

  // ── Scroll selected column into view ─────────────────────────────────────
  useEffect(() => {
    selectedColRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selectedKey]);

  // ── Keyboard nav ─────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  goTo(selectedIdx - 1);
      if (e.key === 'ArrowRight') goTo(selectedIdx + 1);
      if (e.key === 'Escape')     onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectedIdx, goTo, onClose]);

  if (!snap) return null;

  const ps          = phStyle(snap.def.phase);
  const visitWindow = snap.def.window != null ? ` ±${snap.def.window}d` : '';
  const pastCount   = timeline.filter(s => s.status === 'past').length;
  const futureCount = timeline.filter(s => s.status === 'future').length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    /* ── Backdrop ── */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Protocol Timeline Navigator"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(13,17,23,.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn 200ms var(--ease)',
      }}
    >
      {/* ── Card ── */}
      <div
        style={{
          width: '100%', maxWidth: '980px',
          maxHeight: '86vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r4)',
          boxShadow: '0 32px 80px rgba(0,0,0,.28)',
          overflow: 'hidden',
          animation: 'slideUp 240ms var(--ease)',
        }}
      >

        {/* ════ HEADER ══════════════════════════════════════════════════════ */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px',
          padding: '11px 16px',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        }}>
          <CalendarDays size={16} color="var(--blue)" style={{ flexShrink: 0 }} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>
              Protocol Timeline Navigator
            </div>
            <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '2px' }}>
              {patient.id} · {patient.phaseLabel} · Study Day {patient.studyDay ?? '—'} · {pastCount} completed · {futureCount} upcoming
            </div>
          </div>

          {/* Legend chips */}
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {[
              { label: 'Past',      bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
              { label: 'Active',    bg: 'var(--blue-bg)',  text: 'var(--blue)',  dot: '#3B82F6' },
              { label: 'Projected', bg: 'var(--green-bg)', text: 'var(--green)', dot: '#22C55E' },
            ].map(l => (
              <span key={l.label} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                background: l.bg, color: l.text,
                borderRadius: '4px', padding: '2px 7px',
                fontSize: '10px', fontWeight: 600,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: l.dot, display: 'inline-block' }} />
                {l.label}
              </span>
            ))}
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0, background: 'none', border: '1px solid var(--border)',
              borderRadius: 'var(--r1)', cursor: 'pointer', color: 'var(--t3)',
              padding: '6px', display: 'flex', alignItems: 'center',
              transition: 'all 140ms var(--ease)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ════ SOA MATRIX ══════════════════════════════════════════════════ */}
        <div style={{
          flexShrink: 0, height: '200px', overflow: 'hidden',
          borderBottom: '2px solid var(--border)',
          background: 'var(--surface)',
        }}>
          <div ref={matrixScrollRef} style={{ height: '100%', overflowX: 'auto', overflowY: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', minWidth: 'max-content', fontSize: '11px', tableLayout: 'fixed' }}>
              <thead>
                {/* ── Row 1: Cycle group labels ── */}
                <tr>
                  {/* Sticky corner spans both header rows */}
                  <th rowSpan={2} style={{
                    position: 'sticky', left: 0, top: 0, zIndex: 30,
                    background: 'var(--surface)', width: 175, minWidth: 175,
                    padding: '5px 10px',
                    borderRight: '2px solid var(--border)', borderBottom: '1px solid var(--border)',
                    textAlign: 'left', fontSize: '9px', fontWeight: 700,
                    letterSpacing: '0.06em', color: 'var(--t3)', textTransform: 'uppercase',
                    verticalAlign: 'middle',
                  }}>
                    Assessment
                  </th>
                  {cycleGroupSpans.map(span => {
                    if (!span.label) {
                      // Non-PSB single visit: empty cell placeholder
                      return (
                        <th key={span.key} style={{
                          position: 'sticky', top: 0, zIndex: 22,
                          width: 42, minWidth: 42,
                          background: 'var(--surface)',
                          borderBottom: '1px solid var(--border)',
                          borderRight: '1px solid var(--border)',
                        }} />
                      );
                    }
                    const isCycleSel = snap?.def.visitGroup === span.key;
                    const cycBg = span.status === 'past' ? '#F3F4F6' :
                                  span.status === 'current' ? 'var(--blue-bg)' : 'var(--green-bg)';
                    const cycText = span.status === 'past' ? '#9CA3AF' :
                                    span.status === 'current' ? 'var(--blue)' : 'var(--green)';
                    return (
                      <th
                        key={span.key}
                        colSpan={span.colSpan}
                        onClick={() => { setSelectedKey(span.firstVisitKey); setActiveTab('assessments'); }}
                        title={`PSB ${span.label} — click to navigate`}
                        style={{
                          position: 'sticky', top: 0, zIndex: 22,
                          padding: '2px 4px',
                          background: isCycleSel ? cycBg : 'var(--surface)',
                          borderBottom: isCycleSel ? `2px solid ${cycText}` : '1px solid var(--border)',
                          borderRight: '2px solid var(--border)',
                          borderLeft: '1px solid var(--border)',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                      >
                        <span style={{
                          fontSize: '8.5px', fontWeight: isCycleSel ? 700 : 500,
                          color: isCycleSel ? cycText : 'var(--t3)',
                          letterSpacing: '0.03em', whiteSpace: 'nowrap',
                        }}>
                          {span.label}
                        </span>
                      </th>
                    );
                  })}
                </tr>

                {/* ── Row 2: Individual visit chips ── */}
                <tr>
                  {timeline.map(s => {
                    const isSel = s.def.key === selectedKey;
                    const isCur = s.status === 'current';
                    const p2    = phStyle(s.def.phase);
                    return (
                      <th
                        key={s.def.key}
                        ref={isSel ? selectedColRef : undefined}
                        onClick={() => { setSelectedKey(s.def.key); setActiveTab('assessments'); }}
                        title={s.def.label}
                        style={{
                          position: 'sticky', top: '20px', zIndex: 20,
                          width: 42, minWidth: 42, padding: 0,
                          cursor: 'pointer',
                          background: isSel ? p2.bg : 'var(--surface)',
                          borderBottom: isSel ? `3px solid ${p2.dot}` : '1px solid var(--border)',
                          borderRight: '1px solid var(--border)',
                          textAlign: 'center', verticalAlign: 'bottom',
                          transition: 'background 0.15s',
                        }}
                      >
                        <div style={{ padding: '4px 2px 3px' }}>
                          {isCur && (
                            <div style={{
                              width: 5, height: 5, borderRadius: '50%',
                              background: p2.dot, margin: '0 auto 2px',
                              boxShadow: `0 0 0 2px ${p2.bg}, 0 0 0 3px ${p2.dot}`,
                            }} />
                          )}
                          <div style={{
                            fontSize: '9.5px',
                            fontWeight: isSel ? 700 : 500,
                            color: isSel ? p2.text : s.status === 'past' ? '#9CA3AF' : 'var(--t2)',
                            lineHeight: 1.2,
                          }}>
                            {s.def.shortLabel}
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {CAT_ORDER.map(cat => {
                  const rows = matrixRows.filter(r => r.category === cat);
                  if (!rows.length) return null;
                  const cc = CAT_COLOR[cat];
                  return [
                    <tr key={`cat-${cat}`}>
                      <td
                        colSpan={timeline.length + 1}
                        style={{
                          position: 'sticky', left: 0, zIndex: 10,
                          background: cc.bg, padding: '3px 10px',
                          fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
                          textTransform: 'uppercase', color: cc.text,
                          borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {CAT_LABEL[cat]}
                      </td>
                    </tr>,
                    ...rows.map(row => (
                      <tr key={row.code}>
                        {/* Sticky label */}
                        <td style={{
                          position: 'sticky', left: 0, zIndex: 10,
                          background: 'var(--surface)', width: 175, minWidth: 175,
                          padding: '0 10px',
                          borderRight: `3px solid ${cc.bar}`,
                          borderBottom: '1px solid var(--border)', verticalAlign: 'middle',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '20px' }}>
                            <span style={{ fontSize: '9px', color: 'var(--t3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                              {row.code}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.label}
                            </span>
                          </div>
                        </td>

                        {/* Visit cells */}
                        {timeline.map(s => {
                          const isSel = s.def.key === selectedKey;
                          const p2    = phStyle(s.def.phase);
                          const state = matrixCellState(s, row.code);
                          return (
                            <td
                              key={s.def.key}
                              onClick={() => { setSelectedKey(s.def.key); setActiveTab('assessments'); }}
                              title={`${row.fullLabel} @ ${s.def.label}`}
                              style={{
                                width: 42, minWidth: 42, padding: 0,
                                borderBottom: '1px solid var(--border)',
                                borderRight: '1px solid var(--border)',
                                background: isSel
                                  ? `${p2.bg}BB`
                                  : s.status === 'past' ? '#FAFAFA' : 'var(--surface)',
                                cursor: 'pointer', transition: 'background 0.1s',
                              }}
                            >
                              <MatrixCell state={state} dot={p2.dot} />
                            </td>
                          );
                        })}
                      </tr>
                    )),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ════ VISIT DETAIL ════════════════════════════════════════════════ */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {/* ─ Visit header ─ */}
          <div style={{
            flexShrink: 0,
            background: ps.bg, borderBottom: `1px solid ${ps.border}`,
            padding: '9px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
                  background: 'rgba(255,255,255,0.7)', color: ps.text,
                  border: `1px solid ${ps.border}`, borderRadius: '3px',
                  padding: '1px 6px', textTransform: 'uppercase',
                }}>
                  {snap.def.phase} phase
                </span>
                <VisitStatusBadge status={snap.status} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: ps.text }}>
                  {snap.def.label}
                </span>
                {snap.estimatedDate && (
                  <span style={{ fontSize: '11.5px', color: ps.text, opacity: 0.75, display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Clock size={10} />
                    {snap.status === 'future' ? 'Est. ' : ''}{fmtDate(snap.estimatedDate)}{visitWindow}
                  </span>
                )}
              </div>
              {snap.status === 'current' && completionSummary && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
                  <div style={{ flex: 1, maxWidth: '120px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.4)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${completionSummary.pct}%`, background: ps.dot, borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: '11px', color: ps.text, opacity: 0.8 }}>
                    {completionSummary.done}/{completionSummary.total} · {completionSummary.pct}%
                  </span>
                </div>
              )}
            </div>

            {/* Navigation controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <button
                onClick={() => goTo(selectedIdx - 1)}
                disabled={selectedIdx <= 0}
                aria-label="Previous visit"
                style={{
                  background: 'rgba(255,255,255,0.65)', border: `1px solid ${ps.border}`,
                  borderRadius: '5px', padding: '4px', cursor: selectedIdx <= 0 ? 'default' : 'pointer',
                  color: ps.text, opacity: selectedIdx <= 0 ? 0.3 : 1, display: 'flex',
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: '10px', color: ps.text, opacity: 0.7, minWidth: '44px', textAlign: 'center' }}>
                {selectedIdx + 1} / {timeline.length}
              </span>
              <button
                onClick={() => goTo(selectedIdx + 1)}
                disabled={selectedIdx >= timeline.length - 1}
                aria-label="Next visit"
                style={{
                  background: 'rgba(255,255,255,0.65)', border: `1px solid ${ps.border}`,
                  borderRadius: '5px', padding: '4px', cursor: selectedIdx >= timeline.length - 1 ? 'default' : 'pointer',
                  color: ps.text, opacity: selectedIdx >= timeline.length - 1 ? 0.3 : 1, display: 'flex',
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* ─ Tabs ─ */}
          <TabBar active={activeTab} onChange={setActiveTab} logCount={visitLogs.length} docCount={visitDocs.length} />

          {/* ─ Tab content ─ */}
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>

            {/* ── ASSESSMENTS ──────────────────────────────────────────────── */}
            {activeTab === 'assessments' && (
              <div style={{ padding: '12px 14px 24px' }}>

                {/* Cycle Overview — shown for all PSB visits with a group */}
                {cycleVisits && cycleVisits.length > 1 && (
                  <CycleOverviewCard
                    cycleVisits={cycleVisits}
                    selectedKey={selectedKey}
                    onSelectVisit={key => { setSelectedKey(key); }}
                  />
                )}

                {snap.status !== 'current' && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: '7px',
                    padding: '8px 11px', borderRadius: '6px', marginBottom: '12px',
                    background: snap.status === 'past' ? '#F9FAFB' : 'var(--green-bg)',
                    border: `1px solid ${snap.status === 'past' ? '#E5E7EB' : 'var(--green-mid)'}`,
                    fontSize: '11px', color: snap.status === 'past' ? '#6B7280' : '#065F46', lineHeight: 1.55,
                  }}>
                    <Info size={12} style={{ marginTop: '1px', flexShrink: 0 }} />
                    {snap.status === 'past'
                      ? 'Retrospective view. Protocol-required assessments are shown per the approved SoA. Per-visit historical completion is not tracked in the current schema — consult the source eCRF for audit-grade records.'
                      : 'Prospective view. Assessments shown are required per the approved SoA. Actual tasks may vary with protocol amendments, patient eligibility, or clinical judgement.'}
                  </div>
                )}

                {CAT_ORDER.map(cat => {
                  const items = groupedAssessments[cat];
                  if (!items?.length) return null;
                  const cc = CAT_COLOR[cat];
                  const done = items.filter(i => i.completed === true).length;
                  return (
                    <div key={cat} className="card" style={{ marginBottom: '10px', overflow: 'hidden' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 14px', background: cc.bg,
                        borderBottom: `1px solid ${cc.border}`,
                        borderLeft: `3px solid ${cc.bar}`,
                      }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: cc.text, letterSpacing: '0.04em', flex: 1 }}>
                          {CAT_LABEL[cat]}
                        </span>
                        <span style={{ fontSize: '10px', color: cc.text, opacity: 0.7 }}>
                          {snap.status === 'current' ? `${done}/${items.length}` : `${items.length}`}
                        </span>
                      </div>
                      {items.map(item => (
                        <AssessmentDetailRow key={item.code} item={item} status={snap.status} />
                      ))}
                    </div>
                  );
                })}

                {snap.assessments.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: '13px' }}>
                    No assessments defined for this visit.
                  </div>
                )}
              </div>
            )}

            {/* ── COORDINATION ─────────────────────────────────────────────── */}
            {activeTab === 'coordination' && (
              <div style={{ padding: '12px 14px 24px' }}>

                {/* Scheduling grid */}
                <div className="scard" style={{ marginBottom: '10px' }}>
                  <div className="scard-hdr" style={{ fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    <CalendarDays size={12} /> Visit Scheduling
                  </div>
                  <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'Target Date', value: fmtDate(snap.estimatedDate) },
                      { label: 'Window',       value: snap.def.window != null ? `±${snap.def.window} days` : 'Fixed date' },
                      { label: 'Status',       value: snap.status === 'past' ? 'Completed' : snap.status === 'current' ? 'Active' : 'Upcoming' },
                      {
                        label: 'Window Open',
                        value: snap.estimatedDate && snap.def.window
                          ? fmtDate(new Date(snap.estimatedDate.getTime() - snap.def.window * 86400000))
                          : '—',
                      },
                      {
                        label: 'Window Close',
                        value: snap.estimatedDate && snap.def.window
                          ? fmtDate(new Date(snap.estimatedDate.getTime() + snap.def.window * 86400000))
                          : '—',
                      },
                      { label: 'Phase', value: snap.def.phase.toUpperCase() },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: '9.5px', color: 'var(--t3)', fontWeight: 600, marginBottom: '2px', letterSpacing: '0.03em' }}>
                          {label}
                        </div>
                        <div style={{ fontSize: '12.5px', color: 'var(--t1)', fontWeight: 500 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preparation checklist */}
                {snap.def.coordinationNotes && snap.def.coordinationNotes.length > 0 && (
                  <div className="scard" style={{ marginBottom: '10px', overflow: 'hidden' }}>
                    <div className="scard-hdr" style={{ fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase', background: 'var(--blue-bg)', color: 'var(--blue)' }}>
                      <ListChecks size={12} />
                      {snap.status === 'future' ? 'Preparation Checklist' : snap.status === 'current' ? 'Active Visit Notes' : 'Visit Reference Notes'}
                    </div>
                    {snap.def.coordinationNotes.map((note, i) => {
                      const isCrit = note.startsWith('🚨');
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'flex-start', gap: '10px',
                          padding: '9px 14px',
                          borderBottom: i < (snap.def.coordinationNotes?.length ?? 0) - 1 ? '1px solid var(--border)' : 'none',
                          background: isCrit ? 'var(--red-bg)' : 'transparent',
                        }}>
                          <span style={{
                            flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                            background: isCrit ? 'var(--red-mid)' : 'var(--blue-mid)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '9px', fontWeight: 700,
                            color: isCrit ? 'var(--red)' : 'var(--blue)',
                          }}>
                            {isCrit ? '!' : i + 1}
                          </span>
                          <span style={{ fontSize: '12px', color: isCrit ? 'var(--red)' : 'var(--t2)', lineHeight: 1.55 }}>
                            {note.replace('🚨 ', '')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Assessment load summary */}
                <div className="scard">
                  <div className="scard-hdr" style={{ fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Assessment Load — {snap.assessments.length} required
                  </div>
                  <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {CAT_ORDER.map(cat => {
                      const items = groupedAssessments[cat];
                      if (!items?.length) return null;
                      const cc = CAT_COLOR[cat];
                      const pct = Math.round((items.length / snap.assessments.length) * 100);
                      return (
                        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                          <span style={{
                            minWidth: '26px', textAlign: 'center',
                            fontSize: '10px', fontWeight: 700, color: cc.text,
                            background: cc.bg, border: `1px solid ${cc.border}`,
                            borderRadius: '3px', padding: '1px 5px',
                          }}>
                            {items.length}
                          </span>
                          <div style={{ flex: 1, height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: cc.bar, borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--t2)', minWidth: '140px' }}>{CAT_LABEL[cat]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── NOTES & LOG ──────────────────────────────────────────────── */}
            {activeTab === 'log' && (
              <div style={{ padding: '12px 14px 24px' }}>
                {snap.estimatedDate && (
                  <div style={{
                    padding: '6px 10px', border: '1px solid var(--border)',
                    background: 'var(--surface)', borderRadius: '6px',
                    display: 'flex', alignItems: 'center', gap: '5px',
                    fontSize: '11px', color: 'var(--t3)', marginBottom: '10px',
                  }}>
                    <Clock size={11} />
                    Notes within visit window: {fmtDate(getVisitDateWindow(snap).from)} — {fmtDate(getVisitDateWindow(snap).to)}
                  </div>
                )}

                {visitLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '28px 24px', color: 'var(--t3)', fontSize: '13px' }}>
                    <StickyNote size={26} color="var(--border)" style={{ display: 'block', margin: '0 auto 10px' }} />
                    No navigator notes for this visit period.
                    {logs.length > 0 && (
                      <div style={{ fontSize: '11px', marginTop: '4px' }}>{logs.length} note{logs.length !== 1 ? 's' : ''} exist outside this window.</div>
                    )}
                  </div>
                ) : (
                  <div className="scard" style={{ overflow: 'hidden' }}>
                    {visitLogs.map(entry => <LogRow key={entry.id} entry={entry} />)}
                  </div>
                )}
              </div>
            )}

            {/* ── DOCUMENTS ────────────────────────────────────────────────── */}
            {activeTab === 'documents' && (
              <div style={{ padding: '12px 14px 24px' }}>
                {snap.estimatedDate && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px', fontSize: '11px', color: 'var(--t3)' }}>
                    <Clock size={11} />
                    Uploaded within: {fmtDate(getVisitDateWindow(snap).from)} — {fmtDate(getVisitDateWindow(snap).to)}
                  </div>
                )}

                {visitDocs.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '28px 24px',
                    color: 'var(--t3)', fontSize: '13px',
                    background: 'var(--surface)', borderRadius: 'var(--r2)', border: '1px solid var(--border)',
                  }}>
                    <FolderOpen size={26} color="var(--border)" style={{ display: 'block', margin: '0 auto 10px' }} />
                    No documents uploaded during this visit period.
                  </div>
                ) : (
                  <div className="scard" style={{ overflow: 'hidden' }}>
                    {visitDocs.map((doc, idx) => {
                      const catColor: Record<string, string> = {
                        ICF: 'var(--blue)', LAB: '#7C3AED', ECG: 'var(--red)', IMG: 'var(--amber)', OTHER: 'var(--t3)',
                      };
                      return (
                        <div key={doc.id} style={{
                          display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 14px',
                          borderBottom: idx < visitDocs.length - 1 ? '1px solid var(--border)' : 'none',
                        }}>
                          <div style={{
                            flexShrink: 0, width: 32, height: 32, borderRadius: 'var(--r1)',
                            background: 'var(--bg)', border: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <FileText size={14} color="var(--t3)" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.name}
                            </div>
                            <div style={{ fontSize: '10.5px', color: 'var(--t3)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                              <span style={{ fontWeight: 700, fontSize: '9px', color: catColor[doc.category] ?? 'var(--t3)' }}>{doc.category}</span>
                              <span>{doc.extension}</span>
                              <span>{doc.size}</span>
                              <span>{fmtDate(doc.uploadDate)}</span>
                            </div>
                          </div>
                          {doc.critical && <BadgeAlert size={13} color="var(--red)" aria-label="Critical document" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {patient.documents.length > visitDocs.length && (
                  <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--t3)', textAlign: 'center' }}>
                    {patient.documents.length - visitDocs.length} additional document{patient.documents.length - visitDocs.length !== 1 ? 's' : ''} exist outside this visit window.
                  </div>
                )}
              </div>
            )}

          </div>{/* end tab content */}
        </div>{/* end visit detail */}

        {/* ════ FOOTER ══════════════════════════════════════════════════════ */}
        <div style={{
          flexShrink: 0, padding: '6px 14px',
          borderTop: '1px solid var(--border)', background: 'var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '10.5px', color: 'var(--t3)',
        }}>
          <span>
            {pastCount} consolidated · {timeline.filter(s => s.status === 'current').length} active · {futureCount} projected · {timeline.length} total
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Info size={10} />
            Read-only · Protocol v{patient.protocolVersion ?? '—'} · ←→ navigate
          </span>
        </div>

      </div>{/* end card */}
    </div>  /* end backdrop */
  );
}
