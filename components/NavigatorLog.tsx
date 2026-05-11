'use client';

/**
 * NavigatorLog — Daily Log for Navigator/Vendor coordinators.
 *
 * Features:
 * - Free-text note entry with timestamp (ALCOA+ Contemporaneous)
 * - Voice-to-text via Web Speech API (no external deps)
 * - Regex reminder detection → auto-creates notifications
 * - Persistent storage in logsStore (IndexedDB)
 * - Entries grouped by date, reminders can be marked done
 *
 * Reminder detection is intentionally conservative (high precision).
 * A false-positive reminder is preferable to a missed note.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Mic, MicOff, Plus, Bell, FileText, CheckCircle2,
  Circle, ChevronDown, ChevronUp, Clock, Trash2, AlertCircle,
} from 'lucide-react';
import { type LogEntry, type Patient } from '@/lib/data';

// ── Regex Engine ──────────────────────────────────────────────────────────────

const REMINDER_PATTERNS: RegExp[] = [
  // Explicit: remind / reminder / recuerda / recordar / remember
  /\b(remind(?:er)?|recuerda?r?|recordar|remember)\b/i,
  // TODO / TBD / PENDIENTE / PENDING
  /\b(TODO|TBD|PENDIENTE|PENDING)\s*[:：]/i,
  // Follow-up / Seguimiento / F/U
  /\b(follow[\s-]?up|seguimiento|f\/u)\b/i,
  // Schedule / Agendar / Programar
  /\b(schedul(?:e|ing)|agenda?r?|programar)\b/i,
  // Call back / Llamar / Return call
  /\b(call\s+back|llamar|return[\s-]?call|devolver\s+llamada)\b/i,
  // @date tag — explicit trigger
  /@\S+/i,
  // "in N days/hours/weeks" or "en N días"
  /\bin\s+\d+\s+(day|hour|week|días?|horas?|semanas?)s?\b/i,
  // "next week/month" or "próxima semana/mes"
  /\b(next\s+(week|month)|mañana|tomorrow|próxim[ao]\s+(semana|mes))\b/i,
];

const DATE_PATTERNS: { re: RegExp; resolve: (m: RegExpMatchArray) => Date | null }[] = [
  // @YYYY-MM-DD
  {
    re: /@(\d{4}-\d{2}-\d{2})/i,
    resolve: m => { const d = new Date(m[1] + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; },
  },
  // @DD/MM or @MM/DD (ambiguous — treat as DD/MM for clinical context)
  {
    re: /@(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/i,
    resolve: m => {
      const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
      const d = new Date(year, +m[2] - 1, +m[1]);
      return isNaN(d.getTime()) ? null : d;
    },
  },
  // "in N days"
  {
    re: /\bin\s+(\d+)\s+days?\b/i,
    resolve: m => { const d = new Date(); d.setDate(d.getDate() + +m[1]); return d; },
  },
  // "in N weeks"
  {
    re: /\bin\s+(\d+)\s+weeks?\b/i,
    resolve: m => { const d = new Date(); d.setDate(d.getDate() + +m[1] * 7); return d; },
  },
  // tomorrow / mañana
  {
    re: /\b(tomorrow|mañana)\b/i,
    resolve: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d; },
  },
  // next week / próxima semana
  {
    re: /\b(next\s+week|próxima\s+semana)\b/i,
    resolve: () => { const d = new Date(); d.setDate(d.getDate() + 7); return d; },
  },
  // next month / próximo mes
  {
    re: /\b(next\s+month|próximo\s+mes)\b/i,
    resolve: () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; },
  },
];

function detectReminder(text: string): { isReminder: boolean; date?: string; reminderText?: string } {
  const isReminder = REMINDER_PATTERNS.some(re => re.test(text));
  if (!isReminder) return { isReminder: false };

  let date: Date | null = null;
  for (const { re, resolve } of DATE_PATTERNS) {
    const m = text.match(re);
    if (m) { date = resolve(m); if (date) break; }
  }

  // Distill reminder text: take the sentence containing the trigger keyword (max 120 chars)
  const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 0);
  const triggerSentence = sentences.find(s => REMINDER_PATTERNS.some(re => re.test(s))) ?? sentences[0] ?? text;
  const reminderText = triggerSentence.trim().substring(0, 120);

  return {
    isReminder: true,
    date: date?.toISOString().split('T')[0],
    reminderText,
  };
}

// ── Language mapping for speech recognition ───────────────────────────────────

const LANG_MAP: Record<string, string> = {
  'Spanish': 'es-ES',
  'French': 'fr-FR',
  'German': 'de-DE',
  'English': 'en-US',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDateGroup(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupByDate(entries: LogEntry[]): Map<string, LogEntry[]> {
  const map = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const key = new Date(e.timestamp).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface NavigatorLogProps {
  patient: Patient;
  onNewReminder: (entry: LogEntry) => void;
}

const STORE_KEY = (patientId: string) => `logs_${patientId}`;
const MAX_VISIBLE = 8;

export const NavigatorLog = ({ patient, onNewReminder }: NavigatorLogProps) => {
  const [entries, setEntries]         = useState<LogEntry[]>([]);
  const [text, setText]               = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading]     = useState(true);
  const [showAll, setShowAll]         = useState(false);
  const [speechErr, setSpeechErr]     = useState('');
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Load entries from IndexedDB
  useEffect(() => {
    let cancelled = false;
    import('@/lib/db').then(({ logsStore }) => {
      logsStore.getItem<LogEntry[]>(STORE_KEY(patient.id)).then(stored => {
        if (!cancelled) {
          setEntries(stored ?? []);
          setIsLoading(false);
        }
      });
    });
    return () => { cancelled = true; };
  }, [patient.id]);

  // Persist to IndexedDB whenever entries change
  const persist = useCallback(async (next: LogEntry[]) => {
    const { logsStore } = await import('@/lib/db');
    await logsStore.setItem(STORE_KEY(patient.id), next);
  }, [patient.id]);

  // ── Voice recognition ─────────────────────────────────────────────────────

  const startListening = () => {
    setSpeechErr('');
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSpeechErr('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    const rec = new SR();
    rec.lang = LANG_MAP[patient.lang] ?? 'en-US';
    rec.continuous = false;
    rec.interimResults = true;

    let finalTranscript = '';

    rec.onresult = (event: any) => {
      finalTranscript = Array.from(event.results as any[])
        .map((r: any) => r[0].transcript)
        .join('');
      setText(prev => {
        const prefix = prev.trimEnd();
        return prefix ? prefix + ' ' + finalTranscript : finalTranscript;
      });
    };
    rec.onerror = (e: any) => {
      setSpeechErr(e.error === 'not-allowed'
        ? 'Microphone access denied. Allow microphone in browser settings.'
        : 'Speech error. Please try again.');
      setIsListening(false);
    };
    rec.onend = () => setIsListening(false);
    rec.start();
    setIsListening(true);
    recognitionRef.current = rec;
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const { isReminder, date, reminderText } = detectReminder(trimmed);
    // AUDIT-001 FIX: use crypto.randomUUID() instead of Date.now().
    // Two entries submitted within the same millisecond produced identical IDs
    // (ALCOA+ violation: Original — same ID → last-write-wins, data loss).
    // UUID v4 is 122 bits of randomness; collision probability is negligible.
    const entry: LogEntry = {
      id: `${patient.id}_${crypto.randomUUID()}`,
      patientId: patient.id,
      siteId: patient.siteId,
      text: trimmed,
      timestamp: new Date().toISOString(),
      type: isReminder ? 'reminder' : 'note',
      reminderDate: date,
      reminderText: isReminder ? reminderText : undefined,
      done: false,
    };

    const next = [entry, ...entries];
    setEntries(next);
    await persist(next);
    setText('');
    textareaRef.current?.focus();

    if (isReminder) onNewReminder(entry);
  };

  const toggleDone = async (id: string) => {
    const next = entries.map(e => e.id === id ? { ...e, done: !e.done } : e);
    setEntries(next);
    await persist(next);
  };

  const deleteEntry = async (id: string) => {
    const next = entries.filter(e => e.id !== id);
    setEntries(next);
    await persist(next);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // ⚡ OPT-2: Memoize both the slice and the date-group Map.
  // groupByDate was rebuilding a new Map on every render regardless of whether entries changed.
  // useMemo ensures it only recomputes when entries content or showAll flag actually changes.
  const visible = useMemo(
    () => (showAll ? entries : entries.slice(0, MAX_VISIBLE)),
    [entries, showAll]
  );
  const grouped = useMemo(() => groupByDate(visible), [visible]);
  const hasMore = entries.length > MAX_VISIBLE;

  return (
    <div className="card" style={{ marginTop: '16px' }}>
      {/* Header */}
      <div className="card-hdr" style={{ paddingBottom: '12px' }}>
        <div>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={14} color="var(--blue)" /> Navigator Daily Log
          </div>
          <div className="card-sub">Notes &amp; reminders for {patient.id}</div>
        </div>
        {entries.filter(e => e.type === 'reminder' && !e.done).length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '3px 8px', borderRadius: '10px', border: '1px solid #FDE68A' }}>
            <Bell size={11} />
            {entries.filter(e => e.type === 'reminder' && !e.done).length} pending
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{ padding: '0 16px 16px' }}>
        {/* 🎨 UX-3: visually-hidden label — placeholder alone is not sufficient for AT (WCAG 1.3.1) */}
        <label
          htmlFor="nav-log-entry"
          style={{ position: 'absolute', width: '1px', height: '1px', margin: '-1px',
                   padding: 0, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
        >
          Daily log entry for {patient.id}
        </label>
        <textarea
          id="nav-log-entry"
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
          }}
          placeholder={`Note or reminder for ${patient.id}…\n@tomorrow, TODO:, remind me to…\nCtrl+Enter to save`}
          maxLength={500}
          rows={3}
          style={{
            width: '100%', resize: 'none', boxSizing: 'border-box',
            padding: '10px 12px', fontSize: '13px', lineHeight: 1.5,
            border: '1px solid var(--border)', borderRadius: '8px',
            fontFamily: 'inherit', color: 'var(--t1)',
            background: isListening ? '#FFF5F5' : '#FAFAFA',
            transition: 'background 0.2s',
            outline: 'none',
          }}
        />
        {speechErr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#EF4444', marginTop: '4px' }}>
            <AlertCircle size={11} /> {speechErr}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
          {/* Voice button — 🎨 UX-3: aria-pressed communicates recording state to AT */}
          <button
            onClick={isListening ? stopListening : startListening}
            aria-pressed={isListening}
            aria-label={isListening ? 'Stop voice recording' : 'Start voice recording'}
            title={isListening ? 'Stop recording' : 'Voice to text (Web Speech API)'}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 12px', borderRadius: '6px', border: '1px solid',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: isListening ? '#FEE2E2' : 'var(--bg)',
              color: isListening ? '#DC2626' : 'var(--t2)',
              borderColor: isListening ? '#FECACA' : 'var(--border)',
              transition: 'all 0.2s',
            }}
          >
            {isListening
              ? <><MicOff size={13} aria-hidden="true" /> Stop</>
              : <><Mic size={13} aria-hidden="true" /> Speak</>}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', color: 'var(--t3)' }}>{text.length}/500</span>
            <button
              onClick={handleSubmit}
              disabled={!text.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '7px 14px', borderRadius: '6px', border: 'none',
                fontSize: '12px', fontWeight: 600, cursor: text.trim() ? 'pointer' : 'not-allowed',
                background: text.trim() ? 'var(--blue)' : 'var(--border)',
                color: text.trim() ? '#fff' : 'var(--t3)',
                transition: 'all 0.15s',
              }}
            >
              <Plus size={13} /> Add Entry
            </button>
          </div>
        </div>

        {/* Reminder hint */}
        <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--t3)', lineHeight: 1.5 }}>
          💡 Start with <code style={{ background: 'var(--blue-bg)', padding: '0 3px', borderRadius: '2px' }}>TODO:</code>, <code style={{ background: 'var(--blue-bg)', padding: '0 3px', borderRadius: '2px' }}>@tomorrow</code> or <code style={{ background: 'var(--blue-bg)', padding: '0 3px', borderRadius: '2px' }}>remind me</code> to create a tracked reminder.
        </div>
      </div>

      {/* Entry list */}
      {isLoading ? (
        // 🎨 Skeleton mirrors the entry list structure — prevents layout shift
        // when real entries arrive. aria-busy signals AT that content is loading.
        <div role="status" aria-label="Loading log entries" aria-busy="true"
             style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
          {[65, 85, 50].map((w, i) => (
            <div key={i} style={{ padding: '10px 16px', borderBottom: i < 2 ? '1px solid var(--border)' : undefined, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <div style={{ width: '13px', height: '13px', background: '#E2E8F0', borderRadius: '50%', flexShrink: 0, marginTop: '2px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ width: '40px', height: '9px', background: '#F1F5F9', borderRadius: '3px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
                <div style={{ width: `${w}%`, height: '12px', background: '#E2E8F0', borderRadius: '3px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div style={{ padding: '0 16px 16px', fontSize: '12px', color: 'var(--t3)', textAlign: 'center', fontStyle: 'italic' }}>
          No entries yet. Start logging Navigator activity above.
        </div>
      ) : (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {Array.from(grouped.entries()).map(([dateKey, dayEntries]) => (
            <div key={dateKey}>
              {/* Date group header */}
              <div style={{ padding: '8px 16px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                {fmtDateGroup(dayEntries[0].timestamp)}
              </div>

              {dayEntries.map(entry => (
                <div key={entry.id} style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border)',
                  opacity: entry.done ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                  background: entry.type === 'reminder' && !entry.done ? '#FFFBEB' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    {/* Type icon */}
                    <div style={{ paddingTop: '1px', flexShrink: 0 }}>
                      {entry.type === 'reminder'
                        ? <Bell size={13} color={entry.done ? 'var(--t3)' : '#D97706'} />
                        : <FileText size={13} color="var(--t3)" />}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <Clock size={9} /> {fmtTime(entry.timestamp)}
                        </span>
                        {entry.type === 'reminder' && (
                          <span style={{ fontSize: '9px', fontWeight: 700, background: entry.done ? '#E2E8F0' : '#FEF3C7', color: entry.done ? 'var(--t3)' : '#92400E', padding: '1px 5px', borderRadius: '3px' }}>
                            {entry.done ? 'DONE' : entry.reminderDate ? `→ ${entry.reminderDate}` : 'REMINDER'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: entry.done ? 'var(--t3)' : 'var(--t1)', lineHeight: 1.5, wordBreak: 'break-word', textDecoration: entry.done ? 'line-through' : 'none' }}>
                        {entry.text}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                      {entry.type === 'reminder' && (
                        <button
                          onClick={() => toggleDone(entry.id)}
                          title={entry.done ? 'Mark as pending' : 'Mark as done'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: entry.done ? '#10B981' : 'var(--t3)' }}
                        >
                          {entry.done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                        </button>
                      )}
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        title="Delete entry"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--t3)' }}
                        onMouseOver={e => (e.currentTarget.style.color = '#EF4444')}
                        onMouseOut={e => (e.currentTarget.style.color = 'var(--t3)')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* Show more / less */}
          {hasMore && (
            <button
              onClick={() => setShowAll(v => !v)}
              style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--blue)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              {showAll
                ? <><ChevronUp size={13} /> Show less</>
                : <><ChevronDown size={13} /> {entries.length - MAX_VISIBLE} more entries</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
