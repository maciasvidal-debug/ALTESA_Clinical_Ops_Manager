'use client';

/**
 * TimelineNavigator — Clinical-grade bidirectional SoA query panel.
 *
 * Strictly READ-ONLY. No patient state mutations. No DB writes.
 * Querying any visit any number of times is idempotent.
 *
 * Layout:
 *   ① Full-screen modal
 *   ② SoA Matrix — horizontally scrollable table (rows = assessments, columns = visits)
 *      Click any visit column to select it.
 *   ③ Visit Detail Panel — tabbed: Assessments · Coordination · Navigator Log · Documents
 *
 * Past visits:    CONSOLIDATED badge — protocol-required assessments, no live completion.
 * Current visit:  ACTIVE VISIT badge — real-time task completion from patient.tasks.
 * Future visits:  PROJECTED badge   — protocol requirements for planning.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, CheckCircle2, Circle, MinusCircle,
  Clock, CalendarDays, AlertTriangle, History, Telescope, Activity,
  ClipboardList, Beaker, FileText, Stethoscope, Info, StickyNote,
  FolderOpen, ListChecks, ArrowUpRight, BadgeAlert, Zap,
} from 'lucide-react';
import {
  buildPatientTimeline,
  getCurrentVisitKey,
  isRequiredAt,
  getItemAt,
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
const CAT_COLOR: Record<AssessmentCategory, { text: string; bg: string; border: string }> = {
  Q:  { text: '#0369A1', bg: '#E0F2FE', border: '#BAE6FD' },
  PR: { text: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' },
  L:  { text: '#7C3AED', bg: '#EDE9FE', border: '#C4B5FD' },
  AD: { text: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
};

// ─── Phase colors ─────────────────────────────────────────────────────────────

const PHASE_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  scr:   { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6' },
  rescr: { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA', dot: '#F97316' },
  psb:   { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
  rv:    { bg: '#FFF1F2', text: '#BE123C', border: '#FECDD3', dot: '#F43F5E' },
  tx:    { bg: '#FDF4FF', text: '#7E22CE', border: '#E9D5FF', dot: '#A855F7' },
  fu:    { bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD', dot: '#0EA5E9' },
};
const phStyle = (ph: string) => PHASE_STYLE[ph] ?? { bg: '#F9FAFB', text: '#374151', border: '#E5E7EB', dot: '#9CA3AF' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return fmtISO(new Date(d));
}

function fmtLogDate(isoStr: string): string {
  const d = new Date(isoStr);
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

// ─── Matrix cell ──────────────────────────────────────────────────────────────

type CellState = 'required-past' | 'required-future' | 'completed' | 'pending' | 'not-required';

function matrixCell(
  snap: VisitSnapshot,
  code: string,
  isSelected: boolean,
): CellState {
  if (!isRequiredAt(snap.def, code)) return 'not-required';
  if (snap.status === 'past')   return 'required-past';
  if (snap.status === 'future') return 'required-future';
  // current
  const a = snap.assessments.find(x => x.code === code);
  if (!a) return 'required-future';
  if (a.completed === true)  return 'completed';
  if (a.completed === false) return 'pending';
  return 'required-future'; // null = unknown
}

function MatrixCell({
  state, phaseColor, isSelected,
}: {
  state: CellState; phaseColor: string; isSelected: boolean;
}) {
  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '26px', fontSize: '13px',
  };
  if (state === 'not-required') {
    return <div style={base}><span style={{ color: '#D1D5DB', fontSize: '12px' }}>—</span></div>;
  }
  if (state === 'completed') {
    return (
      <div style={base}>
        <CheckCircle2 size={14} color="#059669" strokeWidth={2.5} />
      </div>
    );
  }
  if (state === 'pending') {
    return (
      <div style={base}>
        <Circle size={14} color="#D97706" strokeWidth={2} />
      </div>
    );
  }
  if (state === 'required-past') {
    return (
      <div style={base}>
        <div style={{
          width: 9, height: 9, borderRadius: '50%',
          border: `2px solid #9CA3AF`, background: 'transparent',
        }} />
      </div>
    );
  }
  // required-future
  return (
    <div style={base}>
      <div style={{
        width: 9, height: 9, borderRadius: '50%',
        background: phaseColor, opacity: isSelected ? 1 : 0.55,
      }} />
    </div>
  );
}

// ─── Assessment row in detail panel ──────────────────────────────────────────

function AssessmentDetailRow({
  item, status,
}: {
  item: AssessmentResult; status: 'past' | 'current' | 'future';
}) {
  const isCurrent = status === 'current';
  let indicatorIcon: React.ReactNode;
  let labelColor = 'var(--t1)';

  if (isCurrent) {
    if (item.completed === true) {
      indicatorIcon = <CheckCircle2 size={16} color="#059669" strokeWidth={2.5} />;
    } else if (item.completed === false) {
      indicatorIcon = <Circle size={16} color="#D97706" strokeWidth={2} />;
      labelColor = 'var(--t2)';
    } else {
      indicatorIcon = <MinusCircle size={16} color="var(--t3)" strokeWidth={1.5} />;
      labelColor = 'var(--t2)';
    }
  } else if (status === 'past') {
    indicatorIcon = <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #9CA3AF', flexShrink: 0 }} />;
    labelColor = '#6B7280';
  } else {
    indicatorIcon = <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6366F1', opacity: 0.5, flexShrink: 0 }} />;
    labelColor = 'var(--t2)';
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      padding: '8px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ marginTop: '2px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {indicatorIcon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: '13px', fontWeight: 500, color: labelColor,
          display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
        }}>
          {item.label}
          {item.critical && (
            <span style={{
              fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
              background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5',
              borderRadius: '3px', padding: '1px 5px',
            }}>CRITICAL</span>
          )}
          {item.seq && (
            <span style={{
              fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
              background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A',
              borderRadius: '3px', padding: '1px 5px',
            }}>SEQUENCE</span>
          )}
          {isCurrent && item.completed === false && (
            <span style={{ fontSize: '11px', color: '#D97706', fontWeight: 400 }}>pending</span>
          )}
        </div>
        {item.note && (
          <div style={{ fontSize: '11.5px', color: 'var(--t3)', marginTop: '2px', lineHeight: 1.5 }}>
            {item.note}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Log entry row ────────────────────────────────────────────────────────────

function LogRow({ entry }: { entry: LogEntry }) {
  const isReminder = entry.type === 'reminder';
  return (
    <div style={{
      padding: '10px 12px',
      borderBottom: '1px solid var(--border)',
      background: isReminder && !entry.done ? '#FFFBEB' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <span style={{
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
          background: isReminder ? '#FEF3C7' : '#EFF6FF',
          color: isReminder ? '#92400E' : '#1D4ED8',
          border: `1px solid ${isReminder ? '#FDE68A' : '#BFDBFE'}`,
          borderRadius: '3px', padding: '1px 5px', flexShrink: 0,
        }}>
          {isReminder ? 'REMINDER' : 'NOTE'}
        </span>
        {isReminder && entry.done && (
          <CheckCircle2 size={11} color="#059669" />
        )}
        <span style={{ fontSize: '11px', color: 'var(--t3)', marginLeft: 'auto' }}>
          {fmtLogDate(entry.timestamp)}
        </span>
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--t2)', lineHeight: 1.5 }}>
        {entry.text}
      </div>
      {entry.reminderText && entry.reminderText !== entry.text && (
        <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '3px', fontStyle: 'italic' }}>
          → {entry.reminderText}
        </div>
      )}
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = 'assessments' | 'coordination' | 'log' | 'documents';

function TabBar({
  active, onChange, logCount, docCount,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  logCount: number;
  docCount: number;
}) {
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'assessments',  label: 'Assessments',  icon: <ListChecks size={13} /> },
    { id: 'coordination', label: 'Coordination', icon: <CalendarDays size={13} /> },
    { id: 'log',          label: 'Notes & Log',  icon: <StickyNote size={13} />, badge: logCount || undefined },
    { id: 'documents',    label: 'Documents',    icon: <FolderOpen size={13} />, badge: docCount || undefined },
  ];
  return (
    <div style={{
      display: 'flex', borderBottom: '1px solid var(--border)',
      background: 'var(--surface)', flexShrink: 0, overflowX: 'auto',
      scrollbarWidth: 'none',
    }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '9px 16px', fontSize: '12px', fontWeight: active === t.id ? 700 : 500,
            color: active === t.id ? 'var(--blue)' : 'var(--t2)',
            background: 'none', border: 'none', borderBottom: active === t.id ? '2px solid var(--blue)' : '2px solid transparent',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            transition: 'color 0.15s',
          }}
        >
          {t.icon} {t.label}
          {t.badge != null && (
            <span style={{
              background: active === t.id ? 'var(--blue)' : 'var(--t3)',
              color: 'white', borderRadius: '10px',
              fontSize: '9px', fontWeight: 700, padding: '1px 5px',
            }}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Visit status badge ───────────────────────────────────────────────────────

function VisitStatusBadge({ status }: { status: 'past' | 'current' | 'future' }) {
  if (status === 'past') return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      background: '#F3F4F6', color: '#6B7280', border: '1px solid #D1D5DB',
      borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
    }}>
      <History size={10} /> CONSOLIDATED
    </span>
  );
  if (status === 'current') return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE',
      borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
    }}>
      <Activity size={10} /> ACTIVE VISIT
    </span>
  );
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0',
      borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
    }}>
      <Telescope size={10} /> PROJECTED
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TimelineNavigatorProps {
  patient: Patient;
  onClose: () => void;
}

export function TimelineNavigator({ patient, onClose }: TimelineNavigatorProps) {
  // ── Timeline data (memoised) ───────────────────────────────────────────────
  const timeline = useMemo(() => buildPatientTimeline(patient), [patient]);
  const defaultKey = useMemo(() => getCurrentVisitKey(patient), [patient]);

  // ── State ─────────────────────────────────────────────────────────────────
  const [selectedKey, setSelectedKey] = useState<string>(defaultKey);
  const [activeTab, setActiveTab] = useState<Tab>('assessments');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Refs for scrolling
  const matrixScrollRef = useRef<HTMLDivElement>(null);
  const selectedColRef = useRef<HTMLTableCellElement>(null);

  // ── Async: load navigator log entries (read-only) ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    import('@/lib/db').then(({ logsStore }) => {
      logsStore.getItem<LogEntry[]>(`logs_${patient.id}`).then(stored => {
        if (!cancelled) setLogs(stored ?? []);
      }).catch(() => { /* silently skip if unavailable */ });
    });
    return () => { cancelled = true; };
  }, [patient.id]);

  // ── Derived data ──────────────────────────────────────────────────────────
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

  // Matrix rows: only those that appear in at least one visit
  const matrixRows = useMemo(() => {
    const usedCodes = new Set(timeline.flatMap(s => s.def.items.map(i => i.code)));
    return ALL_MATRIX_ROWS.filter(r => usedCodes.has(r.code));
  }, [timeline]);

  // Category groups for the matrix
  const matrixCategories = useMemo<AssessmentCategory[]>(() => {
    const seen = new Set<AssessmentCategory>();
    const order: AssessmentCategory[] = ['Q', 'PR', 'L', 'AD'];
    return order.filter(c => matrixRows.some(r => r.category === c && seen.add(c)));
  }, [matrixRows]);

  // Filtered log entries for the selected visit window
  const visitLogs = useMemo(() => {
    if (!snap) return [];
    const { from, to } = getVisitDateWindow(snap);
    return logs
      .filter(e => {
        const t = new Date(e.timestamp);
        return t >= from && t <= to;
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [logs, snap]);

  // Documents for selected visit
  const visitDocs = useMemo(() => {
    if (!snap) return [];
    return getDocumentsForVisit(patient, snap);
  }, [patient, snap]);

  // Completion summary for current visit
  const completionSummary = useMemo(() => {
    if (!snap || snap.status !== 'current') return null;
    const total = snap.assessments.length;
    const done  = snap.assessments.filter(a => a.completed === true).length;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [snap]);

  // Grouped assessments for the detail panel
  const groupedAssessments = useMemo(() => {
    if (!snap) return {};
    return groupAssessments(snap.assessments);
  }, [snap]);

  // Scroll selected column into view when it changes
  useEffect(() => {
    selectedColRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selectedKey]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  goTo(selectedIdx - 1);
      if (e.key === 'ArrowRight') goTo(selectedIdx + 1);
      if (e.key === 'Escape')     onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIdx, goTo, onClose]);

  if (!snap) return null;

  const ps = phStyle(snap.def.phase);
  const visitWindow = snap.def.window != null ? ` ±${snap.def.window}d` : '';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Protocol Timeline Navigator"
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderBottom: '2px solid var(--border)',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <CalendarDays size={20} color="var(--blue)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--t1)' }}>
            Protocol Timeline Navigator
          </div>
          <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '1px' }}>
            {patient.id} · {patient.name} · {patient.phaseLabel} · Study Day {patient.studyDay ?? '—'}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
          {[
            { label: 'Past',      bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB', dot: '#9CA3AF' },
            { label: 'Active',    bg: '#DBEAFE', text: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6' },
            { label: 'Projected', bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
          ].map(l => (
            <span key={l.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              background: l.bg, color: l.text, border: `1px solid ${l.border}`,
              borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontWeight: 600,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.dot, display: 'inline-block' }} />
              {l.label}
            </span>
          ))}
        </div>

        <button
          onClick={onClose}
          aria-label="Close Timeline Navigator"
          style={{
            flexShrink: 0, background: 'none', border: '1px solid var(--border)',
            borderRadius: '6px', cursor: 'pointer', color: 'var(--t3)',
            padding: '5px', display: 'flex', alignItems: 'center',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* ══ SOA MATRIX ══════════════════════════════════════════════════════ */}
      <div style={{
        flexShrink: 0,
        height: '300px',
        overflow: 'hidden',
        borderBottom: '2px solid var(--border)',
        background: 'var(--surface)',
        position: 'relative',
      }}>
        <div
          ref={matrixScrollRef}
          style={{ height: '100%', overflowX: 'auto', overflowY: 'auto' }}
        >
          <table style={{
            borderCollapse: 'collapse',
            minWidth: 'max-content',
            fontSize: '12px',
            tableLayout: 'fixed',
          }}>
            {/* ─ Column headers ─ */}
            <thead>
              <tr>
                {/* Sticky top-left corner */}
                <th style={{
                  position: 'sticky', left: 0, top: 0, zIndex: 30,
                  background: 'var(--surface)',
                  width: 200, minWidth: 200,
                  padding: '6px 10px',
                  borderRight: '2px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  textAlign: 'left',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
                  color: 'var(--t3)', textTransform: 'uppercase',
                }}>
                  Assessment
                </th>
                {timeline.map((s, i) => {
                  const isSelected = s.def.key === selectedKey;
                  const isCurrent  = s.status === 'current';
                  const ps2 = phStyle(s.def.phase);
                  return (
                    <th
                      key={s.def.key}
                      ref={isSelected ? selectedColRef : undefined}
                      onClick={() => { setSelectedKey(s.def.key); setActiveTab('assessments'); }}
                      title={s.def.label}
                      style={{
                        position: 'sticky', top: 0, zIndex: 20,
                        width: 52, minWidth: 52,
                        padding: '0',
                        cursor: 'pointer',
                        background: isSelected
                          ? ps2.bg
                          : 'var(--surface)',
                        borderBottom: isSelected
                          ? `3px solid ${ps2.dot}`
                          : '1px solid var(--border)',
                        borderRight: '1px solid var(--border)',
                        textAlign: 'center',
                        transition: 'background 0.15s',
                        verticalAlign: 'bottom',
                      }}
                    >
                      <div style={{ padding: '5px 4px 4px' }}>
                        {isCurrent && (
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: ps2.dot,
                            margin: '0 auto 3px',
                            boxShadow: `0 0 0 2px ${ps2.bg}, 0 0 0 3px ${ps2.dot}`,
                          }} />
                        )}
                        <div style={{
                          fontSize: '10px',
                          fontWeight: isSelected ? 700 : 500,
                          color: isSelected ? ps2.text : (s.status === 'past' ? '#9CA3AF' : 'var(--t2)'),
                          letterSpacing: '0.01em',
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

            {/* ─ Body rows ─ */}
            <tbody>
              {(['Q', 'PR', 'L', 'AD'] as AssessmentCategory[]).map(cat => {
                const rows = matrixRows.filter(r => r.category === cat);
                if (!rows.length) return null;
                const cc = CAT_COLOR[cat];
                return [
                  /* Category header row */
                  <tr key={`cat-${cat}`}>
                    <td
                      colSpan={timeline.length + 1}
                      style={{
                        position: 'sticky', left: 0, zIndex: 10,
                        background: cc.bg,
                        padding: '4px 10px',
                        fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase', color: cc.text,
                        borderTop: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {CAT_LABEL[cat]}
                    </td>
                  </tr>,
                  /* Assessment rows */
                  ...rows.map(row => (
                    <tr key={row.code} style={{ background: 'var(--surface)' }}>
                      {/* Sticky assessment label */}
                      <td style={{
                        position: 'sticky', left: 0, zIndex: 10,
                        background: 'var(--surface)',
                        width: 200, minWidth: 200,
                        padding: '0 10px',
                        borderRight: '2px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        verticalAlign: 'middle',
                      }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '5px',
                          height: '26px',
                        }}>
                          <span style={{ fontSize: '9px', color: 'var(--t3)', fontFamily: 'monospace', letterSpacing: '0.02em', flexShrink: 0 }}>
                            {row.code}
                          </span>
                          <span style={{ fontSize: '11.5px', color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.label}
                          </span>
                        </div>
                      </td>
                      {/* Visit cells */}
                      {timeline.map(s => {
                        const isSelected = s.def.key === selectedKey;
                        const ps2 = phStyle(s.def.phase);
                        const state = matrixCell(s, row.code, isSelected);
                        return (
                          <td
                            key={s.def.key}
                            onClick={() => { setSelectedKey(s.def.key); setActiveTab('assessments'); }}
                            title={`${row.fullLabel} @ ${s.def.label}`}
                            style={{
                              width: 52, minWidth: 52,
                              padding: 0,
                              borderBottom: '1px solid var(--border)',
                              borderRight: '1px solid var(--border)',
                              background: isSelected
                                ? `${ps2.bg}99`
                                : s.status === 'past' ? '#FAFAFA' : 'var(--surface)',
                              cursor: 'pointer',
                              transition: 'background 0.1s',
                            }}
                          >
                            <MatrixCell
                              state={state}
                              phaseColor={ps2.dot}
                              isSelected={isSelected}
                            />
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

      {/* ══ VISIT DETAIL PANEL ══════════════════════════════════════════════ */}
      <div style={{
        flex: 1, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* ─ Visit header ─ */}
        <div style={{
          flexShrink: 0,
          background: ps.bg,
          borderBottom: `1px solid ${ps.border}`,
          padding: '10px 16px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <span style={{
                fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.06em',
                background: 'rgba(255,255,255,0.7)', color: ps.text,
                border: `1px solid ${ps.border}`, borderRadius: '3px',
                padding: '1px 6px', textTransform: 'uppercase',
              }}>
                {snap.def.phase} phase
              </span>
              <VisitStatusBadge status={snap.status} />
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: ps.text, lineHeight: 1.2 }}>
              {snap.def.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '3px', flexWrap: 'wrap' }}>
              {snap.estimatedDate && (
                <span style={{ fontSize: '12px', color: ps.text, opacity: 0.8, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={11} />
                  {snap.status === 'future' ? 'Est. ' : ''}{fmtDate(snap.estimatedDate)}{visitWindow}
                </span>
              )}
              {snap.status === 'current' && completionSummary && (
                <span style={{ fontSize: '12px', color: ps.text, opacity: 0.8, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    display: 'inline-block', width: '80px', height: '5px',
                    borderRadius: '3px', background: 'rgba(255,255,255,0.4)', overflow: 'hidden',
                  }}>
                    <span style={{
                      display: 'block', height: '100%', borderRadius: '3px',
                      background: ps.dot, width: `${completionSummary.pct}%`, transition: 'width 0.3s',
                    }} />
                  </span>
                  {completionSummary.done}/{completionSummary.total} tasks · {completionSummary.pct}%
                </span>
              )}
            </div>
          </div>
          {/* Visit navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => goTo(selectedIdx - 1)}
              disabled={selectedIdx <= 0}
              aria-label="Previous visit"
              style={{
                background: 'rgba(255,255,255,0.6)', border: `1px solid ${ps.border}`,
                borderRadius: '6px', padding: '5px', cursor: selectedIdx <= 0 ? 'default' : 'pointer',
                color: ps.text, opacity: selectedIdx <= 0 ? 0.35 : 1, display: 'flex',
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '10px', color: ps.text, opacity: 0.7, minWidth: '48px', textAlign: 'center' }}>
              {selectedIdx + 1} / {timeline.length}
            </span>
            <button
              onClick={() => goTo(selectedIdx + 1)}
              disabled={selectedIdx >= timeline.length - 1}
              aria-label="Next visit"
              style={{
                background: 'rgba(255,255,255,0.6)', border: `1px solid ${ps.border}`,
                borderRadius: '6px', padding: '5px', cursor: selectedIdx >= timeline.length - 1 ? 'default' : 'pointer',
                color: ps.text, opacity: selectedIdx >= timeline.length - 1 ? 0.35 : 1, display: 'flex',
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* ─ Tabs ─ */}
        <TabBar
          active={activeTab}
          onChange={setActiveTab}
          logCount={visitLogs.length}
          docCount={visitDocs.length}
        />

        {/* ─ Tab content ─ */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>

          {/* ── ASSESSMENTS TAB ─────────────────────────────────────────── */}
          {activeTab === 'assessments' && (
            <div style={{ padding: '12px 16px 24px' }}>

              {/* Data integrity notice */}
              {snap.status !== 'current' && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                  padding: '8px 12px', borderRadius: '6px', marginBottom: '14px',
                  background: snap.status === 'past' ? '#F9FAFB' : '#F0FDF4',
                  border: `1px solid ${snap.status === 'past' ? '#E5E7EB' : '#BBF7D0'}`,
                  fontSize: '11.5px', color: snap.status === 'past' ? '#6B7280' : '#065F46',
                  lineHeight: 1.5,
                }}>
                  <Info size={13} style={{ marginTop: '1px', flexShrink: 0 }} />
                  {snap.status === 'past'
                    ? 'Retrospective view. Protocol-required assessments are shown per the approved SoA. Per-visit historical completion is not tracked in the current schema — consult the source eCRF for audit-grade records.'
                    : 'Prospective view. Assessments shown are required per the approved SoA. Actual tasks may vary with protocol amendments, patient eligibility, or clinical judgement.'}
                </div>
              )}

              {(['Q', 'PR', 'L', 'AD'] as AssessmentCategory[]).map(cat => {
                const items = groupedAssessments[cat];
                if (!items?.length) return null;
                const cc = CAT_COLOR[cat];
                const catDone  = items.filter(i => i.completed === true).length;
                const catTotal = items.length;
                return (
                  <div key={cat} style={{ marginBottom: '18px' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '5px 10px', borderRadius: '5px',
                      background: cc.bg, border: `1px solid ${cc.border}`,
                      marginBottom: '2px',
                    }}>
                      <span style={{ fontSize: '10.5px', fontWeight: 700, color: cc.text, letterSpacing: '0.04em', flex: 1 }}>
                        {CAT_LABEL[cat]}
                      </span>
                      <span style={{ fontSize: '10px', color: cc.text, opacity: 0.7 }}>
                        {snap.status === 'current' ? `${catDone}/${catTotal}` : `${catTotal}`}
                      </span>
                    </div>
                    <div style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: '0 0 6px 6px', padding: '0 12px',
                    }}>
                      {items.map(item => (
                        <AssessmentDetailRow key={item.code} item={item} status={snap.status} />
                      ))}
                    </div>
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

          {/* ── COORDINATION TAB ────────────────────────────────────────── */}
          {activeTab === 'coordination' && (
            <div style={{ padding: '12px 16px 24px' }}>

              {/* Visit window card */}
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '14px 16px', marginBottom: '14px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Visit Scheduling
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { label: 'Target Date',    value: fmtDate(snap.estimatedDate) },
                    { label: 'Window',          value: snap.def.window != null ? `±${snap.def.window} days` : 'No window' },
                    { label: 'Window Open',     value: snap.estimatedDate ? fmtDate(new Date(snap.estimatedDate.getTime() - (snap.def.window ?? 0) * 86400000)) : '—' },
                    { label: 'Window Close',    value: snap.estimatedDate ? fmtDate(new Date(snap.estimatedDate.getTime() + (snap.def.window ?? 0) * 86400000)) : '—' },
                    { label: 'Phase',           value: snap.def.phase.toUpperCase() },
                    { label: 'Status',          value: snap.status === 'past' ? 'Completed' : snap.status === 'current' ? 'Active' : 'Upcoming' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: '10px', color: 'var(--t3)', fontWeight: 600, marginBottom: '2px' }}>{label}</div>
                      <div style={{ fontSize: '13px', color: 'var(--t1)', fontWeight: 500 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coordination checklist */}
              {snap.def.coordinationNotes && snap.def.coordinationNotes.length > 0 && (
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: '8px', overflow: 'hidden', marginBottom: '14px',
                }}>
                  <div style={{
                    padding: '10px 14px', borderBottom: '1px solid var(--border)',
                    background: '#EFF6FF',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    fontSize: '11px', fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.04em',
                  }}>
                    <ListChecks size={13} />
                    {snap.status === 'future' ? 'PREPARATION CHECKLIST' : snap.status === 'current' ? 'ACTIVE VISIT NOTES' : 'VISIT REFERENCE NOTES'}
                  </div>
                  <div>
                    {snap.def.coordinationNotes.map((note, idx) => (
                      <div key={idx} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '10px',
                        padding: '9px 14px',
                        borderBottom: idx < (snap.def.coordinationNotes?.length ?? 0) - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        <span style={{
                          flexShrink: 0, width: 18, height: 18,
                          borderRadius: '50%', background: note.startsWith('🚨') ? '#FEE2E2' : '#EFF6FF',
                          border: `1px solid ${note.startsWith('🚨') ? '#FCA5A5' : '#BFDBFE'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '9px', fontWeight: 700,
                          color: note.startsWith('🚨') ? '#DC2626' : '#1D4ED8',
                        }}>
                          {note.startsWith('🚨') ? '!' : idx + 1}
                        </span>
                        <span style={{ fontSize: '12.5px', color: 'var(--t2)', lineHeight: 1.55 }}>
                          {note.replace('🚨 ', '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assessment summary for coordination */}
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '12px 14px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Assessment Load — {snap.assessments.length} required
                </div>
                {(['Q', 'PR', 'L', 'AD'] as AssessmentCategory[]).map(cat => {
                  const items = groupedAssessments[cat];
                  if (!items?.length) return null;
                  const cc = CAT_COLOR[cat];
                  return (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: cc.text, background: cc.bg, border: `1px solid ${cc.border}`, borderRadius: '3px', padding: '1px 6px', minWidth: '24px', textAlign: 'center' }}>
                        {items.length}
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--t2)' }}>{CAT_LABEL[cat]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── NAVIGATOR LOG TAB ───────────────────────────────────────── */}
          {activeTab === 'log' && (
            <div style={{ padding: '0' }}>
              {/* Window info */}
              {snap.estimatedDate && (
                <div style={{
                  padding: '8px 16px', borderBottom: '1px solid var(--border)',
                  background: 'var(--surface)',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '11px', color: 'var(--t3)',
                }}>
                  <Clock size={11} />
                  Showing notes within the visit window: {fmtDate(getVisitDateWindow(snap).from)} — {fmtDate(getVisitDateWindow(snap).to)}
                </div>
              )}

              {visitLogs.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '40px 24px',
                  color: 'var(--t3)', fontSize: '13px',
                }}>
                  <StickyNote size={28} color="var(--border)" style={{ display: 'block', margin: '0 auto 10px' }} />
                  No navigator notes for this visit period.
                  {logs.length > 0 && (
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>
                      {logs.length} total notes exist outside this window.
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {visitLogs.map(entry => (
                    <LogRow key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── DOCUMENTS TAB ───────────────────────────────────────────── */}
          {activeTab === 'documents' && (
            <div style={{ padding: '12px 16px 24px' }}>
              {/* Window info */}
              {snap.estimatedDate && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  marginBottom: '12px', fontSize: '11px', color: 'var(--t3)',
                }}>
                  <Clock size={11} />
                  Documents uploaded within: {fmtDate(getVisitDateWindow(snap).from)} — {fmtDate(getVisitDateWindow(snap).to)}
                </div>
              )}

              {visitDocs.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '32px 24px',
                  color: 'var(--t3)', fontSize: '13px',
                  background: 'var(--surface)', borderRadius: '8px',
                  border: '1px solid var(--border)',
                }}>
                  <FolderOpen size={28} color="var(--border)" style={{ display: 'block', margin: '0 auto 10px' }} />
                  No documents uploaded during this visit period.
                </div>
              ) : (
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: '8px', overflow: 'hidden',
                }}>
                  {visitDocs.map((doc, idx) => {
                    const catColor: Record<string, string> = {
                      ICF: '#1D4ED8', LAB: '#7C3AED', ECG: '#DC2626', IMG: '#D97706', OTHER: '#6B7280',
                    };
                    return (
                      <div key={doc.id} style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '11px 14px',
                        borderBottom: idx < visitDocs.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        <div style={{
                          flexShrink: 0, width: 34, height: 34, borderRadius: '6px',
                          background: '#F3F4F6', border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <FileText size={16} color="var(--t3)" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                            <span style={{
                              fontWeight: 700, fontSize: '9px',
                              color: catColor[doc.category] ?? '#6B7280',
                            }}>
                              {doc.category}
                            </span>
                            <span>{doc.extension}</span>
                            <span>{doc.size}</span>
                            <span>{fmtDate(doc.uploadDate)}</span>
                          </div>
                        </div>
                        {doc.critical && (
                          <BadgeAlert size={14} color="#DC2626" aria-label="Critical document" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* All patient documents summary */}
              {patient.documents.length > visitDocs.length && (
                <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--t3)', textAlign: 'center' }}>
                  {patient.documents.length - visitDocs.length} additional document{patient.documents.length - visitDocs.length !== 1 ? 's' : ''} exist outside this visit window.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <div style={{
        flexShrink: 0,
        padding: '7px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: '10.5px', color: 'var(--t3)',
      }}>
        <span>
          {timeline.filter(s => s.status === 'past').length} consolidated ·{' '}
          {timeline.filter(s => s.status === 'current').length} active ·{' '}
          {timeline.filter(s => s.status === 'future').length} projected ·{' '}
          {timeline.length} total visits
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Info size={10} />
          Read-only · Protocol v{patient.protocolVersion ?? '—'} · ←→ keys to navigate
        </span>
      </div>
    </div>
  );
}
