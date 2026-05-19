'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, BarChart2, Clock, Activity, TrendingUp,
  ClipboardList, Loader, RefreshCw, Filter,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts';
import {
  type WorkloadSummary,
  type DeclarativeLog,
  type DeclarativeTaskCategory,
  DECLARATIVE_CATEGORY_LABELS,
  getWorkloadSummary,
  getDeclarativeLogsForDate,
} from '@/lib/telemetry';
import { type Patient } from '@/lib/data';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month';

interface StatsScreenProps {
  patients: Patient[];
  onClose: () => void;
  countTasksFn: (p: Patient) => { done: number; total: number };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PALETTE = [
  '#2563EB', '#059669', '#D97706', '#DC2626',
  '#7C3AED', '#0891B2', '#65A30D', '#EA580C',
];

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: 'Last 7 Days',
  month: 'Last 30 Days',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDatesInRange(period: Period): string[] {
  const n = period === 'today' ? 1 : period === 'week' ? 7 : 30;
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function fmtDuration(mins: number): string {
  if (mins === 0) return '0m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtDateShort(iso: string): string {
  const parts = iso.split('-');
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1]} ${day}`;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StatsScreen({ patients, onClose, countTasksFn }: StatsScreenProps) {
  const [period, setPeriod] = useState<Period>('week');
  const [summaries, setSummaries] = useState<WorkloadSummary[]>([]);
  const [logs, setLogs] = useState<DeclarativeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<DeclarativeTaskCategory | 'all'>('all');

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async (p: Period, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const dates = getDatesInRange(p);
    try {
      const [summaryResults, logResults] = await Promise.all([
        Promise.all(dates.map(d => getWorkloadSummary(d))),
        Promise.all(dates.map(d => getDeclarativeLogsForDate(d))),
      ]);

      setSummaries(summaryResults);

      // Flatten, deduplicate by id, sort most-recent first
      const seen = new Set<string>();
      const allLogs = logResults
        .flat()
        .filter(l => {
          if (seen.has(l.id)) return false;
          seen.add(l.id);
          return true;
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setLogs(allLogs);
    } catch {
      // non-fatal — previous state preserved
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(period);
  }, [period, loadData]);

  // Reset category filter when period changes
  useEffect(() => {
    setCategoryFilter('all');
  }, [period]);

  // ── Aggregations ──────────────────────────────────────────────────────────

  const totalMinutes      = summaries.reduce((s, x) => s + x.totalMinutes, 0);
  const inAppMinutes      = summaries.reduce((s, x) => s + x.observationalMinutes, 0);
  const offPlatformMinutes = summaries.reduce((s, x) => s + x.declarativeMinutes, 0);
  const totalLogCount     = summaries.reduce((s, x) => s + x.logCount, 0);

  const aggregatedByCategory: Record<string, number> = {};
  for (const s of summaries) {
    for (const [cat, mins] of Object.entries(s.byCategory)) {
      aggregatedByCategory[cat] = (aggregatedByCategory[cat] ?? 0) + mins;
    }
  }

  const pieData = Object.entries(aggregatedByCategory)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Oldest first for the trend bar chart
  const barData = [...summaries].reverse().map(s => ({
    date: fmtDateShort(s.date),
    'In-App': s.observationalMinutes,
    'Off-Platform': s.declarativeMinutes,
  }));

  const activeCategories = Array.from(
    new Set(logs.map(l => l.taskCategory))
  ) as DeclarativeTaskCategory[];

  const filteredLogs = categoryFilter === 'all'
    ? logs
    : logs.filter(l => l.taskCategory === categoryFilter);

  const hasAnyActivity = barData.some(d => d['In-App'] > 0 || d['Off-Platform'] > 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="screen">
      {/* Header */}
      <div className="hdr">
        <div className="hdr-left">
          <div className="wordmark">ALTE<em>SA</em></div>
          <span className="hdr-context">My Activity</span>
        </div>
        <div className="hdr-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Period selector */}
          <div className="nav-group">
            {(['today', 'week', 'month'] as Period[]).map(p => (
              <button
                key={p}
                type="button"
                className="ibtn"
                onClick={() => setPeriod(p)}
                style={{
                  background: period === p ? 'var(--surface)' : 'transparent',
                  border: `1px solid ${period === p ? 'var(--border)' : 'transparent'}`,
                  color: period === p ? 'var(--t1)' : 'var(--t3)',
                  fontWeight: period === p ? 600 : 400,
                  boxShadow: period === p ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                  minHeight: '36px',
                  padding: '0 14px',
                }}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ibtn"
            onClick={() => loadData(period, true)}
            disabled={refreshing}
            aria-label="Refresh data"
            title="Refresh data"
            style={{ minHeight: '36px', padding: '0 10px' }}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button type="button" className="ibtn" onClick={onClose} title="Back to dashboard">
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="dash">

        {loading ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '80px 0', gap: '10px', color: 'var(--t3)',
          }}>
            <Loader size={16} className="animate-spin" />
            <span style={{ fontSize: '13px' }}>Loading activity data…</span>
          </div>
        ) : (
          <>

            {/* ── KPI Strip ──────────────────────────────────────────────── */}
            <div className="summary" style={{ marginBottom: '20px' }}>
              <div className="sum-cell">
                <div className="sum-v" style={{ fontSize: '22px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={18} style={{ color: 'var(--t3)' }} />
                  {fmtDuration(totalMinutes)}
                </div>
                <div className="sum-l">Total Tracked Time</div>
              </div>
              <div className="sum-cell">
                <div className="sum-v" style={{ fontSize: '22px', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} />
                  {fmtDuration(inAppMinutes)}
                </div>
                <div className="sum-l">In-App Activity</div>
              </div>
              <div className="sum-cell">
                <div className="sum-v" style={{ fontSize: '22px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={18} />
                  {fmtDuration(offPlatformMinutes)}
                </div>
                <div className="sum-l">Off-Platform</div>
              </div>
              <div className="sum-cell">
                <div className="sum-v" style={{ fontSize: '22px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ClipboardList size={18} style={{ color: 'var(--t3)' }} />
                  {totalLogCount}
                </div>
                <div className="sum-l">Log Entries</div>
              </div>
            </div>

            {/* ── Charts row ─────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

              {/* Bar chart — daily trend */}
              <div className="card">
                <div className="card-hdr">
                  <div>
                    <div className="card-title">
                      <BarChart2
                        size={14}
                        style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '6px', color: 'var(--blue)' }}
                      />
                      Daily Workload — {PERIOD_LABELS[period]}
                    </div>
                    <div className="card-sub">In-app vs. off-platform per day</div>
                  </div>
                </div>
                <div style={{ padding: '12px 16px 16px' }}>
                  {!hasAnyActivity ? (
                    <div className="pt-list-empty" style={{ height: '200px' }}>
                      No activity recorded in this period.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={barData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748B' }} unit="m" />
                        <Tooltip
                          formatter={(v) => fmtDuration(typeof v === 'number' ? v : 0)}
                          contentStyle={{
                            fontSize: 11,
                            border: '1px solid #E2E8F0',
                            borderRadius: '6px',
                            background: '#fff',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="In-App" stackId="a" fill="#BFDBFE" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Off-Platform" stackId="a" fill="#2563EB" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Pie chart — by category */}
              <div className="card">
                <div className="card-hdr">
                  <div>
                    <div className="card-title">
                      <Clock
                        size={14}
                        style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '6px', color: 'var(--blue)' }}
                      />
                      Time by Activity
                    </div>
                    <div className="card-sub">Distribution across categories</div>
                  </div>
                </div>
                <div style={{ padding: '12px 16px 16px' }}>
                  {pieData.length === 0 ? (
                    <div className="pt-list-empty" style={{ height: '200px' }}>
                      No logged activity for this period.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
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
                            contentStyle={{
                              fontSize: 11,
                              border: '1px solid #E2E8F0',
                              borderRadius: '6px',
                              background: '#fff',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <ul style={{
                        width: '100%', listStyle: 'none',
                        padding: 0, margin: 0,
                        display: 'flex', flexDirection: 'column', gap: '4px',
                      }}>
                        {pieData.map((d, i) => (
                          <li
                            key={d.name}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: PALETTE[i % PALETTE.length],
                                flexShrink: 0, display: 'inline-block',
                              }} />
                              <span style={{
                                color: 'var(--t2)',
                                maxWidth: '160px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                {d.name}
                              </span>
                            </span>
                            <span style={{ color: 'var(--t3)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                              {fmtDuration(d.value)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Task Progress by Patient ────────────────────────────────── */}
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-hdr">
                <div>
                  <div className="card-title">
                    <ClipboardList
                      size={14}
                      style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '6px', color: 'var(--blue)' }}
                    />
                    Task Progress by Patient
                  </div>
                  <div className="card-sub">Current assessment completion status</div>
                </div>
              </div>
              {patients.length === 0 ? (
                <div className="pt-list-empty">No active patients.</div>
              ) : (
                <div>
                  {/* Column headers */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '130px 1fr 140px 52px',
                    gap: '12px',
                    padding: '6px 18px',
                    background: 'var(--bg)',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    color: 'var(--t3)',
                  }}>
                    <span>Patient</span>
                    <span>Phase</span>
                    <span>Progress</span>
                    <span style={{ textAlign: 'right' }}>Done</span>
                  </div>
                  {patients.map((pt, idx) => {
                    const { done, total } = countTasksFn(pt);
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    const isLast = idx === patients.length - 1;
                    const phaseBadge = (
                      { scr: 'pb-scr', psb: 'pb-psb', rv: 'pb-rv', tx: 'pb-tx', fu: 'pb-fu' }
                    )[pt.phaseCode] ?? 'pb-psb';

                    return (
                      <div
                        key={pt.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '130px 1fr 140px 52px',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '11px 18px',
                          borderBottom: isLast ? 'none' : '1px solid rgba(0,0,0,.04)',
                        }}
                      >
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '13px',
                          fontWeight: 500,
                          color: 'var(--t1)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {pt.id}
                        </span>
                        <span>
                          <span
                            className={`phase-badge ${phaseBadge}`}
                            style={{
                              fontSize: '10px',
                              maxWidth: '220px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                            }}
                            title={pt.phaseLabel}
                          >
                            {pt.phaseLabel}
                          </span>
                        </span>
                        <div>
                          <div className="pt-progress-container" style={{ marginTop: 0 }}>
                            <div
                              className={`pt-progress-fill${pct === 100 ? ' done' : ''}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span style={{
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)',
                          color: pct === 100 ? 'var(--green)' : 'var(--t2)',
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                        }}>
                          {done}/{total}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Off-Platform Activity Log ───────────────────────────────── */}
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-hdr" style={{ flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div className="card-title">
                    <TrendingUp
                      size={14}
                      style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '6px', color: 'var(--blue)' }}
                    />
                    Off-Platform Activity Log
                  </div>
                  <div className="card-sub">
                    {logs.length} {logs.length === 1 ? 'entry' : 'entries'} in period
                    {categoryFilter !== 'all' && filteredLogs.length !== logs.length
                      ? ` · ${filteredLogs.length} shown`
                      : ''}
                  </div>
                </div>
                {activeCategories.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                    <Filter size={12} style={{ color: 'var(--t3)', flexShrink: 0 }} />
                    <select
                      className="modal-input"
                      value={categoryFilter}
                      onChange={e => setCategoryFilter(e.target.value as DeclarativeTaskCategory | 'all')}
                      style={{ minHeight: 'unset', padding: '4px 10px', fontSize: '11px', width: 'auto' }}
                    >
                      <option value="all">All Categories</option>
                      {activeCategories.map(cat => (
                        <option key={cat} value={cat}>{DECLARATIVE_CATEGORY_LABELS[cat]}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {logs.length === 0 ? (
                <div className="pt-list-empty">
                  No off-platform time logged in this period.
                  Use the <strong>Log Time</strong> button to record off-platform activities.
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="pt-list-empty">No entries for the selected category.</div>
              ) : (
                <div>
                  {filteredLogs.map((log, idx) => {
                    const isLast = idx === filteredLogs.length - 1;
                    return (
                      <div
                        key={log.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          padding: '12px 18px',
                          borderBottom: isLast ? 'none' : '1px solid rgba(0,0,0,.04)',
                        }}
                      >
                        <span style={{
                          marginTop: '5px', width: '6px', height: '6px', borderRadius: '50%',
                          background: 'var(--blue)', flexShrink: 0, display: 'inline-block',
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                          }}>
                            <span style={{
                              fontSize: '13px',
                              fontWeight: 500,
                              color: 'var(--t1)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {log.taskLabel}
                            </span>
                            <span style={{
                              flexShrink: 0,
                              fontSize: '11px',
                              fontWeight: 600,
                              color: 'var(--green)',
                              background: 'var(--green-bg)',
                              border: '1px solid var(--green-mid)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontFamily: 'var(--font-mono)',
                            }}>
                              {fmtDuration(log.durationMinutes)}
                            </span>
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '11px',
                            color: 'var(--t3)',
                            marginTop: '3px',
                            flexWrap: 'wrap',
                          }}>
                            <span style={{
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              padding: '1px 6px',
                              fontSize: '10px',
                            }}>
                              {DECLARATIVE_CATEGORY_LABELS[log.taskCategory]}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{fmtDateShort(log.timestamp.slice(0, 10))}</span>
                            <span aria-hidden="true">·</span>
                            <span>{fmtTime(log.timestamp)}</span>
                          </div>
                          {log.notes && (
                            <p style={{
                              fontSize: '11px',
                              color: 'var(--t3)',
                              marginTop: '4px',
                              fontStyle: 'italic',
                              lineHeight: '1.5',
                            }}>
                              {log.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </>
        )}
      </div>
    </div>
  );
}
