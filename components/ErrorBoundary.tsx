'use client';

/**
 * ErrorBoundary — catches unhandled render/lifecycle errors in the React tree.
 *
 * Usage:
 *   <ErrorBoundary context="PatientDetail">
 *     <PatientDetail ... />
 *   </ErrorBoundary>
 *
 * 🛡️ QA/Resiliencia: without this, any component crash destroys the entire
 * application with no recovery path. In a clinical context this means a
 * coordinator loses their session mid-visit.
 *
 * Design decisions:
 * - "Try again" resets state (soft recovery without reload).
 * - "Reload page" as fallback if soft reset fails.
 * - console.error logs component stack first line only — enough to diagnose,
 *   never exposes user data or full stack traces (SbD).
 */

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Short label shown in error UI and log: "PatientDetail", "ManagerDashboard", etc. */
  context?: string;
  /** Custom fallback replaces the default error card. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  retryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true, retryCount: 0 };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const ctx = this.props.context ?? 'Unknown';
    // SbD: log only the first line of componentStack (identifies the component,
    // not user data). Never log the error object or its message.
    const location = info.componentStack?.trim().split('\n')[0]?.trim() ?? 'unknown';
    console.error(`[ALTESA:ErrorBoundary:${ctx}] Unhandled render error at ${location}`);
  }

  handleReset = () => {
    this.setState(s => ({ hasError: false, retryCount: s.retryCount + 1 }));
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const ctx = this.props.context ?? 'component';

    return (
      <div
        role="alert"
        aria-live="assertive"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '48px 24px', textAlign: 'center',
          background: '#FFF8F8', border: '1px solid #FECACA',
          borderRadius: '12px', margin: '16px',
        }}
      >
        <div style={{
          width: '56px', height: '56px', background: '#FEE2E2', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '20px',
        }}>
          <AlertTriangle size={28} color="#DC2626" aria-hidden="true" />
        </div>

        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#991B1B', margin: '0 0 8px 0' }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 24px 0', lineHeight: 1.6, maxWidth: '320px' }}>
          The <strong>{ctx}</strong> could not be displayed. Your data is safe —
          this is a display error only.
        </p>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={this.handleReset}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '9px 16px', background: '#DC2626', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '13px',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            <RotateCcw size={13} aria-hidden="true" /> Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '9px 16px', background: 'transparent', color: '#64748B',
              border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px',
              fontWeight: 500, cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} aria-hidden="true" /> Reload Page
          </button>
        </div>

        {this.state.retryCount > 0 && (
          <p style={{ marginTop: '16px', fontSize: '11px', color: '#94A3B8' }}>
            If the error persists, reload the page or contact support.
          </p>
        )}
      </div>
    );
  }
}
