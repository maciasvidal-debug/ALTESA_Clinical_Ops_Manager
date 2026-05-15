'use client';

/**
 * TimelineNavigator — Bidirectional SoA query panel.
 *
 * Strictly READ-ONLY. No patient state mutations. No DB calls.
 * Querying any visit (past or future) any number of times is safe and idempotent.
 *
 * Visual contract:
 *   Past visits  → muted styling, "Consolidated" badge — protocol-required assessments shown
 *   Current visit → highlighted, live completion indicators
 *   Future visits → outlined/projected styling, "Projected" badge
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  X, ChevronLeft, ChevronRight, CheckCircle2, Circle, MinusCircle,
  Clock, CalendarDays, AlertTriangle, History, Telescope, Activity,
  ClipboardList, Beaker, FileText, Stethoscope, BadgeCheck, Info,
} from 'lucide-react';
import {
  buildPatientTimeline,
  getCurrentVisitKey,
  type VisitSnapshot,
  type AssessmentCategory,
  type AssessmentResult,
} from '@/lib/timeline';
import { type Patient, fmtISO } from '@/lib/data';

// ─── Category metadata ────────────────────────────────────────────────────────

const CAT_META: Record<AssessmentCategory, { label: string; color: string; bg: string }> = {
  Q:  { label: 'Questionnaires & ePRO', color: '#0369A1', bg: '#E0F2FE' },
  PR: { label: 'Procedures & Examinations', color: '#065F46', bg: '#D1FAE5' },
  L:  { label: 'Laboratory Assessments', color: '#7C3AED', bg: '#EDE9FE' },
  AD: { label: 'Administrative & Regulatory', color: '#92400E', bg: '#FEF3C7' },
};

const CAT_ICON: Record<AssessmentCategory, React.ReactNode> = {
  Q:  <ClipboardList size={13} />,
  PR: <Stethoscope size={13} />,
  L:  <Beaker size={13} />,
  AD: <FileText size={13} />,
};

// ─── Phase colors for timeline chips ─────────────────────────────────────────

const PHASE_CHIP: Record<string, { bg: string; text: string; border: string }> = {
  scr:   { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  rescr: { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
  psb:   { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  rv:    { bg: '#FFF1F2', text: '#BE123C', border: '#FECDD3' },
  tx:    { bg: '#FDF4FF', text: '#7E22CE', border: '#E9D5FF' },
  fu:    { bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD' },
};

function phaseChip(phase: string) {
  return PHASE_CHIP[phase] ?? { bg: '#F9FAFB', text: '#374151', border: '#E5E7EB' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return fmtISO(d);
}

function groupByCategory(assessments: AssessmentResult[]) {
  const groups: Partial<Record<AssessmentCategory, AssessmentResult[]>> = {};
  for (const a of assessments) {
    if (!groups[a.category]) groups[a.category] = [];
    groups[a.category]!.push(a);
  }
  return groups;
}

// ─── Assessment row ───────────────────────────────────────────────────────────

function AssessmentRow({ item, status }: { item: AssessmentResult; status: 'past' | 'current' | 'future' }) {
  let icon: React.ReactNode;
  let textColor = 'var(--t2)';

  if (status === 'current') {
    if (item.completed === true) {
      icon = <CheckCircle2 size={16} color="var(--green)" />;
      textColor = 'var(--t1)';
    } else if (item.completed === false) {
      icon = <Circle size={16} color="var(--t3)" />;
    } else {
      icon = <MinusCircle size={16} color="var(--t3)" />;
    }
  } else if (status === 'past') {
    icon = <BadgeCheck size={16} color="#6B7280" />;
    textColor = '#6B7280';
  } else {
    icon = <Circle size={16} color="#9CA3AF" strokeDasharray="3 2" />;
    textColor = '#9CA3AF';
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      padding: '7px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ marginTop: '1px', flexShrink: 0 }}>{icon}</div>
      <div style={{ fontSize: '13px', color: textColor, lineHeight: 1.4 }}>
        {item.label}
        {status === 'current' && item.completed === false && (
          <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--t3)' }}>pending</span>
        )}
      </div>
    </div>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  cat,
  items,
  status,
}: {
  cat: AssessmentCategory;
  items: AssessmentResult[];
  status: 'past' | 'current' | 'future';
}) {
  const meta = CAT_META[cat];
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '4px 8px', borderRadius: '4px',
        background: meta.bg, color: meta.color,
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
        marginBottom: '4px',
      }}>
        {CAT_ICON[cat]}
        {meta.label}
        <span style={{ marginLeft: 'auto', fontWeight: 400 }}>{items.length}</span>
      </div>
      {items.map(item => (
        <AssessmentRow key={item.code} item={item} status={status} />
      ))}
    </div>
  );
}

// ─── Visit status badge ───────────────────────────────────────────────────────

function VisitBadge({ status }: { status: 'past' | 'current' | 'future' }) {
  if (status === 'past') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB',
        borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700,
      }}>
        <History size={11} /> CONSOLIDATED
      </span>
    );
  }
  if (status === 'current') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE',
        borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700,
      }}>
        <Activity size={11} /> ACTIVE VISIT
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0',
      borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700,
    }}>
      <Telescope size={11} /> PROJECTED
    </span>
  );
}

// ─── Timeline chip ────────────────────────────────────────────────────────────

function VisitChip({
  snap,
  selected,
  onClick,
}: {
  snap: VisitSnapshot;
  selected: boolean;
  onClick: () => void;
}) {
  const pc = phaseChip(snap.def.phase);
  const isCurrent = snap.status === 'current';
  const isPast    = snap.status === 'past';

  return (
    <button
      onClick={onClick}
      title={snap.def.label}
      style={{
        flexShrink: 0,
        padding: '4px 10px',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: selected ? 700 : 500,
        border: selected
          ? `2px solid ${pc.text}`
          : `1px solid ${isPast ? '#D1D5DB' : pc.border}`,
        background: selected
          ? pc.bg
          : isPast
          ? '#F9FAFB'
          : isCurrent
          ? pc.bg
          : 'transparent',
        color: selected
          ? pc.text
          : isPast
          ? '#9CA3AF'
          : pc.text,
        cursor: 'pointer',
        position: 'relative',
        minWidth: '44px',
        textAlign: 'center',
        opacity: !selected && isPast ? 0.7 : 1,
        transition: 'all 0.15s',
      }}
    >
      {isCurrent && !selected && (
        <span style={{
          position: 'absolute', top: '-4px', right: '-4px',
          width: '8px', height: '8px',
          background: '#3B82F6', borderRadius: '50%',
          border: '2px solid white',
        }} />
      )}
      {snap.def.shortLabel}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface TimelineNavigatorProps {
  patient: Patient;
  onClose: () => void;
}

export function TimelineNavigator({ patient, onClose }: TimelineNavigatorProps) {
  const timeline = useMemo(() => buildPatientTimeline(patient), [patient]);
  const defaultKey = useMemo(() => getCurrentVisitKey(patient), [patient]);

  const [selectedKey, setSelectedKey] = useState<string>(defaultKey);
  const chipBarRef = useRef<HTMLDivElement>(null);

  const selectedIdx = useMemo(
    () => timeline.findIndex(s => s.def.key === selectedKey),
    [timeline, selectedKey],
  );
  const snapshot = timeline[selectedIdx] ?? timeline[0];

  const goTo = useCallback(
    (idx: number) => {
      if (idx >= 0 && idx < timeline.length) {
        setSelectedKey(timeline[idx].def.key);
      }
    },
    [timeline],
  );

  // Scroll the selected chip into view whenever it changes
  useEffect(() => {
    if (!chipBarRef.current) return;
    const el = chipBarRef.current.querySelector<HTMLButtonElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selectedKey]);

  if (!snapshot) return null;

  const grouped = groupByCategory(snapshot.assessments);
  const catOrder: AssessmentCategory[] = ['Q', 'PR', 'L', 'AD'];
  const pc = phaseChip(snapshot.def.phase);

  const dateStr = fmtDate(snapshot.estimatedDate);
  const windowStr = snapshot.def.window != null ? ` ±${snapshot.def.window}d` : '';

  const totalRequired = snapshot.assessments.length;
  const doneCount = snapshot.assessments.filter(a => a.completed === true).length;
  const pendingCount = snapshot.assessments.filter(a => a.completed === false).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Protocol Timeline Navigator"
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface)',
        borderRadius: '16px 16px 0 0',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
      }}>
        {/* ── Header ── */}
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '12px',
          flexShrink: 0,
        }}>
          <CalendarDays size={20} color="var(--blue)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--t1)' }}>
              Protocol Timeline Navigator
            </div>
            <div style={{ fontSize: '12px', color: 'var(--t3)' }}>
              {patient.id} · {patient.name} · Study Day {patient.studyDay ?? '—'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--t3)', padding: '4px', borderRadius: '6px',
            }}
            aria-label="Close Timeline Navigator"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Data integrity notice ── */}
        <div style={{
          padding: '8px 20px',
          background: '#FFFBEB',
          borderBottom: '1px solid #FEF3C7',
          display: 'flex', alignItems: 'flex-start', gap: '8px',
          flexShrink: 0,
        }}>
          <Info size={14} color="#92400E" style={{ marginTop: '1px', flexShrink: 0 }} />
          <p style={{ fontSize: '11px', color: '#92400E', margin: 0, lineHeight: 1.5 }}>
            <strong>Read-only view.</strong> Past visit panels show <em>protocol-required</em> assessments
            per the approved SoA. Per-visit historical completion data is not stored in the current
            schema — consult the eCRF for audit-grade records. Future visit panels show projected
            protocol requirements for planning purposes only.
          </p>
        </div>

        {/* ── Timeline chip bar ── */}
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <button
              onClick={() => goTo(selectedIdx - 1)}
              disabled={selectedIdx <= 0}
              style={{
                flexShrink: 0, background: 'none', border: '1px solid var(--border)',
                borderRadius: '6px', cursor: selectedIdx <= 0 ? 'default' : 'pointer',
                padding: '5px', color: selectedIdx <= 0 ? 'var(--t3)' : 'var(--t2)',
                opacity: selectedIdx <= 0 ? 0.4 : 1,
              }}
              aria-label="Previous visit"
            >
              <ChevronLeft size={16} />
            </button>

            <div
              ref={chipBarRef}
              style={{
                flex: 1, display: 'flex', gap: '6px',
                overflowX: 'auto', scrollbarWidth: 'none',
                paddingBottom: '2px',
              }}
            >
              {timeline.map(snap => (
                <VisitChip
                  key={snap.def.key}
                  snap={snap}
                  selected={snap.def.key === selectedKey}
                  onClick={() => setSelectedKey(snap.def.key)}
                  // data-selected is set on the DOM element for the scroll-into-view hook
                  {...(snap.def.key === selectedKey ? { 'data-selected': 'true' } as Record<string, string> : {})}
                />
              ))}
            </div>

            <button
              onClick={() => goTo(selectedIdx + 1)}
              disabled={selectedIdx >= timeline.length - 1}
              style={{
                flexShrink: 0, background: 'none', border: '1px solid var(--border)',
                borderRadius: '6px', cursor: selectedIdx >= timeline.length - 1 ? 'default' : 'pointer',
                padding: '5px', color: selectedIdx >= timeline.length - 1 ? 'var(--t3)' : 'var(--t2)',
                opacity: selectedIdx >= timeline.length - 1 ? 0.4 : 1,
              }}
              aria-label="Next visit"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* ── Visit detail panel ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 28px' }}>
          {/* Visit header */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            marginBottom: '12px', gap: '12px', flexWrap: 'wrap',
          }}>
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: pc.bg, color: pc.text,
                border: `1px solid ${pc.border}`,
                borderRadius: '4px', padding: '2px 8px',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
                marginBottom: '6px',
              }}>
                {snapshot.def.phase.toUpperCase()} PHASE
              </div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--t1)' }}>
                {snapshot.def.label}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px', flexWrap: 'wrap' }}>
                <VisitBadge status={snapshot.status} />
                {snapshot.estimatedDate && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--t3)' }}>
                    <Clock size={12} />
                    {snapshot.status === 'past' || snapshot.status === 'current' ? 'Date:' : 'Est. date:'}
                    {' '}{dateStr}{windowStr}
                  </span>
                )}
              </div>
            </div>

            {/* Completion summary (only meaningful for current visit) */}
            {snapshot.status === 'current' && totalRequired > 0 && (
              <div style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '10px 14px',
                fontSize: '12px', color: 'var(--t2)',
                display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px',
              }}>
                <div style={{ fontWeight: 700, color: 'var(--t1)', marginBottom: '2px' }}>
                  Today&apos;s Progress
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={12} color="var(--green)" />
                  {doneCount} completed
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Circle size={12} color="var(--t3)" />
                  {pendingCount} pending
                </div>
                <div style={{
                  marginTop: '4px', height: '4px', borderRadius: '2px',
                  background: 'var(--border)', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: '2px', background: 'var(--green)',
                    width: `${totalRequired > 0 ? Math.round((doneCount / totalRequired) * 100) : 0}%`,
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            )}

            {/* Occurred indicator for past visits */}
            {snapshot.status === 'past' && (
              <div style={{
                background: '#F9FAFB', border: '1px solid #E5E7EB',
                borderRadius: '8px', padding: '10px 14px',
                fontSize: '12px', color: '#6B7280',
                display: 'flex', flexDirection: 'column', gap: '2px',
              }}>
                <div style={{ fontWeight: 700, color: '#374151', marginBottom: '2px' }}>
                  Visit Status
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={12} color="#10B981" />
                  Occurred
                </div>
                <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>
                  {totalRequired} protocol assessments required
                </div>
              </div>
            )}

            {/* Projection note for future visits */}
            {snapshot.status === 'future' && (
              <div style={{
                background: '#F0FDF4', border: '1px solid #BBF7D0',
                borderRadius: '8px', padding: '10px 14px',
                fontSize: '12px', color: '#15803D',
                display: 'flex', flexDirection: 'column', gap: '2px',
              }}>
                <div style={{ fontWeight: 700, color: '#065F46', marginBottom: '2px' }}>
                  Projected Visit
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={12} color="#D97706" />
                  {totalRequired} assessments planned
                </div>
                <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                  Dates are estimates — subject to protocol windows
                </div>
              </div>
            )}
          </div>

          {/* Context strip */}
          <div style={{
            padding: '10px 12px',
            background: snapshot.status === 'current'
              ? '#EFF6FF'
              : snapshot.status === 'past'
              ? '#F9FAFB'
              : '#F0FDF4',
            borderRadius: '6px',
            fontSize: '12px',
            color: snapshot.status === 'current'
              ? '#1E40AF'
              : snapshot.status === 'past'
              ? '#6B7280'
              : '#065F46',
            marginBottom: '16px',
            lineHeight: 1.5,
          }}>
            {snapshot.status === 'past' && (
              <>
                <strong>Retrospective view.</strong> This visit has been completed.
                The assessments listed below were required per the approved Schedule of Assessments
                at this timepoint. For confirmed completion records, consult the eCRF source data.
              </>
            )}
            {snapshot.status === 'current' && (
              <>
                <strong>Active visit.</strong> Real-time task completion is reflected below.
                Completion status is sourced directly from the current visit checklist.
              </>
            )}
            {snapshot.status === 'future' && (
              <>
                <strong>Prospective view.</strong> This visit has not yet occurred.
                The assessments listed below are projected requirements per the approved SoA.
                Actual tasks may vary based on protocol amendments, eligibility, and clinical judgement.
              </>
            )}
          </div>

          {/* Assessment grid by category */}
          {catOrder.map(cat => {
            const items = grouped[cat];
            if (!items?.length) return null;
            return (
              <CategorySection
                key={cat}
                cat={cat}
                items={items}
                status={snapshot.status}
              />
            );
          })}

          {snapshot.assessments.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '32px 0',
              color: 'var(--t3)', fontSize: '14px',
            }}>
              No assessments defined for this visit.
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface)', flexShrink: 0,
          fontSize: '11px', color: 'var(--t3)',
        }}>
          <span>
            Visit {selectedIdx + 1} of {timeline.length} ·{' '}
            {timeline.filter(s => s.status === 'past').length} past,{' '}
            {timeline.filter(s => s.status === 'future').length} projected
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Info size={11} /> Protocol v{patient.protocolVersion ?? '—'} · Read-only
          </span>
        </div>
      </div>
    </div>
  );
}
