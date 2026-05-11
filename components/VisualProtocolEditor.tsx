'use client';

import React, { useState, useMemo } from 'react';
import { X, Save, FileText, CheckCircle2, Activity, Calendar, AlertTriangle, Clock, ArrowRight, Sparkles, Grid3X3, ListFilter, Plus } from 'lucide-react';
import type { AmendmentEditorState } from '@/lib/data';

interface VisualProtocolEditorProps {
  isOpen: boolean;
  onClose: () => void;
  versionId: string;
  /** Persisted editor state to rehydrate from — pass amendment.editorState if available. */
  initialEditorState?: AmendmentEditorState;
  /** Called with the full editor state when the user clicks "Review & Apply Changes". */
  onSave: (state: AmendmentEditorState) => void;
}

interface RuleDef {
  id: string;
  category: string;
  categoryIcon: any;
  name: string;
  description: string;
  legacyValue: string;
  currentValue: string;
  options: string[];
  keywords: string[];
}

interface SoATask {
  id: string;
  name: string;
  category: string;
  phases: {
    screening: boolean;
    preD1: boolean;
    d3: boolean;
    d7: boolean;
    d14: boolean;
    d28: boolean;
    endOfStudy: boolean;
  };
  originalPhases: {
    screening: boolean;
    preD1: boolean;
    d3: boolean;
    d7: boolean;
    d14: boolean;
    d28: boolean;
    endOfStudy: boolean;
  };
}

const INITIAL_RULES: RuleDef[] = [
  {
    id: 'spiro_washout',
    category: 'Assessments',
    categoryIcon: Activity,
    name: 'Bronchodilator Washout Time',
    description: 'Minimum time required after last bronchodilator use before performing spirometry.',
    legacyValue: '4 hours',
    currentValue: '4 hours',
    options: ['4 hours', '6 hours', '8 hours'],
    keywords: ['bronchodilator', 'washout', 'spirometry', 'albuterol', 'salbutamol', 'espirometría', 'espirometria', 'broncodilatador'],
  },
  {
    id: 'ecg_schedule',
    category: 'Schedule',
    categoryIcon: Calendar,
    name: 'Routine ECG Frequency',
    description: 'When routine ECGs must be performed for enrolled patients per protocol schedule.',
    legacyValue: 'Screening, Day 1, Day 7',
    currentValue: 'Screening, Day 1, Day 7',
    options: ['Screening, Day 1, Day 7', 'Every Visit (Monthly)', 'Screening & End of Study'],
    keywords: ['ecg', 'electrocardiogram', 'schedule', 'frequency', 'electrocardiograma', 'frecuencia'],
  },
  {
    id: 'inclusion_age',
    category: 'Eligibility',
    categoryIcon: CheckCircle2,
    name: 'Minimum Age Requirement',
    description: 'Minimum age at the time of the screening visit.',
    legacyValue: '18 years',
    currentValue: '18 years',
    options: ['18 years', '21 years', '40 years'],
    keywords: ['age', 'years', 'inclusion', 'eligibility', 'pediatric', 'adult', 'edad', 'años', 'inclusión', 'inclusion', 'elegibilidad'],
  },
  {
    id: 'sae_window',
    category: 'Safety',
    categoryIcon: AlertTriangle,
    name: 'SAE Reporting Window',
    description: 'Maximum permitted time limit to report a Serious Adverse Event to the Sponsor.',
    legacyValue: '24 hours',
    currentValue: '24 hours',
    options: ['24 hours', '48 hours', '72 hours'],
    keywords: ['sae', 'serious adverse event', 'reporting', 'window', 'adverse event', 'evento adverso grave', 'evento adverso', 'ventana'],
  }
];

const INITIAL_SOA: SoATask[] = [
  { id: 'spiro', name: 'Spirometry (Pre/Post BD)', category: 'Efficacy', phases: { screening: true, preD1: false, d3: false, d7: true, d14: true, d28: true, endOfStudy: true }, originalPhases: { screening: true, preD1: false, d3: false, d7: true, d14: true, d28: true, endOfStudy: true } },
  { id: 'osc', name: 'Oscillometry', category: 'Efficacy', phases: { screening: true, preD1: true, d3: true, d7: true, d14: true, d28: true, endOfStudy: true }, originalPhases: { screening: true, preD1: true, d3: true, d7: true, d14: true, d28: true, endOfStudy: true } },
  { id: 'ecg', name: '12-Lead ECG', category: 'Safety', phases: { screening: true, preD1: true, d3: false, d7: true, d14: false, d28: false, endOfStudy: false }, originalPhases: { screening: true, preD1: true, d3: false, d7: true, d14: false, d28: false, endOfStudy: false } },
  { id: 'blood', name: 'Central Safety Labs (Chem/Haem/UA)', category: 'Lab', phases: { screening: true, preD1: true, d3: true, d7: true, d14: false, d28: true, endOfStudy: false }, originalPhases: { screening: true, preD1: true, d3: true, d7: true, d14: false, d28: true, endOfStudy: false } },
  { id: 'vital', name: 'Vital Signs', category: 'Safety', phases: { screening: true, preD1: true, d3: true, d7: true, d14: true, d28: true, endOfStudy: true }, originalPhases: { screening: true, preD1: true, d3: true, d7: true, d14: true, d28: true, endOfStudy: true } },
  { id: 'pe', name: 'Physical Exam', category: 'Safety', phases: { screening: true, preD1: true, d3: false, d7: false, d14: false, d28: true, endOfStudy: false }, originalPhases: { screening: true, preD1: true, d3: false, d7: false, d14: false, d28: true, endOfStudy: false } },
  { id: 'cvc', name: 'Central Virology Collection (nasal swab)', category: 'Lab', phases: { screening: false, preD1: true, d3: true, d7: true, d14: true, d28: true, endOfStudy: false }, originalPhases: { screening: false, preD1: true, d3: true, d7: true, d14: true, d28: true, endOfStudy: false } },
  { id: 'pk', name: 'Sparse PK Sampling', category: 'Lab', phases: { screening: false, preD1: true, d3: true, d7: false, d14: false, d28: false, endOfStudy: false }, originalPhases: { screening: false, preD1: true, d3: true, d7: false, d14: false, d28: false, endOfStudy: false } },
  { id: 'pt', name: 'Pregnancy Test (WOCBP only)', category: 'Safety', phases: { screening: true, preD1: true, d3: false, d7: false, d14: false, d28: true, endOfStudy: false }, originalPhases: { screening: true, preD1: true, d3: false, d7: false, d14: false, d28: true, endOfStudy: false } },
  { id: 'diary', name: 'Patient eDiary (E-RS / PGIS / WURSS-11)', category: 'PRO', phases: { screening: false, preD1: false, d3: true, d7: true, d14: true, d28: true, endOfStudy: true }, originalPhases: { screening: false, preD1: false, d3: true, d7: true, d14: true, d28: true, endOfStudy: true } },
  { id: 'conmed', name: 'Concomitant Medications / Adverse Events', category: 'Safety', phases: { screening: true, preD1: true, d3: true, d7: true, d14: true, d28: true, endOfStudy: true }, originalPhases: { screening: true, preD1: true, d3: true, d7: true, d14: true, d28: true, endOfStudy: true } },
];

export const VisualProtocolEditor = ({ isOpen, onClose, versionId, initialEditorState, onSave }: VisualProtocolEditorProps) => {
  const [activeTab, setActiveTab] = useState<'soa' | 'rules'>('soa');

  // Rehydrate rules from persisted editorState if available
  const [rules, setRules] = useState<RuleDef[]>(() =>
    INITIAL_RULES.map(r => ({
      ...r,
      currentValue: initialEditorState?.rules[r.id] ?? r.currentValue,
    }))
  );

  // Rehydrate SoA from persisted editorState if available
  const [soa, setSoa] = useState<SoATask[]>(() =>
    INITIAL_SOA.map(t => {
      const saved = initialEditorState?.soa[t.id];
      if (!saved) return t;
      return {
        ...t,
        phases: { ...t.phases, ...saved },
        // originalPhases always reflects the base protocol (INITIAL_SOA), not the saved state
      };
    })
  );

  const [selectedRuleId, setSelectedRuleId] = useState<string>(INITIAL_RULES[0].id);
  const [amendmentRationale, setAmendmentRationale] = useState(initialEditorState?.rationale ?? '');
  const [rationaleError, setRationaleError] = useState('');

  /**
   * Safely parse a version string like "v2.0", "v3.1", "2.0" → bumps the minor.
   * parseFloat("v2.0") = NaN — this was the previous bug.
   */
  const bumpedVersion = useMemo(() => {
    const clean = versionId.replace(/^v/i, '');
    const parts  = clean.split('.');
    const major  = parts[0] ?? '1';
    const minor  = parseInt(parts[1] ?? '0', 10);
    return `v${major}.${minor + 1}`;
  }, [versionId]);

  const suggestedRuleIds = React.useMemo(() => {
    if (!amendmentRationale.trim()) return new Set<string>();
    const textBody = amendmentRationale.toLowerCase();
    const suggestions = new Set<string>();
    rules.forEach(rule => {
      const isMatch = rule.keywords.some(kw => new RegExp(`(^|[^a-zA-Z0-9_À-ÿ])${kw}([^a-zA-Z0-9_À-ÿ]|$)`, 'i').test(textBody));
      if (isMatch) suggestions.add(rule.id);
    });
    return suggestions;
  }, [amendmentRationale, rules]);

  if (!isOpen) return null;

  const selectedRule = rules.find(r => r.id === selectedRuleId);

  const handleUpdateCurrentValue = (newVal: string) => {
    setRules(prev => prev.map(r => r.id === selectedRuleId ? { ...r, currentValue: newVal } : r));
  };

  const handleToggleSoa = (taskId: string, phase: keyof SoATask['phases']) => {
    setSoa(prev => prev.map(task =>
      task.id === taskId
        ? { ...task, phases: { ...task.phases, [phase]: !task.phases[phase] } }
        : task
    ));
  };

  const hasRulesChanges = rules.some(r => r.legacyValue !== r.currentValue);
  const hasSoaChanges   = soa.some(t => JSON.stringify(t.phases) !== JSON.stringify(t.originalPhases));
  const hasChanges      = hasRulesChanges || hasSoaChanges;

  /**
   * Serialize current editor state into the AmendmentEditorState shape
   * and pass it back to the parent for persistence in the ProtocolAmendment record.
   */
  const handleSave = () => {
    if (!amendmentRationale.trim()) {
      setRationaleError('Rationale is required — ICH E6(R3) §4.5.3 mandates documentation of the justification for every protocol change.');
      return;
    }
    setRationaleError('');

    const editorState: AmendmentEditorState = {
      rules: Object.fromEntries(rules.map(r => [r.id, r.currentValue])),
      soa:   Object.fromEntries(
        soa.map(t => [t.id, Object.fromEntries(
          (Object.keys(t.phases) as (keyof typeof t.phases)[]).map(k => [k, t.phases[k]])
        )])
      ),
      rationale: amendmentRationale,
    };
    onSave(editorState);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#F1F5F9', display: 'flex', flexDirection: 'column' }}>
      {/* Top Bar */}
      <div style={{ padding: '16px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#7E22CE', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em' }}>
            <div style={{ background: '#F3E8FF', padding: '8px', borderRadius: '10px' }}>
              <FileText size={20} />
            </div>
            Protocol Amendment Editor
            <span style={{ background: '#EDE9FE', color: '#6B21A8', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, marginLeft: '8px' }}>v{versionId}</span>
          </div>
          
          <div style={{ display: 'flex', background: '#F8FAFC', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)' }}>
            <button
              onClick={() => setActiveTab('soa')}
              style={{
                padding: '8px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s',
                background: activeTab === 'soa' ? '#fff' : 'transparent',
                color: activeTab === 'soa' ? 'var(--t1)' : 'var(--t3)',
                boxShadow: activeTab === 'soa' ? '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Grid3X3 size={16} /> Schedule of Assessments
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              style={{
                padding: '8px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s',
                background: activeTab === 'rules' ? '#fff' : 'transparent',
                color: activeTab === 'rules' ? 'var(--t1)' : 'var(--t3)',
                boxShadow: activeTab === 'rules' ? '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <ListFilter size={16} /> Data Rules Engine
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#F1F5F9'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}><X size={22} /></button>
          <div style={{ width: '1px', height: '32px', background: 'var(--border)' }}></div>
          <button 
            onClick={handleSave}
            disabled={!hasChanges}
            style={{ 
              background: hasChanges ? '#7E22CE' : '#E2E8F0', 
              color: hasChanges ? '#fff' : '#94A3B8', 
              border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', cursor: hasChanges ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s', boxShadow: hasChanges ? '0 4px 6px -1px rgba(126, 34, 206, 0.2), 0 2px 4px -1px rgba(126, 34, 206, 0.1)' : 'none'
            }}
          >
            <Save size={18} /> Review & Apply Changes
          </button>
        </div>
      </div>

      {activeTab === 'soa' && (
        <div style={{ flex: 1, padding: '40px 32px', overflowY: 'auto' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
              <div>
                <h2 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--t1)', margin: '0 0 12px 0', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  Schedule of Assessments Matrix
                  {hasSoaChanges && <span style={{ fontSize: '12px', background: '#FCE7F3', color: '#BE185D', padding: '4px 10px', borderRadius: '12px', fontWeight: 600, letterSpacing: 'normal' }}>Unsaved Changes</span>}
                </h2>
                <p style={{ margin: 0, fontSize: '15px', color: 'var(--t3)', maxWidth: '600px', lineHeight: 1.5 }}>
                  Add, remove, or modify visits and assessments instantly. Changes automatically propagate as e-CRF logic, dynamically updating patient task lists.
                </p>
              </div>
              <button style={{ background: '#fff', border: '1px solid var(--border)', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s' }} onMouseOver={e => Object.assign(e.currentTarget.style, { background: '#F8FAFC', borderColor: '#CBD5E1' })} onMouseOut={e => Object.assign(e.currentTarget.style, { background: '#fff', borderColor: 'var(--border)' })}>
                <Plus size={18} /> Add Assessment
              </button>
            </div>

            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.02)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={{ position: 'sticky', top: 0, padding: '20px 24px', fontSize: '12px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '25%', borderBottom: '2px solid var(--border)' }}>Assessment</th>
                      <th style={{ position: 'sticky', top: 0, padding: '12px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', borderBottom: '2px solid var(--border)' }}>Screening / Re-Scr</th>
                      <th style={{ position: 'sticky', top: 0, padding: '12px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', borderBottom: '2px solid var(--border)' }}>D1 Pre-Dose</th>
                      <th style={{ position: 'sticky', top: 0, padding: '12px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', borderBottom: '2px solid var(--border)' }}>Day 3 (±1)</th>
                      <th style={{ position: 'sticky', top: 0, padding: '12px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', borderBottom: '2px solid var(--border)' }}>Day 7 (±1)</th>
                      <th style={{ position: 'sticky', top: 0, padding: '12px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', borderBottom: '2px solid var(--border)' }}>Day 14 (±2)</th>
                      <th style={{ position: 'sticky', top: 0, padding: '12px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', borderBottom: '2px solid var(--border)' }}>Day 28 (±3)</th>
                      <th style={{ position: 'sticky', top: 0, padding: '12px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', borderBottom: '2px solid var(--border)' }}>D42 / EOS (±3)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soa.map((task, i) => (
                      <tr key={task.id} style={{ transition: 'background 0.2s', borderBottom: i < soa.length - 1 ? '1px solid var(--border)' : 'none' }} onMouseOver={e => e.currentTarget.style.background = '#F8FAFC'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '20px 24px', borderBottom: i < soa.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--t1)', marginBottom: '4px' }}>{task.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: task.category === 'Efficacy' ? '#3B82F6' : task.category === 'Safety' ? '#EF4444' : task.category === 'Lab' ? '#8B5CF6' : '#10B981' }}></span>
                            {task.category}
                          </div>
                        </td>
                        {(['screening', 'preD1', 'd3', 'd7', 'd14', 'd28', 'endOfStudy'] as const).map(phase => {
                          const isActive = task.phases[phase];
                          const wasActive = task.originalPhases[phase];
                          const isChanged = isActive !== wasActive;

                          let bgCol = '#fff';
                          let borCol = '#CBD5E1';
                          let dotCol = 'transparent';
                          let iconColor = 'transparent';

                          if (isActive && isChanged) {
                            bgCol = '#ECFDF5';
                            borCol = '#34D399';
                            iconColor = '#059669';
                          } else if (!isActive && isChanged) {
                            bgCol = '#FEF2F2';
                            borCol = '#FCA5A5';
                            iconColor = '#DC2626';
                          } else if (isActive) {
                            bgCol = '#F1F5F9';
                            borCol = '#94A3B8';
                            dotCol = '#64748B';
                          }

                          return (
                            <td key={phase} style={{ padding: '16px', textAlign: 'center', borderBottom: i < soa.length - 1 ? '1px solid var(--border)' : 'none', background: isChanged ? (isActive ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.03)') : 'transparent' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <button
                                  onClick={() => handleToggleSoa(task.id, phase)}
                                  style={{
                                    width: '36px', height: '36px', borderRadius: '10px', border: `2px solid ${borCol}`, background: bgCol,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative',
                                    boxShadow: isActive ? 'inset 0 2px 4px rgba(0,0,0,0.05)' : '0 1px 2px rgba(0,0,0,0.05)'
                                  }}
                                  onMouseOver={e => Object.assign(e.currentTarget.style, { transform: 'scale(1.05)', borderColor: isActive && !isChanged ? '#64748B' : borCol })}
                                  onMouseOut={e => Object.assign(e.currentTarget.style, { transform: 'scale(1)', borderColor: borCol })}
                                >
                                  {(isActive || (wasActive && isChanged)) && !(!isActive && isChanged) && (
                                    <div style={{ 
                                      width: '12px', height: '12px', borderRadius: '3px', background: isActive && isChanged ? iconColor : dotCol,
                                      transition: 'all 0.2s', transform: isActive ? 'scale(1)' : 'scale(0)'
                                    }} />
                                  )}
                                  {(!isActive && isChanged) && (
                                    <X size={18} color={iconColor} strokeWidth={3} />
                                  )}
                                  {(isActive && isChanged) && (
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <CheckCircle2 size={20} color={iconColor} strokeWidth={2.5} style={{ fill: '#ECFDF5' }} />
                                    </div>
                                  )}
                                </button>
                                {isChanged && (
                                  <div style={{ fontSize: '11px', fontWeight: 700, color: isActive ? '#059669' : '#DC2626', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {isActive ? 'Added' : 'Removed'}
                                  </div>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {hasSoaChanges && (
              <div style={{ marginTop: '32px', padding: '20px 24px', background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: '12px', display: 'flex', gap: '16px', alignItems: 'flex-start', boxShadow: '0 4px 6px -1px rgba(225, 29, 72, 0.1)' }}>
                <div style={{ background: '#FFE4E6', padding: '8px', borderRadius: '50%', color: '#E11D48', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700, color: '#9F1239' }}>Live Protocol Impact Warning</h4>
                  <p style={{ margin: 0, fontSize: '14px', color: '#BE185D', lineHeight: 1.6 }}>
                    You have modified the Schedule of Assessments matrix. Applying this amendment will <strong>instantly update pending tasks</strong> for all patients currently enrolled and active in the affected phases. A rigorous audit trail log and version bump (to {bumpedVersion}) will be generated.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Panel: Protocol Parameters */}
        <div style={{ width: '380px', borderRight: '1px solid var(--border)', background: '#F8FAFC', display: 'flex', flexDirection: 'column', zIndex: 10, boxShadow: '1px 0 10px rgba(0,0,0,0.03)' }}>
          
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <div style={{ background: '#F3E8FF', padding: '6px', borderRadius: '8px', color: '#7E22CE' }}>
                <Sparkles size={18} />
              </div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--t1)', margin: 0 }}>AI Smart Analyzer</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--t3)', margin: '0 0 12px 0', lineHeight: 1.4 }}>
              Paste your clinical protocol amendment text below. The AI will detect affected parameters and highlight them for review.
            </p>
            <textarea
              placeholder="e.g. 'The minimum inclusion age has been updated to 21 years due to regulatory updates...'"
              value={amendmentRationale}
              onChange={(e) => { setAmendmentRationale(e.target.value); if (e.target.value.trim()) setRationaleError(''); }}
              style={{ 
                width: '100%', height: '100px', padding: '12px', boxSizing: 'border-box', borderRadius: '10px', 
                border: `1px solid ${rationaleError ? '#FCA5A5' : 'var(--border)'}`, fontSize: '14px', resize: 'none', lineHeight: 1.5,
                fontFamily: 'inherit', outline: 'none', transition: 'all 0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
              }}
              onFocus={(e) => Object.assign(e.target.style, { borderColor: rationaleError ? '#F87171' : '#A855F7', boxShadow: '0 0 0 3px rgba(168,85,247,0.1)' })}
              onBlur={(e) => Object.assign(e.target.style, { borderColor: rationaleError ? '#FCA5A5' : 'var(--border)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' })}
            />
            {rationaleError && (
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#DC2626', lineHeight: 1.4 }}>
                ⚠ {rationaleError}
              </p>
            )}
            {suggestedRuleIds.size > 0 && (
              <div style={{ marginTop: '16px', padding: '10px 14px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '8px', fontSize: '13px', color: '#047857', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', animation: 'slideUp 0.3s ease' }}>
                <CheckCircle2 size={16} /> Detected {suggestedRuleIds.size} {suggestedRuleIds.size === 1 ? 'parameter' : 'parameters'} to review
              </div>
            )}
          </div>

          <div style={{ padding: '24px 24px 12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Protocol Parameters</h3>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t3)', background: '#E2E8F0', padding: '2px 8px', borderRadius: '12px' }}>{rules.length} total</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {rules.map((rule) => {
                const isSelected = selectedRuleId === rule.id;
                const isChanged = rule.legacyValue !== rule.currentValue;
                const isSuggested = suggestedRuleIds.has(rule.id) && !isChanged;

                return (
                  <button
                    key={rule.id}
                    onClick={() => setSelectedRuleId(rule.id)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '16px', borderRadius: '12px', border: '1px solid',
                      borderColor: isSelected ? '#A855F7' : isSuggested ? '#E9D5FF' : 'var(--border)',
                      background: isSelected ? '#fff' : '#fff',
                      cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isSelected ? '0 4px 6px -1px rgba(168,85,247,0.1), 0 2px 4px -1px rgba(168,85,247,0.06)' : '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                    onMouseOver={e => { if(!isSelected) Object.assign(e.currentTarget.style, { borderColor: '#CBD5E1', transform: 'translateY(-1px)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }); }}
                    onMouseOut={e => { if(!isSelected) Object.assign(e.currentTarget.style, { borderColor: isSuggested ? '#E9D5FF' : 'var(--border)', transform: 'translateY(0)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }); }}
                  >
                    <div style={{ background: isSelected ? '#F3E8FF' : '#F1F5F9', padding: '10px', borderRadius: '10px', color: isSelected ? '#9333EA' : 'var(--t3)', transition: 'all 0.2s' }}>
                      <rule.categoryIcon size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: isSelected ? '#9333EA' : 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {rule.category}
                        </div>
                        {isSuggested && (
                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#7E22CE', background: '#F3E8FF', padding: '3px 8px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid #E9D5FF' }}>
                            <Sparkles size={12} /> Suggested
                          </div>
                        )}
                        {isChanged && (
                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#059669', background: '#D1FAE5', padding: '3px 8px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid #A7F3D0' }}>
                            <CheckCircle2 size={12} /> Modified
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--t1)', marginBottom: '4px', lineHeight: 1.3 }}>
                        {rule.name}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center Panel: Editor */}
        <div style={{ flex: 1, padding: '48px', overflowY: 'auto', display: 'flex', justifyContent: 'center', background: '#F1F5F9' }}>
          {selectedRule && (
            <div style={{ maxWidth: '720px', width: '100%', animation: 'slideUp 0.3s ease' }}>
              <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#E0F2FE', color: '#0369A1', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, marginBottom: '16px', border: '1px solid #BAE6FD' }}>
                  <selectedRule.categoryIcon size={16} strokeWidth={2.5} /> {selectedRule.category}
                </div>
                <h2 style={{ fontSize: '32px', fontWeight: 800, color: 'var(--t1)', margin: '0 0 12px 0', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{selectedRule.name}</h2>
                <p style={{ margin: 0, fontSize: '16px', color: 'var(--t2)', lineHeight: 1.6 }}>
                  {selectedRule.description}
                </p>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '16px', padding: '40px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: '20px', alignItems: 'center', marginBottom: '40px' }}>
                  
                  {/* Previous Version */}
                  <div style={{ padding: '24px', background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--t3)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Original Protocol Value</div>
                    <div style={{ fontSize: '20px', fontWeight: 500, color: '#94A3B8', textDecoration: selectedRule.legacyValue !== selectedRule.currentValue ? 'line-through' : 'none' }}>
                      {selectedRule.legacyValue}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', color: '#CBD5E1', background: '#F1F5F9', padding: '12px', borderRadius: '50%' }}>
                    <ArrowRight size={24} strokeWidth={2.5} />
                  </div>

                  {/* Current/New Version */}
                  <div style={{ padding: '24px', background: selectedRule.legacyValue !== selectedRule.currentValue ? '#ECFDF5' : '#F1F5F9', border: '2px solid', borderColor: selectedRule.legacyValue !== selectedRule.currentValue ? '#34D399' : 'transparent', borderRadius: '12px', textAlign: 'center', transition: 'all 0.3s ease', transform: selectedRule.legacyValue !== selectedRule.currentValue ? 'scale(1.02)' : 'scale(1)', boxShadow: selectedRule.legacyValue !== selectedRule.currentValue ? '0 10px 15px -3px rgba(16, 185, 129, 0.1)' : 'none' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: selectedRule.legacyValue !== selectedRule.currentValue ? '#059669' : 'var(--t3)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Amendment Value
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: selectedRule.legacyValue !== selectedRule.currentValue ? '#065F46' : 'var(--t1)' }}>
                      {selectedRule.currentValue}
                    </div>
                  </div>

                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--t2)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Select New Rule Value
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    {selectedRule.options.map(opt => (
                      <label 
                        key={opt}
                        style={{ 
                          display: 'flex', alignItems: 'center', gap: '14px', padding: '20px', borderRadius: '12px', 
                          border: '2px solid', borderColor: selectedRule.currentValue === opt ? '#7E22CE' : 'var(--border)',
                          background: selectedRule.currentValue === opt ? '#FAF5FF' : '#fff',
                          cursor: 'pointer', transition: 'all 0.2s',
                          boxShadow: selectedRule.currentValue === opt ? '0 4px 6px -1px rgba(126, 34, 206, 0.1)' : '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                        onMouseOver={e => { if(selectedRule.currentValue !== opt) e.currentTarget.style.borderColor = '#CBD5E1'; }}
                        onMouseOut={e => { if(selectedRule.currentValue !== opt) e.currentTarget.style.borderColor = 'var(--border)'; }}
                      >
                        <div style={{ position: 'relative', width: '22px', height: '22px', borderRadius: '50%', border: `2px solid ${selectedRule.currentValue === opt ? '#7E22CE' : '#CBD5E1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                          {selectedRule.currentValue === opt && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#7E22CE' }} />}
                        </div>
                        <input 
                          type="radio" 
                          name="rule_value" 
                          value={opt} 
                          checked={selectedRule.currentValue === opt}
                          onChange={() => handleUpdateCurrentValue(opt)}
                          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{ fontSize: '16px', fontWeight: selectedRule.currentValue === opt ? 700 : 500, color: selectedRule.currentValue === opt ? '#581C87' : 'var(--t1)' }}>
                          {opt}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

              </div>

              {selectedRule.legacyValue !== selectedRule.currentValue && (
                <div style={{ marginTop: '32px', padding: '20px 24px', background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: '12px', display: 'flex', gap: '16px', alignItems: 'flex-start', boxShadow: '0 4px 6px -1px rgba(225, 29, 72, 0.1)', animation: 'slideUp 0.3s ease' }}>
                  <div style={{ background: '#FFE4E6', padding: '8px', borderRadius: '50%', color: '#E11D48', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700, color: '#9F1239' }}>Protocol Impact Warning</h4>
                    <p style={{ margin: 0, fontSize: '14px', color: '#BE185D', lineHeight: 1.6 }}>
                      Changing this parameter will <strong>immediately affect validation rules</strong> for all patients assigned to this protocol amendment. Out-of-window calculations and eligibility checks will be reprocessed. Ensure the Sponsor has officially approved this change.
                    </p>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

