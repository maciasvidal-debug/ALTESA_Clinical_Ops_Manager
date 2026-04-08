'use client';

import React, { useState, useMemo } from 'react';
import { 
  BarChart2, AlertTriangle, CheckCircle2, Clock, 
  Activity, Shield, Calendar, ChevronRight, 
  Search, Filter, MessageSquare, Lock, FileText,
  TrendingUp, Map
} from 'lucide-react';
import { Patient, countTasks, TODAY, diffDays, fmtHuman } from '@/lib/data';
import { DLPWrapper } from '@/components/DLPWrapper';

interface ManagerDashboardProps {
  patients: Patient[];
  queries: any[];
  onLock: () => void;
  onDLPViolation: (action: string) => void;
  isChecked: (pid: string, code: string) => boolean;
  onOpenPatient: (id: string) => void;
}

export function ManagerDashboard({ patients, queries, onLock, onDLPViolation, isChecked, onOpenPatient }: ManagerDashboardProps) {
  const [activeTab, setActiveTab] = useState<'tracker' | 'risk' | 'queries'>('tracker');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  // KPIs
  const kpis = useMemo(() => {
    let overdues = 0;
    let todays = 0;
    let active = filteredPatients.length;
    let openQueries = queries.filter(q => q.status === 'open').length;

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
  }, [filteredPatients, queries, isChecked]);

  // Tracker Columns
  const columns = [
    { id: 'scr', label: 'Screening' },
    { id: 'psb', label: 'Asymptomatic (PSB)' },
    { id: 'rv', label: 'Symptomatic (RV)' },
    { id: 'tx', label: 'Treatment' },
    { id: 'fu', label: 'Follow-up' }
  ];

  return (
    <div className="screen" style={{ background: '#F1F5F9', minHeight: '100vh' }}>
      {/* Header */}
      <div className="hdr" style={{ background: '#0F172A', color: '#fff', borderBottom: 'none' }}>
        <div className="hdr-left">
          <div className="wordmark" style={{ color: '#fff' }}>ALTE<em style={{ color: '#38BDF8' }}>SA</em></div>
          <span className="hdr-context" style={{ color: '#94A3B8', borderLeft: '1px solid #334155' }}>Study Overview</span>
        </div>
        <div className="hdr-center">
          <div style={{ display: 'flex', background: '#1E293B', borderRadius: '6px', padding: '4px' }}>
            <button className={`ftab ${activeTab === 'tracker' ? 'active' : ''}`} style={{ color: activeTab === 'tracker' ? '#fff' : '#94A3B8', background: activeTab === 'tracker' ? '#334155' : 'transparent', border: 'none' }} onClick={() => setActiveTab('tracker')}><Map size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Subject Tracker</button>
            <button className={`ftab ${activeTab === 'risk' ? 'active' : ''}`} style={{ color: activeTab === 'risk' ? '#fff' : '#94A3B8', background: activeTab === 'risk' ? '#334155' : 'transparent', border: 'none' }} onClick={() => setActiveTab('risk')}><TrendingUp size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Risk & Heatmap</button>
            <button className={`ftab ${activeTab === 'queries' ? 'active' : ''}`} style={{ color: activeTab === 'queries' ? '#fff' : '#94A3B8', background: activeTab === 'queries' ? '#334155' : 'transparent', border: 'none' }} onClick={() => setActiveTab('queries')}><MessageSquare size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Queries</button>
          </div>
        </div>
        <div className="hdr-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input 
              type="text" 
              placeholder="Search patients..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ background: '#1E293B', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '6px 12px 6px 30px', fontSize: '13px', outline: 'none', width: '200px' }}
            />
          </div>
          <select 
            value={siteFilter} 
            onChange={e => setSiteFilter(e.target.value)}
            style={{ background: '#1E293B', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '6px 12px', fontSize: '13px', outline: 'none' }}
          >
            <option value="ALL">Global (All Sites)</option>
            {sites.map(s => <option key={s} value={s}>Site: {s}</option>)}
          </select>
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
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 500, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={16} color="#F59E0B" /> Today's Assessments</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#0F172A' }}>{kpis.todays}</div>
          </div>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 500, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><MessageSquare size={16} color="#8B5CF6" /> Open Queries</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#0F172A' }}>{kpis.openQueries}</div>
          </div>
        </div>

        {/* Tracker */}
        {activeTab === 'tracker' && (
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

        {/* Risk & Heatmap */}
        {activeTab === 'risk' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><Calendar size={18} color="#3B82F6"/> Deviation Heatmap (Next 14 Days)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                {Array(14).fill(0).map((_, i) => {
                  const d = new Date(TODAY);
                  d.setDate(d.getDate() + i);
                  const isHighRisk = i === 2 || i === 5; // Mock risk days
                  const isMedRisk = i === 8 || i === 11;
                  
                  return (
                    <div key={i} style={{ 
                      border: '1px solid #E2E8F0', 
                      borderRadius: '8px', 
                      padding: '12px',
                      background: isHighRisk ? '#FEF2F2' : isMedRisk ? '#FFFBEB' : '#F8FAFC',
                      borderColor: isHighRisk ? '#FECACA' : isMedRisk ? '#FDE68A' : '#E2E8F0'
                    }}>
                      <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '8px' }}>{d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                      {isHighRisk ? (
                        <div style={{ fontSize: '12px', color: '#DC2626', fontWeight: 500 }}><AlertTriangle size={12} style={{display:'inline'}}/> 3 RV Windows</div>
                      ) : isMedRisk ? (
                        <div style={{ fontSize: '12px', color: '#D97706', fontWeight: 500 }}><Clock size={12} style={{display:'inline'}}/> 5 Follow-ups</div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#10B981' }}><CheckCircle2 size={12} style={{display:'inline'}}/> Clear</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingUp size={18} color="#8B5CF6"/> Predictive Compliance</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '16px', background: '#FEF2F2', borderRadius: '8px', borderLeft: '4px solid #EF4444' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#991B1B', marginBottom: '4px' }}>High Risk: Site ALTESA</div>
                  <div style={{ fontSize: '12px', color: '#7F1D1D', lineHeight: 1.5 }}>Site has 3 randomisations next week, but historical data shows a 40% delay rate in the 48h RV window. Recommend CRA check-in.</div>
                </div>
                <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '8px', borderLeft: '4px solid #3B82F6' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#1E3A8A', marginBottom: '4px' }}>Trend: ePRO Completion</div>
                  <div style={{ fontSize: '12px', color: '#1E40AF', lineHeight: 1.5 }}>Global daily symptom diary compliance is at 92% (Up 3% from last week).</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Queries */}
        {activeTab === 'queries' && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
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
                {queries.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>No active queries</td>
                  </tr>
                ) : (
                  queries.map((q) => (
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
    </div>
  );
}
