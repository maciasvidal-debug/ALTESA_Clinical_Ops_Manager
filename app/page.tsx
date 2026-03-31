'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PATIENTS, WZ_STEPS, fmtHuman, fmtISO, getTodayPct, TODAY, diffDays, addDays, type Patient, type Notification } from '@/lib/data';
import { 
  Bell, Home, ClipboardList, Wind, Pill, FileText, CheckCircle2, 
  GraduationCap, Phone, Hospital, AlertTriangle, Bug, Droplet, 
  Stethoscope, Activity, FileWarning, Search, Lock, ChevronRight, 
  ArrowLeft, X, Microscope, Check, Circle, ArrowRight, BarChart2,
  Calendar, Flag, Delete, User, ArrowUpDown, UserPlus, FileEdit,
  Info, Globe, Clock, Mail, ChevronDown, Plus, ArrowUp, ArrowDown, Link, HelpCircle
} from 'lucide-react';

const IconMap: Record<string, any> = {
  '🔔': Bell, '🏠': Home, '📋': ClipboardList, '💨': Wind, '💊': Pill,
  '🫁': Activity, '🫀': Activity, '🩺': Stethoscope, '🧪': Droplet,
  '📄': FileText, '✅': CheckCircle2, '🎓': GraduationCap, '📞': Phone,
  '🏥': Hospital, '⚠️': AlertTriangle, '🦠': Bug, '🩸': Droplet,
  '📝': FileEdit,
  'Bell': Bell, 'Home': Home, 'ClipboardList': ClipboardList, 'Wind': Wind, 'Pill': Pill
};

const DependencyLines = ({ activeTrace, p, taskListRef }: { activeTrace: string | null, p: any, taskListRef: React.RefObject<HTMLDivElement | null> }) => {
  const [lines, setLines] = useState<{ x1: number, y1: number, x2: number, y2: number, color: string }[]>([]);

  useEffect(() => {
    const updateLines = () => {
      if (!activeTrace || !taskListRef.current) {
        setLines([]);
        return;
      }
      const containerRect = taskListRef.current.getBoundingClientRect();
      const activeEl = taskListRef.current.querySelector(`[data-code="${activeTrace}"]`);
      if (!activeEl) {
        setLines([]);
        return;
      }

      const activeRect = activeEl.getBoundingClientRect();
      const activeY = activeRect.top - containerRect.top + activeRect.height / 2;
      const activeX = 6; // Just inside the card edge

      const allTasks = Object.values(p.tasks).flat() as any[];
      const activeTask = allTasks.find(t => t.code === activeTrace);
      
      const newLines: any[] = [];

      // Prereqs
      activeTask?.dependsOn?.forEach((code: string) => {
        const el = taskListRef.current?.querySelector(`[data-code="${code}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const y = rect.top - containerRect.top + rect.height / 2;
          newLines.push({ x1: activeX, y1: y, x2: activeX, y2: activeY, color: 'var(--amber)' });
        }
      });

      // Dependents
      allTasks.filter(t => t.dependsOn?.includes(activeTrace)).forEach(t => {
        const el = taskListRef.current?.querySelector(`[data-code="${t.code}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const y = rect.top - containerRect.top + rect.height / 2;
          newLines.push({ x1: activeX, y1: activeY, x2: activeX, y2: y, color: 'var(--blue)' });
        }
      });

      setLines(newLines);
    };

    const raf = requestAnimationFrame(updateLines);
    const timer = setInterval(updateLines, 100); // Faster updates for smooth feel
    window.addEventListener('resize', updateLines);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      window.removeEventListener('resize', updateLines);
    };
  }, [activeTrace, p, taskListRef]);

  if (!activeTrace || lines.length === 0) return null;

  return (
    <svg 
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        pointerEvents: 'none', 
        zIndex: 5,
        overflow: 'visible'
      }}
    >
      <defs>
        <marker id="arrowhead-amber" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="var(--amber)" />
        </marker>
        <marker id="arrowhead-blue" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="var(--blue)" />
        </marker>
      </defs>
      {lines.map((l, i) => {
        const isUp = l.y2 < l.y1;
        const offset = 12; // Adjusted for better alignment
        const radius = 6;
        const dist = Math.abs(l.y2 - l.y1);
        const actualRadius = Math.min(radius, dist / 2);
        
        // Path with rounded corners
        const d = dist < 5 
          ? `M ${l.x1} ${l.y1} L ${l.x2} ${l.y2}`
          : `M ${l.x1} ${l.y1} 
             L ${l.x1 - offset + actualRadius} ${l.y1} 
             Q ${l.x1 - offset} ${l.y1} ${l.x1 - offset} ${l.y1 + (isUp ? -actualRadius : actualRadius)} 
             L ${l.x1 - offset} ${l.y2 + (isUp ? actualRadius : -actualRadius)} 
             Q ${l.x1 - offset} ${l.y2} ${l.x1 - offset + actualRadius} ${l.y2} 
             L ${l.x2} ${l.y2}`;

        return (
          <g key={i}>
            <path 
              d={d}
              fill="none"
              stroke={l.color}
              strokeWidth="2"
              strokeDasharray="4 3"
              markerEnd={`url(#arrowhead-${l.color === 'var(--amber)' ? 'amber' : 'blue'})`}
              style={{ transition: 'all 0.3s ease-in-out', opacity: 0.8 }}
            />
          </g>
        );
      })}
    </svg>
  );
};

const GLOSSARY = [
  { term: 'PSB', def: 'Pre-Symptomatic Baseline. The phase where patients report daily symptoms before infection.' },
  { term: 'DTQ', def: 'Daily Trigger Questionnaire. Asks if the patient has new respiratory symptoms.' },
  { term: 'RV', def: 'Rhinovirus. The protocol triggered after a positive DTQ.' },
  { term: 'E-RS', def: 'Evaluating Respiratory Symptoms scales.' },
  { term: 'ePRO', def: 'Electronic Patient-Reported Outcomes.' },
  { term: 'WURSS', def: 'Wisconsin Upper Respiratory Symptom Survey.' },
  { term: 'SABD', def: 'Short-Acting Bronchodilator.' },
  { term: 'WOCBP', def: 'Women of Childbearing Potential.' }
];

export default function App() {
  const [patients, setPatients] = useState<Patient[]>(() => 
    PATIENTS.map(p => ({ ...p, studyDay: diffDays(p.screeningDate, TODAY) }))
  );
  const [screen, setScreen] = useState<'auth' | 'dashboard' | 'patient'>('auth');
  const [pin, setPin] = useState('');
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
  
  const [dashFilter, setDashFilter] = useState<'all' | 'crit' | 'warn' | 'routine'>('all');
  
  const [chkd, setChkd] = useState<Record<string, Set<string>>>({});
  
  const [wzOpen, setWzOpen] = useState(false);
  const [wzStep, setWzStep] = useState(0);
  const [wzChks, setWzChks] = useState<Record<number, Set<number>>>({});
  const [cdStart, setCdStart] = useState<number | null>(null);
  const [wzConfirmOpen, setWzConfirmOpen] = useState(false);
  const [rndConfirmOpen, setRndConfirmOpen] = useState(false);
  
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQ, setCmdQ] = useState('');
  const [taskConfirm, setTaskConfirm] = useState<{pid: string, task: any} | null>(null);
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

  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const [editPatientData, setEditPatientData] = useState<{name: string, lang: string, loc: string} | null>(null);

  const [toasts, setToasts] = useState<{id: number, msg: string, type: string}[]>([]);
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
        labNote: `Rescreening completed on ${fmtISO(TODAY)}. Eligibility re-verified for Week ${Math.floor((p.studyDay || 0) / 7)} milestone.`
      };
    }));
    setRescreeningOpen(false);
    setRescreeningChks({});
    showToast(`Rescreening for ${rescreeningData.id} completed successfully`, 'ok');
  };

  const showToast = (msg: string, type: string = 'ok') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2800);
  };

  const sendEmailNotification = useCallback((notif: Notification) => {
    if (!emailEnabled) return;
    console.log(`[EMAIL SIMULATION] To: coordinator@example.com | Subject: ${notif.title} | Body: ${notif.message}`);
    // In a real app, this would call an API route that uses SendGrid/Nodemailer
  }, [emailEnabled]);

  const isChecked = useCallback((pid: string, code: string) => {
    const p = patients.find(x => x.id === pid);
    if (!p) return false;
    const all = [...(p.tasks.q || []), ...(p.tasks.pr || []), ...(p.tasks.l || []), ...(p.tasks.ad || [])];
    return chkd[pid]?.has(code) || all.find(t => t.code === code)?.done || false;
  }, [patients, chkd]);

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
          timestamp: TODAY,
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
          timestamp: TODAY,
          read: false,
          patientId: p.id
        });
      }

      // 2. Overdue/Critical Tasks
      const allTasks = [...(p.tasks.q || []), ...(p.tasks.pr || []), ...(p.tasks.l || []), ...(p.tasks.ad || [])];
      allTasks.forEach(t => {
        if (!isChecked(p.id, t.code) && t.dueDate) {
          const diff = diffDays(TODAY, t.dueDate);
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
              timestamp: TODAY,
              read: false,
              patientId: p.id
            });
          }
        }
      });
    });

    // Check for new notifications to trigger "email"
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const handleLoginSuccess = () => {
    setScreen('dashboard');
    if (typeof window !== 'undefined' && !localStorage.getItem('altesa_briefed_today')) {
      setBriefingOpen(true);
      localStorage.setItem('altesa_briefed_today', fmtISO(TODAY));
    }
  };

  const handlePin = (k: string) => {
    if (k === 'del') {
      setPin(prev => prev.slice(0, -1));
      setPinErr('');
    } else if (k === 'go') {
      if (pin.length >= 4) {
        setPinErr('');
        handleLoginSuccess();
      } else {
        setPinErr('Minimum 4 digits required');
      }
    } else {
      if (pin.length < 8) {
        setPin(prev => prev + k);
        setPinErr('');
      }
      if (pin.length + 1 === 8) {
        setTimeout(() => handleLoginSuccess(), 200);
      }
    }
  };

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
      setTaskConfirm({ pid, task });
      return;
    }

    performToggle(pid, code);
  };

  const performToggle = (pid: string, code: string) => {
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

  const handleAddPatient = (e: React.FormEvent) => {
    e.preventDefault();
    setModalErr('');
    
    const id = newPatientId.trim().toUpperCase();
    const name = newPatientName.trim();
    
    if (!id || !name) {
      setModalErr('All fields are required');
      return;
    }
    
    if (name.length < 3) {
      setModalErr('Please enter a full name (at least 3 characters)');
      return;
    }
    
    if (!/^[A-Z0-9]+-[0-9]+$/.test(id)) {
      setModalErr('Invalid ID format. Use SITE-XXX (e.g. ALTESA-002)');
      return;
    }
    
    if (patients.some(p => p.id === id)) {
      setModalErr(`Patient ID ${id} already exists in the system`);
      return;
    }
    
    const newPatient: Patient = {
      id,
      name,
      phase: 'SCREENING',
      phaseCode: 'scr',
      phaseLabel: 'Screening · Day 0',
      studyDay: diffDays(TODAY, TODAY),
      loc: 'CLINIC',
      lang: newPatientLang,
      alert: null,
      screeningDate: TODAY,
      tasks: {
        q: [
          { code: 'CAT', label: 'CAT — COPD Assessment Test', icon: '📋', done: false, note: 'Screening and Rescreening visits only (Table 1)', dueDate: TODAY },
          { code: 'IC', label: 'Informed Consent', icon: '📝', done: false, note: 'New ICF required only if updated version available (fn. a)', dueDate: TODAY },
        ],
        pr: [
          { code: 'OSC', label: 'Oscillometry', icon: '🫁', done: false, seq: true, note: 'Perform BEFORE spirometry at all visits with both (fn. f)', dueDate: TODAY },
          { code: 'SPI', label: 'Spirometry (PRE & POST)', icon: '🫁', done: false, note: 'Washout: short-acting BD 4–6 h · BID 12 h · QD 24 h (fn. f). Pre- and post-SABD at Screening.', dueDate: TODAY },
          { code: 'ECG', label: 'ECG (12-lead)', icon: '🫀', done: false, note: 'Single ECG at Screening. Collect PRIOR to blood draw (fn. e)', dueDate: TODAY },
          { code: 'VS', label: 'Vital Signs', icon: '🩺', done: false, note: 'BP, HR, body temp, respiratory rate. Seated ≥ 5 min (fn. d)', dueDate: TODAY },
          { code: 'PE', label: 'Physical Exam (incl. height — Screening only)', icon: '🩺', done: false, note: 'Full exam including height (Screening only). Subsequent: limited, symptom-directed, include weight (fn. c)', dueDate: TODAY },
        ],
        l: [
          { code: 'CSL', label: 'Central Safety Labs — Chemistry / Haematology / Urinalysis', icon: '🧪', done: false, note: 'Full panel at Screening. Urinalysis: Screening only; subsequent visits: only if clinically indicated', dueDate: TODAY },
          { code: 'PT', label: 'Pregnancy Test (blood — WOCBP only)', icon: '🧪', done: false, note: 'Blood at Screening. Urine at Day 1 Pre-Dose. Blood at Day 28 FUP (fn. a)', dueDate: TODAY },
        ],
        ad: [
          { code: 'DEMO', label: 'Demographics', icon: '📄', done: false, dueDate: TODAY, subcat: 'screening' },
          { code: 'MSH', label: 'Medical & Smoking History', icon: '📄', done: false, note: 'Document as medical history until Day 1 dosing. COPD exacerbations: separate eCRF page (fn. b)', dueDate: TODAY, subcat: 'screening' },
          { code: 'ELG', label: 'Assess Eligibility Criteria', icon: '✅', done: false, note: 'Inclusion and Exclusion. Rescreening: Exclusion criteria only (fn. a)', dueDate: TODAY, subcat: 'screening' },
          { code: 'COPH', label: 'COPD History & Medications', icon: '📄', done: false, dueDate: TODAY, subcat: 'screening' },
          { code: 'CMED', label: 'Concomitant Medications', icon: '💊', done: false, note: 'Reviewed by medically qualified investigator at Screening (fn. l)', dueDate: TODAY, subcat: 'screening' },
          { code: 'TRAIN', label: 'Train Participant on Study Procedures', icon: '🎓', done: false, note: 'Includes ePRO, DTQ, home virology testing instructions', dueDate: TODAY, subcat: 'screening' },
        ]
      },
      ers: [],
      psb: null,
      psbRecords: 0,
      nextVisit: addDays(TODAY, 7),
      nextVisitLabel: 'PSB Start — Week 1 Day 1 (Home)',
    };
    
    setPatients(prev => [...prev, newPatient]);
    setAddPatientOpen(false);
    setNewPatientId('');
    setNewPatientName('');
    setNewPatientLang('English');
    setModalErr('');
    showToast(`Patient ${newPatient.id} added successfully`, 'ok');
  };

  const handleUpdatePatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selPatientId || !editPatientData) return;
    
    setModalErr('');
    const { name, lang, loc } = editPatientData;
    
    if (!name.trim()) {
      setModalErr('Name is required');
      return;
    }

    setPatients(prev => prev.map(p => {
      if (p.id === selPatientId) {
        return { ...p, name: name.trim(), lang, loc };
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

  // Auth Screen
  if (screen === 'auth') {
    return (
      <div className="screen auth-wrap">
        <div className="auth-card">
          <div className="auth-wordmark">ALTE<em>SA</em></div>
          <div className="auth-sub">VPV Study · Coordinator Platform<br/>PBKDF2-SHA256 · AES-256-GCM · No backend</div>
          <div className="pin-track">
            {Array(8).fill(0).map((_, i) => (
              <div key={i} className={`pin-dot ${i < pin.length ? 'on' : ''}`}></div>
            ))}
          </div>
          {pinErr ? <div className="pin-hint err">{pinErr}</div> :
           pin.length > 0 && pin.length < 4 ? <div className="pin-hint ok">{4 - pin.length} more digit{4 - pin.length === 1 ? '' : 's'} needed</div> :
           <div className="pin-hint ok">Enter your coordinator PIN</div>}
          <div className="keypad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', '0', '⌫'].map((k, i) => {
              if (k === '') return <div key={i}></div>;
              if (k === '⌫') return <button key={i} className="kk del" onClick={() => handlePin('del')}><Delete size={16} style={{display:'inline', verticalAlign:'text-bottom'}}/> Del</button>;
              return <button key={i} className="kk" onClick={() => handlePin(k.toString())}>{k}</button>;
            })}
          </div>
          <button className="kk go" onClick={() => handlePin('go')} disabled={pin.length < 4}>Unlock <ArrowRight size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/></button>
          <div className="auth-note">
            <strong>Prototype mode</strong> — any PIN of ≥ 4 digits unlocks the demo.
            Production: 310,000-iteration PBKDF2 key derivation + 8 single-use recovery codes.
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Screen
  if (screen === 'dashboard') {
    const crits = patients.filter(p => p.alert === 'DTQ_POSITIVE');
    const warns = patients.filter(p => p.alert && p.alert !== 'DTQ_POSITIVE');
    const clinicToday = patients.filter(p => p.loc.includes('CLINIC'));

    const filterMap: Record<string, (p: Patient) => boolean> = {
      all: () => true,
      crit: p => p.alert === 'DTQ_POSITIVE',
      warn: p => p.alert !== null && p.alert !== 'DTQ_POSITIVE',
      routine: p => !p.alert,
    };

    const visible = patients.filter(filterMap[dashFilter] || filterMap.all)
      .sort((a, b) => {
        const r = (p: Patient) => p.alert === 'DTQ_POSITIVE' ? 0 : p.alert ? 1 : 2;
        return r(a) - r(b) || a.id.localeCompare(b.id);
      });

    return (
      <div className="screen">
        {crits.length > 0 && (
          <div className="crit-banner">
            <div className="crit-pulse"></div>
            <div className="crit-text"><strong>RV Protocol Active:</strong> {crits.map(p => p.id).join(', ')} — DTQ Positive · 48 h + 6 h window running</div>
            <button className="crit-action" onClick={() => openPatient('ALTESA-047')}>Open Patient <ArrowRight size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/></button>
          </div>
        )}
        {warns.filter(p => p.alert === 'MONTHLY_CALL').length > 0 && (
          <div className="warn-banner">
            <strong>Monthly call due:</strong> {warns.filter(p => p.alert === 'MONTHLY_CALL').map(p => `${p.id} (±5 days)`).join(', ')}
          </div>
        )}
        <div className="hdr">
          <div className="hdr-left">
            <div className="wordmark">ALTE<em>SA</em></div>
            <span className="hdr-context">VPV Study</span>
          </div>
          <div className="hdr-center">
            <button className="search-trigger" onClick={() => setCmdOpen(true)}>
              <Search size={14} />
              <span>Search patients, tasks, or glossary...</span>
              <span className="search-shortcut">⌘K</span>
            </button>
          </div>
          <div className="hdr-right">
            <div className="nav-group">
              <button type="button" className="ibtn" onClick={() => setBriefingOpen(true)} title="Daily Briefing"><ClipboardList size={14} /> Briefing</button>
              <button type="button" className="ibtn relative" onClick={() => setNotifOpen(true)} title="Notifications">
                <Bell size={14} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                )}
              </button>
              <button type="button" className="ibtn" onClick={() => setHelpOpen(true)} title="Help & Glossary"><HelpCircle size={14} /> Help</button>
            </div>
            <button type="button" className="btn btn-primary" style={{ minHeight: '36px', padding: '8px 16px' }} onClick={(e) => { e.preventDefault(); setAddPatientOpen(true); }} title="Add Patient"><UserPlus size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Add Patient</button>
            <button type="button" className="ibtn" style={{ border: 'none', background: 'transparent' }} onClick={(e) => { e.preventDefault(); setPin(''); setScreen('auth'); }} title="Lock Session"><Lock size={14} /></button>
          </div>
        </div>
        <div className="dash">
          <div className="summary">
            <div className="sum-cell"><div className="sum-v">{patients.length}</div><div className="sum-l">Active Patients</div></div>
            <div className="sum-cell alert"><div className="sum-v">{crits.length}</div><div className="sum-l"><abbr title="Daily Trigger Questionnaire (Positive)" className="help-term">DTQ+</abbr> Alerts</div></div>
            <div className="sum-cell warn"><div className="sum-v">{warns.length}</div><div className="sum-l">Pending Actions</div></div>
            <div className="sum-cell"><div className="sum-v">{clinicToday.length}</div><div className="sum-l">Clinic Visits Today</div></div>
          </div>
          <div className="filter-tabs">
            <button className={`ftab ${dashFilter === 'all' ? 'active' : ''}`} onClick={() => setDashFilter('all')}>All ({patients.length})</button>
            <button className={`ftab tab-crit ${dashFilter === 'crit' ? 'active' : ''}`} onClick={() => setDashFilter('crit')}><AlertTriangle size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Critical ({crits.length})</button>
            <button className={`ftab tab-warn ${dashFilter === 'warn' ? 'active' : ''}`} onClick={() => setDashFilter('warn')}><AlertTriangle size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Action needed ({warns.length})</button>
            <button className={`ftab tab-ok ${dashFilter === 'routine' ? 'active' : ''}`} onClick={() => setDashFilter('routine')}><Check size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Routine ({patients.length - crits.length - warns.length})</button>
          </div>
          <div className="sec-hdr">
            <div className="sec-title">{visible.length} patient{visible.length !== 1 ? 's' : ''} — sorted by urgency</div>
            <div className="sec-date">{fmtHuman(TODAY)}, {fmtISO(TODAY)}</div>
          </div>
          <div className="pt-list">
            {visible.length > 0 ? visible.map(p => {
              const { done, total } = countTasks(p);
              const isCrit = p.alert === 'DTQ_POSITIVE';
              const isWarn = p.alert && !isCrit;
              const urgClass = isCrit ? 'crit' : isWarn ? 'warn' : done === total && total > 0 ? 'ok' : 'info';
              const urgText = isCrit ? <><AlertTriangle size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> DTQ+ — Act now</> : isWarn ? p.alert === 'MONTHLY_CALL' ? <><Phone size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Call due</> : <><Activity size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> Rescreening</> : done === total && total > 0 ? <><Check size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> All done</> : 'In progress';
              const phBadge = { scr: 'pb-scr', psb: 'pb-psb', tx: 'pb-tx', fu: 'pb-fu' }[p.phaseCode] || 'pb-psb';
              return (
                <div key={p.id} className={`pt-row ${isCrit ? 'is-crit' : isWarn ? 'is-warn' : ''}`}
                  tabIndex={0} role="button" aria-label={`Open ${p.id} — ${p.phaseLabel}`}
                  onClick={() => openPatient(p.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPatient(p.id); } }}>
                  <div className="pt-meta">
                    <div className="pt-id">{p.id}</div>
                    <div className="pt-name" style={{fontSize:'11px', color:'var(--t3)', marginTop:'2px'}}>{p.name}</div>
                    <div className="pt-phase-lbl">
                      <span className={`phase-badge ${phBadge}`} style={{ padding: '1px 7px', fontSize: '10px' }}>{p.phaseLabel.split('·')[0].trim()}</span>
                    </div>
                    <div className="pt-progress-container" title={`${done}/${total} tasks completed`}>
                      <div className={`pt-progress-fill ${done === total && total > 0 ? 'done' : ''}`} style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}></div>
                    </div>
                    <div className="pt-loc">{p.loc.includes('CLINIC') ? '🏥' : '🏠'} {p.loc}</div>
                  </div>
                  <div className="pt-tl-cell">
                    <div className="mini-tl">
                      <div className="mini-tl-bar">
                        <div className="tl-seg s-scr" title="Screening / Rescreening"><span>SCR</span></div>
                        <div className="tl-seg s-psb" title="Pre-Symptomatic Baseline (Asymptomatic Phase)"><span className="help-term">{p.phaseCode === 'psb' ? 'PSB W' + Math.floor((p.studyDay || 0) / 7) : 'PSB'}</span></div>
                        <div className="tl-seg s-rv" title="RV Infection — Randomisation window"></div>
                        <div className="tl-seg s-tx" title="Treatment Period D1–D42"><span>{p.phaseCode === 'tx' ? 'Tx D' + (p.studyDay || 0) : 'TX'}</span></div>
                        <div className="tl-seg s-fu" title="Follow-up Period"><span>FUP</span></div>
                        <div className="tl-seg s-fut" title="End of Study / future"></div>
                        <div className="tl-now-label" style={{ left: `${getTodayPct(p).toFixed(1)}%` }}>Today</div>
                        <div className="tl-now-marker" style={{ left: `${getTodayPct(p).toFixed(1)}%` }}></div>
                      </div>
                      <div className="tl-label-row">
                        <div className="tl-lbl" style={{ flex: '0 0 4%' }}>Scr</div>
                        <div className="tl-lbl" style={{ flex: '0 0 45%', color: 'var(--blue)' }}>Asymptomatic Phase (up to 68 weeks)</div>
                        <div className="tl-lbl" style={{ flex: '0 0 3%' }}></div>
                        <div className="tl-lbl" style={{ flex: '0 0 12%' }}>Treatment</div>
                        <div className="tl-lbl" style={{ flex: '0 0 8%' }}>FUP</div>
                        <div className="tl-lbl" style={{ flex: 1 }}></div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-action">
                    <div className={`pt-urgency ${urgClass}`}>{urgText}</div>
                    <div className="pt-tasks-count"><strong>{done}</strong>/{total} tasks</div>
                    <div className="pt-next" title={fmtISO(p.nextVisit)}>{fmtHuman(p.nextVisit)}</div>
                    <div className="pt-chevron"><ChevronRight size={16} /></div>
                  </div>
                </div>
              );
            }) : (
              <div className="empty-state-card">
                <div className="empty-icon"><UserPlus size={32} /></div>
                <h3>Welcome to ALTESA Study Tracker</h3>
                <p>Your dashboard is currently empty. Get started by adding your first patient or reviewing the study quick guide.</p>
                <div className="empty-actions">
                  <button className="btn btn-primary" onClick={() => setAddPatientOpen(true)}><UserPlus size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Add First Patient</button>
                  <button className="btn btn-ghost" onClick={() => setHelpOpen(true)}><HelpCircle size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Read Quick Guide</button>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Modals */}
        {briefingOpen && (
          <DailyBriefing 
            patients={patients} 
            onClose={() => setBriefingOpen(false)} 
            onSelectPatient={(id) => {
              openPatient(id);
              setBriefingOpen(false);
            }}
          />
        )}
        {addPatientOpen && (
          <div className="modal-overlay" onClick={() => { setAddPatientOpen(false); setModalErr(""); }}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div className="modal-hdr">
                <div className="modal-title">Add New Patient</div>
                <button type="button" className="ibtn" onClick={() => { setAddPatientOpen(false); setModalErr(""); }}><X size={18} /></button>
              </div>
              <form onSubmit={handleAddPatient}>
                <div className="modal-body">
                  {modalErr && (
                    <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-mid)', borderRadius: 'var(--r1)', color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={14} /> {modalErr}
                    </div>
                  )}
                  <div style={{ marginBottom: '24px' }}>
                    <label className="modal-label"><User size={12} /> Patient Identifier</label>
                    <input 
                      autoFocus
                      type="text" 
                      className="modal-input"
                      value={newPatientId} 
                      onChange={e => setNewPatientId(e.target.value)} 
                      placeholder="e.g. ALTESA-002"
                      required
                    />
                    <div className="modal-help">
                      <Info size={14} />
                      <span>Use the standardized study format (SITE-XXX). This ID will be used for all regulatory tracking.</span>
                    </div>
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    <label className="modal-label"><User size={12} /> Full Name</label>
                    <input 
                      type="text" 
                      className="modal-input"
                      value={newPatientName} 
                      onChange={e => setNewPatientName(e.target.value)} 
                      placeholder="e.g. John Doe"
                      required
                    />
                    <div className="modal-help">
                      <Info size={14} />
                      <span>Enter the patient&apos;s legal name as it appears on study documents.</span>
                    </div>
                  </div>
                  <div>
                    <label className="modal-label"><Globe size={12} /> Primary Language</label>
                    <select 
                      className="modal-input"
                      value={newPatientLang} 
                      onChange={e => setNewPatientLang(e.target.value)}
                    >
                      <option value="English">English</option>
                      <option value="Spanish">Spanish</option>
                      <option value="French">French</option>
                      <option value="German">German</option>
                    </select>
                    <div className="modal-help">
                      <Info size={14} />
                      <span>Sets the default language for ePRO questionnaires and patient-facing materials.</span>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={() => { setAddPatientOpen(false); setModalErr(""); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={!newPatientId.trim()}>
                    <UserPlus size={14} style={{ marginRight: '6px', display: 'inline' }} />
                    Add Patient
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {editPatientOpen && editPatientData && (
          <div className="modal-overlay" onClick={() => { setEditPatientOpen(false); setModalErr(""); }}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div className="modal-hdr">
                <div className="modal-title">Edit Patient Details</div>
                <button type="button" className="ibtn" onClick={() => { setEditPatientOpen(false); setModalErr(""); }}><X size={18} /></button>
              </div>
              <form onSubmit={handleUpdatePatient}>
                <div className="modal-body">
                  {modalErr && (
                    <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-mid)', borderRadius: 'var(--r1)', color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={14} /> {modalErr}
                    </div>
                  )}
                  <div style={{ marginBottom: '24px' }}>
                    <label className="modal-label"><User size={12} /> Full Name</label>
                    <input 
                      autoFocus
                      type="text" 
                      className="modal-input"
                      value={editPatientData.name} 
                      onChange={e => setEditPatientData({ ...editPatientData, name: e.target.value })} 
                      placeholder="e.g. John Doe"
                      required
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
                <button className="ibtn" onClick={() => setNotifOpen(false)}><X size={16} /></button>
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
                      <Mail size={12} /> Email Alerts
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
        {cmdOpen && <CmdPalette q={cmdQ} setQ={setCmdQ} onClose={() => setCmdOpen(false)} onSelect={(id: string) => { if (id === 'dashboard') setScreen('dashboard'); else openPatient(id); }} patients={patients} recentIds={recentIds} />}
        
        {(helpOpen || showWelcome) && (
          <HelpModal 
            onClose={() => { setHelpOpen(false); setShowWelcome(false); }} 
            initialTab={showWelcome ? 'guide' : 'guide'} 
          />
        )}
        
        <Toasts toasts={toasts} />
      </div>
    );
  }

  // Patient Screen
  const p = patients.find(x => x.id === selPatientId);
  if (!p) return null;

  const { done, total } = countTasks(p);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const phBadge = { scr: 'pb-scr', psb: 'pb-psb', rv: 'pb-rv', tx: 'pb-tx', fu: 'pb-fu' }[p.phaseCode] || 'pb-psb';
  const nowPct = getTodayPct(p);
  const phaseColor = { scr: 'var(--ph-scr)', psb: 'var(--ph-psb)', rv: 'var(--ph-rv)', tx: 'var(--ph-tx)', fu: 'var(--ph-fu)' }[p.phaseCode] || 'var(--border)';

  const milestones = [];
  if (p.screeningDate) milestones.push({ l: 'Screening', d: p.screeningDate, cls: 'ms-done' });
  if (p.psbStartDate) milestones.push({ l: 'PSB Start', d: p.psbStartDate, cls: 'ms-done' });
  if (p.rvInfectionDate) milestones.push({ l: 'RV Onset', d: p.rvInfectionDate, cls: 'ms-done' });
  if (p.randomizationDate) milestones.push({ l: 'Randomisation', d: p.randomizationDate, cls: 'ms-done' });
  if (p.resolution) milestones.push({ l: 'Resolution', d: p.resolution, cls: 'ms-done' });
  milestones.push({ l: `Today — ${p.phaseLabel}`, d: TODAY, cls: 'ms-now' });
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
                       onClick={() => toggleCheck(p.id, t)}
                       onMouseEnter={() => setHoveredTask(t.code)}
                       onMouseLeave={() => setHoveredTask(null)}
                       onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleCheck(p.id, t); } }}
                       style={{ cursor: blocked ? 'not-allowed' : 'pointer', position: 'relative' }}>
                    
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
                        
                        {t.dueDate && diffDays(TODAY, t.dueDate) <= 0 && !chk && (
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
                          <div className={`a-note ${t.urgNote || ''}`}>{t.note}</div>
                        )}
                      </div>
                    </div>
                    <div className="a-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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

  const dtc = diffDays(TODAY, p.nextVisit);
  const win = 3;
  const winPct = Math.min(100, Math.max(0, 50 + (dtc / win) * 50));
  const wc = Math.abs(dtc) <= win ? 'var(--green)' : dtc < 0 ? 'var(--red)' : 'var(--amber)';

  return (
    <div className="screen">
      <div className="hdr">
        <div className="hdr-left"><div className="wordmark">ALTE<em>SA</em></div><span className="hdr-context">{p.id} · {p.phaseLabel}</span></div>
        <div className="hdr-right">
          <button className="ibtn" onClick={() => setHelpOpen(true)} title="Help Centre"><HelpCircle size={14} /> Help</button>
          <button className="ibtn relative" onClick={() => setNotifOpen(true)} title="Notifications">
            <Bell size={14} />
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            )}
          </button>
          <button className="ibtn" onClick={() => setCmdOpen(true)}><Search size={14} /> ⌘K</button>
          <button className="ibtn" onClick={() => { setPin(''); setScreen('auth'); }}><Lock size={14} /> Lock</button>
        </div>
      </div>
      {p.dtqPos && (
        <div className="crit-banner">
          <div className="crit-pulse"></div>
          <div className="crit-text"><strong>RV Protocol Active</strong> — DTQ Positive · 48h + 6h window running</div>
          <button className="crit-action" onClick={() => { setCdStart(Date.now() - 3 * 3600000); setWzOpen(true); }}>Open Wizard <ArrowRight size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/></button>
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
        </div>
      )}
      <div className="pv-wrap">
        <div className="pv-topbar">
          <button className="back-btn" onClick={() => setScreen('dashboard')}><ArrowLeft size={14} /> Dashboard</button>
          <div className="pv-id-block">
            <div className="pv-id">
              {p.id} 
              <span style={{color:'var(--t3)', fontWeight:400, fontSize:'16px', marginLeft:'8px'}}>{p.name}</span>
              <button 
                className="ibtn" 
                style={{ marginLeft: '12px', padding: '4px 8px', minHeight: '28px', fontSize: '11px', display: 'inline-flex' }}
                onClick={() => {
                  setEditPatientData({ name: p.name, lang: p.lang, loc: p.loc });
                  setEditPatientOpen(true);
                  setModalErr('');
                }}
              >
                <FileEdit size={12} /> Edit
              </button>
            </div>
            <div className="pv-id-sub">
              <span className={`phase-badge ${phBadge}`}>{p.phaseLabel}</span>
              &nbsp;·&nbsp; Study Day <span style={{ fontFamily: 'var(--fm)' }}>{p.studyDay || 0}</span>
              &nbsp;·&nbsp; {p.loc.includes('CLINIC') ? '🏥 Clinic' : '🏠 Home'}
              &nbsp;·&nbsp; <span style={{ fontFamily: 'var(--fm)' }}>{fmtISO(TODAY)}</span>
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
              <div className="full-s-tx" title="Treatment Period — once-daily study drug, D1–D42 (EOS)">Treatment D1–D42</div>
              <div className="full-s-fu" title="Follow-up — Day 14, 28, 42 / EOS">Follow-up</div>
              <div className="full-s-fut" title="End of Study / future">EOS</div>
            </div>
            <div className="full-tl-now" style={{ left: `${nowPct.toFixed(1)}%` }}></div>
            <div className="full-tl-labels">
              <div className="ftl-lbl" style={{ flex: '0 0 4%' }}>W0</div>
              <div className="ftl-lbl" style={{ flex: '0 0 45%', color: 'var(--blue)' }}>Weeks 1–68 (rescreening every 6 months · monthly calls ±5d)</div>
              <div className="ftl-lbl" style={{ flex: '0 0 3%' }}></div>
              <div className="ftl-lbl" style={{ flex: '0 0 12%', color: 'var(--amber)' }}>D1–D42 (EOS)</div>
              <div className="ftl-lbl" style={{ flex: '0 0 8%', color: 'var(--green)' }}>D14/D28/D42</div>
              <div className="ftl-lbl" style={{ flex: 1 }}></div>
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
                <div><div className="card-title">Today&apos;s Assessment Checklist</div><div className="card-sub">{p.phaseLabel} · {p.loc} · {fmtISO(TODAY)}</div></div>
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
                    <div className="ers-stat"><div className="ers-val" style={{ color: p.psb && p.ers[p.ers.length - 1] > p.psb ? 'var(--red)' : 'var(--green)' }}>{p.ers[p.ers.length - 1]}</div><div className="ers-lbl">Today</div></div>
                    <div className="ers-stat"><div className="ers-val" style={{ color: 'var(--blue)' }}>{p.psbRecords}</div><div className="ers-lbl">Records</div></div>
                  </div>
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
            <div className="scard">
              <div className="scard-hdr"><Bell size={14} /> Schedule & Alerts</div>
              <div className="scard-body" style={{ padding: '10px 14px' }}>
                {p.alert === 'DTQ_POSITIVE' && <div className="al-item"><div className="al-pip" style={{ background: 'var(--red)' }}></div><div><div className="al-body">RV Protocol Active — attend clinic ASAP</div><div className="al-sub">48 h + 6 h window from symptom onset</div></div></div>}
                {p.alert === 'MONTHLY_CALL' && <div className="al-item"><div className="al-pip" style={{ background: 'var(--amber)' }}></div><div><div className="al-body">Monthly call due (±5 days)</div><div className="al-sub">{p.monthlyCallDue ? fmtHuman(p.monthlyCallDue) : ''}</div></div></div>}
                {p.alert === 'RESCREENING' && <div className="al-item"><div className="al-pip" style={{ background: 'var(--amber)' }}></div><div><div className="al-body">Rescreening in {diffDays(TODAY, p.nextVisit)} days</div><div className="al-sub">{fmtHuman(p.nextVisit)}</div></div></div>}
                <div className="al-item"><div className="al-pip" style={{ background: 'var(--blue)' }}></div><div><div className="al-body">{p.nextVisitLabel}</div><div className="al-sub">{fmtHuman(p.nextVisit)}</div></div></div>
              </div>
            </div>
            <div className="scard">
              <div className="scard-hdr"><Calendar size={14} /> Next Visit Window</div>
              <div className="scard-body">
                <div style={{ fontSize: '11.5px', color: 'var(--t2)', marginBottom: '7px' }}>{p.nextVisitLabel}</div>
                <div className="wt-center" style={{ color: wc }}>{fmtHuman(p.nextVisit)}</div>
                <div className="wt-wrap">
                  <div className="wt-bar"><div className="wt-ok-zone" style={{ left: '25%', right: '25%', background: wc }}></div><div className="wt-cursor" style={{ left: `${winPct}%`, background: wc }}></div></div>
                  <div className="wt-labels"><span>−3 days</span><span style={{ color: wc, fontWeight: 600 }}>Optimal</span><span>+3 days</span></div>
                </div>
              </div>
            </div>
            {p.labNote && <div className="scard"><div className="scard-hdr" style={{ color: 'var(--blue)' }}><Flag size={14} /> Protocol Note</div><div className="scard-body"><div className="scard-note">{p.labNote}</div></div></div>}
          </div>
        </div>
      </div>
      
      {/* Modals */}
      {wzOpen && (
        <Wizard 
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
            <div className="confirm-body">You are about to <strong>randomise ALTESA-047</strong> and initiate the Treatment Period. This action is <strong>irreversible</strong> in the clinical record. All 7 protocol steps have been confirmed.</div>
            <div className="confirm-btns">
              <button className="btn btn-ghost" onClick={() => setRndConfirmOpen(false)}>Review again</button>
              <button className="btn btn-success" onClick={() => {
                setRndConfirmOpen(false);
                setWzOpen(false);
                const p = patients.find(x => x.id === 'ALTESA-047');
                if (p) {
                  p.dtqPos = false;
                  p.alert = null;
                  p.phase = 'TREATMENT';
                  p.phaseCode = 'tx';
                  p.phaseLabel = 'Treatment · Day 1';
                  p.loc = 'CLINIC';
                }
                showToast('ALTESA-047 randomised — Treatment Period activated', 'ok');
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
                <>Are you sure you want to mark <strong>{taskConfirm.task.label}</strong> as complete for <strong>{taskConfirm.pid}</strong>?</>
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
                <button className={`btn ${taskConfirm.task.critical || taskConfirm.task.regulatory ? 'btn-danger' : 'btn-primary'}`} onClick={() => {
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
              <button className="ibtn" onClick={() => setEditTask(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="modal-label"><FileText size={12} /> Task Label</div>
              <input 
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
              <input 
                type="date"
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
              <button type="button" className="ibtn" onClick={() => { setEditPatientOpen(false); setModalErr(""); }}><X size={18} /></button>
            </div>
            <form onSubmit={handleUpdatePatient}>
              <div className="modal-body">
                {modalErr && (
                  <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-mid)', borderRadius: 'var(--r1)', color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={14} /> {modalErr}
                  </div>
                )}
                <div style={{ marginBottom: '24px' }}>
                  <label className="modal-label"><User size={12} /> Full Name</label>
                  <input 
                    autoFocus
                    type="text" 
                    className="modal-input"
                    value={editPatientData.name} 
                    onChange={e => setEditPatientData({ ...editPatientData, name: e.target.value })} 
                    placeholder="e.g. John Doe"
                    required
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
              <button className="ibtn" onClick={() => setNotifOpen(false)}><X size={16} /></button>
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
                    <Mail size={12} /> Email Alerts
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

      {(helpOpen || showWelcome) && (
        <HelpModal 
          onClose={() => { setHelpOpen(false); setShowWelcome(false); }} 
          initialTab={showWelcome ? 'guide' : 'guide'} 
        />
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}

function DailyBriefing({ patients, onClose, onSelectPatient }: { patients: Patient[], onClose: () => void, onSelectPatient: (id: string) => void }) {
  const crits = patients.filter(p => p.alert === 'DTQ_POSITIVE');
  const overdueTasks: any[] = [];
  const clinicToday = patients.filter(p => p.loc.includes('CLINIC'));
  
  patients.forEach(p => {
    const allTasks = [...(p.tasks.q || []), ...(p.tasks.pr || []), ...(p.tasks.l || []), ...(p.tasks.ad || [])];
    allTasks.forEach(t => {
      if (!t.done && t.dueDate) {
        const diff = diffDays(TODAY, t.dueDate);
        if (diff < 0) {
          overdueTasks.push({ pid: p.id, task: t, diff: Math.abs(diff) });
        }
      }
    });
  });

  return (
    <div className="briefing-overlay">
      <div className="briefing-card">
        <div className="briefing-hdr">
          <div className="briefing-title">Good morning, Coordinator</div>
          <div className="briefing-sub">
            <Calendar size={14} /> {fmtHuman(TODAY)}, {fmtISO(TODAY)}
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <Clock size={14} /> Shift Summary
          </div>
        </div>
        <div className="briefing-body">
          <div className="brief-sec">
            <div className="brief-sec-title"><AlertTriangle size={14} /> Critical Actions Required</div>
            {crits.length > 0 ? crits.map(p => (
              <div key={p.id} className="brief-item crit" onClick={() => onSelectPatient(p.id)}>
                <div className="brief-icon"><AlertTriangle size={20} /></div>
                <div className="brief-content">
                  <div className="brief-pt-id">{p.id} — {p.name}</div>
                  <div className="brief-msg">RV Protocol Active: Randomisation window is running</div>
                  <div className="brief-meta">Symptom onset reported. Action required within 48h+6h window.</div>
                </div>
                <ChevronRight size={16} color="var(--t4)" />
              </div>
            )) : (
              <div style={{ padding: '16px', background: 'var(--green-bg)', color: 'var(--green)', borderRadius: 'var(--r2)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} /> No patients currently in the critical RV window.
              </div>
            )}
          </div>

          <div className="briefing-grid">
            <div className="brief-sec">
              <div className="brief-sec-title"><Hospital size={14} /> Clinic Visits Today</div>
              {clinicToday.length > 0 ? clinicToday.map(p => (
                <div key={p.id} className="brief-item today" onClick={() => onSelectPatient(p.id)}>
                  <div className="brief-icon"><Hospital size={18} /></div>
                  <div className="brief-content">
                    <div className="brief-pt-id">{p.id}</div>
                    <div className="brief-msg">{p.phaseLabel.split('·')[0]} Visit</div>
                    <div className="brief-meta">Scheduled for today in clinic.</div>
                  </div>
                </div>
              )) : (
                <div style={{ fontSize: '13px', color: 'var(--t3)', padding: '8px 0' }}>No clinic visits scheduled for today.</div>
              )}
            </div>

            <div className="brief-sec">
              <div className="brief-sec-title"><Clock size={14} /> Overdue Tasks</div>
              {overdueTasks.length > 0 ? overdueTasks.slice(0, 4).map((item, i) => (
                <div key={i} className="brief-item warn" onClick={() => onSelectPatient(item.pid)}>
                  <div className="brief-icon"><Clock size={18} /></div>
                  <div className="brief-content">
                    <div className="brief-pt-id">{item.pid}</div>
                    <div className="brief-msg">{item.task.label}</div>
                    <div className="brief-meta">Overdue by {item.diff} day{item.diff !== 1 ? 's' : ''}.</div>
                  </div>
                </div>
              )) : (
                <div style={{ fontSize: '13px', color: 'var(--green)', padding: '8px 0' }}>All tasks are up to date.</div>
              )}
              {overdueTasks.length > 4 && (
                <div style={{ fontSize: '11px', color: 'var(--t3)', textAlign: 'center', marginTop: '8px' }}>
                  + {overdueTasks.length - 4} more overdue tasks
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="brief-footer">
          <button className="btn btn-primary" style={{ padding: '12px 32px' }} onClick={onClose}>Start My Shift</button>
        </div>
      </div>
    </div>
  );
}

function HelpModal({ onClose, initialTab = 'guide' }: { onClose: () => void, initialTab?: string }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="modal-overlay" style={{ zIndex: 900 }}>
      <div className="modal-card" style={{ maxWidth: '600px', padding: 0 }}>
        <div className="modal-hdr" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HelpCircle size={18} color="var(--blue)" /> 
            Help &amp; Learning Centre
          </div>
          <button className="ibtn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px' }}>
            <button className={`tab-btn ${tab === 'guide' ? 'active' : ''}`} onClick={() => setTab('guide')} style={{ padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === 'guide' ? 'var(--blue)' : 'transparent'}`, fontSize: '13px', fontWeight: 600, color: tab === 'guide' ? 'var(--blue)' : 'var(--t2)', cursor: 'pointer' }}>Quick Guide</button>
            <button className={`tab-btn ${tab === 'glossary' ? 'active' : ''}`} onClick={() => setTab('glossary')} style={{ padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === 'glossary' ? 'var(--blue)' : 'transparent'}`, fontSize: '13px', fontWeight: 600, color: tab === 'glossary' ? 'var(--blue)' : 'var(--t2)', cursor: 'pointer' }}>Glossary</button>
            <button className={`tab-btn ${tab === 'shortcuts' ? 'active' : ''}`} onClick={() => setTab('shortcuts')} style={{ padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === 'shortcuts' ? 'var(--blue)' : 'transparent'}`, fontSize: '13px', fontWeight: 600, color: tab === 'shortcuts' ? 'var(--blue)' : 'var(--t2)', cursor: 'pointer' }}>Shortcuts</button>
          </div>
          <div style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto', fontSize: '13px', lineHeight: '1.6', color: 'var(--t2)' }}>
            {tab === 'guide' && (
              <div>
                <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', color: 'var(--t1)' }}>Welcome to the ALTESA Coordination Platform!</h3>
                <p style={{ marginBottom: '16px' }}>This platform is designed to help you manage patients through the different phases of the VPV study. Here is a summary of how to use the main features:</p>
                
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: '6px' }}><Home size={14} /> 1. Dashboard</h4>
                  <p style={{ margin: 0 }}>The main dashboard shows all your active patients. Pay special attention to the <strong>Alerts</strong> at the top. Patients with a <strong>Positive DTQ</strong> alert require immediate action (within the next 48 hours).</p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: '6px' }}><User size={14} /> 2. Patient View and Tasks</h4>
                  <p style={{ marginBottom: '8px' }}>By clicking on a patient, you will see their detailed timeline and task list. Tasks are grouped by category (Questionnaires, Procedures, Laboratories, Administrative).</p>
                  <ul style={{ paddingLeft: '20px', margin: 0 }}>
                    <li style={{ marginBottom: '6px' }}><strong>Complete Tasks:</strong> Click the circle next to a task to mark it as completed.</li>
                    <li style={{ marginBottom: '6px' }}><strong>Dependencies:</strong> Some tasks depend on others. Look for the <span style={{ background: 'var(--amber-bg)', color: 'var(--amber)', padding: '2px 4px', borderRadius: '4px', fontSize: '10px' }}>PREREQUISITE</span> and <span style={{ background: 'var(--blue-bg)', color: 'var(--blue)', padding: '2px 4px', borderRadius: '4px', fontSize: '10px' }}>DEPENDENT</span> tags. Click &quot;Trace Flow&quot; to see visual lines connecting the tasks.</li>
                    <li style={{ marginBottom: '6px' }}><strong>Due Dates:</strong> Tasks with a red dot are overdue or due today.</li>
                  </ul>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> 3. The RV Protocol (Positive DTQ)</h4>
                  <p style={{ margin: 0 }}>If a patient reports new symptoms (DTQ task), the system will ask if the result is Positive or Negative. A <strong>Positive</strong> result triggers the RV Protocol Wizard, which will guide you through the critical steps before randomisation.</p>
                </div>
              </div>
            )}
            {tab === 'glossary' && (
              <div>
                <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', color: 'var(--t1)' }}>Study Terms Glossary</h3>
                <div style={{ display: 'grid', gap: '16px' }}>
                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--t1)', marginBottom: '4px' }}>PSB (Pre-Symptomatic Baseline)</div>
                    <div>The phase where patients report daily symptoms via ePRO. We need at least 3 records to establish a baseline before any infection.</div>
                  </div>
                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--t1)', marginBottom: '4px' }}>DTQ (Daily Trigger Questionnaire)</div>
                    <div>A daily questionnaire asking if the patient has new respiratory symptoms. A positive response triggers the RV Protocol.</div>
                  </div>
                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--t1)', marginBottom: '4px' }}>RV Protocol (Rhinovirus)</div>
                    <div>The time-critical phase (48h + 6h window) starting from symptom onset, leading to randomisation and treatment.</div>
                  </div>
                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--t1)', marginBottom: '4px' }}>E-RS / PGIS</div>
                    <div>Evaluating Respiratory Symptoms scales. Used to calculate the PSB and track symptom resolution during treatment.</div>
                  </div>
                </div>
              </div>
            )}
            {tab === 'shortcuts' && (
              <div>
                <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', color: 'var(--t1)' }}>Keyboard Shortcuts</h3>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <kbd style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontFamily: 'var(--fm)', fontSize: '11px', color: 'var(--t1)', boxShadow: '0 1px 1px rgba(0,0,0,0.05)' }}>⌘ + K</kbd>
                    <span>Open Quick Search / Command Palette</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <kbd style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontFamily: 'var(--fm)', fontSize: '11px', color: 'var(--t1)', boxShadow: '0 1px 1px rgba(0,0,0,0.05)' }}>Esc</kbd>
                    <span>Close modals or search</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <kbd style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontFamily: 'var(--fm)', fontSize: '11px', color: 'var(--t1)', boxShadow: '0 1px 1px rgba(0,0,0,0.05)' }}>Space</kbd> <span style={{ fontSize: '11px' }}>or</span> <kbd style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontFamily: 'var(--fm)', fontSize: '11px', color: 'var(--t1)', boxShadow: '0 1px 1px rgba(0,0,0,0.05)' }}>Enter</kbd>
                    <span>Check/uncheck focused task</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer" style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '16px 24px' }}>
          <button className="btn btn-primary w-full" style={{ width: '100%', justifyContent: 'center' }} onClick={onClose}>Understood!</button>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ scores, psb, w = 264, h = 72 }: { scores: number[], psb: number | null, w?: number, h?: number }) {
  if (!scores || !scores.length) return <p style={{ textAlign: 'center', color: 'var(--t3)', fontSize: '11px', padding: '16px 0' }}>No E-RS data</p>;
  const n = Math.min(30, scores.length);
  const pts = scores.slice(-n);
  const mx = Math.max(...pts, psb || 0) + 2;
  const mn = Math.max(0, Math.min(...pts, psb || 0) - 2);
  const rng = mx - mn || 1;
  const x = (i: number) => (i / (n - 1)) * w;
  const y = (v: number) => h - ((v - mn) / rng) * h;
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${h} ${line} ${x(n - 1).toFixed(1)},${h}`;
  const py = psb ? y(psb) : null;
  
  return (
    <svg className="ers-svg" viewBox={`0 0 ${w} ${h}`} style={{ height: `${h}px` }}>
      <defs>
        <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--blue)" stopOpacity=".25"/>
          <stop offset="100%" stopColor="var(--blue)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {psb && py !== null && (
        <>
          <line x1="0" y1={py.toFixed(1)} x2={w} y2={py.toFixed(1)} stroke="var(--amber)" strokeWidth="1.5" strokeDasharray="4,3"/>
          <text x={w - 2} y={(py - 4).toFixed(1)} textAnchor="end" fontSize="8" fill="var(--amber)" fontFamily="var(--fm)">PSB {psb}</text>
        </>
      )}
      <polygon points={area} fill="url(#eg)"/>
      <polyline points={line} fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={x(n - 1).toFixed(1)} cy={y(pts[n - 1]).toFixed(1)} r="4" fill="var(--blue)"/>
    </svg>
  );
}

function Wizard({ step, setStep, chks, setChks, cdStart, onClose, onRandomise, onToggleChk }: any) {
  const [cdStr, setCdStr] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    const tick = () => {
      const rem = Math.max(0, (48 + 6) * 3600000 - (Date.now() - (cdStart || Date.now())));
      const h = Math.floor(rem / 3600000);
      const m = Math.floor((rem % 3600000) / 60000);
      const s = Math.floor((rem % 60000) / 1000);
      setCdStr(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      setUrgent(rem < 6 * 3600000);
    };
    tick();
    const int = setInterval(tick, 1000);
    return () => clearInterval(int);
  }, [cdStart]);

  const currentStep = WZ_STEPS[step];
  const currentChks = chks[step] || new Set();
  const allDone = currentStep.checks.every((_, i) => currentChks.has(i));
  const isLast = step === WZ_STEPS.length - 1;
  const missCount = currentStep.checks.filter((_, i) => !currentChks.has(i)).length;

  const toggleChk = (i: number) => {
    if (onToggleChk) {
      onToggleChk(step, i);
    } else {
      setChks((prev: any) => {
        const next = { ...prev };
        if (!next[step]) next[step] = new Set();
        const s = new Set(next[step]);
        if (s.has(i)) s.delete(i); else s.add(i);
        next[step] = s;
        return next;
      });
    }
  };

  return (
    <div className="wz-overlay" onClick={() => onClose(false)}>
      <div className="wz-card" onClick={e => e.stopPropagation()}>
        <div className="wz-top">
          <div>
            <div className="wz-heading">RV Protocol — ALTESA-047</div>
            <div className="wz-heading-sub">Step {step + 1} of {WZ_STEPS.length} · {currentStep.title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <div style={{ textAlign: 'right' }}>
              <div className={`cd ${urgent ? 'urgent' : ''}`}>{cdStr}</div>
              <div className="cd-lbl">Window remaining</div>
            </div>
            <button className="wz-close-btn" onClick={() => onClose(false)} title="Close (progress saved)"><X size={14} /></button>
          </div>
        </div>
        <div className="wz-stepper">
          {WZ_STEPS.map((_, i) => (
            <div key={i} className={`step-dot ${i < step ? 'done' : i === step ? 'active' : ''}`}></div>
          ))}
        </div>
        <div className="wz-body">
          <div className="wz-step-n">Step {step + 1} of {WZ_STEPS.length}</div>
          <div className="wz-step-title">{currentStep.title}</div>
          <div className="wz-step-desc" dangerouslySetInnerHTML={{ __html: currentStep.body }}></div>
          {currentStep.checks.map((c, i) => (
            <div key={i} className={`wz-chk-item ${currentChks.has(i) ? 'checked' : ''}`}
              tabIndex={0} role="checkbox" aria-checked={currentChks.has(i)}
              onClick={() => toggleChk(i)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleChk(i); } }}>
              <div className={`chkbox ${currentChks.has(i) ? 'checked' : ''}`} style={{ flexShrink: 0 }}></div>
              <span dangerouslySetInnerHTML={{ __html: c }}></span>
            </div>
          ))}
        </div>
        <div className="wz-foot">
          <button className="btn btn-ghost" onClick={() => step === 0 ? onClose(false) : setStep(step - 1)}>
            {step === 0 ? <><X size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Close</> : <><ArrowLeft size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Back</>}
          </button>
          <div className={`wz-missing-badge ${allDone ? 'none' : ''}`}>
            {missCount > 0 ? `${missCount} item${missCount > 1 ? 's' : ''} to confirm` : ''}
          </div>
          <button className={`btn ${isLast ? 'btn-success' : 'btn-primary'}`} disabled={!allDone} onClick={() => isLast ? onRandomise() : setStep(step + 1)}>
            {isLast ? <><Check size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/> Randomise</> : <>Next <ArrowRight size={14} style={{display:'inline', verticalAlign:'text-bottom'}}/></>}
          </button>
        </div>
      </div>
    </div>
  );
}

const RescreeningWizard = ({ 
  patient, 
  step, 
  setStep, 
  chks, 
  onToggleChk, 
  onClose, 
  onComplete 
}: { 
  patient: any, 
  step: number, 
  setStep: (s: number) => void, 
  chks: Record<number, Set<number>>, 
  onToggleChk: (step: number, i: number) => void, 
  onClose: () => void, 
  onComplete: () => void 
}) => {
  const steps = [
    { title: 'Patient Re-identification', icon: <User size={18} /> },
    { title: 'Eligibility Re-evaluation', icon: <CheckCircle2 size={18} /> },
    { title: 'Baseline Assessments', icon: <Microscope size={18} /> },
    { title: 'Review & Schedule', icon: <Calendar size={18} /> }
  ];

  const eligibilityItems = [
    'Confirm Informed Consent is still valid (or re-sign if updated)',
    'Re-verify Inclusion Criteria (COPD diagnosis, age, etc.)',
    'Re-verify Exclusion Criteria (no new comorbidities, no prohibited meds)',
    'Update Medical & Smoking History (eCRF page updated)',
    'Review Concomitant Medications with Investigator'
  ];

  const assessmentItems = [
    'CAT — COPD Assessment Test performed',
    'Oscillometry performed BEFORE spirometry',
    'Spirometry (Pre & Post SABD) completed',
    '12-lead ECG collected (prior to blood draw)',
    'Vital Signs (seated ≥ 5 min) recorded',
    'Central Safety Labs (Chemistry/Haematology) collected',
    'Pregnancy Test (WOCBP only) performed'
  ];

  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <div className="wz-step-body">
            <div className="wz-step-title">Patient Re-identification</div>
            <div className="wz-step-desc">Confirm the identity of the patient being rescreened. Data is pre-populated from the study record.</div>
            <div className="wz-form-grid">
              <div className="wz-form-item"><label>Patient ID</label><input type="text" value={patient.id} disabled /></div>
              <div className="wz-form-item"><label>Full Name</label><input type="text" value={patient.name} disabled /></div>
              <div className="wz-form-item"><label>Current Phase</label><input type="text" value={patient.phaseLabel} disabled /></div>
              <div className="wz-form-item"><label>Original Screening Date</label><input type="text" value={fmtISO(patient.screeningDate)} disabled /></div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="wz-step-body">
            <div className="wz-step-title">Eligibility Re-evaluation</div>
            <div className="wz-step-desc">In accordance with SoA Table 1, re-verify that the patient still meets all study criteria.</div>
            <div className="wz-chk-list">
              {eligibilityItems.map((item, i) => (
                <div key={i} className={`wz-chk-item ${chks[2]?.has(i) ? 'on' : ''}`} onClick={() => onToggleChk(2, i)}>
                  <div className="wz-chk-box">{chks[2]?.has(i) && <Check size={14} />}</div>
                  <div className="wz-chk-text">{item}</div>
                </div>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="wz-step-body">
            <div className="wz-step-title">Baseline Assessments</div>
            <div className="wz-step-desc">Update baseline clinical data. These assessments are required every 6 months during the Asymptomatic Phase.</div>
            <div className="wz-chk-list">
              {assessmentItems.map((item, i) => (
                <div key={i} className={`wz-chk-item ${chks[3]?.has(i) ? 'on' : ''}`} onClick={() => onToggleChk(3, i)}>
                  <div className="wz-chk-box">{chks[3]?.has(i) && <Check size={14} />}</div>
                  <div className="wz-chk-text">{item}</div>
                </div>
              ))}
            </div>
          </div>
        );
      case 4:
        const allDone = (chks[2]?.size === eligibilityItems.length) && (chks[3]?.size === assessmentItems.length);
        return (
          <div className="wz-step-body">
            <div className="wz-step-title">Review & Schedule</div>
            <div className="wz-step-desc">Review all rescreening data and schedule the next monthly call.</div>
            <div style={{ padding: '16px', background: 'var(--bg)', borderRadius: '8px', marginTop: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Rescreening Summary</div>
              <div style={{ fontSize: '11px', color: 'var(--t2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>Eligibility: <strong>{chks[2]?.size || 0}/{eligibilityItems.length}</strong></div>
                <div>Assessments: <strong>{chks[3]?.size || 0}/{assessmentItems.length}</strong></div>
                <div>Status: <span style={{ color: allDone ? 'var(--green)' : 'var(--amber)' }}>{allDone ? 'Ready to Complete' : 'Incomplete'}</span></div>
              </div>
            </div>
            {!allDone && (
              <div style={{ marginTop: '12px', padding: '10px', background: 'var(--amber-bg)', color: 'var(--amber)', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--amber-mid)' }}>
                <AlertTriangle size={12} style={{ display: 'inline', marginRight: '6px' }} />
                All eligibility and assessment items must be checked to complete rescreening.
              </div>
            )}
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="wz-overlay" style={{ zIndex: 600 }}>
      <div className="wz-card" style={{ maxWidth: '700px' }}>
        <div className="wz-hdr">
          <div className="wz-hdr-left">
            <div className="wz-icon-circle" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}><Flag size={20} /></div>
            <div>
              <div className="wz-title">Rescreening Workflow</div>
              <div className="wz-sub">ALTESA Study · {patient.id} · Week {Math.floor(patient.studyDay / 7)}</div>
            </div>
          </div>
          <button className="wz-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="wz-stepper">
          {steps.map((s, i) => (
            <div key={i} className={`wz-step ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`} onClick={() => setStep(i + 1)}>
              <div className="wz-step-icon">{step > i + 1 ? <Check size={14} /> : s.icon}</div>
              <div className="wz-step-label">{s.title}</div>
              {i < steps.length - 1 && <div className="wz-step-line"></div>}
            </div>
          ))}
        </div>
        <div className="wz-content">{renderStep()}</div>
        <div className="wz-footer">
          <button className="btn btn-ghost" onClick={() => step > 1 ? setStep(step - 1) : onClose()}>
            {step === 1 ? 'Cancel' : 'Previous'}
          </button>
          {step < 4 ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Next Step</button>
          ) : (
            <button 
              className="btn btn-success" 
              disabled={!(chks[2]?.size === eligibilityItems.length && chks[3]?.size === assessmentItems.length)}
              onClick={onComplete}
            >
              Complete Rescreening
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

function CmdPalette({ q, setQ, onClose, onSelect, patients, recentIds = [] }: any) {
  const fuzzyMatch = (str: string, query: string) => {
    if (!query) return true;
    const s = str.toLowerCase();
    const qry = query.toLowerCase();
    let i = 0, j = 0;
    while (i < s.length && j < qry.length) {
      if (s[i] === qry[j]) j++;
      i++;
    }
    return j === qry.length;
  };

  const all = patients.filter((p: Patient) => 
    !q || 
    fuzzyMatch(p.id, q) || 
    fuzzyMatch(p.name, q) || 
    fuzzyMatch(p.phaseLabel, q) || 
    fuzzyMatch(p.loc, q)
  );

  const recents = patients.filter((p: Patient) => recentIds.includes(p.id))
    .sort((a: Patient, b: Patient) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));

  const crits = all.filter((p: Patient) => p.alert === 'DTQ_POSITIVE');
  const warns = all.filter((p: Patient) => p.alert && p.alert !== 'DTQ_POSITIVE');
  const routine = all.filter((p: Patient) => !p.alert);
  const icons: any = { SCREENING: <ClipboardList size={14} />, PSB: <BarChart2 size={14} />, TREATMENT: <Pill size={14} />, FOLLOWUP: <Activity size={14} /> };

  const renderSection = (title: string, pts: any[], icon?: any) => {
    if (!pts.length) return null;
    return (
      <>
        <div className="cmd-section-hdr">{icon && <span style={{marginRight:'6px'}}>{icon}</span>}{title}</div>
        {pts.slice(0, 5).map(p => (
          <div key={p.id} className="cmd-item" onClick={() => onSelect(p.id)}>
            <div className="cmd-item-icon">{icons[p.phase] || <User size={14} />}{p.alert === 'DTQ_POSITIVE' ? <AlertTriangle size={14} style={{display:'inline', verticalAlign:'text-bottom', color:'var(--red)'}}/> : ''}</div>
            <div>
              <div className="cmd-item-main">{p.id} <span style={{color:'var(--t3)', fontWeight:400, fontSize:'11px', marginLeft:'4px'}}>{p.name}</span></div>
              <div className="cmd-item-sub">{p.phaseLabel} · {p.loc}</div>
            </div>
          </div>
        ))}
      </>
    );
  };

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-box" onClick={e => e.stopPropagation()}>
        <div className="cmd-input-row">
          <span className="cmd-icon"><Search size={16} /></span>
          <input autoFocus className="cmd-input" placeholder="Search patient ID, name, phase…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onClose(); }} />
        </div>
        <div className="cmd-results">
          {!q && renderSection('Recently Accessed', recents, <Clock size={10} />)}
          {renderSection('Critical', crits)}
          {renderSection('Action Needed', warns)}
          {renderSection('Routine', routine)}
          <div className="cmd-section-hdr">Navigation</div>
          <div className="cmd-item" onClick={() => onSelect('dashboard')}>
            <div className="cmd-item-icon">🏠</div>
            <div><div className="cmd-item-main">Dashboard</div><div className="cmd-item-sub">All patients — sorted by urgency</div></div>
          </div>
        </div>
        <div className="cmd-footer"><ArrowUpDown size={12} style={{display:'inline', verticalAlign:'text-bottom'}}/> navigate · Enter to select · Esc to close</div>
      </div>
    </div>
  );
}

function Toasts({ toasts }: { toasts: any[] }) {
  return (
    <div id="toasts">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}
