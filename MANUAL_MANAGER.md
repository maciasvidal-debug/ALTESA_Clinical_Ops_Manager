# ALTESA Clinical App - User Manual (Manager View)

## 1. Introduction
Welcome to the Manager manual for the **ALTESA** platform. The Manager Dashboard acts as the central command structure, allowing Clinical Operations teams to visualize multi-site deployment, inject dynamic protocol amendments securely, analyze trial-wide performance, and govern compliance using zero-trust cryptography.

## 2. Secure Access & Activation
The Manager View is highly privileged and protected.
1. **Master Secret:** Accessing the dashboard requires providing the **Master Password** during the initialization or login flow.
2. **Initial Bootstrapping:** On the very first run, you must provide a valid JSON Protocol Configuration to bootstrap the environment.
3. **Session Auto-Locking:** As with CRC views, the Manager session leverages a strict timeout policy.

## 3. Top Navigation & Sections
The Manager environment is split into four core pillars, accessible via the left sidebar:
1. **Subject Tracker:** Global timeline monitoring.
2. **Risk Intelligence:** Automated anomaly and deviation detection.
3. **Analytics:** Global recruitment and timeline benchmarking.
4. **Queries & Flags:** Communication and validation workflows for site data.

Additionally, a **Settings (Gear Icon)** menu powers the administrative framework of the platform.

---

## 4. Subject Tracker
This is your cross-site view of all subjects.
- **Filters & Search:** Instantly filter subjects by Clinical Site (e.g., SITE-1, SITE-2).
- **Views:**
  - **Board (Kanban):** Drag-and-drop-style visualization of subjects segmented by clinical Phase (Screening, Window Active, Enrolled, Completed).
  - **Grid:** Tabular format for rapid data consumption.
  - **Calendar:** Anticipate clinic surges across all sites globally.
- **Actionability:** Click on any subject's card to quickly peek at their latest activity logs and timeline status without needing CRC-level decryption.

## 5. Risk Intelligence
Proactive compliance monitoring. The system continuously evaluates CRC actions against the mathematical models of the protocol.
- **Deviation Alerts:** The dashboard highlights major infractions (e.g., "Randomisation window breached", "Consent preceded DTQ positivity in an impossible temporal sequence").
- **Quality Flags:** Displays soft-warnings when certain metrics (like site responsiveness) degrade.
- **Risk Table:** Allows the Manager to acknowledge or flag warnings for monitoring visits.

## 6. Global Analytics
A macro-level dashboard tracking the pulse of the trial.
- **Recruitment Burn-Down:** Charts projected vs actual consents to evaluate if the trial is statistically powered.
- **Velocity Tracking:** Measures the time delta between ICF (Consent) and Randomisation, charting the median metric to identify site-level bottlenecks.
- **Demographics & Retention:** Overview of participant retention and screen-failure rates.

## 7. Queries & Flags
Replace archaic email queries with direct, contextual data-flags.
- **Data Queries:** Visualize questions raised against specific CRFs or timeline nodes.
- **Status Workflows:** Resolve, open, or escalate queries. Allows asynchronous monitoring interaction.

---

## 8. Manager Settings & Administration
Clicking the **Gear Icon** in the bottom-left opens the heart of the Manager permissions.

### 8.1 Protocol Configuration (The Visual Editor)
ALTESA allows dynamic protocol rules. You don't need code to change the timeline.
1. Navigate to **Manager Settings > Protocol**.
2. **Amendment History:** See the list of all historic protocol versions.
3. **Create Amendment:** Click "+ Create Amendment". You must provide a rationale (e.g., "FDA mandate 2.1").
4. **Visual Protocol Editor:**
   - **Timeline (SoA) Tab:** Modify tasks, their logical prerequisites, or their assigned icons.
   - **Rules Tab:** Update strict mathematical constants (e.g., setting the randomisation window from 48h to 72h).
5. **Publishing:** Once saved, this amendment is cryptographically signed and pushed. CRCs will immediately see the new Protocol Version available for patient assignments.

### 8.2 Security, Keys & Activation Configs
1. **Manager Keys:** You must import your secure Public/Private keypairs provided by the trial sponsor here.
2. **Site Activation Codes:** Generate site-specific activation JSONs that include the Study ID, secret handshakes, and constraints. **You must send these secure codes to your CRCs manually so they can unlock their site.**
3. **Device Fingerprinting:** Shows secure hashes of endpoints authorized to connect to the trial. 

### 8.3 Crypto Audit Log
- A raw, un-editable timeline of administrative changes. Whenever an amendment is pushed, a key is generated, or data is exported, the event is permanently fused to the audit ledger.

## 9. Secure Synchronization
- Found at the bottom of the sidebar, the **Sync (Arrows)** button is used to ingest packages securely from offline sites or push Manager payloads to the central relay. All transfers use End-to-End Encryption ensuring no middleman (including cloud providers) can parse PHI.
