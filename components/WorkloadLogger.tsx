'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Plus, X, CheckCircle, ChevronDown, Loader,
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Workload Logger"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-blue-600 dark:text-blue-400" />
            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
              Log Off-Platform Time
            </span>
          </div>
          {!loadingLogs && todayTotalMinutes > 0 && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
              Today: {fmtDuration(todayTotalMinutes)} logged
            </span>
          )}
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors rounded-md p-0.5"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 flex-1">

          {/* Category */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
              <Tag size={12} /> Category
            </label>
            <div className="relative">
              <select
                value={category}
                onChange={e => setCategory(e.target.value as DeclarativeTaskCategory)}
                className="w-full appearance-none bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {CATEGORIES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400"
              />
            </div>
          </div>

          {/* Task description */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
              <AlignLeft size={12} /> Task Description
            </label>
            <input
              type="text"
              value={taskLabel}
              onChange={e => setTaskLabel(e.target.value)}
              placeholder="e.g. Site initiation call with sponsor"
              maxLength={200}
              className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
              <Timer size={12} /> Duration (minutes)
            </label>
            <div className="flex gap-2 flex-wrap">
              {DURATION_PRESETS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDurationMinutes(p)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    durationMinutes === p
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:border-blue-400'
                  }`}
                >
                  {fmtDuration(p)}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={durationMinutes}
              onChange={e => setDurationMinutes(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Or enter exact minutes"
              min={1}
              max={720}
              className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Notes (optional) */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
              <MessageSquare size={12} /> Notes <span className="text-neutral-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional context or follow-up actions"
              rows={2}
              maxLength={500}
              className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Error */}
          {submitError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {submitError}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || submitted}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
              submitted
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white disabled:opacity-60 disabled:cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <><Loader size={14} className="animate-spin" /> Saving…</>
            ) : submitted ? (
              <><CheckCircle size={14} /> Logged</>
            ) : (
              <><Plus size={14} /> Log Time</>
            )}
          </button>
        </form>

        {/* Recent logs for today */}
        {(loadingLogs || recentLogs.length > 0) && (
          <div className="border-t border-neutral-200 dark:border-neutral-700 px-5 pb-5 pt-4">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-3">
              Today&apos;s Entries
            </p>

            {loadingLogs ? (
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Loader size={12} className="animate-spin" /> Loading…
              </div>
            ) : (
              <ul className="space-y-2">
                {recentLogs.map(log => (
                  <li
                    key={log.id}
                    className="flex items-start gap-3 text-xs text-neutral-700 dark:text-neutral-300"
                  >
                    <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{log.taskLabel}</span>
                        <span className="shrink-0 text-neutral-400">
                          {fmtDuration(log.durationMinutes)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-neutral-400 mt-0.5">
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
