'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Plus, X, CheckCircle, Loader,
  AlignLeft, Tag, Timer, MessageSquare,
} from 'lucide-react';
import {
  type DeclarativeTaskCategory,
  type DeclarativeLog,
  DECLARATIVE_CATEGORY_LABELS,
  submitDeclarativeLog,
  getDeclarativeLogsForDate,
} from '@/lib/telemetry';

// ── Props ─────────────────────────────────────────────────────────────────────

interface WorkloadLoggerProps {
  onClose: () => void;
  userId: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = Object.entries(DECLARATIVE_CATEGORY_LABELS) as [
  DeclarativeTaskCategory,
  string,
][];

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkloadLogger({ onClose }: WorkloadLoggerProps) {
  // Form state
  const [category, setCategory] = useState<DeclarativeTaskCategory>('administrative');
  const [taskLabel, setTaskLabel] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Recent logs
  const [recentLogs, setRecentLogs] = useState<DeclarativeLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // ── Load today's declarative logs ────────────────────────────────────────

  const loadRecentLogs = useCallback(async () => {
    try {
      const logs = await getDeclarativeLogsForDate();
      setRecentLogs(logs);
    } catch {
      // non-critical; leave empty
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    loadRecentLogs();
  }, [loadRecentLogs]);

  // ── Form submission ───────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const mins = Number(durationMinutes);
    if (!taskLabel.trim()) {
      setSubmitError('Please describe the task.');
      return;
    }
    if (!mins || mins <= 0 || !Number.isFinite(mins)) {
      setSubmitError('Please enter a valid duration (minutes > 0).');
      return;
    }
    if (mins > 720) {
      setSubmitError('Duration cannot exceed 12 hours (720 minutes).');
      return;
    }

    setSubmitting(true);
    try {
      await submitDeclarativeLog({
        taskCategory: category,
        taskLabel,
        durationMinutes: mins,
        notes: notes || undefined,
      });

      setSubmitted(true);
      setTaskLabel('');
      setDurationMinutes('');
      setNotes('');

      await loadRecentLogs();
      setTimeout(() => setSubmitted(false), 2000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save log entry.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const todayTotalMinutes = recentLogs.reduce((s, l) => s + l.durationMinutes, 0);

  const fmtDuration = (mins: number) =>
    mins < 60
      ? `${mins}m`
      : `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? `${mins % 60}m` : ''}`.trim();

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh', overflowY: 'auto', maxWidth: '480px' }}
        role="dialog"
        aria-modal="true"
        aria-label="Log Off-Platform Time"
      >
        {/* Header */}
        <div className="modal-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} style={{ color: 'var(--blue)', flexShrink: 0 }} />
            <div className="modal-title">Log Off-Platform Time</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!loadingLogs && todayTotalMinutes > 0 && (
              <span style={{
                fontSize: '11px', color: 'var(--t3)',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '100px', padding: '2px 8px', whiteSpace: 'nowrap',
              }}>
                Today: {fmtDuration(todayTotalMinutes)} logged
              </span>
            )}
            <button type="button" className="ibtn" onClick={onClose} aria-label="Close">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body">

            {/* Category */}
            <div style={{ marginBottom: '20px' }}>
              <label className="modal-label">
                <Tag size={12} aria-hidden="true" /> Category
              </label>
              <select
                className="modal-input"
                value={category}
                onChange={e => setCategory(e.target.value as DeclarativeTaskCategory)}
              >
                {CATEGORIES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Task description */}
            <div style={{ marginBottom: '20px' }}>
              <label className="modal-label">
                <AlignLeft size={12} aria-hidden="true" /> Task Description
              </label>
              <input
                type="text"
                className="modal-input"
                value={taskLabel}
                onChange={e => setTaskLabel(e.target.value)}
                placeholder="e.g. Site initiation call with sponsor"
                maxLength={200}
                autoComplete="off"
              />
            </div>

            {/* Duration */}
            <div style={{ marginBottom: '20px' }}>
              <label className="modal-label">
                <Timer size={12} aria-hidden="true" /> Duration (minutes)
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {DURATION_PRESETS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setDurationMinutes(p)}
                    style={{
                      fontSize: '11px',
                      padding: '4px 12px',
                      borderRadius: '100px',
                      border: `1px solid ${durationMinutes === p ? 'var(--blue)' : 'var(--border2)'}`,
                      background: durationMinutes === p ? 'var(--blue)' : 'var(--bg)',
                      color: durationMinutes === p ? '#fff' : 'var(--t2)',
                      cursor: 'pointer',
                      transition: 'all 140ms var(--ease)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {fmtDuration(p)}
                  </button>
                ))}
              </div>
              <input
                type="number"
                className="modal-input"
                value={durationMinutes}
                onChange={e => setDurationMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Or enter exact minutes"
                min={1}
                max={720}
              />
            </div>

            {/* Notes (optional) */}
            <div style={{ marginBottom: submitError ? '20px' : '0' }}>
              <label className="modal-label">
                <MessageSquare size={12} aria-hidden="true" /> Notes{' '}
                <span style={{ color: 'var(--t4)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  (optional)
                </span>
              </label>
              <textarea
                className="modal-input"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Additional context or follow-up actions"
                rows={2}
                maxLength={500}
                style={{ resize: 'none', minHeight: 'auto' }}
              />
            </div>

            {/* Error */}
            {submitError && (
              <div style={{
                padding: '10px 12px',
                background: 'var(--red-bg)',
                border: '1px solid var(--red-mid)',
                borderRadius: 'var(--r1)',
                color: 'var(--red)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                {submitError}
              </div>
            )}

          </div>

          {/* Submit */}
          <div className="modal-footer">
            <button
              type="submit"
              disabled={submitting || submitted}
              className={submitted ? 'btn btn-success' : 'btn btn-primary'}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              {submitting ? (
                <><Loader size={14} className="animate-spin" /> Saving…</>
              ) : submitted ? (
                <><CheckCircle size={14} /> Logged</>
              ) : (
                <><Plus size={14} /> Log Time</>
              )}
            </button>
          </div>
        </form>

        {/* Recent logs for today */}
        {(loadingLogs || recentLogs.length > 0) && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '16px 24px 20px' }}>
            <p style={{
              fontSize: '11px', fontWeight: 700, color: 'var(--t3)',
              textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '10px',
            }}>
              Today&apos;s Entries
            </p>

            {loadingLogs ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--t4)' }}>
                <Loader size={12} className="animate-spin" /> Loading…
              </div>
            ) : (
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '8px', listStyle: 'none', padding: 0, margin: 0 }}>
                {recentLogs.map(log => (
                  <li
                    key={log.id}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12px', color: 'var(--t2)' }}
                  >
                    <span style={{
                      marginTop: '5px', width: '6px', height: '6px', borderRadius: '50%',
                      background: 'var(--blue)', flexShrink: 0, display: 'inline-block',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.taskLabel}
                        </span>
                        <span style={{ flexShrink: 0, color: 'var(--t3)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                          {fmtDuration(log.durationMinutes)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--t3)', fontSize: '11px', marginTop: '2px' }}>
                        <span>{DECLARATIVE_CATEGORY_LABELS[log.taskCategory]}</span>
                        <span>·</span>
                        <span>{fmtTime(log.timestamp)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
