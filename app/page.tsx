'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  PATIENTS, fmtHuman, fmtISO, getTodayPct, getToday, diffDays, addDays, 
  GLOSSARY, WZ_STEPS, PROTOCOL_AMENDMENTS, type ProtocolAmendment,
  type Patient, type Notification, type Document, type Task
} from '@/lib/data';
import { 
  Bell, ClipboardList, AlertTriangle, Search, Lock, UserPlus, 
  Check, ArrowRight, Delete, X, Info, User, Globe, Mail, Hospital, Clock,
  HelpCircle, Phone, Activity, ChevronRight, ArrowUp, ArrowDown, Link,
  ChevronDown, Plus, FileEdit, ArrowLeft, Circle, FileText, BarChart2,
  CheckCircle2, CheckCircle, Calendar, Flag, Microscope, Home, Wind, Pill, MessageSquare,
  Stethoscope, Droplet, Bug, TestTubes, FlaskConical, Beaker, GraduationCap, Heart, BadgeCheck,
  CalendarDays
} from 'lucide-react';

// Components
import { Auth } from '@/components/Auth';
import { Dashboard } from '@/components/Dashboard';
import { PatientDetail } from '@/components/PatientDetail';
import { NavigatorLog } from '@/components/NavigatorLog';
import { DependencyLines } from '@/components/DependencyLines';
import { CmdPalette } from '@/components/CmdPalette';
import { HelpModal } from '@/components/HelpModal';
import { DailyBriefing } from '@/components/DailyBriefing';
import { Sparkline } from '@/components/Sparkline';
import { AddPatientModal } from '@/components/AddPatientModal';
import { EditPatientModal } from '@/components/EditPatientModal';
import { ScreeningOutcomeModal } from '@/components/ScreeningOutcomeModal';
import { NotificationCenter } from '@/components/NotificationCenter';
import { ManagerDashboard } from '@/components/ManagerDashboard';
import { Settings } from '@/components/Settings';
import { Toasts } from '@/components/Toasts';
import { Wizard } from '@/components/Wizard';
import { RescreeningWizard } from '@/components/RescreeningWizard';
import { DLPWrapper } from '@/components/DLPWrapper';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WorkloadLogger } from '@/components/WorkloadLogger';
import { TimelineNavigator } from '@/components/TimelineNavigator';
import { checkTaskCompletion } from '@/lib/task-utils';
import { classifyFirebaseError, shouldClearOnRevocation } from '@/lib/auth-utils';
import { initTelemetrySession, endTelemetrySession, trackScreenView, trackEvent } from '@/lib/telemetry';

const LungIcon = ({ size = 16, color = "currentColor", strokeWidth = 2, ...props }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2v5" />
    <path d="M12 7c-2.5 0-4.5 2-4.5 4.5v5c0 1.5-1 2.5-2.5 2.5S2 18 2 16.5v-3C2 12 4 10 6.5 10c1.5 0 2.5 1 2.5 2.5v1" />
    <path d="M12 7c2.5 0 4.5 2 4.5 4.5v5c0 1.5 1 2.5 2.5 2.5S22 18 22 16.5v-3c0-2-2-4-4.5-4-1.5 0-2.5 1-2.5 2.5v1" />
  </svg>
);

const IconMap: Record<string, any> = {
  Bell, ClipboardList, AlertTriangle, Search, Lock, UserPlus, 
  Check, ArrowRight, Delete, X, Info, User, Globe, Mail, Hospital, Clock,
  Home, Wind, Pill, Activity, Phone, Calendar, Flag, Microscope, FileText,
  CheckCircle2, Circle, Plus, FileEdit, ArrowLeft, ArrowUp, ArrowDown, Link,
  ChevronDown, ChevronRight, Stethoscope, Droplet, Bug, TestTubes, FlaskConical, Beaker, GraduationCap, Heart, BadgeCheck,
  '📋': ClipboardList, '📝': FileText, '🫁': LungIcon,
  '🫀': Heart, '🩺': Stethoscope, '🧪': Beaker, '📄': FileText, '✅': BadgeCheck,
  '💊': Pill, '🎓': GraduationCap, '🔔': Bell, '💨': Wind, '📞': Phone, '🏥': Hospital,
  '🦠': Bug, '🩸': Droplet, '⚠️': AlertTriangle
};

export default function App() {
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  /**
   * 🕵️ 100ms threshold rule: IndexedDB typically resolves in 10–50ms.
   * Showing a spinner for < 200ms causes a disorienting flash (worse than
   * no spinner). showDbLoader only activates after 200ms; if load completes
   * before that, the user never sees the loading screen.
   */
  const [showDbLoader, setShowDbLoader] = useState(false);
  useEffect(() => {
    if (!isLoadingDb) { setShowDbLoader(false); return; }
    const t = setTimeout(() => setShowDbLoader(true), 200);
    return () => clearTimeout(t);
  }, [isLoadingDb]);
  const [protocolVersions, setProtocolVersions] = useState<ProtocolAmendment[]>(PROTOCOL_AMENDMENTS);
  const [patients, setPatients] = useState<Patient[]>([]);
  
  useEffect(() => {
    async function initDB() {
      const { 
        getAllProtocols, 
        getAllPatients, 
        initializeDbWithDefaults 
      } = await import('@/lib/db');
      
      try {
        await initializeDbWithDefaults(PATIENTS, PROTOCOL_AMENDMENTS);
        
        const protocolsList = await getAllProtocols();
        if (protocolsList.length > 0) {
          setProtocolVersions(protocolsList);
        }
        
        const patientsList = await getAllPatients();
        setPatients(patientsList.map(p => ({ ...p, studyDay: diffDays(p.screeningDate, getToday()) })));
      } catch {
        // SbD: log operation context only — never log the err object (may expose storage internals).
        console.error('[ALTESA:DB] Storage initialization failed — running in offline fallback mode.');
        // Fall back to reference data so the app remains usable, but surface a visible
        // warning so no coordinator mistakes demo data for live patient records.
        setPatients(PATIENTS.map(p => ({ ...p, studyDay: diffDays(p.screeningDate, getToday()) })));
        // showToast is a stable useCallback([]) — safe to call from this effect after mount.
        showToast('Local database unavailable. Showing reference data only — reopen the app to retry.', 'warn');
      } finally {
        setIsLoadingDb(false);
      }
    }
    if (typeof window !== 'undefined') {
      initDB();
    }
  }, []);

  useEffect(() => {
    if (!isLoadingDb) {
      import('@/lib/db').then(({ saveAllProtocols }) => {
        saveAllProtocols(protocolVersions).catch(() =>
          console.error('[ALTESA:DB] Protocol version sync failed.')
        );
      });
    }
  }, [protocolVersions, isLoadingDb]);

  useEffect(() => {
    if (!isLoadingDb) {
      import('@/lib/db').then(({ savePatient }) => {
        patients.forEach(p => savePatient(p));
      });
    }
  }, [patients, isLoadingDb]);

  const [screen, setScreen] = useState<'auth' | 'dashboard' | 'patient' | 'manager_dashboard' | 'settings'>('auth');
  const [role, setRole] = useState<'coordinator' | 'manager'>('coordinator');
  const [authMode, setAuthMode] = useState<'crc' | 'manager'>('crc');
  const [pin, setPin] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [selPatientId, setSelPatientId] = useState<string | null>(null);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [tracedTask, setTracedTask] = useState<string | null>(null);
  
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [modalErr, setModalErr] = useState('');
  const [newPatientId, setNewPatientId] = useState('');
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientLang, setNewPatientLang] = useState('English');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const taskListRef = useRef<HTMLDivElement>(null);
  
  const [rescreeningOpen, setRescreeningOpen] = useState(false);
  const [rescreeningStep, setRescreeningStep] = useState(1);
  const [rescreeningData, setRescreeningData] = useState<any>(null);
  const [rescreeningChks, setRescreeningChks] = useState<Record<number, Set<number>>>({});
  
  const [screeningOutcomeOpen, setScreeningOutcomeOpen] = useState(false);
  
  const [dashFilter, setDashFilter] = useState<'all' | 'crit' | 'warn' | 'routine'>('all');
  
  const [chkd, setChkd] = useState<Record<string, Set<string>>>({});
  
  const [timelineOpen, setTimelineOpen] = useState(false);

  const [wzOpen, setWzOpen] = useState(false);
  const [wzStep, setWzStep] = useState(0);
  const [wzChks, setWzChks] = useState<Record<number, Set<number>>>({});
  const [cdStart, setCdStart] = useState<number | null>(null);
  const [wzConfirmOpen, setWzConfirmOpen] = useState(false);
  const [rndConfirmOpen, setRndConfirmOpen] = useState(false);
  
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQ, setCmdQ] = useState('');
  const [taskConfirm, setTaskConfirm] = useState<{pid: string, task: any} | null>(null);
  const [attestationChecked, setAttestationChecked] = useState(false);
  const [taskDataValue, setTaskDataValue] = useState('');
  const [wzCheckConfirm, setWzCheckConfirm] = useState<{step: number, index: number} | null>(null);
  const [editTask, setEditTask] = useState<{pid: string, task: any} | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [workloadLogOpen, setWorkloadLogOpen] = useState(false);

  // Manager State
  const [reviewedTasks, setReviewedTasks] = useState<Set<string>>(new Set());
  const [queries, setQueries] = useState<any[]>([
    { id: 'QRY-1001', pid: 'ALTESA-002', taskCode: 'SPI', issue: 'Missing Spirometry Post-BD data', status: 'open' },
    { id: 'QRY-1002', pid: 'ALTESA-047', taskCode: 'LAB', issue: 'Lab results not uploaded', status: 'answered' }
  ]);
  const [queryModalOpen, setQueryModalOpen] = useState(false);
  const [queryDraft, setQueryDraft] = useState({ pid: '', taskCode: '', issue: '' });

  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [editPatientData, setEditPatientData] = useState<{name: string, lang: string, loc: string, protocolVersion?: string} | null>(null);

  const [toasts, setToasts] = useState<{id: number, msg: string, type: string}[]>([]);
  const [isActivated, setIsActivated] = useState<boolean>(false);
  const [isStudyInit, setIsStudyInit] = useState<boolean>(false);
  const [hasPin, setHasPin] = useState<boolean>(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    if (typeof window !== 'undefined') {
      import('@/lib/db').then(({ configStore }) => {
        Promise.all([
          configStore.getItem('altesa_activated'),
          configStore.getItem('altesa_study_secret'),
          configStore.getItem('altesa_crc_pin_hash')
        ]).then(([activated, secret, pinHash]) => {
          setIsActivated(activated === 'true');
          setIsStudyInit(!!secret);
          setHasPin(!!pinHash);
        });
      });
    }
  }, []);

  // Firebase session watcher — handles credential revocation from the console.
  // If Firebase signs the user out (e.g. password changed by admin), the next
  // time the app needs re-activation or PIN recovery it will be blocked.
  // Active sessions using PIN only are NOT interrupted mid-session (online-first
  // only for activation; PIN works offline once established).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 🛠️ Race condition fix: if the component unmounts before the async import
    // chain resolves, the cleanup function runs with unsubscribe === undefined.
    // The `cancelled` flag prevents registering the listener after unmount,
    // and the ref ensures cleanup can always call it if it was registered.
    let cancelled = false;
    const unsubscribeRef = { current: undefined as (() => void) | undefined };

    import('@/lib/firebase').then(({ auth }) => {
      import('firebase/auth').then(({ onAuthStateChanged }) => {
        if (cancelled) return; // component already unmounted
        unsubscribeRef.current = onAuthStateChanged(auth, (user) => {
          if (shouldClearOnRevocation(user, isStudyInit, screen)) {
            setIsStudyInit(false);
            setIsActivated(false);
          }
        });
      });
    });
    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Passive screen-time telemetry — fires on every screen transition.
  // Non-blocking: trackScreenView dispatches fire-and-forget writes.
  useEffect(() => {
    if (screen !== 'auth') {
      trackScreenView(screen as Parameters<typeof trackScreenView>[0]);
    }
  }, [screen]);

  const toastIdRef = useRef(0);

  const getRescreeningStatus = (p: Patient) => {
    if (p.phaseCode !== 'psb') return null;
    const milestones = [168, 336, 504, 672];
    const nextMilestone = milestones.find(m => m > (p.studyDay || 0));
    if (!nextMilestone) return null;
    const daysToMilestone = nextMilestone - (p.studyDay || 0);
    if (daysToMilestone <= 28) return { days: daysToMilestone, milestone: nextMilestone / 7 };
    return null;
  };

  const toggleRescreeningChk = (step: number, i: number) => {
    setRescreeningChks(prev => {
      const next = { ...prev };
      const s = new Set(next[step] || []);
      if (s.has(i)) s.delete(i); else s.add(i);
      next[step] = s;
      return next;
    });
  };

  const handleCompleteRescreening = () => {
    if (!selPatientId || !rescreeningData) return;
    setPatients(prev => prev.map(p => {
      if (p.id !== selPatientId) return p;
      return { 
        ...p, 
        alert: null,
        labNote: `Rescreening completed on ${fmtISO(getToday())}. Eligibility re-verified for Week ${Math.floor((p.studyDay || 0) / 7)} milestone.`
      };
    }));
    setRescreeningOpen(false);
    setRescreeningChks({});
    showToast(`Rescreening for ${rescreeningData.id} completed successfully`, 'ok');
  };

  const handleScreeningOutcome = (outcome: 'success' | 'failure', icfDate: Date, psbStartDate?: Date, reason?: string) => {
    setPatients(prev => prev.map(p => {
      if (p.id === selPatientId) {
        if (outcome === 'success') {
          return {
            ...p,
            screeningDate: icfDate,
            screeningOutcome: 'success',
            psbStartDate: psbStartDate,
            phase: 'PSB',
            phaseCode: 'psb',
            phaseLabel: 'Asymptomatic Phase · Week 1',
            studyDay: 1,
            nextVisit: addDays(psbStartDate!, 28),
            nextVisitLabel: 'Monthly call (Day 28)',
            nextVisitWindow: 5,
            tasks: {
              q: [
                { code: 'DTQ', label: 'Daily Trigger Questionnaire', icon: '🔔', done: false, note: 'Daily during PSB. Triggers RV Protocol if positive.', dueDate: psbStartDate },
                { code: 'ERS', label: 'E-RS / PGIS (EXACT)', icon: '📋', done: false, note: 'Daily during PSB. PGIS at each E-RS administration (fn. i)', dueDate: psbStartDate },
                { code: 'WURSS', label: 'WURSS-11', icon: '📋', done: false, note: 'Daily during PSB (fn. i)', dueDate: psbStartDate },
                { code: 'PRN', label: 'COPD PRN Inhaler Use', icon: '💨', done: false, note: 'Collected with E-RS', dueDate: psbStartDate },
              ],
              pr: [],
              l: [],
              ad: [
                { code: 'MC', label: 'Monthly Phone/Telehealth Call', icon: '📞', done: false, urgent: true, note: 'Due: Week 4 (Day 28). Discuss: comorbidities, COPD meds, infections, hospitalisations (fn. m)', subcat: 'fup', dueDate: addDays(psbStartDate!, 28) },
                { code: 'CMED', label: 'Concomitant Medications — record any changes', icon: '💊', done: false, note: 'Document new/changed ConMeds since last contact (fn. l)', dueDate: addDays(psbStartDate!, 28), subcat: 'fup' },
              ]
            }
          };
        } else {
          return {
            ...p,
            screeningDate: icfDate,
            screeningOutcome: 'failure',
            screeningFailureReason: reason,
            phase: 'SCREEN FAILURE',
            phaseCode: 'fail',
            phaseLabel: 'Screen Failure',
            nextVisit: icfDate,
            nextVisitLabel: 'N/A',
            tasks: { q: [], pr: [], l: [], ad: [] }
          };
        }
      }
      return p;
    }));
    setScreeningOutcomeOpen(false);
    showToast(`Screening outcome recorded for ${selPatientId}`, outcome === 'success' ? 'ok' : 'warn');
  };

  const handleAbortProtocol = () => {
    setPatients(prev => prev.map(p => {
      if (p.id === selPatientId) {
        return {
          ...p,
          dtqPos: false,
          alert: null,
          phase: 'EARLY TERMINATION',
          phaseCode: 'et',
          phaseLabel: 'Early Termination (Randomization Failure)',
          nextVisitLabel: 'N/A',
          tasks: { q: [], pr: [], l: [], ad: [] }
        };
      }
      return p;
    }));
    setWzOpen(false);
    setWzStep(0);
    setWzChks({});
    showToast(`Patient ${selPatientId} Early Terminated due to Randomization Failure`, 'warn');
  };

  const showToast = useCallback((msg: string, type: string = 'ok') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2800);
  }, []);

  const handleDLPViolation = (action: string) => {
    showToast(`DLP Policy: ${action === 'copy' ? 'Copying' : action === 'cut' ? 'Cutting' : 'Dragging'} sensitive patient data is disabled to prevent data leakage.`, 'dlp-alert');
  };

  const sendEmailNotification = useCallback((_notif: Notification) => {
    if (!emailEnabled) return;
    /**
     * Email dispatch — NOT YET IMPLEMENTED.
     *
     * ⚠️  PHI POLICY: Never log, print, or expose _notif.title or _notif.message
     * client-side. These fields contain patient identifiers and clinical alert
     * content that qualifies as Protected Health Information (PHI).
     *
     * Implementation contract:
     *   - Dispatch via an authenticated server-side API route (POST /api/notify).
     *   - The server constructs the email body; no PHI payload crosses to the client log.
     *   - Audit the dispatch event by notification ID and type only — never by content.
     *
     * The underscore prefix on _notif signals this parameter is intentionally
     * unused in the current stub. Remove the prefix when wiring the API call.
     */
  }, [emailEnabled]);

  const toggleReview = (pid: string, code: string) => {
    const key = `${pid}-${code}`;
    setReviewedTasks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    showToast(`Task ${code} marked as reviewed`, 'ok');
  };

  const handleOpenQuery = (pid: string, code: string) => {
    setQueryDraft({ pid, taskCode: code, issue: '' });
    setQueryModalOpen(true);
  };

  const submitQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryDraft.issue.trim()) return;
    
    setQueries(prev => [{
      id: `QRY-${1000 + prev.length + 1}`,
      pid: queryDraft.pid,
      taskCode: queryDraft.taskCode,
      issue: queryDraft.issue,
      status: 'open'
    }, ...prev]);
    
    setQueryModalOpen(false);
    showToast('Query opened successfully', 'ok');
  };

  // ⚡ OPT-1: O(1) patient lookup — avoids O(n) patients.find on every isChecked call.
  // isChecked is called ~160×/cycle (n_patients × n_tasks). Previously: O(n) scan each time.
  const patientMap = useMemo(
    () => new Map(patients.map(p => [p.id, p])),
    [patients]
  );

  const isChecked = useCallback((pid: string, code: string) =>
    checkTaskCompletion(pid, code, patientMap, chkd),
  [patientMap, chkd]);

  const isBlocked = useCallback((pid: string, task: any) => {
    if (!task.dependsOn || task.dependsOn.length === 0) return false;
    return task.dependsOn.some((depCode: string) => !isChecked(pid, depCode));
  }, [isChecked]);

  useEffect(() => {
    // Initial notification scan
    const newNotifs: Notification[] = [];
    patients.forEach(p => {
      // 1. Patient Alerts
      if (p.alert === 'DTQ_POSITIVE') {
        const id = `alert-${p.id}`;
        newNotifs.push({
          id,
          type: 'critical',
          title: 'Critical Alert: DTQ Positive',
          message: `Patient ${p.id} has confirmed symptom onset. RV Protocol activated.`,
          timestamp: getToday(),
          read: false,
          patientId: p.id
        });
      } else if (p.alert === 'MONTHLY_CALL') {
        const id = `alert-call-${p.id}`;
        newNotifs.push({
          id,
          type: 'alert',
          title: 'Monthly Call Due',
          message: `Patient ${p.id} is due for their monthly follow-up call.`,
          timestamp: getToday(),
          read: false,
          patientId: p.id
        });
      }

      // 2. Overdue/Critical Tasks
      const allTasks = [...(p.tasks.q || []), ...(p.tasks.pr || []), ...(p.tasks.l || []), ...(p.tasks.ad || [])];
      allTasks.forEach(t => {
        if (!isChecked(p.id, t.code) && t.dueDate) {
          const diff = diffDays(getToday(), t.dueDate);
          if (diff < 0) {
            const id = `overdue-${p.id}-${t.code}`;
            newNotifs.push({
              id,
              type: 'overdue',
              title: 'Overdue Task',
              message: `${t.label} for patient ${p.id} is overdue by ${Math.abs(diff)} days.`,
              timestamp: t.dueDate,
              read: false,
              patientId: p.id
            });
          } else if (diff === 0 && (t.critical || t.urgent)) {
            const id = `crit-today-${p.id}-${t.code}`;
            newNotifs.push({
              id,
              type: 'critical',
              title: 'Critical Task Due Today',
              message: `${t.label} for patient ${p.id} must be completed today.`,
              timestamp: getToday(),
              read: false,
              patientId: p.id
            });
          }
        }
      });
    });

    // Check for new notifications to trigger "email"
    setNotifications(prev => {
      const prevIds = new Set(prev.map(n => n.id));
      newNotifs.forEach(n => {
        if (!prevIds.has(n.id)) {
          sendEmailNotification(n);
        }
      });
      return newNotifs;
    });
  }, [patients, isChecked, sendEmailNotification]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (screen !== 'auth') setCmdOpen(true);
      }
      if (e.key === 'Escape') setCmdOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen]);

  const handleLoginSuccess = useCallback(() => {
    // In production, role is determined by the specific key used to decrypt the vault
    // For this prototype, we'll use a role selector or specific PIN ranges if needed,
    // but we remove the hardcoded "9999" bypass.
    initTelemetrySession('local_user');
    setRole('coordinator');
    setScreen('dashboard');
    
    if (typeof window !== 'undefined') {
      import('@/lib/db').then(({ configStore }) => {
        configStore.getItem('altesa_briefed_today').then(briefed => {
          if (!briefed) {
            setBriefingOpen(true);
            configStore.setItem('altesa_briefed_today', fmtISO(getToday()));
          }
        });
      });
    }
  }, []);

  const handlePin = useCallback(async (k: string) => {
    if (k === 'del') {
      setPin(prev => prev.slice(0, -1));
      setPinErr('');
    } else if (k.startsWith('manager_unlock:')) {
      const pass = k.split(':').slice(1).join(':'); // Preserve colons in passphrase
      if (pass.length < 12) {
        showToast('Passphrase too short (min 12 characters)', 'error');
        return;
      }
      const { keysStore } = await import('@/lib/db');
      const { derivePINHash, generateSalt } = await import('@/lib/crypto');
      const stored = await keysStore.getItem<{ hash: string; salt: string } | null>('altesa_manager_pass_hash');
      if (!stored) {
        // First access: register passphrase (Trust On First Use)
        const salt = generateSalt();
        const hash = await derivePINHash(pass, salt);
        await keysStore.setItem('altesa_manager_pass_hash', { hash, salt });
        setRole('manager');
        setScreen('manager_dashboard');
        showToast('Manager Passphrase registered and vault unlocked', 'ok');
      } else {
        // Subsequent access: verify against stored PBKDF2 hash
        const inputHash = await derivePINHash(pass, stored.salt);
        if (inputHash === stored.hash) {
          initTelemetrySession('manager_user');
          setRole('manager');
          setScreen('manager_dashboard');
          showToast('Manager Vault Decrypted', 'ok');
        } else {
          showToast('Invalid Manager Passphrase', 'error');
        }
      }
    } else if (k === 'reset_pin') {
      const { configStore } = await import('@/lib/db');
      await configStore.removeItem('altesa_crc_pin_hash');
      await configStore.removeItem('altesa_crc_pin_salt');
      setPin('');
      setPinErr('');
      setHasPin(false);
      showToast('Recovery Successful. Please enter a new PIN.', 'ok');
    } else if (k === 'go') {
      const { configStore } = await import('@/lib/db');
      const storedHash = await configStore.getItem<string>('altesa_crc_pin_hash');
      const storedSalt = await configStore.getItem<string>('altesa_crc_pin_salt');
      if (storedHash && storedSalt) {
        const { derivePINHash } = await import('@/lib/crypto');
        const inputHash = await derivePINHash(pin, storedSalt);
        if (inputHash === storedHash) {
          setPinErr('');
          handleLoginSuccess();
        } else {
          setPinErr('Invalid PIN');
          setPin('');
        }
      } else {
        setPinErr('PIN not configured. Please use recovery.');
        setPin('');
      }
    } else {
      if (pin.length < 8) {
        setPin(prev => prev + k);
        setPinErr('');
      }
    }
  }, [pin, handleLoginSuccess, showToast]);

  const handleDTQResult = (pid: string, isPos: boolean) => {
    setPatients(prev => prev.map(p => {
      if (p.id !== pid) return p;
      const updatedTasks = { ...p.tasks };
      updatedTasks.q = updatedTasks.q.map(t => {
        if (t.code === 'DTQ') {
          return { 
            ...t, 
            done: true, 
            note: isPos ? '⚠ POSITIVE — RV symptom onset confirmed. RV Protocol activated.' : 'Answer: NO',
            urgNote: isPos ? 'crit-note' : undefined,
            critical: isPos ? true : t.critical
          };
        }
        return t;
      });
      
      if (isPos) {
        setCdStart(Date.now() - 3 * 3600000); // Start countdown
        setWzOpen(true); // Open wizard
        showToast('DTQ POSITIVE: RV Protocol Activated', 'crit');
        return { ...p, dtqPos: true, alert: 'DTQ_POSITIVE', tasks: updatedTasks };
      } else {
        showToast('DTQ Negative: Patient remains in PSB', 'ok');
        return { ...p, dtqPos: false, alert: null, tasks: updatedTasks };
      }
    }));
    
    setChkd(prev => {
      const next = { ...prev };
      if (!next[pid]) next[pid] = new Set();
      const s = new Set(next[pid]);
      s.add('DTQ');
      next[pid] = s;
      return next;
    });
  };

  const toggleCheck = (pid: string, task: any) => {
    const code = task.code;
    const currentlyChecked = isChecked(pid, code);

    // If we are marking as complete (checking), show confirmation
    if (!currentlyChecked) {
      if (isBlocked(pid, task)) {
        showToast(`Cannot complete ${task.label}: Dependencies not met`, 'warn');
        return;
      }
      setAttestationChecked(false);
      setTaskDataValue('');
      setTaskConfirm({ pid, task });
      return;
    }

    performToggle(pid, code);
  };

  const performToggle = (pid: string, code: string) => {
    const isChecking = !isChecked(pid, code);

    setPatients(prev => prev.map(p => {
      if (p.id === pid) {
        const updatedTasks = { ...p.tasks };
        (Object.keys(updatedTasks) as Array<keyof typeof updatedTasks>).forEach(cat => {
          updatedTasks[cat] = updatedTasks[cat].map((t: any) => {
            if (t.code === code) {
              return { 
                ...t, 
                attested: isChecking ? attestationChecked : false,
                dataValue: isChecking ? taskDataValue : undefined
              };
            }
            return t;
          });
        });
        return { ...p, tasks: updatedTasks };
      }
      return p;
    }));

    setChkd(prev => {
      const next = { ...prev };
      if (!next[pid]) next[pid] = new Set();
      const s = new Set(next[pid]);
      if (isChecked(pid, code)) {
        s.delete(code);
        showToast('Assessment unchecked', 'ok');
      } else {
        s.add(code);
        showToast('Assessment marked complete', 'ok');
      }
      next[pid] = s;
      return next;
    });
  };

  const handleAddPatient = (id: string, siteId: string, name: string, lang: string, consentDate: Date, protocolVersion: string) => {
    const newPatient: Patient = {
      id, siteId, name, lang, protocolVersion,
      phase: 'SCREENING', phaseCode: 'scr', phaseLabel: 'Screening · Day 0',
      loc: 'CLINIC', alert: null,
      screeningDate: consentDate,
      consentDate: consentDate,
      tasks: {
        q: [
          { code: 'CAT', label: 'CAT — COPD Assessment Test', icon: '📋', done: false, note: 'Screening and Rescreening visits only (Table 1)', dueDate: consentDate },
          { code: 'IC', label: 'Informed Consent', icon: '📝', done: true, note: 'Signed on ' + fmtISO(consentDate) },
        ],
        pr: [
          { code: 'OSC', label: 'Oscillometry', icon: '🫁', done: false, seq: true, note: 'Perform BEFORE spirometry at all visits with both (fn. f)', dueDate: consentDate },
          { code: 'SPI', label: 'Spirometry (PRE & POST)', icon: '🫁', done: false, note: 'Pre- and post-SABD at Screening.', dependsOn: ['OSC'], dueDate: consentDate },
          { code: 'ECG', label: 'ECG (12-lead)', icon: '🫀', done: false, note: 'Collect PRIOR to blood draw (fn. e)', dueDate: consentDate },
          { code: 'VS', label: 'Vital Signs', icon: '🩺', done: false, note: 'BP, HR, body temp, respiratory rate. Seated ≥ 5 min (fn. d)', dueDate: consentDate },
          { code: 'PE', label: 'Physical Exam (incl. height — Screening only)', icon: '🩺', done: false, note: 'Full exam including height (Screening only).', dueDate: consentDate },
        ],
        l: [
          { code: 'CSL', label: 'Central Safety Labs — Chemistry / Haematology / Urinalysis', icon: '🧪', done: false, note: 'Full panel at Screening.', dependsOn: ['ECG'], dueDate: consentDate },
          { code: 'PT', label: 'Pregnancy Test (blood — WOCBP only)', icon: '🧪', done: false, note: 'Blood at Screening.', dueDate: consentDate },
        ],
        ad: [
          { code: 'DEMO', label: 'Demographics', icon: '📄', done: true, subcat: 'screening' },
          { code: 'MSH', label: 'Medical & Smoking History', icon: '📄', done: false, note: 'Document as medical history until Day 1 dosing.', subcat: 'screening' },
          { code: 'ELG', label: 'Assess Eligibility Criteria', icon: '✅', done: false, note: 'Inclusion and Exclusion.', subcat: 'screening' },
          { code: 'COPH', label: 'COPD History & Medications', icon: '📄', done: false, subcat: 'screening' },
          { code: 'CMED', label: 'Concomitant Medications', icon: '💊', done: false, note: 'Reviewed by medically qualified investigator at Screening (fn. l)', subcat: 'screening' },
          { code: 'TRAIN', label: 'Train Participant on Study Procedures', icon: '🎓', done: false, note: 'Includes ePRO, DTQ, home virology testing instructions', subcat: 'screening' },
        ]
      },
      ers: [], psb: null, psbRecords: 0,
      nextVisit: addDays(consentDate, 21), nextVisitLabel: 'PSB Start (Theoretical)',
      nextVisitWindow: undefined,
      documents: []
    };
    
    setPatients(prev => [newPatient, ...prev]);
    setAddPatientOpen(false);
    showToast(`Patient ${id} added successfully`, 'ok');
  };

  const handleUpdatePatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selPatientId || !editPatientData) return;
    
    setModalErr('');
    const { name, lang, loc, protocolVersion } = editPatientData;
    
    if (!name.trim()) {
      setModalErr('Name is required');
      return;
    }

    // PII / DNI Validation
    const piiRegex = /\d{7,}/;
    if (piiRegex.test(name)) {
      setModalErr('It looks like you are trying to enter Personally Identifiable Information (PII). To comply with FDA and ICH GCP regulations, please do not enter real patient data.');
      return;
    }

    setPatients(prev => prev.map(p => {
      if (p.id === selPatientId) {
        return { ...p, name: name.trim(), lang, loc, protocolVersion };
      }
      return p;
    }));
    
    setEditPatientOpen(false);
    showToast('Patient details updated successfully', 'ok');
  };

  const handleSaveTask = (pid: string, updatedTask: any) => {
    setPatients(prev => prev.map(p => {
      if (p.id !== pid) return p;
      const nextTasks = { ...p.tasks };
      for (const key in nextTasks) {
        const group = (nextTasks as any)[key] as any[];
        const idx = group.findIndex(t => t.code === updatedTask.code);
        if (idx !== -1) {
          const newGroup = [...group];
          newGroup[idx] = updatedTask;
          (nextTasks as any)[key] = newGroup;
          break;
        }
      }
      return { ...p, tasks: nextTasks };
    }));
    showToast('Task updated successfully', 'ok');
    setEditTask(null);
  };

  const countTasks = (p: Patient) => {
    const all = [...(p.tasks.q || []), ...(p.tasks.pr || []), ...(p.tasks.l || []), ...(p.tasks.ad || [])];
    return { done: all.filter(t => isChecked(p.id, t.code)).length, total: all.length };
  };

  const openPatient = (id: string) => {
    setSelPatientId(id);
    setScreen('patient');
    setCmdOpen(false);
    setRecentIds(prev => {
      const next = [id, ...prev.filter(x => x !== id)];
      return next.slice(0, 5);
    });
  };

  // Prevent hydration mismatch
  if (!hasMounted) return null;

  // 🎨 DB Loading — skeleton screen with 200ms threshold gate.
  // Only shown if IndexedDB takes > 200ms (unusual on modern hardware).
  // Skeleton mimics the app shell to prevent layout shift on transition.
  if (isLoadingDb && showDbLoader) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Initializing local database"
        aria-busy="true"
        style={{
          height: '100vh', display: 'flex', flexDirection: 'column',
          background: '#F1F5F9', animation: 'fadeIn 150ms ease',
        }}
      >
        {/* Skeleton header */}
        <div style={{ height: '56px', background: '#fff', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', padding: '0 24px', gap: '16px' }}>
          <div style={{ width: '72px', height: '20px', background: '#E2E8F0', borderRadius: '4px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
          <div style={{ flex: 1 }} />
          <div style={{ width: '32px', height: '32px', background: '#E2E8F0', borderRadius: '6px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
          <div style={{ width: '32px', height: '32px', background: '#E2E8F0', borderRadius: '6px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
        </div>
        {/* Skeleton content */}
        <div style={{ flex: 1, padding: '32px 24px', maxWidth: '960px', margin: '0 auto', width: '100%' }}>
          {/* Summary row */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
            {[100, 80, 90, 75].map((w, i) => (
              <div key={i} style={{ flex: 1, height: '72px', background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ width: `${w}%`, height: '20px', background: '#E2E8F0', borderRadius: '4px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
                <div style={{ width: '40%', height: '12px', background: '#F1F5F9', borderRadius: '4px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
              </div>
            ))}
          </div>
          {/* Patient card skeletons */}
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '8px', height: '48px', background: '#E2E8F0', borderRadius: '4px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ width: '30%', height: '14px', background: '#E2E8F0', borderRadius: '4px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
                <div style={{ width: '55%', height: '12px', background: '#F1F5F9', borderRadius: '4px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
              </div>
              <div style={{ width: '72px', height: '24px', background: '#E2E8F0', borderRadius: '20px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
            </div>
          ))}
        </div>
        {/* Shimmer + fadeIn keyframes — globals.css has spin but not shimmer */}
        <style>{`
          @keyframes shimmer {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.45; }
          }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
      </div>
    );
  }

  // Auth Screen
  if (screen === 'auth') {
    return (
      <Auth 
        pin={pin} 
        pinErr={pinErr} 
        onPin={handlePin}
        isStudyInit={isStudyInit}
        hasPin={hasPin}
        onFirebaseLogin={async (email, password, role) => {
          try {
            const { signInWithEmailAndPassword } = await import('firebase/auth');
            const { auth } = await import('@/lib/firebase');
            const credential = await signInWithEmailAndPassword(auth, email, password);
            const user = credential.user;

            const { initializeFromFirebaseUser } = await import('@/lib/security');
            await initializeFromFirebaseUser(user.uid, user.email ?? email);

            setIsStudyInit(true);
            setIsActivated(true);

            const { configStore } = await import('@/lib/db');
            const pinHash = await configStore.getItem<string>('altesa_crc_pin_hash');
            setHasPin(!!pinHash);

            if (role === 'manager') {
              setRole('manager');
              setScreen('manager_dashboard');
              showToast('Manager Vault Unlocked', 'ok');
            } else {
              showToast('Session authenticated', 'ok');
            }
            return { success: true };
          } catch (err: any) {
            const code: string = err?.code ?? '';
            return { success: false, error: classifyFirebaseError(code) };
          }
        }}
        onRecovery={async (email, password) => {
          try {
            const { signInWithEmailAndPassword } = await import('firebase/auth');
            const { auth } = await import('@/lib/firebase');
            await signInWithEmailAndPassword(auth, email, password);
            return true;
          } catch {
            return false;
          }
        }}
        onSetupPin={async (newPin) => {
          const { configStore } = await import('@/lib/db');
          const { derivePINHash, generateSalt } = await import('@/lib/crypto');
          const salt = generateSalt();
          const hash = await derivePINHash(newPin, salt);
          await configStore.setItem('altesa_crc_pin_hash', hash);
          await configStore.setItem('altesa_crc_pin_salt', salt);
          setHasPin(true);
          showToast('PIN Activated and Saved', 'ok');
          return true;
        }}
      />
    );
  }

  // Settings Screen
  if (screen === 'settings') {
    return (
      <ErrorBoundary context="Settings">
        <Settings 
          patients={patients} 
          onClose={() => setScreen('dashboard')} 
          onImportQueries={(importedQueries) => {
            setQueries(prev => {
              const map = new Map(prev.map(q => [q.id, q]));
              importedQueries.forEach(q => map.set(q.id, q));
            return Array.from(map.values());
          });
          showToast(`Successfully imported ${importedQueries.length} queries.`, 'ok');
        }}
        onImportAmendments={(amendments) => {
          // Idempotent merge: incoming versions upsert by ID, local-only versions are preserved
          setProtocolVersions(prev => {
            const map = new Map(prev.map(a => [a.id, a]));
            amendments.forEach(a => map.set(a.id, a));
            return Array.from(map.values());
          });
          showToast(`Successfully imported ${amendments.length} protocol amendments.`, 'ok');
        }}
      />
    </ErrorBoundary>
    );
  }

  const handleImportPatients = (imported: Patient[]) => {
    setPatients(prev => {
      const map = new Map(prev.map(p => [p.id, p]));
      imported.forEach(p => map.set(p.id, p));
      return Array.from(map.values());
    });
    showToast(`Successfully imported ${imported.length} patient records.`, 'ok');
  };

  // Manager Dashboard Screen
  if (screen === 'manager_dashboard') {
    return (
      <>
      <ErrorBoundary context="ManagerDashboard">
        <ManagerDashboard 
          patients={patients} 
          queries={queries}
          protocolVersions={protocolVersions}
          setProtocolVersions={setProtocolVersions}
          onLock={() => { endTelemetrySession(); setScreen('auth'); setPassphrase(''); setRole('coordinator'); setAuthMode('crc'); }}
          onOpenHelp={() => setHelpOpen(true)}
          onDLPViolation={handleDLPViolation} 
          isChecked={isChecked}
          onOpenPatient={openPatient}
          onImportPatients={handleImportPatients}
        />
      </ErrorBoundary>
        <Toasts toasts={toasts} />
        {cmdOpen && <CmdPalette q={cmdQ} setQ={setCmdQ} onClose={() => setCmdOpen(false)} onSelect={(id: string) => { if (id === 'dashboard') setScreen('dashboard'); else openPatient(id); }} patients={patients} recentIds={recentIds} onDLPViolation={handleDLPViolation} />}
        {(helpOpen || showWelcome) && (
          <HelpModal 
            onClose={() => { setHelpOpen(false); setShowWelcome(false); }} 
            initialTab={showWelcome ? 'guide' : 'guide'} 
            onDLPViolation={handleDLPViolation}
            role={role}
          />
        )}
      </>
    );
  }

  // Dashboard Screen
  if (screen === 'dashboard') {
    return (
      <>
        <Dashboard
          patients={patients}
          notifications={notifications}
          dashFilter={dashFilter}
          setDashFilter={setDashFilter}
          onOpenSearch={() => setCmdOpen(true)}
          onOpenBriefing={() => setBriefingOpen(true)}
          onOpenNotif={() => setNotifOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenAddPatient={() => { setAddPatientOpen(true); setModalErr(''); }}
          onOpenSettings={() => setScreen('settings')}
          onLock={() => { setPin(''); setScreen('auth'); }}
          onOpenPatient={openPatient}
          onDLPViolation={handleDLPViolation}
        />
        {/* Modals */}
        {briefingOpen && (
          <DailyBriefing 
            patients={patients} 
            onClose={() => setBriefingOpen(false)} 
            onSelectPatient={(id) => {
              openPatient(id);
              setBriefingOpen(false);
            }}
            onDLPViolation={handleDLPViolation}
          />
        )}
        {addPatientOpen && (
          <AddPatientModal
            isOpen={addPatientOpen}
            onClose={() => setAddPatientOpen(false)}
            onAdd={handleAddPatient}
            protocolVersions={protocolVersions}
          />
        )}
        {selPatientId && (
          <ScreeningOutcomeModal
            patient={patients.find(p => p.id === selPatientId)!}
            isOpen={screeningOutcomeOpen}
            onClose={() => setScreeningOutcomeOpen(false)}
            onOutcome={handleScreeningOutcome}
          />
        )}
        {editPatientOpen && editPatientData && (
          <div className="modal-overlay" onClick={() => { setEditPatientOpen(false); setModalErr(""); }}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div className="modal-hdr">
                <div className="modal-title">Edit Patient Details</div>
                <button type="button" aria-label="Close" className="ibtn" onClick={() => { setEditPatientOpen(false); setModalErr(""); }}><X size={18} aria-hidden="true" /></button>
              </div>
              <form onSubmit={handleUpdatePatient}>
                <div className="modal-body">
                  {modalErr && (
                    <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-mid)', borderRadius: 'var(--r1)', color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={14} /> {modalErr}
                    </div>
                  )}
                  <div style={{ marginBottom: '24px' }}>
                    <label htmlFor="edit-patient-name" className="modal-label"><User size={12} /> Full Name</label>
                    <input 
                      id="edit-patient-name"
                      autoFocus
                      type="text" 
                      className="modal-input"
                      value={editPatientData.name} 
                      onChange={e => setEditPatientData({ ...editPatientData, name: e.target.value })} 
                      placeholder="e.g. John Doe"
                      required
                      onCopy={(e) => { e.preventDefault(); handleDLPViolation('copy'); }}
                      onCut={(e) => { e.preventDefault(); handleDLPViolation('cut'); }}
                      onDragStart={(e) => { e.preventDefault(); handleDLPViolation('drag'); }}
                    />
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    <label className="modal-label"><Globe size={12} /> Primary Language</label>
                    <select 
                      className="modal-input"
                      value={editPatientData.lang} 
                      onChange={e => setEditPatientData({ ...editPatientData, lang: e.target.value })}
                    >
                      <option value="English">English</option>
                      <option value="Spanish">Spanish</option>
                      <option value="French">French</option>
                      <option value="German">German</option>
                      <option value="Mandarin">Mandarin</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    <label className="modal-label"><Hospital size={12} /> Current Location</label>
                    <select 
                      className="modal-input"
                      value={editPatientData.loc} 
                      onChange={e => setEditPatientData({ ...editPatientData, loc: e.target.value })}
                    >
                      <option value="CLINIC">CLINIC</option>
                      <option value="HOME">HOME</option>
                      <option value="HOME→CLINIC">HOME→CLINIC</option>
                    </select>
                  </div>
                  {protocolVersions && protocolVersions.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                      <label className="modal-label"><FileText size={12} /> Protocol Amendment Version</label>
                      <select 
                        className="modal-input"
                        value={editPatientData.protocolVersion || ''} 
                        onChange={e => setEditPatientData({ ...editPatientData, protocolVersion: e.target.value })}
                      >
                        <option value="">(Not Set)</option>
                        {protocolVersions.map(pv => (
                          <option key={pv.id} value={pv.id}>
                            {pv.id} - {pv.label} {pv.status === 'active' ? '(Current)' : '(Legacy)'}
                          </option>
                        ))}
                      </select>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                        If you change the amendment version, the patient&apos;s schedule and rules will update going forward.
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="ibtn" onClick={() => { setEditPatientOpen(false); setModalErr(""); }}>Cancel</button>
                  <button type="submit" className="ibtn" style={{ background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 600 }}>Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}
        {notifOpen && (
          <div className="modal-overlay" style={{ zIndex: 800 }}>
            <div className="modal-card" style={{ maxWidth: '480px' }}>
              <div className="modal-hdr">
                <div className="modal-title">Notification Centre</div>
                <button aria-label="Close" className="ibtn" onClick={() => setNotifOpen(false)}><X size={16} aria-hidden="true" /></button>
              </div>
              <div className="modal-body" style={{ padding: '0' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)' }}>
                    {notifications.length} Notifications
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button 
                      className="ibtn" 
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                    >
                      Mark all read
                    </button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={emailEnabled} onChange={e => setEmailEnabled(e.target.checked)} />
                      <Mail size={12} aria-hidden="true" /> Email Alerts
                    </label>
                  </div>
                </div>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t3)' }}>
                      <Bell size={32} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
                      <p>No active notifications</p>
                    </div>
                  ) : (
                    notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).map(n => (
                      <div 
                        key={n.id} 
                        className={`notif-item ${n.read ? 'read' : 'unread'}`}
                        style={{ 
                          padding: '16px 20px', 
                          borderBottom: '1px solid var(--border)', 
                          cursor: 'pointer',
                          background: n.read ? 'transparent' : 'var(--blue-bg)',
                          position: 'relative'
                        }}
                        onClick={() => {
                          setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                          if (n.patientId) openPatient(n.patientId);
                          setNotifOpen(false);
                        }}
                      >
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <div style={{ marginTop: '2px' }}>
                            {n.type === 'critical' ? <AlertTriangle size={16} color="var(--red)" /> :
                             n.type === 'overdue' ? <Clock size={16} color="var(--amber)" /> :
                             <Bell size={16} color="var(--blue)" />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', marginBottom: '2px' }}>{n.title}</div>
                            <div style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: '1.5' }}>{n.message}</div>
                            <div style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '6px' }}>{fmtHuman(n.timestamp)}</div>
                          </div>
                          {!n.read && <div style={{ width: '8px', height: '8px', background: 'var(--blue)', borderRadius: '50%', marginTop: '6px' }}></div>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost w-full" onClick={() => setNotifOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
        {cmdOpen && <CmdPalette q={cmdQ} setQ={setCmdQ} onClose={() => setCmdOpen(false)} onSelect={(id: string) => { if (id === 'dashboard') setScreen('dashboard'); else openPatient(id); }} patients={patients} recentIds={recentIds} onDLPViolation={handleDLPViolation} />}

        {(helpOpen || showWelcome) && (
          <HelpModal
            onClose={() => { setHelpOpen(false); setShowWelcome(false); }}
            initialTab={showWelcome ? 'guide' : 'guide'}
            onDLPViolation={handleDLPViolation}
            role={role}
          />
        )}

        {/* Workload Logger FAB */}
        <button
          onClick={() => { setWorkloadLogOpen(true); trackEvent('modal_opened', { modal: 'workload_logger' }); }}
          aria-label="Log off-platform time"
          title="Log off-platform time"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-medium px-3.5 py-2.5 rounded-full shadow-lg transition-all hover:shadow-xl"
        >
          <Clock size={14} />
          Log Time
        </button>

        {workloadLogOpen && (
          <WorkloadLogger
            userId="local_user"
            onClose={() => { setWorkloadLogOpen(false); trackEvent('modal_closed', { modal: 'workload_logger' }); }}
          />
        )}

        <Toasts toasts={toasts} />
      </>
    );
  }

  // Patient Screen
  const p = patients.find(x => x.id === selPatientId);
  if (!p) return null;

  const displayPhaseCode = p.dtqPos && !p.randomizationDate ? 'rv' : p.phaseCode;
  const displayPhaseLabel = p.dtqPos && !p.randomizationDate ? 'RV Protocol Active' : p.phaseLabel;

  const { done, total } = countTasks(p);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const phBadge = { scr: 'pb-scr', psb: 'pb-psb', rv: 'pb-rv', tx: 'pb-tx', fu: 'pb-fu' }[displayPhaseCode] || 'pb-psb';
  const nowPct = getTodayPct(p);
  const phaseColor = { scr: 'var(--ph-scr)', psb: 'var(--ph-psb)', rv: 'var(--ph-rv)', tx: 'var(--ph-tx)', fu: 'var(--ph-fu)' }[displayPhaseCode] || 'var(--border)';

  const milestones = [];
  if (p.screeningDate) milestones.push({ l: 'Screening', d: p.screeningDate, cls: 'ms-done' });
  if (p.psbStartDate) milestones.push({ l: 'PSB Start', d: p.psbStartDate, cls: 'ms-done' });
  if (p.rvInfectionDate) milestones.push({ l: 'RV Onset', d: p.rvInfectionDate, cls: 'ms-done' });
  if (p.randomizationDate) milestones.push({ l: 'Randomisation', d: p.randomizationDate, cls: 'ms-done' });
  if (p.resolution) milestones.push({ l: 'Resolution', d: p.resolution, cls: 'ms-done' });
  milestones.push({ l: `Today — ${displayPhaseLabel}`, d: getToday(), cls: 'ms-now' });
  if (p.nextVisit) milestones.push({ l: p.nextVisitLabel, d: p.nextVisit, cls: 'ms-next' });

  const renderGroup = (label: string, items: any[]) => {
    if (!items || !items.length) return null;

    const groups: Record<string, any[]> = {};
    items.forEach(item => {
      const cat = item.subcat || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });

    const subcats = Object.keys(groups).sort((a, b) => {
      const order = { screening: 0, fup: 1, general: 2 };
      return (order[a as keyof typeof order] ?? 3) - (order[b as keyof typeof order] ?? 3);
    });

    const totalDone = items.filter(t => isChecked(p.id, t.code)).length;
    const allDone = totalDone === items.length;

    return (
      <div className="a-group">
        <div className="a-group-hdr">
          <div className="a-group-label">{label}</div>
          <div className={`a-group-prog ${allDone ? 'done' : ''}`}>{totalDone}/{items.length}</div>
        </div>
        {subcats.map(cat => {
          const groupItems = [...groups[cat]].sort((a, b) => {
            const getScore = (t: any) => {
              if (t.critical) return 0;
              if (t.urgent) return 1;
              if (t.regulatory) return 2;
              if (t.seq) return 3;
              return 4;
            };
            const scoreA = getScore(a);
            const scoreB = getScore(b);
            if (scoreA !== scoreB) return scoreA - scoreB;
            if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return 0;
          });

          const catLabel = { screening: 'Screening', fup: 'Follow-up', general: 'General' }[cat] || cat;
          const catColor = { screening: 'var(--blue)', fup: 'var(--green)', general: 'var(--t3)' }[cat] || 'var(--t3)';

          const allPatientTasks = Object.values(p.tasks).flat();
          const getTaskLabel = (code: string) => allPatientTasks.find(tx => tx.code === code)?.label || code;

          const activeTrace = tracedTask || hoveredTask;
          const traceData = activeTrace ? allPatientTasks.find(tx => tx.code === activeTrace) : null;
          const tracePrereqs = traceData?.dependsOn || [];
          const traceDependents = activeTrace ? allPatientTasks.filter(tx => tx.dependsOn?.includes(activeTrace)).map(tx => tx.code) : [];

          return (
            <div key={cat} className="a-subgroup">
              {subcats.length > 1 && (
                <div className="a-subgroup-hdr" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: catColor }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: catColor }}></div>
                  {catLabel}
                </div>
              )}
              {groupItems.map(t => {
                const chk = isChecked(p.id, t.code);
                const blocked = isBlocked(p.id, t);
                
                const isHovered = hoveredTask === t.code;
                const isTraced = tracedTask === t.code;
                const isPrereq = tracePrereqs.includes(t.code);
                const isDependent = traceDependents.includes(t.code);
                const isDimmed = activeTrace && !isHovered && !isTraced && !isPrereq && !isDependent;

                const rowClass = t.critical ? 'is-critical-row' : t.periodic ? 'is-periodic-row' : '';
                const highlightClass = isHovered ? 'is-hovered' : isTraced ? 'is-traced' : isPrereq ? 'is-prereq' : isDependent ? 'is-dependent' : '';
                const dimmedClass = isDimmed ? 'is-dimmed' : '';

                return (
                  <div key={t.code} data-code={t.code} className={`a-item ${rowClass} ${blocked ? 'is-blocked' : ''} ${highlightClass} ${dimmedClass}`}
                       tabIndex={0} role="checkbox" aria-checked={chk} aria-label={t.label}
                       onClick={() => role === 'coordinator' && toggleCheck(p.id, t)}
                       onMouseEnter={() => setHoveredTask(t.code)}
                       onMouseLeave={() => setHoveredTask(null)}
                       onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); role === 'coordinator' && toggleCheck(p.id, t); } }}
                       style={{ cursor: blocked ? 'not-allowed' : role === 'manager' ? 'default' : 'pointer', position: 'relative' }}>
                    
                    {(isPrereq || isDependent) && (
                      <div className="dep-connector" style={{ 
                        position: 'absolute', 
                        left: '-2px', 
                        top: '0', 
                        bottom: '0', 
                        width: '4px', 
                        background: isPrereq ? 'var(--amber)' : 'var(--blue)',
                        zIndex: 10,
                        opacity: isDimmed ? 0.3 : 1
                      }} />
                    )}

                    <div className="a-icon">
                      {IconMap[t.icon] ? (() => { const Icon = IconMap[t.icon]; return <Icon size={16} strokeWidth={2.5} />; })() : t.icon}
                    </div>
                    <div className="a-body">
                      <div className={`a-name ${chk ? 'done' : ''} ${blocked ? 'blocked' : ''}`}>
                        {t.label}
                        {isPrereq && <span className="a-badge" style={{ background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-mid)', marginLeft: '8px' }} title={`This task must be completed before ${activeTrace ? getTaskLabel(activeTrace) : 'the hovered task'} can start.`}><ArrowUp size={10} style={{display:'inline', marginRight:'4px'}}/>PREREQUISITE</span>}
                        {isDependent && <span className="a-badge" style={{ background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-mid)', marginLeft: '8px' }} title={`This task depends on ${activeTrace ? getTaskLabel(activeTrace) : 'the hovered task'}.`}><ArrowDown size={10} style={{display:'inline', marginRight:'4px'}}/>DEPENDENT</span>}
                        
                        {(t.dependsOn?.length || allPatientTasks.some(tx => tx.dependsOn?.includes(t.code))) && (
                          <button 
                            className={`note-toggle ${isTraced ? 'active' : ''}`}
                            style={{ marginLeft: '8px', padding: '2px 6px', background: isTraced ? 'var(--blue)' : 'transparent', color: isTraced ? 'white' : 'var(--blue)', border: `1px solid ${isTraced ? 'var(--blue)' : 'var(--blue-mid)'}`, borderRadius: '4px', fontSize: '9px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTracedTask(isTraced ? null : t.code);
                            }}
                            title={isTraced ? "Stop tracing dependencies" : "Trace dependencies for this task"}
                          >
                            <Link size={10} style={{marginRight: '4px'}} />
                            {isTraced ? 'Tracing...' : 'Trace Flow'}
                          </button>
                        )}
                        
                        {t.dueDate && diffDays(getToday(), t.dueDate) <= 0 && !chk && (
                          <span 
                            style={{ 
                              display: 'inline-block', 
                              width: '6px', 
                              height: '6px', 
                              borderRadius: '50%', 
                              background: 'var(--red)', 
                              marginLeft: '6px',
                              verticalAlign: 'middle',
                              boxShadow: '0 0 4px var(--red)'
                            }} 
                            title="Urgent: Due today or overdue"
                          />
                        )}
                        {t.dueDate && (
                          <span className="a-badge" style={{background:'var(--bg)', color:'var(--t3)', border:'1px solid var(--border)', marginLeft:'6px'}}>
                            Due {fmtHuman(t.dueDate)}
                          </span>
                        )}
                        {t.dependsOn && t.dependsOn.length > 0 && (
                          <span 
                            className={`a-badge ${blocked ? 'blocked' : 'ready'}`} 
                            style={{ marginLeft: '6px', cursor: 'pointer' }} 
                            title={`Depends on: ${t.dependsOn.map(getTaskLabel).join(', ')}. Click to find prerequisite.`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const prereq = t.dependsOn?.[0];
                              if (prereq) {
                                const el = document.querySelector(`[data-code="${prereq}"]`);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }}
                          >
                            {blocked ? <Lock size={10} style={{display:'inline', marginRight:'4px'}}/> : <Check size={10} style={{display:'inline', marginRight:'4px'}}/>}
                            <Link size={10} style={{display:'inline', marginRight:'4px'}} />
                            Depends on {t.dependsOn.map(getTaskLabel).join(', ')}
                          </span>
                        )}
                        {allPatientTasks.some(tx => tx.dependsOn?.includes(t.code)) && (
                          <span className="a-badge ready" style={{ marginLeft: '6px' }} title={`Prerequisite for: ${allPatientTasks.filter(tx => tx.dependsOn?.includes(t.code)).map(tx => tx.label).join(', ')}`}>
                            <ArrowDown size={10} style={{display:'inline', marginRight:'4px'}} />
                            Prerequisite for {allPatientTasks.filter(tx => tx.dependsOn?.includes(t.code)).length} tasks
                          </span>
                        )}
                        {t.seq && <span className="a-badge seq" title="Order-critical: must be performed before the next procedure">⓵ FIRST</span>}
                        {t.periodic && <span className="a-badge periodic" title="Periodic assessment — not collected daily">PERIODIC</span>}
                        {t.regulatory && <span className="a-badge regulatory" title="Regulatory traceability — must not be omitted">REGULATORY</span>}
                      </div>
                      <div className="a-note-container">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {t.note ? (
                            <button 
                              className="note-toggle"
                              onClick={(e) => {
                                e.stopPropagation();
                                const key = `${p.id}-${t.code}`;
                                setExpandedNotes(prev => ({ ...prev, [key]: !prev[key] }));
                              }}
                            >
                              {expandedNotes[`${p.id}-${t.code}`] ? 'Hide details' : 'Show details'}
                              <ChevronDown size={12} style={{ transform: expandedNotes[`${p.id}-${t.code}`] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            </button>
                          ) : (
                            <button 
                              className="note-toggle"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDateError(null);
                                setEditTask({ pid: p.id, task: { ...t } });
                              }}
                              title="Add specific instructions for this task"
                            >
                              <Plus size={10} /> Add Note
                            </button>
                          )}
                          {expandedNotes[`${p.id}-${t.code}`] && t.note && (
                            <button 
                              className="note-toggle"
                              style={{ color: 'var(--blue)' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDateError(null);
                                setEditTask({ pid: p.id, task: { ...t } });
                              }}
                              title="Edit specific instructions"
                            >
                              <FileEdit size={10} /> Edit Note
                            </button>
                          )}
                        </div>
                        {expandedNotes[`${p.id}-${t.code}`] && t.note && (
                          <div className={`a-note ${t.urgNote || ''}`}><DLPWrapper onViolation={handleDLPViolation}>{t.note}</DLPWrapper></div>
                        )}
                      </div>
                    </div>
                    <div className="a-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {role === 'coordinator' ? (
                        <>
                          <button 
                            className="ibtn" 
                            style={{ padding: '6px', minHeight: '32px', border: 'none', background: 'transparent' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDateError(null);
                              setEditTask({ pid: p.id, task: { ...t } });
                            }}
                            title="Edit task details"
                          >
                            <FileEdit size={14} color="var(--t3)" />
                          </button>
                          <div className={`chkbox ${chk ? 'checked' : ''}`}></div>
                        </>
                      ) : (
                        <>
                          <button 
                            className="ibtn" 
                            style={{ padding: '6px', minHeight: '32px', border: 'none', background: 'transparent' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleReview(p.id, t.code);
                            }}
                            title="Mark as Reviewed"
                          >
                            <CheckCircle2 size={14} color={reviewedTasks.has(`${p.id}-${t.code}`) ? 'var(--green)' : 'var(--t3)'} />
                          </button>
                          <button 
                            className="ibtn" 
                            style={{ padding: '6px', minHeight: '32px', border: 'none', background: 'transparent' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenQuery(p.id, t.code);
                            }}
                            title="Open Query"
                          >
                            <MessageSquare size={14} color={queries.some(q => q.pid === p.id && q.taskCode === t.code && q.status === 'open') ? 'var(--amber)' : 'var(--t3)'} />
                          </button>
                          <div className={`chkbox ${chk ? 'checked' : ''}`} style={{ opacity: 0.5, cursor: 'default' }}></div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const dtc = diffDays(getToday(), p.nextVisit);
  const win = p.nextVisitWindow || 0;
  const winPct = win > 0 ? Math.min(100, Math.max(0, 50 + (dtc / (win * 2)) * 100)) : 50;
  const wc = win > 0 
    ? (Math.abs(dtc) <= win ? 'var(--green)' : dtc < 0 ? 'var(--red)' : 'var(--amber)')
    : (dtc === 0 ? 'var(--green)' : dtc < 0 ? 'var(--red)' : 'var(--amber)');

  return (
    <div className="screen">
      <div className="hdr">
        <div className="hdr-left"><div className="wordmark">ALTE<em>SA</em></div><span className="hdr-context"><DLPWrapper onViolation={handleDLPViolation}>{p.id}</DLPWrapper> · {displayPhaseLabel}</span></div>
        <div className="hdr-right">
          <button
            className="ibtn"
            onClick={() => setTimelineOpen(true)}
            title="Open Protocol Timeline Navigator"
            style={{ color: 'var(--blue)', fontWeight: 600 }}
          >
            <CalendarDays size={14} /> Timeline
          </button>
          <button
            className="ibtn"
            onClick={() => { setWorkloadLogOpen(true); trackEvent('modal_opened', { modal: 'workload_logger', screen: 'patient' }); }}
            title="Log off-platform time"
          >
            <Clock size={14} /> Log Time
          </button>
          <button className="ibtn" onClick={() => setHelpOpen(true)} title="Help Centre"><HelpCircle size={14} /> Help</button>
          <button className="ibtn relative" onClick={() => setNotifOpen(true)} title="Notifications">
            <Bell size={14} />
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            )}
          </button>
          <button className="ibtn" onClick={() => setCmdOpen(true)}><Search size={14} /></button>
          <button className="ibtn" onClick={() => { setPin(''); setScreen('auth'); }}><Lock size={14} /> Lock</button>
        </div>
      </div>
      {p.dtqPos && (
        <div className="crit-banner">
          <div className="crit-pulse"></div>
          <div className="crit-text"><strong>RV Protocol Active</strong> — DTQ Positive · 48h + 6h window running</div>
          {role === 'coordinator' && (
            <button className="crit-action" onClick={() => { setCdStart(Date.now() - 3 * 3600000); setWzOpen(true); }}>Open Wizard <ArrowRight size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/></button>
          )}
        </div>
      )}
      {p.alert === 'MONTHLY_CALL' && (
        <div className="warn-banner"><strong>Monthly Call Due</strong> — Week 8 (Day 56-58) ± 5 days</div>
      )}
      {getRescreeningStatus(p) && (
        <div className="warn-banner" style={{ background: 'var(--amber-bg)', borderBottom: '1px solid var(--amber-mid)', color: 'var(--amber)', display: 'flex', alignItems: 'center', padding: '10px 20px' }}>
          <AlertTriangle size={16} style={{ marginRight: '10px' }} />
          <div style={{ flex: 1 }}>
            <strong>Rescreening Window Open</strong> — Patient is nearing the Week {getRescreeningStatus(p)?.milestone} re-evaluation milestone ({getRescreeningStatus(p)?.days} days remaining).
          </div>
          {role === 'coordinator' && (
            <button 
              className="btn btn-primary" 
              style={{ padding: '4px 12px', fontSize: '11px', background: 'var(--amber)', borderColor: 'var(--amber)', color: '#fff' }}
              onClick={() => {
                setRescreeningData(p);
                setRescreeningOpen(true);
                setRescreeningStep(1);
              }}
            >
              Start Rescreening Workflow
            </button>
          )}
        </div>
      )}
      <div className="pv-wrap">
        <div className="pv-topbar">
          <button className="back-btn" onClick={() => setScreen(role === 'manager' ? 'manager_dashboard' : 'dashboard')}><ArrowLeft size={14} /> Back</button>
          <div className="pv-id-block">
            <div className="pv-id">
              <DLPWrapper onViolation={handleDLPViolation}>{p.id}</DLPWrapper> 
              <span style={{color:'var(--t3)', fontWeight:400, fontSize:'16px', marginLeft:'8px'}}>
                <DLPWrapper onViolation={handleDLPViolation}>{p.name}</DLPWrapper>
              </span>
              {role === 'coordinator' && (
                <button 
                  className="ibtn" 
                  style={{ marginLeft: '12px', padding: '4px 8px', minHeight: '28px', fontSize: '11px', display: 'inline-flex' }}
                  onClick={() => {
                    setEditPatientData({ name: p.name, lang: p.lang, loc: p.loc, protocolVersion: p.protocolVersion });
                    setEditPatientOpen(true);
                    setModalErr('');
                  }}
                >
                  <FileEdit size={12} /> Edit
                </button>
              )}
            </div>
            <div className="pv-id-sub">
              <span className={`phase-badge ${phBadge}`}>{displayPhaseLabel}</span>
              {p.protocolVersion && (
                <span className="phase-badge bg-purple-100 text-purple-700 ml-2" style={{ background: '#F3E8FF', color: '#7E22CE' }}>
                  <FileText size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  {protocolVersions.find(v => v.id === p.protocolVersion)?.label || `Amendment ${p.protocolVersion}`}
                </span>
              )}
              &nbsp;·&nbsp; Study Day <span style={{ fontFamily: 'var(--fm)' }}>{p.studyDay || 0}</span>
              &nbsp;·&nbsp; {p.loc.includes('CLINIC') ? '🏥 Clinic' : '🏠 Home'}
              &nbsp;·&nbsp; <span style={{ fontFamily: 'var(--fm)' }}>{fmtISO(getToday())}</span>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center', fontSize: '10px', color: 'var(--t3)', background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: '20px', width: 'fit-content' }}>
              <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>DEPENDENCY FLOW:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '8px', height: '8px', background: 'var(--amber)', borderRadius: '2px' }}></div>
                <span>Prerequisite</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '8px', height: '8px', background: 'var(--blue)', borderRadius: '2px' }}></div>
                <span>Dependent</span>
              </div>
              <span style={{ opacity: 0.6, marginLeft: '8px' }}>(Hover or click &quot;Trace Flow&quot; to see links)</span>
            </div>
          </div>
          <div><span className={`progress-pill ${pct === 100 ? 'done' : ''}`}>{done}/{total} {pct === 100 ? <Check size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> : ''}</span></div>
        </div>
        <div className="full-tl-section">
          <div className="full-tl-wrap">
            <div className="full-tl-now-lbl" style={{ left: `${nowPct.toFixed(1)}%` }}>▼ Today</div>
            <div className="full-tl-bar">
              <div className="full-s-scr" title="Screening / Rescreening every 6 months">SCR</div>
              <div className="full-s-psb" title="Pre-Symptomatic Baseline — daily DTQ, E-RS/PGIS, WURSS-11. Up to 68 weeks.">Asymptomatic Phase (<abbr title="Pre-Symptomatic Baseline">PSB</abbr>) — up to 68 weeks</div>
              <div className="full-s-rv" title="RV Infection — 48h + 6h randomisation window">RV</div>
              <div className="full-s-tx" title="Treatment Period — once-daily study drug, D1–D7">Treatment D1–D7</div>
              <div className="full-s-fu" title="Follow-up — Day 14, 28, 42 (EOS)">Follow-up D8–D42 (EOS)</div>
            </div>
            <div className="full-tl-now" style={{ left: `${nowPct.toFixed(1)}%` }}></div>
            <div className="full-tl-labels">
              <div className="ftl-lbl" style={{ flex: '0 0 10%' }}>W0</div>
              <div className="ftl-lbl" style={{ flex: '0 0 60%', color: 'var(--blue)' }}>Weeks 1–68 (rescreening every 6 months · monthly calls ±5d)</div>
              <div className="ftl-lbl" style={{ flex: '0 0 2%' }}></div>
              <div className="ftl-lbl" style={{ flex: '0 0 4.6%', color: 'var(--amber)' }}>D1–D7</div>
              <div className="ftl-lbl" style={{ flex: '0 0 23.4%', color: 'var(--green)' }}>D8/D14/D28/D42 (EOS)</div>
            </div>
            <div className="tl-legend">
              <div className="tl-legend-item"><div className="tl-legend-swatch" style={{ background: 'var(--ph-scr)' }}></div>Screening</div>
              <span className="tl-legend-sep">·</span>
              <div className="tl-legend-item"><div className="tl-legend-swatch" style={{ background: 'var(--ph-psb)' }}></div><abbr title="Pre-Symptomatic Baseline">PSB</abbr></div>
              <span className="tl-legend-sep">·</span>
              <div className="tl-legend-item"><div className="tl-legend-swatch" style={{ background: 'var(--ph-rv)' }}></div><abbr title="Rhinovirus">RV</abbr> Onset</div>
              <span className="tl-legend-sep">·</span>
              <div className="tl-legend-item"><div className="tl-legend-swatch" style={{ background: 'var(--ph-tx)' }}></div>Treatment</div>
              <span className="tl-legend-sep">·</span>
              <div className="tl-legend-item"><div className="tl-legend-swatch" style={{ background: 'var(--ph-fu)' }}></div>Follow-up</div>
              <div className="tl-legend-note">▌ = Today&apos;s position</div>
            </div>
            <div className="milestone-row">
              {milestones.map((m, i) => (
                <div key={i} className={`milestone ${m.cls}`} title={fmtISO(m.d)}>
                  <span>{m.cls === 'ms-done' ? <Check size={12} /> : m.cls === 'ms-now' ? <Circle size={10} fill="currentColor" /> : m.cls === 'ms-next' ? <ArrowRight size={12} /> : <Circle size={10} />}</span>
                  <span>{m.l}</span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: '9.5px', opacity: .7 }}>{fmtHuman(m.d)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="today-context-bar" style={{ background: `linear-gradient(90deg, ${phaseColor} 0%, transparent 100%)` }}></div>
        <div className="pv-grid">
          <div>
            {p.dtqPos && (
              <button className="dtq-btn" onClick={() => { setCdStart(Date.now() - 3 * 3600000); setWzOpen(true); }}>
                <AlertTriangle size={18} /><span>Open RV Protocol Wizard — Countdown Active</span>
              </button>
            )}
            <div className="card" ref={taskListRef} style={{ position: 'relative' }}>
              <DependencyLines activeTrace={tracedTask || hoveredTask} p={p} taskListRef={taskListRef} />
              <div className="card-hdr">
                <div><div className="card-title">Today&apos;s Assessment Checklist</div><div className="card-sub">{displayPhaseLabel} · {p.loc} · {fmtISO(getToday())}</div></div>
                <div className={`progress-pill ${pct === 100 ? 'done' : ''}`}>{done}/{total}</div>
              </div>
              {renderGroup('Questionnaires / ePRO', p.tasks.q)}
              {renderGroup('Procedures', p.tasks.pr)}
              {renderGroup('Laboratory', p.tasks.l)}
              {renderGroup('Administrative', p.tasks.ad)}
            </div>
          </div>
          <div className="rpanel">
            {p.ers && p.ers.length > 0 && (
              <div className="scard">
                <div className="scard-hdr"><BarChart2 size={14} /> E-RS Trend · Last 30 Days</div>
                <div className="scard-body">
                  <Sparkline scores={p.ers} psb={p.psb} />
                  <div className="ers-stat-row">
                    <div className="ers-stat"><div className="ers-val" style={{ color: 'var(--amber)' }}>{p.psb ?? '—'}</div><div className="ers-lbl">PSB Score</div></div>
                    <div className="ers-stat">
                      <div className="ers-val" style={{ 
                        color: p.psb && p.ers[p.ers.length - 1] > p.psb ? 'var(--red)' : 'var(--green)',
                        fontWeight: p.psb && (p.ers[p.ers.length - 1] < 0 || p.ers[p.ers.length - 1] > 10) ? 800 : 700,
                        textDecoration: p.psb && (p.ers[p.ers.length - 1] < 0 || p.ers[p.ers.length - 1] > 10) ? 'underline wavy var(--red) 2px' : 'none',
                        background: p.psb && (p.ers[p.ers.length - 1] < 0 || p.ers[p.ers.length - 1] > 10) ? 'var(--red-bg)' : 'transparent',
                        padding: p.psb && (p.ers[p.ers.length - 1] < 0 || p.ers[p.ers.length - 1] > 10) ? '2px 6px' : '0',
                        borderRadius: '4px'
                      }}>
                        {p.ers[p.ers.length - 1]}
                      </div>
                      <div className="ers-lbl">Today</div>
                    </div>
                    <div className="ers-stat"><div className="ers-val" style={{ color: 'var(--blue)' }}>{p.psbRecords}</div><div className="ers-lbl">Records</div></div>
                  </div>
                  {p.psb != null && p.ers.length > 0 && (p.ers[p.ers.length - 1] < 0 || p.ers[p.ers.length - 1] > 10) && (
                    <div style={{ marginTop: '9px', padding: '7px', background: 'var(--red-bg)', borderRadius: '4px', fontSize: '11px', color: 'var(--red)' }}>
                      <AlertTriangle size={12} style={{display:'inline', verticalAlign:'text-bottom', marginRight: '4px'}}/>
                      Warning: E-RS score is outside the expected range of 0 to 10 based on the PSB value.
                    </div>
                  )}
                  {p.psbRecords < 3 && <div style={{ marginTop: '9px', padding: '7px', background: 'var(--red-bg)', borderRadius: '4px', fontSize: '11px', color: 'var(--red)' }}><AlertTriangle size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> &lt; 3 records — PSB not yet valid</div>}
                </div>
              </div>
            )}
            {p.resolution && (
              <div className="scard">
                <div className="scard-hdr"><CheckCircle2 size={14} /> Resolution Confirmed</div>
                <div className="scard-body">
                  <div className="resolution-box">
                    <div className="resolution-date">{fmtHuman(p.resolution)}</div>
                    <div className="resolution-lbl">3 consecutive E-RS days ≤ PSB<br /><span style={{ fontFamily: 'var(--fm)', fontSize: '10px' }}>{fmtISO(p.resolution)}</span></div>
                  </div>
                </div>
              </div>
            )}
            {(p.phaseCode === 'scr' || p.phaseCode === 'rescr') && (
              <div className="scard">
                <div className="scard-hdr"><CheckCircle2 size={14} /> {p.phaseCode === 'rescr' ? 'Rescreening Actions' : 'Screening Actions'}</div>
                <div className="scard-body" style={{ padding: '10px 14px' }}>
                  <button 
                    className="btn btn-primary" 
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setScreeningOutcomeOpen(true)}
                  >
                    {p.phaseCode === 'rescr' ? 'Record Rescreening Outcome' : 'Record Screening Outcome'}
                  </button>
                </div>
              </div>
            )}
            <div className="scard">
              <div className="scard-hdr"><Bell size={14} /> Schedule & Alerts</div>
              <div className="scard-body" style={{ padding: '10px 14px' }}>
                {p.alert === 'DTQ_POSITIVE' && <div className="al-item"><div className="al-pip" style={{ background: 'var(--red)' }}></div><div><div className="al-body">RV Protocol Active — attend clinic ASAP</div><div className="al-sub">48 h + 6 h window from symptom onset</div></div></div>}
                {p.alert === 'MONTHLY_CALL' && <div className="al-item"><div className="al-pip" style={{ background: 'var(--amber)' }}></div><div><div className="al-body">Monthly call due (±5 days)</div><div className="al-sub">{p.monthlyCallDue ? fmtHuman(p.monthlyCallDue) : ''}</div></div></div>}
                {p.alert === 'RESCREENING' && <div className="al-item"><div className="al-pip" style={{ background: 'var(--amber)' }}></div><div><div className="al-body">Rescreening in {diffDays(getToday(), p.nextVisit)} days</div><div className="al-sub">{fmtHuman(p.nextVisit)}</div></div></div>}
                <div className="al-item"><div className="al-pip" style={{ background: 'var(--blue)' }}></div><div><div className="al-body">{p.nextVisitLabel}</div><div className="al-sub">{fmtHuman(p.nextVisit)}</div></div></div>
              </div>
            </div>
            <div className="scard">
              <div className="scard-hdr"><Calendar size={14} /> {win > 0 ? 'Next Visit Window' : 'Next Visit'}</div>
              <div className="scard-body">
                <div style={{ fontSize: '11.5px', color: 'var(--t2)', marginBottom: '7px' }}>{p.nextVisitLabel}</div>
                <div className="wt-center" style={{ color: wc }}>{fmtHuman(p.nextVisit)}</div>
                {win > 0 ? (
                  <div className="wt-wrap">
                    <div className="wt-bar">
                      <div className="wt-ok-zone" style={{ left: '25%', right: '25%', background: wc }}></div>
                      <div className="wt-cursor" style={{ left: `${winPct}%`, background: wc }}></div>
                    </div>
                    <div className="wt-labels">
                      <span>−{win} {win === 1 ? 'day' : 'days'}</span>
                      <span style={{ color: wc, fontWeight: 600 }}>Optimal</span>
                      <span>+{win} {win === 1 ? 'day' : 'days'}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--t3)', marginTop: '8px', padding: '8px', background: 'rgba(0,0,0,0.02)', borderRadius: '4px' }}>
                    No visit window defined for this milestone.
                  </div>
                )}
              </div>
            </div>
            {p.labNote && <div className="scard"><div className="scard-hdr" style={{ color: 'var(--blue)' }}><Flag size={14} /> Protocol Note</div><div className="scard-body"><div className="scard-note"><DLPWrapper onViolation={handleDLPViolation}>{p.labNote}</DLPWrapper></div></div></div>}

            {/* Navigator Daily Log */}
            <NavigatorLog
              patient={p}
              onNewReminder={(entry) => {
                setNotifications(prev => [{
                  id: `rem_${entry.id}`,
                  type: 'info' as const,
                  title: `Reminder · ${p.id}`,
                  message: entry.reminderText || entry.text.substring(0, 120),
                  timestamp: new Date(),
                  read: false,
                  patientId: p.id,
                }, ...prev]);
                showToast('Reminder saved and added to notifications', 'ok');
              }}
            />
          </div>
        </div>
      </div>
      
      {/* Modals */}
      {selPatientId && (
        <ScreeningOutcomeModal
          patient={patients.find(p => p.id === selPatientId)!}
          isOpen={screeningOutcomeOpen}
          onClose={() => setScreeningOutcomeOpen(false)}
          onOutcome={handleScreeningOutcome}
        />
      )}
      {editPatientOpen && editPatientData && (
        <div className="modal-overlay" onClick={() => { setEditPatientOpen(false); setModalErr(""); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-title">Edit Patient Details</div>
              <button type="button" aria-label="Close" className="ibtn" onClick={() => { setEditPatientOpen(false); setModalErr(""); }}><X size={18} aria-hidden="true" /></button>
            </div>
            <form onSubmit={handleUpdatePatient}>
              <div className="modal-body">
                {modalErr && (
                  <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-mid)', borderRadius: 'var(--r1)', color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={14} /> {modalErr}
                  </div>
                )}
                <div style={{ marginBottom: '24px' }}>
                  <label htmlFor="edit-patient-name-pv" className="modal-label"><User size={12} /> Full Name</label>
                  <input 
                    id="edit-patient-name-pv"
                    autoFocus
                    type="text" 
                    className="modal-input"
                    value={editPatientData.name} 
                    onChange={e => setEditPatientData({ ...editPatientData, name: e.target.value })} 
                    placeholder="e.g. John Doe"
                    required
                    onCopy={(e) => { e.preventDefault(); handleDLPViolation('copy'); }}
                    onCut={(e) => { e.preventDefault(); handleDLPViolation('cut'); }}
                    onDragStart={(e) => { e.preventDefault(); handleDLPViolation('drag'); }}
                  />
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label className="modal-label"><Globe size={12} /> Primary Language</label>
                  <select 
                    className="modal-input"
                    value={editPatientData.lang} 
                    onChange={e => setEditPatientData({ ...editPatientData, lang: e.target.value })}
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Mandarin">Mandarin</option>
                  </select>
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label className="modal-label"><Hospital size={12} /> Current Location</label>
                  <select 
                    className="modal-input"
                    value={editPatientData.loc} 
                    onChange={e => setEditPatientData({ ...editPatientData, loc: e.target.value })}
                  >
                    <option value="CLINIC">CLINIC</option>
                    <option value="HOME">HOME</option>
                    <option value="HOME→CLINIC">HOME→CLINIC</option>
                  </select>
                </div>
                {protocolVersions && protocolVersions.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <label className="modal-label"><FileText size={12} /> Protocol Amendment Version</label>
                    <select 
                      className="modal-input"
                      value={editPatientData.protocolVersion || ''} 
                      onChange={e => setEditPatientData({ ...editPatientData, protocolVersion: e.target.value })}
                    >
                      <option value="">(Not Set)</option>
                      {protocolVersions.map(pv => (
                        <option key={pv.id} value={pv.id}>
                          {pv.id} - {pv.label} {pv.status === 'active' ? '(Current)' : '(Legacy)'}
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                      If you change the amendment version, the patient&apos;s schedule and rules will update going forward.
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="ibtn" onClick={() => { setEditPatientOpen(false); setModalErr(""); }}>Cancel</button>
                <button type="submit" className="ibtn" style={{ background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 600 }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {wzOpen && (
        <Wizard 
          patientId={selPatientId}
          step={wzStep} 
          setStep={setWzStep} 
          chks={wzChks} 
          setChks={setWzChks} 
          cdStart={cdStart} 
          onClose={(force: boolean) => {
            const hasProgress = Object.values(wzChks).some(s => s.size > 0);
            if (!force && hasProgress) {
              setWzConfirmOpen(true);
            } else {
              setWzOpen(false);
            }
          }}
          onRandomise={() => setRndConfirmOpen(true)}
          onAbort={handleAbortProtocol}
          onToggleChk={(step: number, i: number) => {
            const currentChks = wzChks[step] || new Set();
            if (!currentChks.has(i)) {
              setWzCheckConfirm({ step, index: i });
            } else {
              setWzChks((prev: any) => {
                const next = { ...prev };
                const s = new Set(next[step]);
                s.delete(i);
                next[step] = s;
                return next;
              });
            }
          }}
        />
      )}
      
      {wzConfirmOpen && (
        <div className="confirm-overlay" style={{ zIndex: 700 }}>
          <div className="confirm-card">
            <div className="confirm-icon"><AlertTriangle size={32} color="var(--amber)" /></div>
            <div className="confirm-title">Close RV Protocol Wizard?</div>
            <div className="confirm-body">Progress will be <strong>saved</strong> and restored when you reopen. The countdown timer continues running.</div>
            <div className="confirm-btns">
              <button className="btn btn-ghost" onClick={() => setWzConfirmOpen(false)}>Keep open</button>
              <button className="btn btn-danger" onClick={() => { setWzConfirmOpen(false); setWzOpen(false); }}>Close &amp; save</button>
            </div>
          </div>
        </div>
      )}

      {rescreeningOpen && rescreeningData && (
        <RescreeningWizard 
          patient={rescreeningData}
          step={rescreeningStep}
          setStep={setRescreeningStep}
          chks={rescreeningChks}
          onToggleChk={toggleRescreeningChk}
          onClose={() => setRescreeningOpen(false)}
          onComplete={handleCompleteRescreening}
        />
      )}
      
      {rndConfirmOpen && (
        <div className="confirm-overlay" style={{ zIndex: 700 }}>
          <div className="confirm-card">
            <div className="confirm-icon"><Microscope size={32} color="var(--blue)" /></div>
            <div className="confirm-title">Confirm Randomisation</div>
            <div className="confirm-body">You are about to <strong>randomise {selPatientId}</strong> and initiate the Treatment Period. This action is <strong>irreversible</strong> in the clinical record. All 7 protocol steps have been confirmed.</div>
            <div className="confirm-btns">
              <button className="btn btn-ghost" onClick={() => setRndConfirmOpen(false)}>Review again</button>
              <button className="btn btn-success" onClick={() => {
                setRndConfirmOpen(false);
                setWzOpen(false);
                setPatients(prev => prev.map(p => {
                  if (p.id === selPatientId) {
                    return {
                      ...p,
                      dtqPos: false,
                      alert: null,
                      phase: 'TREATMENT',
                      phaseCode: 'tx',
                      phaseLabel: 'Treatment · Day 1',
                      loc: 'CLINIC',
                      randomizationDate: new Date(),
                      nextVisit: addDays(new Date(), 2),
                      nextVisitLabel: 'Treatment Day 3 (±1) — Clinic',
                      nextVisitWindow: 1,
                      tasks: {
                        q: [
                          { code: 'ERS', label: 'E-RS / PGIS (EXACT)', icon: '📋', done: false, note: 'Daily D1→D28. Continues to D42 if not returned to PSB by D28 (fn. i)' },
                          { code: 'WURSS', label: 'WURSS-11', icon: '📋', done: false, note: 'Daily through Day 28 ONLY — does not continue to D42 (fn. i)' },
                        ],
                        pr: [
                          { code: 'PE', label: 'Physical Exam — limited (include weight)', icon: '🩺', done: false, note: 'Symptom-directed. Include weight (fn. c)' },
                          { code: 'VS', label: 'Vital Signs', icon: '🩺', done: false, note: 'Seated ≥ 5 min (fn. d)' },
                          { code: 'OSC', label: 'Oscillometry', icon: '🫁', done: false, seq: true, note: 'Perform BEFORE spirometry (fn. f)' },
                          { code: 'SPI', label: 'Spirometry', icon: '🫁', done: false, note: 'Washout required (fn. f)', dependsOn: ['OSC'], attestation: 'I confirm that the patient has completed the required washout period prior to this assessment.' },
                          { code: 'CVC', label: 'Central Virology Collection', icon: '🦠', done: false, note: 'Mid-turbinate nasal swab each nostril (fn. g)' },
                          { code: 'ECG', label: 'ECG (12-lead)', icon: '🫀', done: false, note: 'Collect PRIOR to blood draw (fn. e)' },
                          { code: 'DRUG', label: 'Study Drug Dosing — Day 1', icon: '💊', done: false, note: 'First dose in clinic', dependsOn: ['CVC', 'ECG', 'CSL'], requiresData: { label: 'Time of First Dose', type: 'time' } },
                        ],
                        l: [
                          { code: 'CSL', label: 'Central Safety Labs — Chemistry / Haematology', icon: '🧪', done: false, note: 'Urinalysis only if clinically indicated' },
                          { code: 'PT_U', label: 'Pregnancy Test (urine — WOCBP only)', icon: '🧪', done: false, note: 'Urine at Day 1 Pre-Dose (fn. a)' },
                        ],
                        ad: [
                          { code: 'AE', label: 'Adverse Events', icon: '⚠️', done: false, regulatory: true, note: 'Collected from first dose through Day 42 Visit (fn. k)', subcat: 'fup' },
                          { code: 'CMED', label: 'Concomitant Medications', icon: '💊', done: false, note: 'Record any changes (fn. l)', subcat: 'fup' },
                          { code: 'HOSP', label: 'COPD-related Hospitalisations', icon: '🏥', done: false, subcat: 'fup' },
                          { code: 'PRN', label: 'COPD PRN Inhaler Use', icon: '💨', done: false, note: 'Collected with E-RS', subcat: 'general' },
                        ]
                      }
                    };
                  }
                  return p;
                }));
                showToast(`${selPatientId} randomised — Treatment Period activated`, 'ok');
              }}><Check size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Confirm Randomisation</button>
            </div>
          </div>
        </div>
      )}

      {wzCheckConfirm && (
        <div className="confirm-overlay" style={{ zIndex: 700 }}>
          <div className="confirm-card">
            <div className="confirm-icon"><CheckCircle2 size={32} color="var(--blue)" /></div>
            <div className="confirm-title">Confirm Protocol Step</div>
            <div className="confirm-body">
              Are you sure you want to confirm this protocol requirement?
              <div style={{marginTop:'12px', padding:'10px', background:'var(--bg)', borderRadius:'4px', fontSize:'12px', border:'1px solid var(--border)'}}>
                {WZ_STEPS[wzCheckConfirm.step].checks[wzCheckConfirm.index]}
              </div>
            </div>
            <div className="confirm-btns">
              <button className="btn btn-ghost" onClick={() => setWzCheckConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                setWzChks((prev: any) => {
                  const next = { ...prev };
                  if (!next[wzCheckConfirm.step]) next[wzCheckConfirm.step] = new Set();
                  const s = new Set(next[wzCheckConfirm.step]);
                  s.add(wzCheckConfirm.index);
                  next[wzCheckConfirm.step] = s;
                  return next;
                });
                setWzCheckConfirm(null);
              }}>Confirm Step</button>
            </div>
          </div>
        </div>
      )}

      {taskConfirm && (
        <div className="confirm-overlay" style={{ zIndex: 700 }}>
          <div className="confirm-card">
            <div className="confirm-icon">
              {taskConfirm.task.critical || taskConfirm.task.regulatory ? <AlertTriangle size={32} color="var(--red)" /> : <CheckCircle2 size={32} color="var(--blue)" />}
            </div>
            <div className="confirm-title">Confirm Assessment Completion</div>
            <div className="confirm-body">
              {taskConfirm.task.code === 'DTQ' ? (
                <>What was the result of the <strong>Daily Trigger Questionnaire</strong> for <strong>{taskConfirm.pid}</strong>?</>
              ) : (
                <>
                  <p>Are you sure you want to mark <strong>{taskConfirm.task.label}</strong> as complete for <strong>{taskConfirm.pid}</strong>?</p>
                  
                  {taskConfirm.task.attestation && (
                    <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'left' }}>
                      <label style={{ display: 'flex', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                        <input 
                          type="checkbox" 
                          checked={attestationChecked} 
                          onChange={(e) => setAttestationChecked(e.target.checked)}
                          style={{ marginTop: '3px' }}
                        />
                        <span>{taskConfirm.task.attestation}</span>
                      </label>
                    </div>
                  )}

                  {taskConfirm.task.requiresData && (
                    <div style={{ marginTop: '16px', textAlign: 'left' }}>
                      <label className="modal-label">{taskConfirm.task.requiresData.label}</label>
                      <input 
                        type={taskConfirm.task.requiresData.type} 
                        className="modal-input"
                        placeholder={taskConfirm.task.requiresData.placeholder}
                        value={taskDataValue}
                        onChange={(e) => setTaskDataValue(e.target.value)}
                      />
                    </div>
                  )}
                </>
              )}
              {(taskConfirm.task.regulatory || taskConfirm.task.critical) && <div style={{marginTop:'12px', padding:'8px', background:'var(--red-bg)', borderRadius:'4px', fontSize:'11px', color:'var(--red)', fontWeight:600, border:'1px solid var(--red)'}}>⚠ REGULATORY REQUIREMENT: This assessment is critical for study compliance and data integrity.</div>}
            </div>
            <div className="confirm-btns">
              <button className="btn btn-ghost" onClick={() => setTaskConfirm(null)}>Cancel</button>
              {taskConfirm.task.code === 'DTQ' ? (
                <>
                  <button className="btn btn-danger" onClick={() => {
                    handleDTQResult(taskConfirm.pid, true);
                    setTaskConfirm(null);
                  }}>Positive Result</button>
                  <button className="btn btn-primary" onClick={() => {
                    handleDTQResult(taskConfirm.pid, false);
                    setTaskConfirm(null);
                  }}>Negative Result</button>
                </>
              ) : (
                <button 
                  className={`btn ${taskConfirm.task.critical || taskConfirm.task.regulatory ? 'btn-danger' : 'btn-primary'}`} 
                  disabled={(taskConfirm.task.attestation && !attestationChecked) || (taskConfirm.task.requiresData && !taskDataValue)}
                  onClick={() => {
                    performToggle(taskConfirm.pid, taskConfirm.task.code);
                    setTaskConfirm(null);
                  }}>Confirm Completion</button>
              )}
            </div>
          </div>
        </div>
      )}

      {cmdOpen && (
        <CmdPalette 
          q={cmdQ} 
          setQ={setCmdQ} 
          onClose={() => setCmdOpen(false)} 
          patients={patients}
          recentIds={recentIds}
          onSelect={(id: string) => {
            if (id === 'dashboard') {
              setScreen('dashboard');
            } else {
              openPatient(id);
            }
            setCmdOpen(false);
          }} 
        />
      )}
      
      {editTask && (
        <div className="modal-overlay" style={{ zIndex: 700 }}>
          <div className="modal-card">
            <div className="modal-hdr">
              <div className="modal-title">Edit Task Details</div>
              <button aria-label="Close" className="ibtn" onClick={() => setEditTask(null)}><X size={16} aria-hidden="true" /></button>
            </div>
            <div className="modal-body">
              <div className="modal-label"><label htmlFor="edit-task-label"><FileText size={12} /> Task Label</label></div>
              <input 
                id="edit-task-label"
                className="modal-input" 
                value={editTask.task.label} 
                onChange={e => setEditTask({ ...editTask, task: { ...editTask.task, label: e.target.value } })}
                placeholder="Assessment name"
              />
              
              <div className="modal-label" style={{ marginTop: '20px' }}><ClipboardList size={12} /> Instructions / Note</div>
              <textarea 
                className="modal-input" 
                style={{ minHeight: '80px', resize: 'vertical' }}
                value={editTask.task.note || ''} 
                onChange={e => setEditTask({ ...editTask, task: { ...editTask.task, note: e.target.value } })}
                placeholder="Additional instructions for the coordinator"
              />

              <div className="modal-label" style={{ marginTop: '20px' }}><Calendar size={12} /> Due Date</div>
              {dateError && (
                <div style={{ marginBottom: '8px', padding: '8px 12px', background: 'var(--amber-bg)', border: '1px solid var(--amber-mid)', borderRadius: 'var(--r1)', color: 'var(--amber)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={14} /> {dateError}
                </div>
              )}
              <div className="modal-label" style={{ marginTop: '16px' }}><label htmlFor="edit-task-date"><Calendar size={12} /> Due Date</label></div>
              <input 
                id="edit-task-date"
                type="date"
                max={new Date().toISOString().split('T')[0]}
                className="modal-input" 
                value={editTask.task.dueDate ? fmtISO(new Date(editTask.task.dueDate)) : ''} 
                onChange={e => {
                  const d = e.target.value ? new Date(e.target.value + 'T12:00:00') : undefined;
                  if (d && d > new Date()) {
                    setDateError("Oops! It looks like you've selected a date in the future. Please choose a valid date (today or earlier).");
                  } else {
                    setDateError(null);
                    setEditTask({ ...editTask, task: { ...editTask.task, dueDate: d } });
                  }
                }}
              />
              <div className="modal-help">
                <Info size={12} />
                Changing the due date will re-prioritize this task in the patient view.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setEditTask(null); setDateError(null); }}>Cancel</button>
              <button className="btn btn-primary" disabled={!!dateError} onClick={() => { handleSaveTask(editTask.pid, editTask.task); setDateError(null); }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {editPatientOpen && editPatientData && (
        <div className="modal-overlay" style={{ zIndex: 700 }} onClick={() => { setEditPatientOpen(false); setModalErr(""); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-title">Edit Patient Details</div>
              <button type="button" aria-label="Close" className="ibtn" onClick={() => { setEditPatientOpen(false); setModalErr(""); }}><X size={18} aria-hidden="true" /></button>
            </div>
            <form onSubmit={handleUpdatePatient}>
              <div className="modal-body">
                {modalErr && (
                  <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-mid)', borderRadius: 'var(--r1)', color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={14} /> {modalErr}
                  </div>
                )}
                <div style={{ marginBottom: '24px' }}>
                  <label htmlFor="edit-patient-name-2" className="modal-label"><User size={12} /> Full Name</label>
                  <input 
                    id="edit-patient-name-2"
                    autoFocus
                    type="text" 
                    className="modal-input"
                    value={editPatientData.name} 
                    onChange={e => setEditPatientData({ ...editPatientData, name: e.target.value })} 
                    placeholder="e.g. John Doe"
                    required
                    onCopy={(e) => { e.preventDefault(); handleDLPViolation('copy'); }}
                    onCut={(e) => { e.preventDefault(); handleDLPViolation('cut'); }}
                    onDragStart={(e) => { e.preventDefault(); handleDLPViolation('drag'); }}
                  />
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label className="modal-label"><Globe size={12} /> Primary Language</label>
                  <select 
                    className="modal-input"
                    value={editPatientData.lang} 
                    onChange={e => setEditPatientData({ ...editPatientData, lang: e.target.value })}
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Mandarin">Mandarin</option>
                  </select>
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label className="modal-label"><Hospital size={12} /> Current Location</label>
                  <select 
                    className="modal-input"
                    value={editPatientData.loc} 
                    onChange={e => setEditPatientData({ ...editPatientData, loc: e.target.value })}
                  >
                    <option value="CLINIC">CLINIC</option>
                    <option value="HOME">HOME</option>
                    <option value="HOME→CLINIC">HOME→CLINIC</option>
                  </select>
                </div>
                {protocolVersions && protocolVersions.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <label className="modal-label"><FileText size={12} /> Protocol Amendment Version</label>
                    <select 
                      className="modal-input"
                      value={editPatientData.protocolVersion || ''} 
                      onChange={e => setEditPatientData({ ...editPatientData, protocolVersion: e.target.value })}
                    >
                      <option value="">(Not Set)</option>
                      {protocolVersions.map(pv => (
                        <option key={pv.id} value={pv.id}>
                          {pv.id} - {pv.label} {pv.status === 'active' ? '(Current)' : '(Legacy)'}
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                      If you change the amendment version, the patient&apos;s schedule and rules will update going forward.
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="ibtn" onClick={() => { setEditPatientOpen(false); setModalErr(""); }}>Cancel</button>
                <button type="submit" className="ibtn" style={{ background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 600 }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {notifOpen && (
        <div className="modal-overlay" style={{ zIndex: 800 }}>
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-hdr">
              <div className="modal-title">Notification Centre</div>
              <button aria-label="Close" className="ibtn" onClick={() => setNotifOpen(false)}><X size={16} aria-hidden="true" /></button>
            </div>
            <div className="modal-body" style={{ padding: '0' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)' }}>
                  {notifications.length} Notifications
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    className="ibtn" 
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                  >
                    Mark all read
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={emailEnabled} onChange={e => setEmailEnabled(e.target.checked)} />
                    <Mail size={12} aria-hidden="true" /> Email Alerts
                  </label>
                </div>
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t3)' }}>
                    <Bell size={32} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
                    <p>No active notifications</p>
                  </div>
                ) : (
                  notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).map(n => (
                    <div 
                      key={n.id} 
                      className={`notif-item ${n.read ? 'read' : 'unread'}`}
                      style={{ 
                        padding: '16px 20px', 
                        borderBottom: '1px solid var(--border)', 
                        cursor: 'pointer',
                        background: n.read ? 'transparent' : 'var(--blue-bg)',
                        position: 'relative'
                      }}
                      onClick={() => {
                        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                        if (n.patientId) openPatient(n.patientId);
                        setNotifOpen(false);
                      }}
                    >
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ marginTop: '2px' }}>
                          {n.type === 'critical' ? <AlertTriangle size={16} color="var(--red)" /> :
                           n.type === 'overdue' ? <Clock size={16} color="var(--amber)" /> :
                           <Bell size={16} color="var(--blue)" />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', marginBottom: '2px' }}>{n.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: '1.5' }}><DLPWrapper onViolation={handleDLPViolation}>{n.message}</DLPWrapper></div>
                          <div style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '6px' }}>{fmtHuman(n.timestamp)}</div>
                        </div>
                        {!n.read && <div style={{ width: '8px', height: '8px', background: 'var(--blue)', borderRadius: '50%', marginTop: '6px' }}></div>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost w-full" onClick={() => setNotifOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {(helpOpen || showWelcome) && (
        <HelpModal 
          onClose={() => { setHelpOpen(false); setShowWelcome(false); }} 
          initialTab={showWelcome ? 'guide' : 'guide'} 
          onDLPViolation={handleDLPViolation}
          role={role}
        />
      )}

      {queryModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 800 }}>
          <div className="modal-card" style={{ maxWidth: '400px' }}>
            <div className="modal-hdr">
              <div className="modal-title">Open Query</div>
              <button aria-label="Close" className="ibtn" onClick={() => setQueryModalOpen(false)}><X size={16} aria-hidden="true" /></button>
            </div>
            <form onSubmit={submitQuery}>
              <div className="modal-body">
                <div style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--t2)' }}>
                  Opening a query for task <strong>{queryDraft.taskCode}</strong> on patient <strong><DLPWrapper onViolation={handleDLPViolation}>{queryDraft.pid}</DLPWrapper></strong>.
                </div>
                <div>
                  <label className="modal-label">Issue Description</label>
                  <textarea 
                    autoFocus
                    className="modal-input" 
                    rows={4}
                    value={queryDraft.issue}
                    onChange={e => setQueryDraft({ ...queryDraft, issue: e.target.value })}
                    placeholder="Describe the issue or missing information..."
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="ibtn" onClick={() => setQueryModalOpen(false)}>Cancel</button>
                <button type="submit" className="ibtn" style={{ background: 'var(--amber)', color: '#fff', border: 'none', fontWeight: 600 }}>Submit Query</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {timelineOpen && (
        <TimelineNavigator
          patient={p}
          onClose={() => setTimelineOpen(false)}
        />
      )}

      {workloadLogOpen && (
        <WorkloadLogger
          userId="local_user"
          onClose={() => { setWorkloadLogOpen(false); trackEvent('modal_closed', { modal: 'workload_logger' }); }}
        />
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}




