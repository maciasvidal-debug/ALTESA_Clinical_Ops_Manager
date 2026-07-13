'use client';

/**
 * OperationsDashboard — Manager roll-up of operational-capture data.
 *
 * This is the structured replacement for the "Do Not Touch (Graph Sum)" tabs of
 * Noela's KPI workbook. Unlike the workbook it:
 *   • rolls up per-site AND cross-site (scope selector) from one dataset;
 *   • filters by date range (the workbook averages whole columns, all-time);
 *   • never renders #DIV/0! — guarded metrics show "—" on an empty sample;
 *   • counts DISTINCT non-compliant patients, not spreadsheet rows;
 *   • separates billing-facing effort from operational study metrics.
 *
 * Patient status (Symptomatic / Asymptomatic / Non-compliant) is DERIVED from
 * the patient list already loaded by the manager — no second data entry.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity, Phone, MessageSquare, Mail, Users, TrendingDown,
  UserCheck, RefreshCw, Loader, Globe, Database, Timer, Clock, AlertTriangle, Download,
} from 'lucide-react';
import type { Patient } from '@/lib/data';
import { getSiteId } from '@/lib/data';
import {
  type OperationsRecord,
  summariseOperations,
  deriveStatusCounts,
  sitesInRecords,
  operationsSummaryToCsv,
  STATUS_LABELS,
  RANDOMIZATION_WINDOW_HOURS,
} from '@/lib/operations';

type RangePreset = 'all' | '7d' | '30d' | 'month';

const RANGE_LABELS: Record<RangePreset, string> = {
  all: 'All time',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
};

function rangeToDates(preset: RangePreset): { from?: string; to?: string } {
  if (preset === 'all') return {};
  const to = new Date();
  const from = new Date();
  if (preset === '7d') from.setDate(to.getDate() - 6);
  else if (preset === '30d') from.setDate(to.getDate() - 29);
  else if (preset === 'month') from.setDate(1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const fmtNum = (n: number | null, digits = 0): string =>
  n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: digits });

const fmtPct = (r: number | null): string => (r == null ? '—' : `${Math.round(r * 100)}%`);

const fmtMinsToHhmm = (mins: number | null): string => {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
};

interface OperationsDashboardProps {
  patients: Patient[];
}

export function OperationsDashboard({ patients }: OperationsDashboardProps) {
  const [records, setRecords] = useState<OperationsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scope, setScope] = useState<string>('ALL');
  const [preset, setPreset] = useState<RangePreset>('all');

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { getAllOperations } = await import('@/lib/db');
      setRecords(await getAllOperations());
    } catch {
      // non-fatal; keep previous
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Sites available = union of sites in records and sites from the patient list.
  const sites = useMemo(() => {
    const s = new Set<string>([...sitesInRecords(records), ...patients.map(getSiteId)]);
    return [...s].filter(Boolean).sort();
  }, [records, patients]);

  // Export the KPIs as CSV — one row per scope (ALL + each site) for the current
  // date range. This is the loop-closing replacement for "email the spreadsheet".
  const exportCsv = useCallback(() => {
    const { from: f, to: t } = rangeToDates(preset);
    const exportScopes = ['ALL', ...sites];
    const csv = operationsSummaryToCsv(records, exportScopes, { from: f, to: t });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ALTESA_Operational_KPIs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [records, sites, preset]);

  const { from, to } = rangeToDates(preset);
  const summary = useMemo(
    () => summariseOperations(records, { scope, from, to }),
    [records, scope, from, to],
  );

  // Status derivation is scoped to the same site as the KPI roll-up.
  const scopedPatients = useMemo(
    () => (scope === 'ALL' ? patients : patients.filter((p) => getSiteId(p) === scope)),
    [patients, scope],
  );
  const statusCounts = useMemo(
    () => deriveStatusCounts(scopedPatients, new Set(summary.patientIdsCurrentlyNonCompliant)),
    [scopedPatients, summary.patientIdsCurrentlyNonCompliant],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-neutral-400 gap-2">
        <Loader size={16} className="animate-spin" />
        <span className="text-sm">Loading operational data…</span>
      </div>
    );
  }

  const empty = records.length === 0;

  return (
    <div className="space-y-6">
      {/* Header + controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-blue-600 dark:text-blue-400" />
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Operational KPIs
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="Site scope"
            className="appearance-none bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="ALL">All sites</option>
            {sites.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as RangePreset)}
            aria-label="Date range"
            className="appearance-none bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {(Object.keys(RANGE_LABELS) as RangePreset[]).map((k) => (
              <option key={k} value={k}>{RANGE_LABELS[k]}</option>
            ))}
          </select>
          <button
            onClick={exportCsv}
            disabled={empty}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 text-xs text-neutral-600 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Export operational KPIs as CSV"
            title="Export operational KPIs as CSV"
          >
            <Download size={13} /> CSV
          </button>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="p-1.5 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {empty && (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No operational data captured yet.
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Coordinators log interactions, referrals, compliance and dropout events from the patient view.
            Derived patient status below is available regardless.
          </p>
        </div>
      )}

      {/* Derived patient status — replaces manual "Patient Status" typing */}
      <Section title="Patient Status" subtitle="Derived from clinical signals — no manual entry">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi icon={<Activity size={16} className="text-rose-500" />} label={STATUS_LABELS.symptomatic} value={String(statusCounts.symptomatic)} />
          <Kpi icon={<UserCheck size={16} className="text-emerald-500" />} label={STATUS_LABELS.asymptomatic} value={String(statusCounts.asymptomatic)} />
          <Kpi icon={<TrendingDown size={16} className="text-amber-500" />} label={STATUS_LABELS.noncompliant} value={String(statusCounts.noncompliant)} />
          <Kpi icon={<Users size={16} className="text-neutral-400" />} label="Tracked patients" value={String(scopedPatients.length)} />
        </div>
      </Section>

      {/* Navigator effort — billing-facing */}
      <Section title="Navigator Effort" subtitle="Contact volume & response — billing-facing">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi icon={<Phone size={16} className="text-blue-500" />} label="Calls" value={String(summary.calls)} />
          <Kpi icon={<MessageSquare size={16} className="text-violet-500" />} label="Texts" value={String(summary.texts)} />
          <Kpi icon={<Mail size={16} className="text-cyan-500" />} label="Emails" value={String(summary.emails)} />
          <Kpi
            icon={<Activity size={16} className="text-emerald-500" />}
            label="Avg response"
            value={fmtMinsToHhmm(summary.avgResponseMinutes)}
            sub={`${summary.inboundCount} inbound`}
          />
        </div>
      </Section>

      {/* Recruitment funnel — operational */}
      <Section title="Recruitment Funnel" subtitle="Referral intake & source">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi icon={<Users size={16} className="text-blue-500" />} label="Reviewed" value={fmtNum(summary.referralsReviewed)} />
          <Kpi
            icon={<UserCheck size={16} className="text-emerald-500" />}
            label="Meet criteria"
            value={fmtNum(summary.referralsMeet)}
            sub={`${fmtPct(summary.meetRatio)} of reviewed`}
          />
          <Kpi icon={<Globe size={16} className="text-cyan-500" />} label="From website" value={fmtNum(summary.recruitedWebsite)} />
          <Kpi icon={<Database size={16} className="text-violet-500" />} label="From database" value={fmtNum(summary.recruitedDatabase)} />
        </div>
      </Section>

      {/* Symptom trigger → office visit — operational */}
      <Section title="Symptom Trigger → Visit" subtitle={`Hours computed from timestamps · ${RANDOMIZATION_WINDOW_HOURS}h randomisation window`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi
            icon={<Timer size={16} className="text-blue-500" />}
            label="Avg trigger→visit"
            value={summary.avgTriggerToVisitHours == null ? '—' : `${fmtNum(summary.avgTriggerToVisitHours, 1)}h`}
          />
          <Kpi icon={<Activity size={16} className="text-violet-500" />} label="Triggers" value={String(summary.triggerCount)} />
          <Kpi icon={<Clock size={16} className="text-amber-500" />} label="Awaiting visit" value={String(summary.triggersPendingVisit)} />
          <Kpi
            icon={<AlertTriangle size={16} className={summary.triggerWindowBreaches > 0 ? 'text-rose-500' : 'text-neutral-400'} />}
            label="Window breaches"
            value={String(summary.triggerWindowBreaches)}
          />
        </div>
      </Section>

      {/* Compliance & retention — operational */}
      <Section title="Compliance & Retention" subtitle="Distinct patients — not spreadsheet rows">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi icon={<TrendingDown size={16} className="text-amber-500" />} label="Currently non-compliant" value={String(summary.patientsCurrentlyNonCompliant)} />
          <Kpi icon={<Activity size={16} className="text-amber-500" />} label="Avg days out" value={fmtNum(summary.avgDaysOutOfCompliance, 1)} />
          <Kpi icon={<UserCheck size={16} className="text-emerald-500" />} label="Dropouts prevented" value={String(summary.dropoutsPrevented)} />
          <Kpi icon={<TrendingDown size={16} className="text-rose-500" />} label="Dropouts" value={String(summary.dropouts)} />
        </div>
      </Section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">{title}</p>
        <p className="text-[11px] text-neutral-400">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 truncate">{label}</span>
      </div>
      <p className="text-xl font-bold text-neutral-900 dark:text-neutral-100 leading-none tabular-nums">{value}</p>
      {sub && <p className="text-xs text-neutral-400 mt-1">{sub}</p>}
    </div>
  );
}
