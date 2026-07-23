'use client';

/**
 * OperationsCapture — coordinator-facing capture for the operational KPIs the
 * manager needs, replacing Noela's per-site spreadsheet tabs.
 *
 * One modal, four point-of-care forms:
 *   • Interaction  — contact channel + direction + effort + no-PHI synopsis
 *   • Referral     — recruitment-funnel intake batch
 *   • Compliance   — 80%-adherence fall-out / recovery window
 *   • Dropout      — withdrawal intent / retention
 *
 * The spreadsheet's "Patient Status" column is deliberately absent: status is
 * DERIVED (see lib/operations.deriveOpStatus), so the coordinator never types it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Phone, MessageSquare, Mail, MoreHorizontal, CheckCircle, Loader,
  ArrowUpRight, ArrowDownLeft, Users, TrendingDown, LogOut, Zap,
} from 'lucide-react';
import type { Patient } from '@/lib/data';
import { getSiteId } from '@/lib/data';
import {
  type InteractionChannel,
  type InteractionDirection,
  submitInteraction,
  submitReferralIntake,
  submitComplianceEvent,
  submitDropoutEvent,
  submitTriggerEvent,
  completeTriggerVisit,
  findOpenTrigger,
  setOperationsUser,
  hoursBetween,
  RANDOMIZATION_WINDOW_HOURS,
  type OperationsRecord,
} from '@/lib/operations';

/** ISO datetime → the `YYYY-MM-DDTHH:mm` shape a datetime-local input expects. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Tab = 'interaction' | 'referral' | 'compliance' | 'dropout' | 'trigger';

interface OperationsCaptureProps {
  onClose: () => void;
  patients: Patient[];
  userId?: string;
  defaultPatientId?: string;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'interaction', label: 'Interaction' },
  { id: 'trigger', label: 'Trigger' },
  { id: 'referral', label: 'Referral' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'dropout', label: 'Dropout' },
];

const CHANNELS: { id: InteractionChannel; label: string; icon: React.ReactNode }[] = [
  { id: 'call', label: 'Call', icon: <Phone size={13} /> },
  { id: 'text', label: 'Text', icon: <MessageSquare size={13} /> },
  { id: 'email', label: 'Email', icon: <Mail size={13} /> },
  { id: 'other', label: 'Other', icon: <MoreHorizontal size={13} /> },
];

const EFFORT_PRESETS = [5, 10, 15, 30];

const todayISO = () => new Date().toISOString().slice(0, 10);

export function OperationsCapture({ onClose, patients, userId, defaultPatientId }: OperationsCaptureProps) {
  const [tab, setTab] = useState<Tab>('interaction');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (userId) setOperationsUser(userId); }, [userId]);

  const sites = useMemo(
    () => [...new Set(patients.map(getSiteId).filter(Boolean))].sort(),
    [patients],
  );
  const defaultPatient = defaultPatientId
    ? patients.find((p) => p.id === defaultPatientId)
    : undefined;
  const defaultSite = defaultPatient ? getSiteId(defaultPatient) : (sites[0] ?? '');

  // ── Interaction form ──────────────────────────────────────────────────────
  const [iPatient, setIPatient] = useState<string>(defaultPatientId ?? '');
  const [iChannel, setIChannel] = useState<InteractionChannel>('call');
  const [iDirection, setIDirection] = useState<InteractionDirection>('outbound');
  const [iResponse, setIResponse] = useState<string>('');
  const [iEffort, setIEffort] = useState<number | ''>('');
  const [iSynopsis, setISynopsis] = useState('');

  // ── Referral form ─────────────────────────────────────────────────────────
  const [rSite, setRSite] = useState<string>(defaultSite);
  const [rReviewed, setRReviewed] = useState<string>('');
  const [rMeet, setRMeet] = useState<string>('');
  const [rNotMeet, setRNotMeet] = useState<string>('');
  const [rWeb, setRWeb] = useState<string>('');
  const [rDb, setRDb] = useState<string>('');

  // ── Compliance form ───────────────────────────────────────────────────────
  const [cPatient, setCPatient] = useState<string>(defaultPatientId ?? '');
  const [cFellOut, setCFellOut] = useState<string>(todayISO());
  const [cReturned, setCReturned] = useState<string>('');
  const [cReason, setCReason] = useState('');

  // ── Trigger form ──────────────────────────────────────────────────────────
  const [tPatient, setTPatient] = useState<string>(defaultPatientId ?? '');
  const [tTrigger, setTTrigger] = useState<string>('');
  const [tVisit, setTVisit] = useState<string>('');
  // Existing OPEN trigger (auto-created when the DTQ turned positive), if any.
  const [opsRecords, setOpsRecords] = useState<OperationsRecord[]>([]);
  const [openTriggerId, setOpenTriggerId] = useState<string | null>(null);

  // Load operational records once so the Trigger tab can pre-fill / complete an
  // auto-created onset instead of asking the coordinator to re-type it.
  const reloadOps = async () => {
    try {
      const { getAllOperations } = await import('@/lib/db');
      setOpsRecords(await getAllOperations());
    } catch { /* non-fatal */ }
  };
  useEffect(() => { reloadOps(); }, []);

  // Tracks whether the onset field currently holds an auto-filled value, so that
  // switching to a patient WITHOUT an open trigger clears the stale onset without
  // wiping a legitimately hand-typed manual entry.
  const triggerAutoFilledRef = useRef(false);

  // When a patient is chosen for the Trigger tab, pre-fill from their open
  // trigger (the DTQ-positive onset). If none exists, clear only a previously
  // auto-filled value; manual entry is preserved.
  useEffect(() => {
    const open = tPatient ? findOpenTrigger(opsRecords, tPatient) : null;
    setOpenTriggerId(open?.id ?? null);
    if (open) {
      setTTrigger(toLocalInput(open.triggerAt));
      triggerAutoFilledRef.current = true;
    } else if (triggerAutoFilledRef.current) {
      setTTrigger('');
      triggerAutoFilledRef.current = false;
    }
  }, [tPatient, opsRecords]);

  // ── Dropout form ──────────────────────────────────────────────────────────
  const [dPatient, setDPatient] = useState<string>(defaultPatientId ?? '');
  const [dIntent, setDIntent] = useState<string>('');
  const [dDropout, setDDropout] = useState<string>('');
  const [dPrevent, setDPrevent] = useState('');
  const [dReason, setDReason] = useState('');

  const patientSite = (id: string) => {
    const p = patients.find((x) => x.id === id);
    return p ? getSiteId(p) : defaultSite;
  };

  const flash = () => {
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 1600);
  };

  const num = (s: string): number => {
    const v = Number(s);
    return Number.isFinite(v) ? v : 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (tab === 'interaction') {
        const site = iPatient ? patientSite(iPatient) : (sites[0] ?? defaultSite);
        if (!site) throw new Error('No site available. Add a patient first.');
        await submitInteraction({
          siteId: site,
          patientId: iPatient || undefined,
          channel: iChannel,
          direction: iDirection,
          responseMinutes: iDirection === 'inbound' && iResponse ? num(iResponse) : undefined,
          effortMinutes: iEffort === '' ? undefined : Number(iEffort),
          synopsis: iSynopsis || undefined,
        });
        setIResponse(''); setIEffort(''); setISynopsis('');
      } else if (tab === 'referral') {
        if (!rSite) throw new Error('Select a site.');
        await submitReferralIntake({
          siteId: rSite,
          reviewed: num(rReviewed),
          meetsCriteria: num(rMeet),
          doesNotMeet: num(rNotMeet),
          recruitedFromWebsite: num(rWeb),
          recruitedFromDatabase: num(rDb),
        });
        setRReviewed(''); setRMeet(''); setRNotMeet(''); setRWeb(''); setRDb('');
      } else if (tab === 'compliance') {
        if (!cPatient) throw new Error('Select a patient.');
        await submitComplianceEvent({
          siteId: patientSite(cPatient),
          patientId: cPatient,
          fellOutDate: cFellOut,
          returnedDate: cReturned || undefined,
          reason: cReason || undefined,
        });
        setCReturned(''); setCReason('');
      } else if (tab === 'trigger') {
        if (!tPatient) throw new Error('Select a patient.');
        if (openTriggerId) {
          // Completing the auto-created onset — only the office visit is needed.
          if (!tVisit) throw new Error('Enter the office visit date & time.');
          await completeTriggerVisit(openTriggerId, tVisit);
        } else {
          if (!tTrigger) throw new Error('Enter the trigger date & time.');
          await submitTriggerEvent({
            siteId: patientSite(tPatient),
            patientId: tPatient,
            triggerAt: tTrigger,
            officeVisitAt: tVisit || undefined,
          });
        }
        setTTrigger(''); setTVisit(''); setOpenTriggerId(null);
        triggerAutoFilledRef.current = false;
        await reloadOps();
      } else {
        if (!dPatient) throw new Error('Select a patient.');
        if (!dIntent && !dDropout) throw new Error('Enter an intent date or a dropout date.');
        await submitDropoutEvent({
          siteId: patientSite(dPatient),
          patientId: dPatient,
          intentDate: dIntent || undefined,
          dropoutDate: dDropout || undefined,
          preventionAction: dPrevent || undefined,
          reason: dReason || undefined,
        });
        setDIntent(''); setDDropout(''); setDPrevent(''); setDReason('');
      }
      flash();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSubmitting(false);
    }
  };

  const patientOptions = (allowEmpty: boolean, emptyLabel: string) => (
    <>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {patients.map((p) => (
        <option key={p.id} value={p.id}>{p.id} — {getSiteId(p)}</option>
      ))}
    </>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '92vh', overflowY: 'auto', maxWidth: '520px' }}
        role="dialog"
        aria-modal="true"
        aria-label="Capture operational data"
      >
        {/* Header */}
        <div className="modal-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} style={{ color: 'var(--blue)', flexShrink: 0 }} />
            <div className="modal-title">Operational Capture</div>
          </div>
          <button type="button" className="ibtn" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', padding: '12px 24px 0', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setError(null); }}
              style={{
                fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '8px',
                border: `1px solid ${tab === t.id ? 'var(--blue)' : 'var(--border)'}`,
                background: tab === t.id ? 'var(--blue)' : 'var(--bg)',
                color: tab === t.id ? '#fff' : 'var(--t2)', cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">

            {tab === 'interaction' && (
              <>
                <Field label="Patient (optional)">
                  <select className="modal-input" value={iPatient} onChange={(e) => setIPatient(e.target.value)}>
                    {patientOptions(true, 'General / no specific patient')}
                  </select>
                </Field>

                <Field label="Channel">
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {CHANNELS.map((c) => (
                      <Pill key={c.id} active={iChannel === c.id} onClick={() => setIChannel(c.id)}>
                        {c.icon} {c.label}
                      </Pill>
                    ))}
                  </div>
                </Field>

                <Field label="Direction">
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Pill active={iDirection === 'outbound'} onClick={() => setIDirection('outbound')}>
                      <ArrowUpRight size={13} /> We reached out
                    </Pill>
                    <Pill active={iDirection === 'inbound'} onClick={() => setIDirection('inbound')}>
                      <ArrowDownLeft size={13} /> Patient reached out
                    </Pill>
                  </div>
                </Field>

                {iDirection === 'inbound' && (
                  <Field label="Time to response (minutes)">
                    <input type="number" min={0} className="modal-input" value={iResponse}
                      onChange={(e) => setIResponse(e.target.value)} placeholder="e.g. 30" />
                  </Field>
                )}

                <Field label="Effort (minutes, optional)">
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    {EFFORT_PRESETS.map((p) => (
                      <Pill key={p} active={iEffort === p} onClick={() => setIEffort(p)}>{p}m</Pill>
                    ))}
                  </div>
                  <input type="number" min={0} className="modal-input" value={iEffort}
                    onChange={(e) => setIEffort(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Or exact minutes" />
                </Field>

                <Field label="Synopsis — no PHI (optional)">
                  <textarea className="modal-input" rows={2} maxLength={500} value={iSynopsis}
                    onChange={(e) => setISynopsis(e.target.value)}
                    placeholder="Brief context — emails/phones are auto-redacted"
                    style={{ resize: 'none' }} />
                </Field>
              </>
            )}

            {tab === 'referral' && (
              <>
                <Field label="Site">
                  <select className="modal-input" value={rSite} onChange={(e) => setRSite(e.target.value)}>
                    {sites.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Row>
                  <Field label="Reviewed"><NumInput value={rReviewed} onChange={setRReviewed} /></Field>
                  <Field label="Meet criteria"><NumInput value={rMeet} onChange={setRMeet} /></Field>
                  <Field label="Do not meet"><NumInput value={rNotMeet} onChange={setRNotMeet} /></Field>
                </Row>
                <Row>
                  <Field label="From website"><NumInput value={rWeb} onChange={setRWeb} /></Field>
                  <Field label="From database"><NumInput value={rDb} onChange={setRDb} /></Field>
                </Row>
              </>
            )}

            {tab === 'trigger' && (
              <>
                <Field label="Patient">
                  <select className="modal-input" value={tPatient} onChange={(e) => setTPatient(e.target.value)}>
                    {patientOptions(true, 'Select patient…')}
                  </select>
                </Field>
                {openTriggerId && (
                  <div style={{
                    marginBottom: '16px', padding: '8px 12px', borderRadius: 'var(--r1)', fontSize: '12px',
                    background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <Zap size={13} /> Onset auto-filled from the DTQ-positive check — just add the office visit to complete it.
                  </div>
                )}
                <Row>
                  <Field label={openTriggerId ? 'ePRO trigger (from DTQ)' : 'ePRO trigger (symptom onset)'}>
                    <input type="datetime-local" className="modal-input" value={tTrigger}
                      onChange={(e) => setTTrigger(e.target.value)}
                      readOnly={!!openTriggerId}
                      style={openTriggerId ? { background: 'var(--bg)', color: 'var(--t3)', cursor: 'not-allowed' } : undefined} />
                  </Field>
                  <Field label={openTriggerId ? 'Office visit' : 'Office visit (optional)'}>
                    <input type="datetime-local" className="modal-input" value={tVisit}
                      onChange={(e) => setTVisit(e.target.value)} />
                  </Field>
                </Row>
                <TriggerPreview triggerAt={tTrigger} visitAt={tVisit} />
                <Hint>Hours are computed from the two timestamps — no manual math. {openTriggerId ? 'The onset was captured when the DTQ turned positive.' : 'Leave the visit empty until the patient attends.'}</Hint>
              </>
            )}

            {tab === 'compliance' && (
              <>
                <Field label="Patient">
                  <select className="modal-input" value={cPatient} onChange={(e) => setCPatient(e.target.value)}>
                    {patientOptions(true, 'Select patient…')}
                  </select>
                </Field>
                <Row>
                  <Field label="Fell below 80% on">
                    <input type="date" className="modal-input" value={cFellOut} onChange={(e) => setCFellOut(e.target.value)} />
                  </Field>
                  <Field label="Back to ≥80% on (optional)">
                    <input type="date" className="modal-input" value={cReturned} onChange={(e) => setCReturned(e.target.value)} />
                  </Field>
                </Row>
                <Field label="Reason (optional)">
                  <input type="text" className="modal-input" value={cReason} onChange={(e) => setCReason(e.target.value)}
                    placeholder="e.g. device sync issue, travel" />
                </Field>
                <Hint>Leave the recovery date empty while the patient is still out of compliance.</Hint>
              </>
            )}

            {tab === 'dropout' && (
              <>
                <Field label="Patient">
                  <select className="modal-input" value={dPatient} onChange={(e) => setDPatient(e.target.value)}>
                    {patientOptions(true, 'Select patient…')}
                  </select>
                </Field>
                <Row>
                  <Field label="Expressed intent on (optional)">
                    <input type="date" className="modal-input" value={dIntent} onChange={(e) => setDIntent(e.target.value)} />
                  </Field>
                  <Field label="Actually dropped out on (optional)">
                    <input type="date" className="modal-input" value={dDropout} onChange={(e) => setDDropout(e.target.value)} />
                  </Field>
                </Row>
                <Field label="Prevention action (optional)">
                  <input type="text" className="modal-input" value={dPrevent} onChange={(e) => setDPrevent(e.target.value)}
                    placeholder="What was done to retain the patient" />
                </Field>
                <Field label="Reason (optional)">
                  <input type="text" className="modal-input" value={dReason} onChange={(e) => setDReason(e.target.value)}
                    placeholder="Reason for withdrawal" />
                </Field>
                <Hint>Intent without a dropout date + a prevention action counts as a prevented dropout.</Hint>
              </>
            )}

            {error && (
              <div style={{
                marginTop: '12px', padding: '10px 12px', background: 'var(--red-bg)',
                border: '1px solid var(--red-mid)', borderRadius: 'var(--r1)',
                color: 'var(--red)', fontSize: '12px',
              }}>
                {error}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="submit"
              disabled={submitting || submitted}
              className={submitted ? 'btn btn-success' : 'btn btn-primary'}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              {submitting ? <><Loader size={14} className="animate-spin" /> Saving…</>
                : submitted ? <><CheckCircle size={14} /> Saved</>
                : tab === 'dropout' ? <><LogOut size={14} /> Log dropout event</>
                : tab === 'compliance' ? <><TrendingDown size={14} /> Log compliance event</>
                : tab === 'trigger' && openTriggerId ? <><Zap size={14} /> Complete trigger visit</>
                : <>Save {tab}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Presentational helpers ────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px', flex: 1, minWidth: 0 }}>
      <label className="modal-label" style={{ display: 'block', marginBottom: '6px' }}>{label}</label>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>{children}</div>;
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600,
        padding: '6px 12px', borderRadius: '100px', cursor: 'pointer',
        border: `1px solid ${active ? 'var(--blue)' : 'var(--border2)'}`,
        background: active ? 'var(--blue)' : 'var(--bg)',
        color: active ? '#fff' : 'var(--t2)',
      }}
    >
      {children}
    </button>
  );
}

function NumInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input type="number" min={0} className="modal-input" value={value}
      onChange={(e) => onChange(e.target.value)} placeholder="0" />
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '-4px', lineHeight: 1.5 }}>{children}</p>;
}

function TriggerPreview({ triggerAt, visitAt }: { triggerAt: string; visitAt: string }) {
  if (!triggerAt || !visitAt) return null;
  const hrs = hoursBetween(triggerAt, visitAt);
  if (hrs == null) return null;
  if (hrs < 0) {
    return (
      <div style={{ marginBottom: '16px', padding: '8px 12px', borderRadius: 'var(--r1)',
        fontSize: '12px', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-mid)' }}>
        Office visit is before the trigger — check the timestamps.
      </div>
    );
  }
  const breached = hrs > RANDOMIZATION_WINDOW_HOURS;
  const rounded = hrs < 10 ? hrs.toFixed(1) : Math.round(hrs);
  return (
    <div style={{
      marginBottom: '16px', padding: '8px 12px', borderRadius: 'var(--r1)', fontSize: '12px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
      background: breached ? 'var(--amber-bg, #FEF3C7)' : 'var(--blue-bg)',
      color: breached ? '#92400E' : 'var(--blue)',
      border: `1px solid ${breached ? '#FDE68A' : 'var(--blue-mid, var(--border))'}`,
    }}>
      <span><strong>{rounded} h</strong> from trigger to visit</span>
      <span style={{ fontWeight: 700, fontSize: '11px' }}>
        {breached ? `⚠ Beyond ${RANDOMIZATION_WINDOW_HOURS} h window` : `Within ${RANDOMIZATION_WINDOW_HOURS} h window`}
      </span>
    </div>
  );
}
