'use client';

import React, { useState, useMemo } from 'react';
import { 
  BarChart2, AlertTriangle, CheckCircle2, Clock, 
  Activity, Shield, Calendar, ChevronRight, 
  Search, Filter, MessageSquare, Lock, FileText, Key,
  TrendingUp, Map, List, LayoutGrid, Upload, X, Terminal, Download, LifeBuoy,
  PieChart as PieChartIcon, BarChart as BarChartIcon, LineChart as LineChartIcon, Settings
} from 'lucide-react';
import { Patient, countTasks, TODAY, diffDays, fmtHuman, addDays } from '@/lib/data';
import { DLPWrapper } from '@/components/DLPWrapper';
import { verifyAndDecrypt, encryptAndSign } from '@/lib/crypto';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';

interface ManagerDashboardProps {
  patients: Patient[];
  queries: any[];
  onLock: () => void;
  onDLPViolation: (action: string) => void;
  isChecked: (pid: string, code: string) => boolean;
  onOpenPatient: (id: string) => void;
  onImportPatients: (patients: Patient[]) => void;
}

export function ManagerDashboard({ patients, queries, onLock, onDLPViolation, isChecked, onOpenPatient, onImportPatients }: ManagerDashboardProps) {
  const [activeTab, setActiveTab] = useState<'tracker' | 'risk' | 'analytics' | 'queries' | 'settings'>('tracker');
  const [trackerView, setTrackerView] = useState<'board' | 'grid' | 'calendar'>('board');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [managerKeys, setManagerKeys] = useState<{publicKey: string, privateKey: string, signPublicKey: string, signPrivateKey: string, encPublicKey: string, encPrivateKey: string} | null>(null);

  // Recovery Tool State
  const [recoveryChallenge, setRecoveryChallenge] = useState('');
  const [generatedResponse, setGeneratedResponse] = useState('');

  // Activation Generator State
  const [actSiteId, setActSiteId] = useState('');
  const [actDeviceId, setActDeviceId] = useState('');
  const [generatedActCode, setGeneratedActCode] = useState('');

  // Master Key Generator State
  const [newStudyId, setNewStudyId] = useState('ALTESA-2026');
  const [generatedMasterConfig, setGeneratedMasterConfig] = useState('');

  const handleGenerateActivation = async () => {
    const { generateActivationCode } = await import('@/lib/security');
    const code = await generateActivationCode(actSiteId, actDeviceId);
    setGeneratedActCode(code);
  };

  const handleGenerateMasterConfig = () => {
    const secret = 'SEC-' + Math.random().toString(36).substring(2, 15).toUpperCase() + '-' + Date.now();
    const config = {
      studyId: newStudyId,
      secret: secret
    };
    setGeneratedMasterConfig(JSON.stringify(config, null, 2));
  };

  const handleGenerateResponse = async () => {
    const { generateResponseCode } = await import('@/lib/security');
    const resp = await generateResponseCode(recoveryChallenge);
    setGeneratedResponse(resp);
  };

  React.useEffect(() => {
    const initKeys = async () => {
      const stored = localStorage.getItem('altesa_manager_keys');
      if (stored) {
        setManagerKeys(JSON.parse(stored));
      } else {
        const { generateManagerKeys } = await import('@/lib/crypto');
        const keys = await generateManagerKeys();
        localStorage.setItem('altesa_manager_keys', JSON.stringify(keys));
        setManagerKeys(keys);
      }
    };
    initKeys();
  }, []);
  
  // Sync Modal State
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);

  // Audit Log State
  const [auditLogs] = useState([
    { timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), event: 'Manager keys generated and stored securely.', type: 'security' },
    { timestamp: new Date(Date.now() - 86400000 * 1).toISOString(), event: 'Public key exported for Coordinator distribution.', type: 'transfer' },
    { timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), event: 'Data sync initiated. 2 encrypted packages received.', type: 'transfer' },
    { timestamp: new Date(Date.now() - 3600000 * 5 + 2000).toISOString(), event: 'Signature verification successful for SITE-A.', type: 'security' },
    { timestamp: new Date(Date.now() - 3600000 * 5 + 4000).toISOString(), event: 'Payload decrypted successfully. 8 patient records updated.', type: 'transfer' },
    { timestamp: new Date(Date.now() - 1800000).toISOString(), event: 'PIN Recovery challenge generated for Coordinator.', type: 'security' },
  ]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsSyncing(true);
    setSyncLogs(["[SYSTEM] Initiating secure import protocol..."]);
    let allImported: Patient[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setSyncLogs(prev => [...prev, `[READ] Loading ${file.name}...`]);
      try {
        if (!managerKeys) throw new Error("Manager keys not initialized.");
        const text = await file.text();
        const pkg = JSON.parse(text);
        
        setSyncLogs(prev => [...prev, `[CRYPTO] Verifying ECDSA signature for ${file.name}...`]);
        await new Promise(r => setTimeout(r, 600)); // Simulate crypto delay
        
        setSyncLogs(prev => [...prev, `[CRYPTO] Decrypting AES-256-GCM payload...`]);
        await new Promise(r => setTimeout(r, 400));
        
        // In a real app, we would look up the CRC's public key based on the sender ID in the package.
        // For this prototype, we'll try to load it from local storage if available, or fallback.
        let crcSignKey = 'CRC-PUB-MOCK';
        const storedCrcKeys = localStorage.getItem('altesa_crc_keys');
        if (storedCrcKeys) {
          const parsed = JSON.parse(storedCrcKeys);
          if (parsed.signPublicKey) crcSignKey = parsed.signPublicKey;
        }

        const data = await verifyAndDecrypt(pkg, managerKeys.encPrivateKey, crcSignKey);
        allImported = [...allImported, ...data];
        
        setSyncLogs(prev => [...prev, `[SUCCESS] Decrypted ${data.length} records from ${file.name}.`]);
      } catch (err: any) {
        setSyncLogs(prev => [...prev, `[ERROR] Failed processing ${file.name}: ${err.message}`]);
      }
    }

    if (allImported.length > 0) {
      setSyncLogs(prev => [...prev, `[DB] Merging ${allImported.length} records into secure storage...`]);
      await new Promise(r => setTimeout(r, 500));
      onImportPatients(allImported);
      setSyncLogs(prev => [...prev, `[SYSTEM] Import complete. Dashboard updated.`]);
    } else {
      setSyncLogs(prev => [...prev, `[SYSTEM] Import finished with 0 records.`]);
    }
    setIsSyncing(false);
  };

  // Derive sites from patient IDs (e.g., "SITEA-001" -> "SITEA")
  const sites = useMemo(() => {
    const s = new Set<string>();
    patients.forEach(p => {
      const parts = p.id.split('-');
      if (parts.length > 1) s.add(parts[0]);
      else s.add('UNKNOWN');
    });
    return Array.from(s);
  }, [patients]);

  const filteredPatients = useMemo(() => {
    let result = patients;
    if (siteFilter !== 'ALL') {
      result = result.filter(p => p.id.startsWith(siteFilter + '-') || (siteFilter === 'UNKNOWN' && !p.id.includes('-')));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.id.toLowerCase().includes(q) || 
        p.name.toLowerCase().includes(q) || 
        p.phaseLabel.toLowerCase().includes(q)
      );
    }
    return result;
  }, [patients, siteFilter, searchQuery]);

  const filteredQueries = useMemo(() => {
    let result = queries;
    if (siteFilter !== 'ALL') {
      result = result.filter(q => q.pid.startsWith(siteFilter + '-') || (siteFilter === 'UNKNOWN' && !q.pid.includes('-')));
    }
    return result;
  }, [queries, siteFilter]);

  // KPIs
  const kpis = useMemo(() => {
    let overdues = 0;
    let todays = 0;
    let active = filteredPatients.length;
    let openQueries = filteredQueries.filter(q => q.status === 'open').length;

    filteredPatients.forEach(p => {
      const allTasks = [...(p.tasks.q || []), ...(p.tasks.pr || []), ...(p.tasks.l || []), ...(p.tasks.ad || [])];
      allTasks.forEach(t => {
        if (!isChecked(p.id, t.code) && t.dueDate) {
          const diff = diffDays(TODAY, t.dueDate);
          if (diff < 0) overdues++;
          else if (diff === 0) todays++;
        }
      });
    });

    return { overdues, todays, active, openQueries };
  }, [filteredPatients, filteredQueries, isChecked]);

  // --- Analytics Data ---
  const analyticsData = useMemo(() => {
    // 1. Enrollment Trend (Cumulative)
    const sortedByDate = [...patients].sort((a, b) => a.screeningDate.getTime() - b.screeningDate.getTime());
    
    const firstDate = sortedByDate[0]?.screeningDate || TODAY;
    const daysElapsed = Math.max(1, diffDays(firstDate, TODAY));
    const ratePerDay = patients.length / daysElapsed;
    const target = 50; // Mock target
    const remaining = target - patients.length;
    const daysToTarget = remaining > 0 ? Math.ceil(remaining / ratePerDay) : 0;
    const projectedDate = addDays(TODAY, daysToTarget);

    const trend = sortedByDate.map((p, i) => ({
      date: p.screeningDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      actual: (i + 1) as number | null,
      projected: null as number | null
    }));

    // Add Today point
    const todayStr = TODAY.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (trend.length > 0 && trend[trend.length - 1].date !== todayStr) {
      trend.push({
        date: todayStr,
        actual: patients.length,
        projected: patients.length
      });
    } else if (trend.length > 0) {
      trend[trend.length - 1].projected = patients.length;
    } else {
      trend.push({ date: todayStr, actual: 0, projected: 0 });
    }

    // Add Projected point
    if (daysToTarget > 0) {
      trend.push({
        date: projectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        actual: null,
        projected: target
      });
    }

    // 2. Site Performance
    const siteStats = sites.map(site => {
      const sitePatients = patients.filter(p => p.id.startsWith(site + '-'));
      const totalTasks = sitePatients.reduce((acc, p) => acc + countTasks(p).total, 0);
      const doneTasks = sitePatients.reduce((acc, p) => acc + countTasks(p).done, 0);
      const compliance = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
      const openQueries = queries.filter(q => q.pid.startsWith(site + '-') && q.status === 'open').length;
      
      return {
        name: site,
        subjects: sitePatients.length,
        compliance,
        queries: openQueries
      };
    });

    // 3. Phase Distribution
    const phases = [
      { name: 'Screening', value: patients.filter(p => p.phaseCode === 'scr').length, color: '#94A3B8' },
      { name: 'PSB', value: patients.filter(p => p.phaseCode === 'psb').length, color: '#38BDF8' },
      { name: 'RV/Treatment', value: patients.filter(p => p.phaseCode === 'rv' || p.phaseCode === 'tx').length, color: '#8B5CF6' },
      { name: 'Follow-up', value: patients.filter(p => p.phaseCode === 'fu').length, color: '#10B981' },
    ];

    return { trend, siteStats, phases, projectedDate, ratePerDay, target };
  }, [patients, queries, sites]);

  // --- Risk Intelligence ---
  const riskIntelligence = useMemo(() => {
    return filteredPatients.map(p => {
      let riskScore = 0;
      const reasons: string[] = [];

      // 1. Alerts & Critical Windows
      if (p.alert === 'DTQ_POSITIVE') {
        riskScore += 60;
        reasons.push("Active RV Window (48h+6h)");
      } else if (p.alert === 'RESCREENING') {
        riskScore += 30;
        reasons.push("Rescreening required");
      } else if (p.alert === 'MONTHLY_CALL') {
        riskScore += 15;
        reasons.push("Monthly call due");
      } else if (p.alert) {
        riskScore += 10;
        reasons.push(`Active alert: ${p.alert}`);
      }

      // 2. Task Overdue Risk
      const allTasks = [...(p.tasks.q || []), ...(p.tasks.pr || []), ...(p.tasks.l || []), ...(p.tasks.ad || [])];
      const overdueTasks = allTasks.filter(t => !isChecked(p.id, t.code) && t.dueDate && diffDays(TODAY, t.dueDate) < 0);
      
      if (overdueTasks.length > 0) {
        let overdueScore = 0;
        let criticalOverdue = 0;
        let urgentOverdue = 0;

        overdueTasks.forEach(t => {
          if (t.critical) {
            overdueScore += 25;
            criticalOverdue++;
          } else if (t.urgent) {
            overdueScore += 15;
            urgentOverdue++;
          } else {
            overdueScore += 10;
          }
        });

        riskScore += overdueScore;
        if (criticalOverdue > 0) reasons.push(`${criticalOverdue} critical tasks overdue`);
        if (urgentOverdue > 0) reasons.push(`${urgentOverdue} urgent tasks overdue`);
        const normalOverdue = overdueTasks.length - criticalOverdue - urgentOverdue;
        if (normalOverdue > 0) reasons.push(`${normalOverdue} tasks overdue`);
      }

      // 3. Missing Critical Docs
      const hasICF = p.documents.some(d => d.category === 'ICF');
      if (!hasICF) {
        riskScore += 50;
        reasons.push("Missing Informed Consent (ICF)");
      }

      // 4. Low Compliance
      const { done, total } = countTasks(p);
      const completionPct = total > 0 ? (done / total) * 100 : 100;
      if (completionPct < 50 && total > 0) {
        riskScore += 20;
        reasons.push(`Low compliance (${Math.round(completionPct)}%)`);
      }

      return {
        id: p.id,
        score: Math.min(100, riskScore),
        reasons
      };
    }).sort((a, b) => b.score - a.score);
  }, [filteredPatients, isChecked]);

  // Tracker Columns
  const columns = [
    { id: 'scr', label: 'Screening' },
    { id: 'psb', label: 'Asymptomatic (PSB)' },
    { id: 'rv', label: 'Symptomatic (RV)' },
    { id: 'tx', label: 'Treatment' },
    { id: 'fu', label: 'Follow-up' }
  ];

  // Tour State
  const [tourStep, setTourStep] = useState<number>(0); // 0 = off, 1 = Export Key, 2 = Data Sync, 3 = Export Queries

  const nextTourStep = () => {
    if (tourStep === 1) setTourStep(2);
    else if (tourStep === 2) {
      setActiveTab('queries');
      setTourStep(3);
    }
    else setTourStep(0);
  };

  return (
    <div className="screen" style={{ background: '#F1F5F9', minHeight: '100vh', position: 'relative' }}>
      
      {/* Tour Overlay */}
      {tourStep > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', zIndex: 900, backdropFilter: 'blur(2px)' }} onClick={() => setTourStep(0)} />
      )}

      {/* Header */}
      <div className="hdr" style={{ background: '#0F172A', color: '#fff', borderBottom: 'none', position: 'relative', zIndex: (tourStep === 1 || tourStep === 2) ? 1000 : 10 }}>
        <div className="hdr-left">
          <div className="wordmark" style={{ color: '#fff' }}>ALTE<em style={{ color: '#38BDF8' }}>SA</em></div>
          <span className="hdr-context" style={{ color: '#94A3B8', borderLeft: '1px solid #334155' }}>Study Overview</span>
        </div>
        <div className="hdr-center" style={{ display: 'flex', gap: '8px' }}>
          <button className={`ftab ${activeTab === 'tracker' ? 'active' : ''}`} style={{ color: activeTab === 'tracker' ? '#fff' : '#94A3B8', background: activeTab === 'tracker' ? '#334155' : 'transparent', border: 'none' }} onClick={() => setActiveTab('tracker')}><Map size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Subject Tracker</button>
          <button className={`ftab ${activeTab === 'risk' ? 'active' : ''}`} style={{ color: activeTab === 'risk' ? '#fff' : '#94A3B8', background: activeTab === 'risk' ? '#334155' : 'transparent', border: 'none' }} onClick={() => setActiveTab('risk')}><AlertTriangle size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Risk Intelligence</button>
          <button className={`ftab ${activeTab === 'analytics' ? 'active' : ''}`} style={{ color: activeTab === 'analytics' ? '#fff' : '#94A3B8', background: activeTab === 'analytics' ? '#334155' : 'transparent', border: 'none' }} onClick={() => setActiveTab('analytics')}><BarChart2 size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Analytics</button>
          <button className={`ftab ${activeTab === 'queries' ? 'active' : ''}`} style={{ color: activeTab === 'queries' ? '#fff' : '#94A3B8', background: activeTab === 'queries' ? '#334155' : 'transparent', border: 'none', position: 'relative', zIndex: tourStep === 3 ? 1000 : 1, boxShadow: tourStep === 3 ? '0 0 0 2px #8B5CF6' : 'none' }} onClick={() => setActiveTab('queries')}><MessageSquare size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Queries</button>
        </div>
        <div className="hdr-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            style={{ minHeight: '32px', padding: '6px 12px', fontSize: '13px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px' }} 
            onClick={() => setTourStep(1)}
          >
            <Shield size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Security Tour
          </button>
          <div style={{ position: 'relative', zIndex: tourStep === 1 ? 1000 : 1, boxShadow: tourStep === 1 ? '0 0 0 4px rgba(245, 158, 11, 0.5)' : 'none', borderRadius: '6px' }}>
            {tourStep === 1 && (
              <div style={{ position: 'absolute', top: '45px', right: '0', background: '#78350F', color: '#fff', padding: '16px', borderRadius: '8px', width: '320px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)', textAlign: 'left' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#FCD34D', marginBottom: '4px' }}>STEP 1 OF 3</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Security Settings</div>
                <div style={{ fontSize: '13px', color: '#FEF3C7', marginBottom: '12px' }}>Access your security settings to export your public key and generate PIN recovery codes for your Coordinators.</div>
                <button onClick={nextTourStep} style={{ background: '#F59E0B', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>Next <ChevronRight size={14} /></button>
              </div>
            )}
            <button 
              type="button" 
              className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ minHeight: '32px', padding: '6px 12px', fontSize: '13px', background: activeTab === 'settings' ? '#38BDF8' : '#334155', color: activeTab === 'settings' ? '#0F172A' : '#fff', border: 'none', borderRadius: '6px' }} 
              onClick={() => {
                setActiveTab('settings');
                if (tourStep === 1) nextTourStep();
              }} 
              title="Security Settings"
            >
              <Settings size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Settings
            </button>
          </div>
          <div style={{ position: 'relative', zIndex: tourStep === 2 ? 1000 : 1, boxShadow: tourStep === 2 ? '0 0 0 4px rgba(56, 189, 248, 0.5)' : 'none', borderRadius: '6px' }}>
            {tourStep === 2 && (
              <div style={{ position: 'absolute', top: '45px', right: '0', background: '#0369A1', color: '#fff', padding: '16px', borderRadius: '8px', width: '320px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)', textAlign: 'left' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#7DD3FC', marginBottom: '4px' }}>STEP 2 OF 3</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Sync Coordinator Data</div>
                <div style={{ fontSize: '13px', color: '#E0F2FE', marginBottom: '12px' }}>Import the encrypted .enc packages sent by your Coordinators to update your dashboard.</div>
                <button onClick={nextTourStep} style={{ background: '#0EA5E9', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>Next <ChevronRight size={14} /></button>
              </div>
            )}
            <button type="button" className="btn btn-primary" style={{ minHeight: '32px', padding: '6px 12px', fontSize: '13px', background: '#38BDF8', color: '#0F172A', border: 'none', borderRadius: '6px' }} onClick={() => { setSyncModalOpen(true); if (tourStep === 2) nextTourStep(); }} title="Import Data"><FileText size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Data Sync</button>
          </div>
          <button type="button" className="ibtn" style={{ border: 'none', background: 'transparent', color: '#94A3B8' }} onClick={onLock} title="Lock Session"><Lock size={14} /></button>
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 500, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Activity size={16} color="#3B82F6" /> Active Participants</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#0F172A' }}>{kpis.active}</div>
          </div>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 500, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={16} color="#EF4444" /> Overdue Assessments</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: kpis.overdues > 0 ? '#EF4444' : '#10B981' }}>{kpis.overdues}</div>
          </div>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 500, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={16} color="#F59E0B" /> Today&apos;s Assessments</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#0F172A' }}>{kpis.todays}</div>
          </div>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 500, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><MessageSquare size={16} color="#8B5CF6" /> Open Queries</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#0F172A' }}>{kpis.openQueries}</div>
          </div>
        </div>

        {/* Control Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', background: '#fff', padding: '12px 16px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          
          {/* Left: Site Context Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Map size={14} /> Site Context
            </div>
            <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', padding: '4px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <button 
                onClick={() => setSiteFilter('ALL')}
                style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: siteFilter === 'ALL' ? '#fff' : 'transparent', color: siteFilter === 'ALL' ? '#0F172A' : '#64748B', boxShadow: siteFilter === 'ALL' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s' }}
              >
                Global (All)
              </button>
              {sites.map(s => (
                <button 
                  key={s}
                  onClick={() => setSiteFilter(s)}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: siteFilter === s ? '#fff' : 'transparent', color: siteFilter === s ? '#0F172A' : '#64748B', boxShadow: siteFilter === s ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Search and View Toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input 
                aria-label="Search patients"
                type="text" 
                placeholder="Search patients..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '6px 12px 6px 30px', fontSize: '13px', outline: 'none', width: '200px', transition: 'all 0.2s' }}
              />
            </div>
            {activeTab === 'tracker' && (
              <>
                <div style={{ width: '1px', height: '24px', background: '#E2E8F0', margin: '0 4px' }}></div>
                <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '4px', border: '1px solid #E2E8F0' }}>
                  <button onClick={() => setTrackerView('board')} style={{ padding: '6px 10px', borderRadius: '6px', background: trackerView === 'board' ? '#fff' : 'transparent', border: 'none', boxShadow: trackerView === 'board' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', fontSize: '12px', cursor: 'pointer', color: trackerView === 'board' ? '#0F172A' : '#64748B', fontWeight: trackerView === 'board' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '6px' }}><LayoutGrid size={14} /> Board</button>
                  <button onClick={() => setTrackerView('grid')} style={{ padding: '6px 10px', borderRadius: '6px', background: trackerView === 'grid' ? '#fff' : 'transparent', border: 'none', boxShadow: trackerView === 'grid' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', fontSize: '12px', cursor: 'pointer', color: trackerView === 'grid' ? '#0F172A' : '#64748B', fontWeight: trackerView === 'grid' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '6px' }}><List size={14} /> List</button>
                  <button onClick={() => setTrackerView('calendar')} style={{ padding: '6px 10px', borderRadius: '6px', background: trackerView === 'calendar' ? '#fff' : 'transparent', border: 'none', boxShadow: trackerView === 'calendar' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', fontSize: '12px', cursor: 'pointer', color: trackerView === 'calendar' ? '#0F172A' : '#64748B', fontWeight: trackerView === 'calendar' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={14} /> Calendar</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tracker */}
        {activeTab === 'tracker' && trackerView === 'board' && (
          <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px' }}>
            {columns.map(col => {
              const colPatients = filteredPatients.filter(p => p.phaseCode === col.id);
              return (
                <div key={col.id} style={{ flex: '1', minWidth: '260px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 220px)' }}>
                  <div style={{ padding: '16px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {col.label}
                    <span style={{ background: '#E2E8F0', color: '#475569', fontSize: '12px', padding: '2px 8px', borderRadius: '12px' }}>{colPatients.length}</span>
                  </div>
                  <div style={{ padding: '12px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {colPatients.map(p => {
                      const isCrit = p.alert === 'DTQ_POSITIVE';
                      const isWarn = p.alert && !isCrit;
                      return (
                        <div key={p.id} onClick={() => onOpenPatient(p.id)} style={{ cursor: 'pointer', background: '#fff', padding: '16px', borderRadius: '8px', border: `1px solid ${isCrit ? '#FECACA' : isWarn ? '#FDE68A' : '#E2E8F0'}`, borderLeft: `4px solid ${isCrit ? '#EF4444' : isWarn ? '#F59E0B' : '#3B82F6'}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ fontWeight: 600, fontSize: '13px', color: '#0F172A' }}><DLPWrapper onViolation={onDLPViolation}>{p.id}</DLPWrapper></div>
                            <div style={{ fontSize: '11px', color: '#64748B', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>{p.id.split('-')[0]}</div>
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569', marginBottom: '12px' }}>
                            <Shield size={12} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px', color: '#10B981'}}/>
                            Secure ID: <span style={{fontFamily:'monospace', color:'#94A3B8'}}>{btoa(p.id).substring(0,8)}...</span>
                          </div>
                          {isCrit && (
                            <div style={{ fontSize: '11px', color: '#DC2626', background: '#FEF2F2', padding: '6px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <AlertTriangle size={12} /> DTQ+ Window Active
                            </div>
                          )}
                          {isWarn && (
                            <div style={{ fontSize: '11px', color: '#D97706', background: '#FFFBEB', padding: '6px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Clock size={12} /> Action Needed
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {colPatients.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: '13px' }}>No subjects</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'tracker' && trackerView === 'grid' && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Secure ID</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Site</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Phase</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Next Visit</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map(p => (
                  <tr key={p.id} onClick={() => onOpenPatient(p.id)} style={{ borderBottom: '1px solid #E2E8F0', cursor: 'pointer' }}>
                    <td style={{ padding: '16px', fontFamily: 'monospace', color: '#3B82F6' }}>{btoa(p.id).substring(0,8)}</td>
                    <td style={{ padding: '16px' }}>{p.id.split('-')[0]}</td>
                    <td style={{ padding: '16px' }}>{p.phaseLabel}</td>
                    <td style={{ padding: '16px' }}>{p.nextVisit ? new Date(p.nextVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</td>
                    <td style={{ padding: '16px' }}>
                      {p.alert === 'DTQ_POSITIVE' ? (
                        <span style={{ color: '#DC2626', background: '#FEF2F2', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 500 }}>Critical</span>
                      ) : p.alert ? (
                        <span style={{ color: '#D97706', background: '#FFFBEB', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 500 }}>Warning</span>
                      ) : (
                        <span style={{ color: '#10B981', background: '#ECFDF5', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 500 }}>On Track</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredPatients.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>No subjects found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'tracker' && trackerView === 'calendar' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '16px' }}>
            {Array(14).fill(0).map((_, i) => {
              const d = new Date(TODAY);
              d.setDate(d.getDate() + i);
              const dayPatients = filteredPatients.filter(p => {
                if (!p.nextVisit) return false;
                const nv = new Date(p.nextVisit);
                return nv.getFullYear() === d.getFullYear() && nv.getMonth() === d.getMonth() && nv.getDate() === d.getDate();
              });
              
              return (
                <div key={i} style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', minHeight: '120px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '12px', fontWeight: 600, color: '#475569', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
                    {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div style={{ padding: '8px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {dayPatients.map(p => (
                      <div key={p.id} onClick={() => onOpenPatient(p.id)} style={{ fontSize: '11px', padding: '4px 8px', background: p.alert === 'DTQ_POSITIVE' ? '#FEF2F2' : '#F1F5F9', color: p.alert === 'DTQ_POSITIVE' ? '#DC2626' : '#334155', borderRadius: '4px', cursor: 'pointer', border: `1px solid ${p.alert === 'DTQ_POSITIVE' ? '#FECACA' : '#E2E8F0'}` }}>
                        {btoa(p.id).substring(0,8)} ({p.id.split('-')[0]})
                      </div>
                    ))}
                    {dayPatients.length === 0 && <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center', marginTop: '8px' }}>No visits</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Risk Intelligence */}
        {activeTab === 'risk' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={18} color="#EF4444"/> Subject Risk Prioritization</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {riskIntelligence.map(risk => (
                  <div key={risk.id} onClick={() => onOpenPatient(risk.id)} style={{ cursor: 'pointer', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: risk.score > 70 ? '#FEF2F2' : risk.score > 30 ? '#FFFBEB' : '#fff' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: risk.score > 70 ? '#FEE2E2' : risk.score > 30 ? '#FEF3C7' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: risk.score > 70 ? '#991B1B' : risk.score > 30 ? '#92400E' : '#475569', border: `2px solid ${risk.score > 70 ? '#EF4444' : risk.score > 30 ? '#F59E0B' : '#CBD5E1'}` }}>
                        <span style={{ margin: 'auto' }}>{risk.score}</span>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#0F172A' }}>{risk.id}</div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                          {risk.reasons.map((r, i) => (
                            <span key={i} style={{ fontSize: '10px', background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: '4px', color: '#64748B' }}>{r}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} color="#94A3B8" />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><Calendar size={18} color="#3B82F6"/> Critical Windows</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredPatients.filter(p => p.alert === 'DTQ_POSITIVE').map(p => (
                    <div key={p.id} style={{ padding: '12px', background: '#FEF2F2', borderRadius: '8px', borderLeft: '4px solid #EF4444' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#991B1B' }}>{p.id} — RV Window</div>
                      <div style={{ fontSize: '11px', color: '#B91C1C', marginTop: '2px' }}>Randomization required within 48h+6h of onset.</div>
                    </div>
                  ))}
                  {filteredPatients.filter(p => p.alert === 'DTQ_POSITIVE').length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#94A3B8', fontSize: '13px', border: '1px dashed #E2E8F0', borderRadius: '8px' }}>No active critical windows</div>
                  )}
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingUp size={18} color="#8B5CF6"/> Risk Trends</h3>
                <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}>
                  Global risk index is <strong>stable</strong>. Site ALTESA shows a slight increase in overdue tasks (+5% vs last sync).
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analytics */}
        {activeTab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top Row: Projections */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Enrollment Rate</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A' }}>{analyticsData.ratePerDay.toFixed(2)} <span style={{ fontSize: '14px', fontWeight: 400, color: '#94A3B8' }}>subs/day</span></div>
              </div>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Projected Target Date</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#3B82F6' }}>{analyticsData.projectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>To reach target of {analyticsData.target} subjects</div>
              </div>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Target Completion</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#10B981' }}>{Math.round((patients.length / analyticsData.target) * 100)}%</div>
                <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#10B981', width: `${(patients.length / analyticsData.target) * 100}%` }}></div>
                </div>
              </div>
            </div>

            {/* Middle Row: Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Enrollment Trend & Projection</h3>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '12px', height: '3px', background: '#3B82F6' }}></div>
                      <span style={{ color: '#64748B' }}>Actual</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '12px', height: '3px', background: '#3B82F6', borderTop: '2px dashed #3B82F6', backgroundClip: 'padding-box', backgroundColor: 'transparent' }}></div>
                      <span style={{ color: '#64748B' }}>Projected</span>
                    </div>
                  </div>
                </div>
                <div style={{ height: '300px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analyticsData.trend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="date" fontSize={11} tickMargin={10} axisLine={false} tickLine={false} />
                      <YAxis fontSize={11} axisLine={false} tickLine={false} domain={[0, analyticsData.target + 5]} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        labelStyle={{ fontWeight: 600, marginBottom: '4px' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="actual" 
                        stroke="#3B82F6" 
                        strokeWidth={3} 
                        dot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff' }} 
                        activeDot={{ r: 6 }} 
                        connectNulls
                      />
                      <Line 
                        type="monotone" 
                        dataKey="projected" 
                        stroke="#3B82F6" 
                        strokeWidth={2} 
                        strokeDasharray="5 5" 
                        dot={false} 
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px' }}>Phase Distribution</h3>
                <div style={{ height: '300px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analyticsData.phases}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {analyticsData.phases.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Bottom Row: Site Benchmarking */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Site Benchmarking</h3>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748B', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ padding: '16px 24px', fontWeight: 600 }}>Site Name</th>
                    <th style={{ padding: '16px 24px', fontWeight: 600 }}>Subjects</th>
                    <th style={{ padding: '16px 24px', fontWeight: 600 }}>Compliance Index</th>
                    <th style={{ padding: '16px 24px', fontWeight: 600 }}>Open Queries</th>
                    <th style={{ padding: '16px 24px', fontWeight: 600 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsData.siteStats.map(site => (
                    <tr key={site.name} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '16px 24px', fontWeight: 600 }}>{site.name}</td>
                      <td style={{ padding: '16px 24px' }}>{site.subjects}</td>
                      <td style={{ padding: '16px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden', maxWidth: '100px' }}>
                            <div style={{ height: '100%', background: site.compliance > 80 ? '#10B981' : site.compliance > 50 ? '#F59E0B' : '#EF4444', width: `${site.compliance}%` }}></div>
                          </div>
                          <span style={{ fontWeight: 600 }}>{site.compliance}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 24px' }}>{site.queries}</td>
                      <td style={{ padding: '16px 24px' }}>
                        <span style={{ 
                          padding: '4px 8px', 
                          borderRadius: '12px', 
                          fontSize: '11px', 
                          fontWeight: 600,
                          background: site.compliance > 80 ? '#ECFDF5' : '#FEF2F2',
                          color: site.compliance > 80 ? '#059669' : '#DC2626'
                        }}>
                          {site.compliance > 80 ? 'High Performance' : 'Needs Attention'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Security Settings */}
        {activeTab === 'settings' && (
          <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Export Key Section */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ background: '#FEF3C7', padding: '12px', borderRadius: '12px' }}>
                  <Key size={24} color="#D97706" />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>Export Public Key</h3>
                  <p style={{ fontSize: '14px', color: '#64748B', margin: '4px 0 0 0' }}>Share this key with Coordinators to allow them to encrypt data for you</p>
                </div>
              </div>
              
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px dashed #CBD5E1', marginBottom: '24px' }}>
                <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                  Your public key is required by Coordinators to securely encrypt patient data before sending it to you. 
                  Exporting this key is safe; it cannot be used to decrypt data.
                </p>
              </div>

              <button 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '12px', fontSize: '14px', background: '#F59E0B', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600 }}
                onClick={() => {
                  if (!managerKeys) {
                    alert("Manager keys not initialized.");
                    return;
                  }
                  const keyData = JSON.stringify({
                    encPublicKey: managerKeys.encPublicKey,
                    signPublicKey: managerKeys.signPublicKey
                  });
                  const blob = new Blob([keyData], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Manager_Public_Key.txt`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                <Shield size={16} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'6px'}}/> Download Public Key
              </button>
            </div>

            {/* PIN Recovery Section */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ background: '#F0F9FF', padding: '12px', borderRadius: '12px' }}>
                  <LifeBuoy size={24} color="#0EA5E9" />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>PIN Recovery Generator</h3>
                  <p style={{ fontSize: '14px', color: '#64748B', margin: '4px 0 0 0' }}>Generate a response code for a Coordinator challenge</p>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>Challenge Code (from Coordinator)</label>
                <input 
                  type="text" 
                  placeholder="Enter 6-digit challenge"
                  value={recoveryChallenge}
                  onChange={(e) => setRecoveryChallenge(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '16px', outline: 'none', transition: 'border-color 0.2s' }}
                />
              </div>

              <button 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '12px', fontSize: '14px', background: '#0EA5E9', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600 }}
                disabled={recoveryChallenge.length < 6}
                onClick={handleGenerateResponse}
              >
                Generate Response Code
              </button>

              {generatedResponse && (
                <div style={{ marginTop: '32px', padding: '24px', background: '#F0FDF4', borderRadius: '12px', border: '1px solid #BBF7D0', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '8px', letterSpacing: '0.05em' }}>RESPONSE CODE FOR COORDINATOR</div>
                  <div style={{ fontSize: '32px', fontWeight: 700, color: '#15803D', letterSpacing: '4px' }}>{generatedResponse}</div>
                  <p style={{ fontSize: '12px', color: '#166534', marginTop: '12px', opacity: 0.8 }}>Provide this code to the Coordinator to unlock their session.</p>
                </div>
              )}
            </div>

            <div style={{ marginTop: '24px', padding: '16px', background: '#FEF3C7', borderRadius: '8px', border: '1px solid #FDE68A', display: 'flex', gap: '12px' }}>
              <Shield size={20} color="#B45309" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '13px', color: '#92400E', lineHeight: 1.5 }}>
                <strong>Security Protocol:</strong> Always verify the identity of the Coordinator via a secondary channel (voice/video) before providing a recovery code.
              </div>
            </div>

            {/* Activation Generator */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginTop: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ background: '#F5F3FF', padding: '12px', borderRadius: '12px' }}>
                  <Shield size={24} color="#7C3AED" />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>Site Activation Generator</h3>
                  <p style={{ fontSize: '14px', color: '#64748B', margin: '4px 0 0 0' }}>Authorize a new device/site instance</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>Site ID</label>
                  <input 
                    type="text" 
                    placeholder="e.g. SITE-A"
                    value={actSiteId}
                    onChange={(e) => setActSiteId(e.target.value.toUpperCase())}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>Device Hardware ID</label>
                  <input 
                    type="text" 
                    placeholder="DEV-XXXX..."
                    value={actDeviceId}
                    onChange={(e) => setActDeviceId(e.target.value.toUpperCase())}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <button 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '12px', fontSize: '14px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600 }}
                disabled={!actSiteId || !actDeviceId}
                onClick={handleGenerateActivation}
              >
                Generate Activation Code
              </button>

              {generatedActCode && (
                <div style={{ marginTop: '24px', padding: '20px', background: '#F5F3FF', borderRadius: '12px', border: '1px solid #DDD6FE', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#5B21B6', marginBottom: '8px' }}>ACTIVATION CODE FOR SITE</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#4C1D95', fontFamily: 'monospace', letterSpacing: '2px' }}>{generatedActCode}</div>
                </div>
              )}
            </div>

            {/* Master Key Generator (Developer/Admin Tool) */}
            <div style={{ background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #CBD5E1', padding: '32px', marginTop: '48px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ background: '#E2E8F0', padding: '12px', borderRadius: '12px' }}>
                  <Key size={24} color="#475569" />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>Master Key File Generator</h3>
                  <p style={{ fontSize: '14px', color: '#64748B', margin: '4px 0 0 0' }}>Developer Tool: Generate a new Study Configuration</p>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>Study ID</label>
                <input 
                  type="text" 
                  value={newStudyId}
                  onChange={(e) => setNewStudyId(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '14px' }}
                />
              </div>

              <button 
                className="btn" 
                style={{ width: '100%', padding: '12px', background: '#475569', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600 }}
                onClick={handleGenerateMasterConfig}
              >
                Generate New Master Key File Content
              </button>

              {generatedMasterConfig && (
                <div style={{ marginTop: '24px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>COPY THIS JSON TO DISTRIBUTE TO MANAGERS:</div>
                  <pre style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px', overflowX: 'auto', color: '#0F172A' }}>
                    {generatedMasterConfig}
                  </pre>
                  <p style={{ fontSize: '12px', color: '#64748B', marginTop: '12px' }}>
                    <strong>Warning:</strong> This file contains the cryptographic seed for the entire study. Keep it secure.
                  </p>
                </div>
              )}
            </div>

            {/* Security Audit Log */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginTop: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ background: '#F1F5F9', padding: '12px', borderRadius: '12px' }}>
                  <Terminal size={24} color="#475569" />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>Security Audit Log</h3>
                  <p style={{ fontSize: '14px', color: '#64748B', margin: '4px 0 0 0' }}>Review recent security-related events and data transfer activities</p>
                </div>
              </div>

              <div style={{ background: '#0F172A', borderRadius: '8px', padding: '16px', maxHeight: '300px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '12px', color: '#10B981', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
                {auditLogs.map((log, i) => (
                  <div key={i} style={{ marginBottom: '8px', lineHeight: 1.4, display: 'flex', gap: '12px' }}>
                    <span style={{ color: '#64748B', flexShrink: 0 }}>[{new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19)}]</span>
                    <span style={{ color: log.type === 'security' ? '#F59E0B' : '#38BDF8', flexShrink: 0 }}>[{log.type.toUpperCase()}]</span>
                    <span style={{ color: '#F8FAFC' }}>{log.event}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* Queries */}
        {activeTab === 'queries' && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', margin: 0 }}>Active Queries</h3>
              <div style={{ position: 'relative', zIndex: tourStep === 3 ? 1000 : 1, boxShadow: tourStep === 3 ? '0 0 0 4px rgba(139, 92, 246, 0.5)' : 'none', borderRadius: '6px' }}>
                {tourStep === 3 && (
                  <div style={{ position: 'absolute', top: '40px', right: '0', background: '#4C1D95', color: '#fff', padding: '16px', borderRadius: '8px', width: '320px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)', textAlign: 'left' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#C4B5FD', marginBottom: '4px' }}>STEP 3 OF 3</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Export Queries</div>
                    <div style={{ fontSize: '13px', color: '#EDE9FE', marginBottom: '12px' }}>After reviewing the data, export your queries securely. Send this file back to your Coordinators.</div>
                    <button onClick={nextTourStep} style={{ background: '#8B5CF6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>Finish Tour <CheckCircle2 size={14} /></button>
                  </div>
                )}
                <button 
                  className="btn btn-primary" 
                  style={{ padding: '6px 12px', fontSize: '12px', background: '#8B5CF6', color: '#fff', border: 'none' }}
                  onClick={async () => {
                    try {
                      if (!managerKeys) throw new Error("Manager keys not initialized.");
                      
                      let crcEncKey = 'CRC-PUB-MOCK';
                      const storedCrcKeys = localStorage.getItem('altesa_crc_keys');
                      if (storedCrcKeys) {
                        const parsed = JSON.parse(storedCrcKeys);
                        if (parsed.encPublicKey) crcEncKey = parsed.encPublicKey;
                      }

                      const pkg = await encryptAndSign(filteredQueries, crcEncKey, managerKeys.signPrivateKey);
                      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `ALTESA_Queries_${new Date().toISOString().split('T')[0]}.enc`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      if (tourStep === 3) nextTourStep();
                    } catch (err) {
                      console.error(err);
                      alert("Failed to export queries.");
                    }
                  }}
                >
                  <Download size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Export Queries
                </button>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Query ID</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Subject (Secure ID)</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Site</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Issue</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Status</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueries.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>No active queries</td>
                  </tr>
                ) : (
                  filteredQueries.map((q) => (
                    <tr key={q.id} onClick={() => onOpenPatient(q.pid)} style={{ borderBottom: '1px solid #E2E8F0', cursor: 'pointer' }}>
                      <td style={{ padding: '16px', fontFamily: 'monospace', color: '#3B82F6' }}>{q.id}</td>
                      <td style={{ padding: '16px', fontFamily: 'monospace', color: '#64748B' }}>{btoa(q.pid).substring(0,8)}</td>
                      <td style={{ padding: '16px' }}>{q.pid.split('-')[0]}</td>
                      <td style={{ padding: '16px', color: '#334155' }}>{q.issue}</td>
                      <td style={{ padding: '16px' }}>
                        <span style={{ background: q.status === 'open' ? '#FEF2F2' : '#FFFBEB', color: q.status === 'open' ? '#DC2626' : '#D97706', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 500 }}>
                          {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <button style={{ background: 'transparent', border: '1px solid #E2E8F0', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#334155', fontWeight: 500 }}>
                          {q.status === 'open' ? 'Review' : 'Approve'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Sync Modal */}
      {syncModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => !isSyncing && setSyncModalOpen(false)}>
          <div className="modal-card" style={{ background: '#fff', borderRadius: '16px', width: '600px', maxWidth: '90vw', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: '#E0F2FE', padding: '8px', borderRadius: '8px' }}>
                  <Shield size={24} color="#0284C7" />
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0 }}>Secure Data Import</h2>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>Import encrypted .enc packages from Coordinators</p>
                </div>
              </div>
              {!isSyncing && (
                <button aria-label="Close" onClick={() => setSyncModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                  <X size={20} aria-hidden="true" />
                </button>
              )}
            </div>

            <div style={{ padding: '24px' }}>
              {/* File Drop Zone */}
              <div style={{ border: '2px dashed #CBD5E1', borderRadius: '12px', padding: '40px 24px', textAlign: 'center', background: '#F8FAFC', marginBottom: '24px', position: 'relative', transition: 'all 0.2s' }}>
                <input 
                  aria-label="Upload encrypted package"
                  type="file" 
                  multiple 
                  accept=".enc" 
                  onChange={handleFileUpload}
                  disabled={isSyncing}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: isSyncing ? 'not-allowed' : 'pointer', width: '100%' }}
                />
                <Upload size={32} color="#94A3B8" style={{ margin: '0 auto 12px auto' }} />
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#334155', margin: '0 0 4px 0' }}>Select or drop .enc files here</h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>Supports multiple site packages simultaneously</p>
              </div>

              {/* Audit Log Terminal */}
              <div style={{ background: '#0F172A', borderRadius: '8px', padding: '16px', minHeight: '160px', maxHeight: '240px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '12px', color: '#10B981', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#64748B', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                  <Terminal size={14} /> <span>Security Audit Log</span>
                </div>
                {syncLogs.length === 0 ? (
                  <div style={{ color: '#475569' }}>Waiting for input...</div>
                ) : (
                  syncLogs.map((log, i) => (
                    <div key={i} style={{ marginBottom: '4px', lineHeight: 1.4 }}>
                      <span style={{ color: '#64748B' }}>{new Date().toISOString().split('T')[1].substring(0,8)}</span>{' '}
                      <span style={{ color: log.includes('ERROR') ? '#EF4444' : log.includes('SUCCESS') ? '#34D399' : log.includes('CRYPTO') ? '#38BDF8' : '#10B981' }}>
                        {log}
                      </span>
                    </div>
                  ))
                )}
                {isSyncing && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}>
                    <div className="crit-pulse" style={{ width: '8px', height: '8px', background: '#10B981', animationDuration: '1s' }}></div>
                    <span style={{ color: '#10B981' }}>Processing...</span>
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ padding: '16px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setSyncModalOpen(false)} 
                disabled={isSyncing}
                style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500, background: isSyncing ? '#E2E8F0' : '#fff', color: isSyncing ? '#94A3B8' : '#334155', border: '1px solid #CBD5E1', cursor: isSyncing ? 'not-allowed' : 'pointer' }}
              >
                {syncLogs.length > 0 && !isSyncing ? 'Close' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
