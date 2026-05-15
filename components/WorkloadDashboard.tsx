'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, Clock, Activity, TrendingUp,
  ChevronDown, RefreshCw, Loader,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import {
  type WorkloadSummary,
  type DeclarativeLog,
  DECLARATIVE_CATEGORY_LABELS,
  getWorkloadSummary,
  getDeclarativeLogsForDate,
} from '@/lib/telemetry';

// ── Constants ─────────────────────────────────────────────────────────────────

const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#84cc16', '#f97316',
];

// Returns the last N ISO dates (YYYY-MM-DD), today first
function lastNDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkloadDashboard() {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [summary, setSummary] = useState<WorkloadSummary | null>(null);
  const [logs, setLogs] = useState<DeclarativeLog[]>([]);
  const [weekSummaries, setWeekSummaries] = useState<WorkloadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const dateOptions = lastNDates(7);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async (date: string, showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [s, l] = await Promise.all([
        getWorkloadSummary(date),
        getDeclarativeLogsForDate(date),
      ]);
      setSummary(s);
      setLogs(l);
    } catch {
      // leave previous state; non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadWeekData = useCallback(async () => {
    try {
      const summaries = await Promise.all(
        lastNDates(7).map(d => getWorkloadSummary(d))
      );
      setWeekSummaries(summaries);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    loadData(selectedDate);
    loadWeekData();
  }, [selectedDate, loadData, loadWeekData]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const fmtDuration = (mins: number) => {
    if (mins === 0) return '0m';
    return mins < 60
      ? `${mins}m`
      : `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? `${mins % 60}m` : ''}`.trim();
  };

  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const today = new Date();
    const date = new Date(y, m - 1, d);
    const isToday =
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
    if (isToday) return 'Today';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[m - 1]} ${d}`;
  };

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const pieData = summary
    ? Object.entries(summary.byCategory).map(([name, value]) => ({ name, value }))
    : [];

  const barData = weekSummaries
    .slice()
    .reverse()
    .map(s => ({
      date: fmtDate(s.date),
      'In-App': s.observationalMinutes,
      'Off-Platform': s.declarativeMinutes,
    }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={18} className="text-blue-600 dark:text-blue-400" />
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Workload Dashboard
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Date selector */}
          <div className="relative">
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="appearance-none bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-lg pl-3 pr-7 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {dateOptions.map(d => (
                <option key={d} value={d}>{fmtDate(d)}</option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400"
            />
          </div>

          {/* Refresh */}
          <button
            onClick={() => loadData(selectedDate, true)}
            disabled={refreshing}
            className="p-1.5 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-neutral-400 gap-2">
          <Loader size={16} className="animate-spin" />
          <span className="text-sm">Loading workload data…</span>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard
              icon={<Clock size={16} className="text-blue-500" />}
              label="Total Time"
              value={fmtDuration(summary?.totalMinutes ?? 0)}
              sub={`${fmtDate(selectedDate)}`}
            />
            <KpiCard
              icon={<Activity size={16} className="text-emerald-500" />}
              label="In-App"
              value={fmtDuration(summary?.observationalMinutes ?? 0)}
              sub="Passive tracking"
            />
            <KpiCard
              icon={<TrendingUp size={16} className="text-amber-500" />}
              label="Off-Platform"
              value={fmtDuration(summary?.declarativeMinutes ?? 0)}
              sub={`${summary?.logCount ?? 0} entries`}
            />
            <KpiCard
              icon={<BarChart2 size={16} className="text-violet-500" />}
              label="UI Events"
              value={String(summary?.eventCount ?? 0)}
              sub="Observational"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Pie chart — time by category */}
            <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-3">
                Time Allocation — {fmtDate(selectedDate)}
              </p>
              {pieData.length === 0 ? (
                <EmptyState label="No activity recorded for this date." />
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        dataKey="value"
                        paddingAngle={2}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => fmtDuration(typeof v === 'number' ? v : 0)}
                        contentStyle={{ fontSize: 11 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="w-full space-y-1">
                    {pieData.map((d, i) => (
                      <li key={d.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: PALETTE[i % PALETTE.length] }}
                          />
                          <span className="text-neutral-700 dark:text-neutral-300 truncate max-w-[140px]">
                            {d.name}
                          </span>
                        </span>
                        <span className="text-neutral-500 dark:text-neutral-400 tabular-nums">
                          {fmtDuration(d.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Bar chart — 7-day trend */}
            <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-3">
                7-Day Workload Trend
              </p>
              {barData.every(d => d['In-App'] === 0 && d['Off-Platform'] === 0) ? (
                <EmptyState label="No activity in the last 7 days." />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} unit="m" />
                    <Tooltip
                      formatter={(v) => fmtDuration(typeof v === 'number' ? v : 0)}
                      contentStyle={{ fontSize: 11 }}
                    />
                    <Bar dataKey="In-App" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Off-Platform" stackId="a" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Declarative log list */}
          {logs.length > 0 && (
            <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-3">
                Off-Platform Entries — {fmtDate(selectedDate)}
              </p>
              <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {logs.map(log => (
                  <div key={log.id} className="py-2.5 flex items-start gap-3">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                          {log.taskLabel}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                          {fmtDuration(log.durationMinutes)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
                        <span>{DECLARATIVE_CATEGORY_LABELS[log.taskCategory]}</span>
                        <span>·</span>
                        <span>{fmtTime(log.timestamp)}</span>
                      </div>
                      {log.notes && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 italic">
                          {log.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold text-neutral-900 dark:text-neutral-100 leading-none">
        {value}
      </p>
      <p className="text-xs text-neutral-400 mt-1">{sub}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[160px]">
      <p className="text-xs text-neutral-400 text-center">{label}</p>
    </div>
  );
}
