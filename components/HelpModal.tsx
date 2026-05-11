'use client';

import React, { useState } from 'react';
import {
  HelpCircle, X, Home, User, Shield, FileText, Key,
  BookOpen, Lock, Mic, Building2, ClipboardList,
  AlertTriangle, ChevronRight, Terminal,
} from 'lucide-react';
import { DLPWrapper } from '@/components/DLPWrapper';

interface HelpModalProps {
  onClose: () => void;
  initialTab?: string;
  onDLPViolation?: (action: string) => void;
  role?: 'coordinator' | 'manager';
}

/* ── shared micro-components ──────────────────────────────────────────────── */

const Section = ({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
}) => (
  <div style={{ marginBottom: 24 }}>
    <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'var(--t1)',
      display: 'flex', alignItems: 'center', gap: 6 }}>
      {icon} {title}
    </h4>
    <div style={{ color: 'var(--t2)', lineHeight: 1.65, fontSize: 13 }}>{children}</div>
  </div>
);

const Card = ({ color = '#F8FAFC', border = 'var(--border)', children }: {
  color?: string; border?: string; children: React.ReactNode;
}) => (
  <div style={{ marginBottom: 16, padding: 16, background: color,
    borderRadius: 8, border: `1px solid ${border}` }}>
    {children}
  </div>
);

const Step = ({ n, title, children }: {
  n: number; title: string; children: React.ReactNode;
}) => (
  <div style={{ marginBottom: 20 }}>
    <p style={{ margin: '0 0 6px 0', fontWeight: 700, color: 'var(--t1)', fontSize: 13 }}>
      {n}. {title}
    </p>
    <div style={{ color: 'var(--t2)', lineHeight: 1.65, fontSize: 13 }}>{children}</div>
  </div>
);

const Tag = ({ label, bg, color }: { label: string; bg: string; color: string }) => (
  <span style={{ background: bg, color, padding: '2px 6px',
    borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{label}</span>
);

/* ── tab content ──────────────────────────────────────────────────────────── */

const QuickGuide = ({ role }: { role: 'coordinator' | 'manager' }) => (
  <div>
    <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 16, color: 'var(--t1)' }}>
      Welcome to the ALTESA Coordination Platform
    </h3>
    <p style={{ marginBottom: 20 }}>
      ALTESA is a <strong>Hybrid-Auth, Local-First</strong> clinical coordination platform.
      Firebase handles who you are; all patient data stays on your device, encrypted.
    </p>

    <Section icon={<Lock size={14} color="#7C3AED" />} title="Getting Started — Login & PIN">
      <strong>First use:</strong> Sign in with your site email and password (verified by Firebase).
      The app then asks you to create a <strong>4–8 digit PIN</strong> for daily access.
      Your PIN is protected with PBKDF2 (310,000 iterations) — it never leaves the device.{' '}
      <strong>After setup, you log in daily with your PIN only</strong> — no internet required.
      Need to reset your PIN? Use <em>Forgot PIN?</em> on the login screen (requires network).
    </Section>

    {role === 'coordinator' && (
      <>
        <Section icon={<Home size={14} />} title="CRC Dashboard">
          Your daily operations centre. Patient cards show phase, progress bar (tasks done/total),
          and a coloured left border by site. The <strong>Alert bell</strong> counts items needing
          action. A <strong>positive DTQ</strong> badge means you have ≤ 48 h to initiate the
          RV Protocol for that patient.
        </Section>
        <Section icon={<User size={14} />} title="Patient Timeline">
          Click any patient to open their timeline. Tasks are grouped by day and category
          (Questionnaires, Procedures, Labs, Admin). Complete a task by clicking its circle or
          pressing Space/Enter. Tasks with a <Tag label="PREREQUISITE" bg="var(--amber-bg)" color="var(--amber)" />{' '}
          tag must be done before their dependents can be unlocked.
        </Section>
        <Section icon={<Mic size={14} color="#0EA5E9" />} title="Navigator Log">
          The log panel at the bottom of each patient view is your real-time clinical notebook.
          Type a note or tap <strong>Speak</strong> for voice-to-text (Web Speech API).
          Smart triggers: start with <code>@tomorrow</code> to create a next-day reminder,
          or <code>TODO:</code> to generate an action item. Every entry gets an immutable UUID
          and timestamp (ALCOA+ compliant).
        </Section>
        <Section icon={<FileText size={14} />} title="Exporting Data to the Manager">
          Open <strong>Settings</strong> (gear icon) → <em>Export Encrypted Sync Package</em>.
          The package is AES-256-GCM encrypted and signed with ECDSA-P256. Only your Manager's
          private key can open it. Transfer the <code>.enc</code> file via any channel — it is
          useless without the private key.
        </Section>
      </>
    )}

    {role === 'manager' && (
      <>
        <Section icon={<Home size={14} />} title="Manager Dashboard">
          Aggregates anonymised data across all sites. Key panels: active patients per site,
          pending randomisations, global alerts, and the sync log when importing CRC packages.
        </Section>
        <Section icon={<Key size={14} color="#F59E0B" />} title="Key Generation (One-Time Setup)">
          Go to <em>Settings → Keys</em> and click <strong>Generate Manager Keys</strong>.
          This creates an RSA-OAEP keypair (encryption) and ECDSA-P256 keypair (signing).
          Export your <strong>Public Key</strong> and share it with your CRCs — this allows them
          to encrypt packages that only you can decrypt. Your private key never leaves this device.
        </Section>
        <Section icon={<ClipboardList size={14} />} title="Protocol Amendments">
          Under <em>Settings → Protocol Versions</em>, manage amendments through their full
          regulatory lifecycle: <strong>Draft → Submitted → Approved → Active → Superseded</strong>.
          Each new amendment requires a Version ID (e.g. v3.0), Effective Date, and Rationale
          (ICH E6(R3) §4.5.3). Click <em>Visual Editor</em> on any version to modify the
          Schedule of Assessments and rules — changes are saved back to that amendment record.
        </Section>
        <Section icon={<Shield size={14} />} title="Site Authorization">
          In the <strong>Compliance Vault → Site Authorization</strong> tab, view the active
          Firebase session, local key status, and a direct link to manage users in the
          Firebase Console. Users are created and revoked in Firebase, not in this app.
        </Section>
      </>
    )}
  </div>
);

const SecuritySync = () => (
  <div>
    <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 16, color: 'var(--t1)' }}>
      Security Architecture &amp; Data Sync
    </h3>
    <p style={{ marginBottom: 20 }}>
      ALTESA uses a <strong>Hybrid-Auth, Local-First</strong> model.
      Firebase handles identity; all clinical data is stored exclusively on-device in
      IndexedDB, encrypted at rest. No PHI reaches the cloud.
    </p>

    <Card color="var(--bg)">
      <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'var(--t1)',
        display: 'flex', alignItems: 'center', gap: 6 }}>
        <Lock size={14} color="#7C3AED" /> 1. Identity — Firebase Auth
      </h4>
      <p style={{ margin: 0 }}>
        The first login authenticates with Firebase using the shared site email and password.
        Firebase verifies identity and returns a UID. The app derives a device-specific key
        from that UID via SHA-256 — this key unlocks the local database.
        <strong> All subsequent daily logins use a local PIN only</strong> — no network call,
        no Firebase round-trip.
      </p>
    </Card>

    <Card color="var(--bg)">
      <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'var(--t1)',
        display: 'flex', alignItems: 'center', gap: 6 }}>
        <Key size={14} color="#F59E0B" /> 2. PIN Protection — PBKDF2
      </h4>
      <p style={{ margin: 0 }}>
        Your PIN is <strong>never stored in plain text</strong>. It is transformed via
        PBKDF2 with 310,000 iterations and a unique random salt per device. On login,
        the entered PIN is re-transformed and compared against the stored hash — the
        original PIN never exists in memory beyond the input field.
      </p>
    </Card>

    <Card color="var(--bg)">
      <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'var(--t1)',
        display: 'flex', alignItems: 'center', gap: 6 }}>
        <Shield size={14} color="#3B82F6" /> 3. Data Export — AES-256-GCM + ECDSA-P256
      </h4>
      <p style={{ margin: 0 }}>
        When a CRC exports a data package: (a) patient data is AES-256-GCM encrypted with
        a random session key; (b) that session key is wrapped with the Manager's
        RSA-OAEP public key (so only the Manager can unwrap it); (c) the entire package
        is signed with the CRC's ECDSA-P256 private key.
        If a single byte of the ciphertext is modified after signing, the signature check
        fails and the package is rejected before any decryption occurs.
      </p>
    </Card>

    <Card color="var(--bg)">
      <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'var(--t1)',
        display: 'flex', alignItems: 'center', gap: 6 }}>
        <FileText size={14} color="#10B981" /> 4. Secure Import (Manager)
      </h4>
      <p style={{ margin: 0 }}>
        The Manager receives the <code>.enc</code> package (via any channel — it is safe
        to transmit on untrusted networks). In the Manager Dashboard they click
        <em> Import Clinical Package</em>, select the file, and the platform:
        verifies the ECDSA signature → decrypts the AES session key with the Manager's
        RSA-OAEP private key → decrypts the payload → validates the schema → merges into
        the local dashboard. All steps run in the browser's WebCrypto API.
      </p>
    </Card>

    <div style={{ marginTop: 20, padding: '12px 16px', background: '#F0FDF4',
      border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 12, color: '#166534' }}>
      <strong>ALCOA+ compliance:</strong> Every LogEntry and clinical record is assigned a
      UUID v4 (collision-proof), a contemporaneous ISO timestamp, and an immutable audit trail
      entry. Data exported via the <code>.enc</code> package format guarantees
      byte-for-byte accuracy (AES-GCM authentication tag).
    </div>
  </div>
);

const Glossary = () => (
  <div>
    <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 16, color: 'var(--t1)' }}>
      Study Terms &amp; Platform Glossary
    </h3>
    <div style={{ display: 'grid', gap: 16 }}>
      {[
        ['PSB (Pre-Symptomatic Baseline)',
         'The enrolment phase where patients report daily symptoms via ePRO. At least 3 records are needed to establish a baseline before any infection event.'],
        ['DTQ (Daily Trigger Questionnaire)',
         'A daily questionnaire checking for new respiratory symptoms. A positive response triggers the RV Protocol and starts the 48-hour randomisation window.'],
        ['RV Protocol (Rhinovirus)',
         'The time-critical intervention phase (48 h + 6 h window) starting from symptom onset, leading to randomisation and treatment assignment.'],
        ['E-RS / PGIS',
         'Evaluating Respiratory Symptoms scales. Used to calculate the PSB baseline and track symptom resolution during treatment.'],
        ['Site ID',
         'A short identifier for the clinical site where a patient is enrolled (e.g. FALP-CL, HMC). Required at patient creation; used for multi-site reporting and Navigator tracking.'],
        ['Navigator Log',
         'A per-patient real-time clinical notebook. Entries are voice or text, timestamped with a UUID, and stored immutably in IndexedDB. Smart triggers: @tomorrow creates a next-day reminder; TODO: creates an action item.'],
        ['Protocol Amendment',
         'A formal change to the study protocol, managed through the lifecycle: Draft → Submitted → Approved → Active → Superseded. Each amendment has a Version ID, Effective Date, and mandatory Rationale per ICH E6(R3) §4.5.3.'],
        ['Hybrid-Auth',
         'The security model used by ALTESA: Firebase Auth verifies user identity online (first login / PIN reset); all clinical data lives locally on-device in IndexedDB and never reaches the cloud.'],
        ['ALCOA+',
         'Attributable, Legible, Contemporaneous, Original, Accurate — the FDA/ICH data integrity standard. ALTESA enforces this via UUID-based IDs, immutable timestamps, AES-GCM authenticated encryption, and a cryptographically signed audit ledger.'],
        ['PBKDF2',
         'Password-Based Key Derivation Function 2. Used to protect the CRC/Manager PIN: 310,000 hash iterations with a random per-device salt so the original PIN cannot be recovered from the stored hash.'],
      ].map(([term, def]) => (
        <div key={term} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
          <div style={{ fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>{term}</div>
          <div>{def}</div>
        </div>
      ))}
    </div>
  </div>
);

const ManagerManual = () => (
  <DLPWrapper onViolation={() => {}}>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BookOpen size={20} color="var(--blue)" />
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--t1)' }}>Manager Operations Manual</h3>
      </div>
      <Card color="var(--amber-bg)" border="var(--amber-mid)">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--amber)', fontSize: 12 }}>
          <Shield size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span><strong>CONFIDENTIAL RESOURCE.</strong> DO NOT REPRODUCE OR DISTRIBUTE OUTSIDE THIS SECURE ENVIRONMENT. ACTIONS ARE LOGGED VIA DLP.</span>
        </div>
      </Card>

      <Step n={1} title="First Login — Firebase Auth + PIN Setup">
        Open the app and select the <strong>Manager</strong> tab on the login screen.
        Enter the shared site email and password. Firebase verifies your credentials and
        the app activates the local database. You are then prompted to create a <strong>4–8
        digit PIN</strong> for daily access — this PIN is hashed with PBKDF2 (310,000
        iterations) and never leaves the device.
        <br /><strong>Daily login:</strong> enter your PIN on the keypad. No internet required.
        <br /><strong>Forgot PIN?</strong> Use the recovery flow (requires Firebase re-authentication).
      </Step>

      <Step n={2} title="One-Time Key Generation (Settings → Keys)">
        Navigate to <em>Settings → Export Public Key</em>. Click <strong>Generate Manager Keys</strong>.
        The platform generates two keypairs stored only in your device's IndexedDB:
        (a) RSA-OAEP — used to wrap the AES session key in CRC packages so only you can decrypt them;
        (b) ECDSA-P256 — used to sign outgoing packages.
        Export the <strong>Public Key</strong> and share it with your CRCs via a trusted channel.
        Your private key never leaves this device. If you re-generate keys, existing <code>.enc</code> packages
        from CRCs can no longer be decrypted — coordinate with your team before rotating.
      </Step>

      <Step n={3} title="The Global Oversight Dashboard">
        The main dashboard consolidates anonymised data from all sites. Key panels:
        <br />— <strong>Active Patients</strong> per site and phase.
        <br />— <strong>Pending Randomisations</strong>: patients in the critical RV Protocol window.
        <br />— <strong>Global Alerts</strong>: compliance drops or mass delays.
        <br />— <strong>Site filter</strong>: restrict the view to a specific site ID (e.g. FALP-CL).
        The <em>patientSiteMap</em> is built from the <code>siteId</code> field set at patient enrolment.
      </Step>

      <Step n={4} title="Importing Encrypted CRC Packages">
        In the Manager Dashboard, find the <em>Sync</em> section and click <strong>Import Clinical Package</strong>.
        Select the <code>.enc</code> file received from the CRC. The platform:
        (1) verifies the ECDSA-P256 signature — if the file was tampered with, this step rejects it;
        (2) decrypts the RSA-OAEP-wrapped session key using your private key;
        (3) decrypts the AES-256-GCM payload;
        (4) validates the schema (required fields: <code>id</code>, <code>name</code>, <code>phaseCode</code>);
        (5) merges records into your local dashboard via idempotent upsert by patient ID.
        Progress is shown in the sync log. Files from different CRCs can be imported in batch.
      </Step>

      <Step n={5} title="Protocol Amendments (Settings → Protocol Versions)">
        Manage the full regulatory lifecycle of protocol changes:
        <br />— Click <strong>+ New Version</strong>. Required fields: <em>Version ID</em> (e.g. v3.0),
        <em>Amendment Label</em>, <em>Effective Date at Site</em>, and <em>Rationale</em>
        (mandatory per ICH E6(R3) §4.5.3). Optional: IRB/Regulatory Reference.
        <br />— New amendments start with status <Tag label="Draft" bg="#F1F5F9" color="#64748B" />.
        Progress through <Tag label="Submitted" bg="#EFF6FF" color="#2563EB" />{' → '}
        <Tag label="Approved" bg="#F0FDF4" color="#15803D" />{' → '}
        <Tag label="Active" bg="#DCFCE7" color="#16A34A" />.
        <br />— Click <strong>Make Active</strong> to promote a version. The previous Active version
        becomes <Tag label="Superseded" bg="#FFF7ED" color="#C2410C" />. A confirmation dialog shows
        how many patients are enrolled under other versions (they remain on their current version —
        only new enrolments use the newly activated version).
        <br />— Export the amendment list as JSON to share with other sites or for import.
      </Step>

      <Step n={6} title="Visual Protocol Editor">
        Click <strong>Visual Editor</strong> on any amendment version. The editor has two tabs:
        <br />— <strong>Schedule of Assessments (SoA)</strong>: toggle tasks on/off for each phase.
        Changes relative to the base protocol are highlighted.
        <br />— <strong>Protocol Rules</strong>: modify operational parameters (e.g. washout windows,
        DTQ frequency). Use the Rationale field (required) to document the justification for each rule change.
        <br />Click <strong>Review &amp; Apply Changes</strong> to save. The editor state is stored inside
        the amendment record in IndexedDB — re-opening the editor for the same version restores your changes.
      </Step>

      <Step n={7} title="Data Administration & Compliance Vault">
        Accessed via the <em>Vault</em> button in the dashboard header.
        <br />— <strong>eTMF &amp; Archive</strong>: generate encrypted snapshots or a 15-year regulatory archive.
        <br />— <strong>Site Authorization</strong>: view the active Firebase session (email, UID, last sign-in),
        local key status (Manager Keys + CRC Signing Keys), and a direct link to the Firebase Console for
        adding, disabling, or revoking users. User management happens in Firebase, not in this app.
        <br />— <strong>Audit Ledger</strong>: a real-time immutable log of all security events
        (key generation, package import, protocol activation, DLP triggers). Export as <code>.txt</code>
        for external auditors.
      </Step>

      <Step n={8} title="Compliance &amp; DLP Monitoring">
        All access to this manual and other confidential resources is logged by the Data Loss Prevention
        (DLP) capability. Attempts to copy, print, or export protected content are captured in the
        Audit Ledger with a <code>[SECURITY]</code> classification.
      </Step>
    </div>
  </DLPWrapper>
);

const CRCManual = () => (
  <DLPWrapper onViolation={() => {}}>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BookOpen size={20} color="var(--blue)" />
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--t1)' }}>CRC Operations Manual</h3>
      </div>
      <Card color="var(--amber-bg)" border="var(--amber-mid)">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--amber)', fontSize: 12 }}>
          <Shield size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span><strong>CONFIDENTIAL RESOURCE.</strong> DO NOT REPRODUCE OR DISTRIBUTE OUTSIDE THIS SECURE ENVIRONMENT. ACTIONS ARE LOGGED VIA DLP.</span>
        </div>
      </Card>

      <Step n={1} title="First Login — Firebase Auth + PIN Setup">
        Select the <strong>Coordinator</strong> tab on the login screen. Enter the shared site
        email and password. Firebase verifies your credentials and activates the local encrypted
        database. You are prompted to create a <strong>4–8 digit PIN</strong>.
        <br /><strong>Daily login</strong>: enter your PIN on the numeric keypad — no internet
        required once the device is activated.
        <br /><strong>Forgot PIN?</strong>: use <em>Forgot PIN?</em> on the login screen
        (requires network for Firebase re-authentication).
      </Step>

      <Step n={2} title="Initial Encryption Setup (Settings → Manager Key)">
        Before you can export patient data, you must have the Manager's public key. Your Manager
        will provide a <strong>Public Key string</strong> via a secure channel. In the app, go to
        <em> Settings → Import Manager Public Key</em> and paste it. This allows the app to encrypt
        packages that only your Manager can decrypt. This is a one-time setup per device.
      </Step>

      <Step n={3} title="Creating a New Patient">
        From the dashboard, click <strong>+ Add Patient</strong>. The form requires:
        <br />— <strong>Patient ID</strong>: study format, e.g. ALTESA-002
        <br />— <strong>Site ID</strong>: your clinical site code, e.g. FALP-CL or HMC
        (required for multi-site Navigator reporting — auto-converts to uppercase)
        <br />— <strong>Full Name</strong>: patient's legal name as on study documents
        <br />— <strong>Primary Language</strong>: sets the language for ePRO materials
        <br />— <strong>Consent Date</strong>: date the ICF was signed (marks Screening start)
        <br />— <strong>Protocol Version</strong>: the amendment the patient is consented under
        (defaults to the currently Active version)
        <br />The patient enters the Pre-Symptomatic Baseline (PSB) phase immediately.
        <em> Contact information is not collected — the app stores no PII beyond the name field.</em>
      </Step>

      <Step n={4} title="The CRC Dashboard">
        Your daily operations centre. Each patient card shows:
        phase badge, task progress bar, site ID chip, and coloured border by site.
        Filters: ALL / ACTIVE / OVERDUE. The <strong>notification bell</strong> shows the count
        of unread items (screen-reader announces the unread count automatically).
        A <strong>positive DTQ</strong> alert means you have ≤ 48 hours to initiate the RV Protocol.
      </Step>

      <Step n={5} title="Patient Timeline — Schedule of Assessments">
        Click any patient row to open their timeline. Tasks are grouped by day and category:
        Questionnaires (Q), Procedures (PR), Labs (L), Admin (AD).
        Click the circular checkbox or press <kbd>Space</kbd>/<kbd>Enter</kbd> to complete a task.
        Only un-blocked tasks can be marked complete. A <Tag label="PREREQUISITE" bg="var(--amber-bg)" color="var(--amber)" />{' '}
        tag means this task unlocks dependents; a <Tag label="DEPENDENT" bg="var(--blue-bg)" color="var(--blue)" />{' '}
        tag means it requires a prior step.
      </Step>

      <Step n={6} title="Trace Flow — Understanding Dependencies">
        On a blocked task, click <strong>Trace Flow</strong> to visualise which prerequisite
        tasks must be completed to unblock it. The topological lines connect the dependency
        chain so you can see exactly what needs to happen in sequence.
      </Step>

      <Step n={7} title="DTQ & Initiating the RV Protocol">
        During PSB, process the Daily Trigger Questionnaire (DTQ). The app asks:
        positive or negative for new respiratory symptoms?
        <br />— <strong>Negative</strong>: patient remains in PSB, normal daily flow.
        <br />— <strong>Positive</strong>: the patient's phase automatically transitions to the
        <strong> RV Protocol</strong>. Critical time-sensitive tasks appear immediately
        (swab PCR, randomisation). A 54-hour countdown starts. This transition is irreversible.
      </Step>

      <Step n={8} title="Navigator Log — Clinical Notebook">
        The Navigator Log panel appears in the right panel of every patient view.
        <br />— <strong>Type</strong> a note directly, or tap <strong>Speak</strong> to use
        voice-to-text (Web Speech API — no audio is transmitted).
        <br />— Smart triggers: start with <code>@tomorrow</code> to create a next-day
        reminder (appears in the notifications panel the following day), or <code>TODO:</code>
        to create a dashboard action item.
        <br />Every entry is stamped with a UUID v4 and ISO timestamp at the moment of saving.
        Entries cannot be modified after saving (ALCOA+ Original). Use a new entry to
        amend or clarify a prior note.
      </Step>

      <Step n={9} title="Quick Search &amp; Command Palette">
        Press <kbd>⌘ K</kbd> (or <kbd>Ctrl K</kbd>) or click the search bar to open the
        Command Palette. Type any patient ID or name to jump directly to their timeline.
        Works from any screen.
      </Step>

      <Step n={10} title="Exporting End-of-Day Data">
        When ready to sync with the Manager, open <strong>Settings</strong> (gear icon) →
        <em> Download Data Package</em>. The app:
        (1) strips all PII vectors and applies <code>filterPII</code>;
        (2) encrypts the payload with AES-256-GCM;
        (3) wraps the session key with the Manager's RSA-OAEP public key;
        (4) signs the package with your ECDSA-P256 key;
        (5) saves a versioned <code>.enc</code> file.
        Transfer this file to your Manager via any channel —
        it is cryptographically safe to send over untrusted networks.
      </Step>
    </div>
  </DLPWrapper>
);

const Shortcuts = () => (
  <div>
    <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 16, color: 'var(--t1)' }}>
      Keyboard Shortcuts
    </h3>
    <div style={{ display: 'grid', gap: 12 }}>
      {[
        [['⌘ K', 'Ctrl K'],  'Open Quick Search / Command Palette'],
        [['Esc'],             'Close modal, search, or overlay'],
        [['Space', 'Enter'],  'Check / uncheck focused task'],
        [['← →'],            'Navigate slides in the Briefing overlay'],
        [['Tab'],             'Move focus between interactive elements (keyboard navigation)'],
      ].map(([keys, desc]) => (
        <div key={desc as string} style={{ display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {(keys as string[]).map(k => (
              <kbd key={k} style={{ background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '4px 8px', fontFamily: 'var(--fm)',
                fontSize: 11, color: 'var(--t1)', boxShadow: '0 1px 1px rgba(0,0,0,0.05)' }}>
                {k}
              </kbd>
            ))}
          </div>
          <span style={{ fontSize: 13, color: 'var(--t2)' }}>{desc as string}</span>
        </div>
      ))}
    </div>
  </div>
);

/* ── HelpModal shell ──────────────────────────────────────────────────────── */

export function HelpModal({
  onClose,
  initialTab = 'guide',
  onDLPViolation,
  role = 'coordinator',
}: HelpModalProps) {
  const [tab, setTab] = useState(initialTab);

  const tabs = [
    { id: 'guide',     label: 'Quick Guide' },
    { id: 'security',  label: 'Security & Sync' },
    { id: 'glossary',  label: 'Glossary' },
    { id: 'manuals',   label: 'Manuals' },
    { id: 'shortcuts', label: 'Shortcuts' },
  ];

  const tabStyle = (id: string) => ({
    padding: '12px 16px',
    background: 'transparent',
    border: 'none',
    borderBottom: `2px solid ${tab === id ? 'var(--blue)' : 'transparent'}`,
    fontSize: 13,
    fontWeight: tab === id ? 700 : 500 as 700 | 500,
    color: tab === id ? 'var(--blue)' : 'var(--t2)',
    cursor: 'pointer' as const,
    whiteSpace: 'nowrap' as const,
  });

  return (
    <div className="modal-overlay" style={{ zIndex: 900 }}>
      <div className="modal-card" style={{ maxWidth: 750, padding: 0 }}>
        <div className="modal-hdr" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HelpCircle size={18} color="var(--blue)" aria-hidden="true" />
            Help &amp; Learning Centre
          </div>
          <button className="ibtn" onClick={onClose} aria-label="Close Help">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body" style={{ padding: 0 }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)',
            background: 'var(--bg)', padding: '0 16px', overflowX: 'auto' }}>
            {tabs.map(t => (
              <button key={t.id} style={tabStyle(t.id)} onClick={() => setTab(t.id)}>
                {t.id === 'manuals' && <BookOpen size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: 24, maxHeight: '60vh', overflowY: 'auto',
            fontSize: 13, lineHeight: 1.6, color: 'var(--t2)' }}>
            {tab === 'guide'     && <QuickGuide role={role} />}
            {tab === 'security'  && <SecuritySync />}
            {tab === 'glossary'  && <Glossary />}
            {tab === 'manuals'   && (
              role === 'manager'
                ? <ManagerManual />
                : <CRCManual />
            )}
            {tab === 'shortcuts' && <Shortcuts />}
          </div>
        </div>

        <div className="modal-footer" style={{ background: 'var(--bg)',
          borderTop: '1px solid var(--border)', padding: '16px 24px' }}>
          <button className="btn btn-primary w-full"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
