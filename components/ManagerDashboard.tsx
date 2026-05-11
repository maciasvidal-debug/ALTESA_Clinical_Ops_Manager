"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  Shield,
  Calendar,
  ChevronRight,
  Search,
  Filter,
  MessageSquare,
  Lock,
  FileText,
  Key,
  TrendingUp,
  Map as MapIcon,
  List,
  LayoutGrid,
  Upload,
  X,
  Terminal,
  Download,
  LifeBuoy,
  Plus,
  Settings2,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  LineChart as LineChartIcon,
  Settings,
  Archive,
  Users,
  Database,
  SaveAll,
  ShieldCheck,
  History,
  ChevronDown,
  HelpCircle,
} from "lucide-react";
import {
  Patient,
  ProtocolAmendment,
  getSiteId,
  countTasks,
  getToday,
  diffDays,
  fmtHuman,
  addDays,
} from "@/lib/data";
import { DLPWrapper } from "@/components/DLPWrapper";
import { PinConfirmModal } from "@/components/PinConfirmModal";
import { verifyAndDecrypt, encryptAndSign, generateCRCKeys } from "@/lib/crypto";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { VisualProtocolEditor } from "@/components/VisualProtocolEditor";
import { TourOverlay } from "./TourOverlay";
import { ComplianceVault } from "./ComplianceVault";

interface ManagerDashboardProps {
  patients: Patient[];
  queries: any[];
  protocolVersions: ProtocolAmendment[];
  setProtocolVersions: React.Dispatch<React.SetStateAction<ProtocolAmendment[]>>;
  onLock: () => void;
  onOpenHelp?: () => void;
  onDLPViolation: (action: string) => void;
  isChecked: (pid: string, code: string) => boolean;
  onOpenPatient: (id: string) => void;
  onImportPatients: (patients: Patient[]) => void;
}

export function ManagerDashboard({
  patients,
  queries,
  protocolVersions,
  setProtocolVersions,
  onLock,
  onOpenHelp,
  onDLPViolation,
  isChecked,
  onOpenPatient,
  onImportPatients,
}: ManagerDashboardProps) {
  const [activeTab, setActiveTab] = useState<
    "tracker" | "risk" | "analytics" | "queries"
  >("tracker");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"protocol" | "keys" | "audit">(
    "protocol",
  );
  const [trackerView, setTrackerView] = useState<"board" | "grid" | "calendar">(
    "board",
  );
  const [siteFilter, setSiteFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [managerKeys, setManagerKeys] = useState<{
    publicKey: string;
    privateKey: string;
    signPublicKey: string;
    signPrivateKey: string;
    encPublicKey: string;
    encPrivateKey: string;
  } | null>(null);

  // Recovery Tool State
  const [recoveryChallenge, setRecoveryChallenge] = useState("");
  const [generatedResponse, setGeneratedResponse] = useState("");

  // Protocol Amendments State
  const [showAmendmentModal, setShowAmendmentModal] = useState(false);
  const [visualEditorOpen, setVisualEditorOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState("");
  const [pendingAmendmentData, setPendingAmendmentData] = useState<{
    id: string; label: string; effectiveDate: string;
    rationale: string; approvalReference: string;
  } | null>(null);
  const [showConfigConfirm, setShowConfigConfirm] = useState(false);

  /** Controlled form state — replaces document.getElementById anti-pattern. */
  const EMPTY_AMENDMENT_FORM = { id: '', label: '', effectiveDate: new Date().toISOString().split('T')[0], rationale: '', approvalReference: '' };
  const [amendmentForm, setAmendmentForm] = useState(EMPTY_AMENDMENT_FORM);
  const [amendmentFormErrors, setAmendmentFormErrors] = useState<Record<string, string>>({});

  const openAmendmentModal = () => { setAmendmentForm(EMPTY_AMENDMENT_FORM); setAmendmentFormErrors({}); setShowAmendmentModal(true); };

  const validateAmendmentForm = () => {
    const errs: Record<string, string> = {};
    if (!amendmentForm.id.trim()) errs.id = 'Version ID is required (e.g. v3.0)';
    else if (protocolVersions.some(p => p.id === amendmentForm.id.trim())) errs.id = `"${amendmentForm.id.trim()}" already exists — choose a unique ID.`;
    if (!amendmentForm.label.trim()) errs.label = 'Label is required';
    if (!amendmentForm.effectiveDate) errs.effectiveDate = 'Effective date is required';
    if (!amendmentForm.rationale.trim()) errs.rationale = 'Rationale required — ICH E6(R3) §4.5.3';
    setAmendmentFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Activation Generator State
  const [actSiteId, setActSiteId] = useState("");
  const [actDeviceId, setActDeviceId] = useState("");
  const [generatedActCode, setGeneratedActCode] = useState("");

  // Master Key Generator State
  const [newStudyId, setNewStudyId] = useState("ALTESA-2026");
  const [generatedMasterConfig, setGeneratedMasterConfig] = useState("");
  const [importConfigJson, setImportConfigJson] = useState("");
  
  const [managerToast, setManagerToast] = useState<{message: string, type: 'error' | 'success'} | null>(null);
  const [isProcessing, setIsProcessing] = useState<{ active: boolean; message: string }>({ active: false, message: "" });

  const showToast = (message: string, type: 'error' | 'success' = 'success') => {
    setManagerToast({ message, type });
    setTimeout(() => setManagerToast(null), 3000);
  };

  const handleGenerateActivation = async () => {
    const { generateActivationCode } = await import("@/lib/security");
    const code = await generateActivationCode(
      actSiteId.trim(),
      actDeviceId.trim(),
    );
    setGeneratedActCode(code);

    setAuditLogs((prev) => [
      {
        timestamp: new Date().toISOString(),
        event: `Activation code generated for Site: ${actSiteId.trim()}, Device: ${actDeviceId.trim()}`,
        type: "security",
      },
      ...prev,
    ]);
  };

  const handleGenerateMasterConfig = async () => {
    setIsProcessing({ active: true, message: "Generating Master Cryptographic Configuration..." });
    await new Promise((r) => setTimeout(r, 1200)); // Simulate intensive generation

    const secret =
      "SEC-" +
      Math.random().toString(36).substring(2, 15).toUpperCase() +
      "-" +
      Date.now();
    const config = {
      studyId: newStudyId.trim(),
      secret: secret,
    };

    const configStr = JSON.stringify(config, null, 2);
    setGeneratedMasterConfig(configStr);

    const { configStore } = await import('@/lib/db');
    await configStore.setItem("altesa_study_id", config.studyId);
    await configStore.setItem("altesa_study_secret", secret);

    setAuditLogs((prev) => [
      {
        timestamp: new Date().toISOString(),
        event: `New Master Key Config generated and applied to local environment for Study: ${config.studyId}`,
        type: "security",
      },
      ...prev,
    ]);
    setShowConfigConfirm(false);
    setIsProcessing({ active: false, message: "" });
    showToast(`Successfully generated configuration for ${config.studyId}.`, "success");
  };

  const handleImportMasterConfig = async () => {
    setIsProcessing({ active: true, message: "Validating and Applying Configuration..." });
    await new Promise((r) => setTimeout(r, 800)); // Simulate verification delay

    try {
      const config = JSON.parse(importConfigJson);
      if (config.studyId && config.secret) {
        const { configStore } = await import('@/lib/db');
        await configStore.setItem("altesa_study_id", config.studyId);
        await configStore.setItem("altesa_study_secret", config.secret);
        setAuditLogs((prev) => [
          {
            timestamp: new Date().toISOString(),
            event: `Master Key Config imported and applied for Study: ${config.studyId}`,
            type: "security",
          },
          ...prev,
        ]);
        setImportConfigJson("");
        showToast(
          `Successfully loaded Master Key Configuration for ${config.studyId}.`, "success"
        );
      } else {
        showToast("Invalid Configuration JSON.", "error");
      }
    } catch {
      showToast("Invalid JSON format.", "error");
    } finally {
      setIsProcessing({ active: false, message: "" });
    }
  };

  const handleGenerateResponse = async () => {
    const { generateResponseCode } = await import("@/lib/security");
    const resp = await generateResponseCode(recoveryChallenge);
    setGeneratedResponse(resp);
  };

  React.useEffect(() => {
    const initKeys = async () => {
      const { keysStore } = await import('@/lib/db');
      const stored = await keysStore.getItem<any>("manager_keys");
      if (stored) {
        setManagerKeys(stored);
      } else {
        const { generateManagerKeys } = await import("@/lib/crypto");
        const keys = await generateManagerKeys();
        await keysStore.setItem("manager_keys", keys);
        setManagerKeys(keys);
      }
    };
    initKeys();
  }, []);

  // Sync Modal State
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);

  // Audit Log State
  const [auditLogs, setAuditLogs] = useState([
    {
      timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
      event: "Manager keys generated and stored securely.",
      type: "security",
    },
    {
      timestamp: new Date(Date.now() - 86400000 * 1).toISOString(),
      event: "Public key exported for Coordinator distribution.",
      type: "transfer",
    },
    {
      timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
      event: "Data sync initiated. 2 encrypted packages received.",
      type: "transfer",
    },
    {
      timestamp: new Date(Date.now() - 3600000 * 5 + 2000).toISOString(),
      event: "Signature verification successful for SITE-A.",
      type: "security",
    },
    {
      timestamp: new Date(Date.now() - 3600000 * 5 + 4000).toISOString(),
      event: "Payload decrypted successfully. 8 patient records updated.",
      type: "transfer",
    },
    {
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      event: "PIN Recovery challenge generated for Coordinator.",
      type: "security",
    },
  ]);

  React.useEffect(() => {
    const el = document.getElementById("sync-terminal");
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [syncLogs]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsSyncing(true);
    setSyncProgress(0);
    setSyncLogs(["[SYSTEM] Initiating secure import protocol..."]);
    let allImported: Patient[] = [];

    const totalSteps = files.length * 3 + 1; // 3 steps per file + 1 completion step
    let currentStep = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setSyncLogs((prev) => [...prev, `[READ] Loading ${file.name}...`]);
      currentStep++;
      setSyncProgress(Math.round((currentStep / totalSteps) * 100));

      try {
        if (!managerKeys) throw new Error("Manager keys not initialized.");
        const text = await file.text();
        let pkg;
        try {
          pkg = JSON.parse(text);
        } catch {
          throw new Error("Invalid or corrupted package format.");
        }

        setSyncLogs((prev) => [
          ...prev,
          `[CRYPTO] Verifying ECDSA signature for ${file.name}...`,
        ]);
        // SEC-005 FIX: removed setTimeout(600) — was artificial UX delay, not real crypto wait.
        currentStep++;
        setSyncProgress(Math.round((currentStep / totalSteps) * 100));

        setSyncLogs((prev) => [
          ...prev,
          `[CRYPTO] Decrypting AES-256-GCM payload...`,
        ]);
        // SEC-005 FIX: removed setTimeout(400) — WebCrypto is inherently async; no mock needed.

        let crcSignKey = "";
        const { keysStore } = await import('@/lib/db');
        let storedCrcKeys = await keysStore.getItem<any>("crc_keys");
        if (!storedCrcKeys) {
            const keys = await generateCRCKeys();
            await keysStore.setItem("crc_keys", keys);
            storedCrcKeys = keys;
        }
        if (storedCrcKeys) {
          if (storedCrcKeys.signPublicKey) crcSignKey = storedCrcKeys.signPublicKey;
        }

        const data = await verifyAndDecrypt(
          pkg,
          managerKeys.encPrivateKey,
          crcSignKey,
        );
        // SEC-006 FIX: push instead of spread accumulation.
        // [...allImported, ...data] created a new O(n) array on every iteration.
        // push is O(1) amortized — no intermediate array allocations.
        allImported.push(...data);

        setSyncLogs((prev) => [
          ...prev,
          `[SUCCESS] Decrypted ${data.length} records from ${file.name}.`,
        ]);
        
        setAuditLogs((prev) => [
          {
            timestamp: new Date().toISOString(),
            event: `Data payload from ${file.name} successfully decrypted and ingested.`,
            type: "transfer",
          },
          ...prev,
        ]);
      } catch {
        // SbD: err.message from crypto libraries may expose key or algorithm details.
        // Audit logs use safe, actionable messages that identify the file and failure
        // category without leaking implementation internals.
        setSyncLogs((prev) => [
          ...prev,
          `[ERROR] Failed processing ${file.name} — decryption or verification error.`,
        ]);
        
        setAuditLogs((prev) => [
          {
            timestamp: new Date().toISOString(),
            event: `Decryption failed for package ${file.name} — verify Manager keys and package integrity.`,
            type: "security",
          },
          ...prev,
        ]);
      }
      currentStep++;
      setSyncProgress(Math.round((currentStep / totalSteps) * 100));
    }

    if (allImported.length > 0) {
      setSyncLogs((prev) => [
        ...prev,
        `[DB] Merging ${allImported.length} records into secure storage...`,
      ]);
      // SEC-005 FIX: removed setTimeout(500) — no justification for artificial delay before DB write.
      onImportPatients(allImported);
      setSyncLogs((prev) => [
        ...prev,
        `[SYSTEM] Import complete. Dashboard updated.`,
      ]);
    } else {
      setSyncLogs((prev) => [
        ...prev,
        `[SYSTEM] Import finished with 0 records.`,
      ]);
    }
    
    setSyncProgress(100);
    setTimeout(() => {
      setIsSyncing(false);
    }, 1000);
  };

  // ⚡ OPT-3: Single patientSiteMap built once per [patients] change.
  // Previously: sites useMemo called getSiteId(p) for all patients, AND filteredQueries
  // independently built `new Map(patients.map(...getSiteId...))` — two full passes for the
  // same data. Now one Map is computed and shared by sites, filteredPatients, filteredQueries.
  const patientSiteMap = useMemo(
    () => new Map(patients.map(p => [p.id, getSiteId(p)])),
    [patients]
  );

  // Derive sites from explicit siteId field (with fallback to patient ID prefix for legacy records)
  const sites = useMemo(() => {
    const s = new Set<string>(patientSiteMap.values());
    return Array.from(s).sort();
  }, [patientSiteMap]);

  const filteredPatients = useMemo(() => {
    let result = patients;
    if (siteFilter !== "ALL") {
      result = result.filter((p) => patientSiteMap.get(p.id) === siteFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          (p.siteId ?? '').toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.phaseLabel.toLowerCase().includes(q),
      );
    }
    return result;
  }, [patients, patientSiteMap, siteFilter, searchQuery]);

  const filteredQueries = useMemo(() => {
    let result = queries;
    if (siteFilter !== "ALL") {
      // ⚡ Reuses patientSiteMap from OPT-3 — no Map reconstruction here
      result = result.filter(q => patientSiteMap.get(q.pid) === siteFilter);
    }
    return result;
  }, [queries, siteFilter, patientSiteMap]);

  // KPIs
  const kpis = useMemo(() => {
    let overdues = 0;
    let todays = 0;
    let active = filteredPatients.length;
    let openQueries = filteredQueries.filter((q) => q.status === "open").length;

    filteredPatients.forEach((p) => {
      const allTasks = [
        ...(p.tasks.q || []),
        ...(p.tasks.pr || []),
        ...(p.tasks.l || []),
        ...(p.tasks.ad || []),
      ];
      allTasks.forEach((t) => {
        if (!isChecked(p.id, t.code) && t.dueDate) {
          const diff = diffDays(getToday(), t.dueDate);
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
    const sortedByDate = [...patients].sort(
      (a, b) => {
        const dateA = a.screeningDate ? new Date(a.screeningDate) : getToday();
        const dateB = b.screeningDate ? new Date(b.screeningDate) : getToday();
        return dateA.getTime() - dateB.getTime();
      }
    );

    const firstDate = sortedByDate[0]?.screeningDate || getToday();
    const daysElapsed = Math.max(1, diffDays(firstDate, getToday()));
    const ratePerDay = patients.length / daysElapsed;
    const target = 50; // Mock target
    const remaining = target - patients.length;
    const daysToTarget = remaining > 0 ? Math.ceil(remaining / ratePerDay) : 0;
    const projectedDate = addDays(getToday(), daysToTarget);

    const trend = sortedByDate.map((p, i) => ({
      date: p.screeningDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      actual: (i + 1) as number | null,
      projected: null as number | null,
    }));

    // Add Today point
    const todayStr = getToday().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    if (trend.length > 0 && trend[trend.length - 1].date !== todayStr) {
      trend.push({
        date: todayStr,
        actual: patients.length,
        projected: patients.length,
      });
    } else if (trend.length > 0) {
      trend[trend.length - 1].projected = patients.length;
    } else {
      trend.push({ date: todayStr, actual: 0, projected: 0 });
    }

    // Add Projected point
    if (daysToTarget > 0) {
      trend.push({
        date: projectedDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        actual: null,
        projected: target,
      });
    }

    // 2. Site Performance
    const siteStats = sites.map((site) => {
      const sitePatients = patients.filter((p) => getSiteId(p) === site);
      const totalTasks = sitePatients.reduce(
        (acc, p) => acc + countTasks(p).total,
        0,
      );
      const doneTasks = sitePatients.reduce(
        (acc, p) => acc + countTasks(p).done,
        0,
      );
      const compliance =
        totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
      const sitePatientIds = new Set(sitePatients.map(p => p.id));
      const openQueries = queries.filter(
        (q) => sitePatientIds.has(q.pid) && q.status === "open",
      ).length;
      
      const avgTasksCompleted = sitePatients.length > 0 ? Math.round(doneTasks / sitePatients.length * 10) / 10 : 0;
      
      // Mock last sync dates for realism
      const syncTimes = ["Today, 10:42 AM", "Today, 09:15 AM", "Yesterday, 16:30", "Just now"];
      const lastSync = syncTimes[sites.indexOf(site) % syncTimes.length];

      return {
        name: site,
        subjects: sitePatients.length,
        compliance,
        queries: openQueries,
        avgTasksCompleted,
        lastSync,
      };
    });

    // 3. Phase Distribution
    const phases = [
      {
        name: "Screening",
        value: patients.filter((p) => p.phaseCode === "scr").length,
        color: "var(--t3)",
      },
      {
        name: "PSB",
        value: patients.filter((p) => p.phaseCode === "psb").length,
        color: "#38BDF8",
      },
      {
        name: "RV/Treatment",
        value: patients.filter(
          (p) => p.phaseCode === "rv" || p.phaseCode === "tx",
        ).length,
        color: "#8B5CF6",
      },
      {
        name: "Follow-up",
        value: patients.filter((p) => p.phaseCode === "fu").length,
        color: "#10B981",
      },
    ];

    return { trend, siteStats, phases, projectedDate, ratePerDay, target };
  }, [patients, queries, sites]);

  // --- Risk Intelligence ---
  const riskIntelligence = useMemo(() => {
    return filteredPatients
      .map((p) => {
        let riskScore = 0;
        const reasons: string[] = [];

        // 1. Alerts & Critical Windows
        if (p.alert === "DTQ_POSITIVE") {
          riskScore += 60;
          reasons.push("Active RV Window (48h+6h)");
        } else if (p.alert === "RESCREENING") {
          riskScore += 30;
          reasons.push("Rescreening required");
        } else if (p.alert === "MONTHLY_CALL") {
          riskScore += 15;
          reasons.push("Monthly call due");
        } else if (p.alert) {
          riskScore += 10;
          reasons.push(`Active alert: ${p.alert}`);
        }

        // 2. Task Overdue Risk
        const allTasks = [
          ...(p.tasks.q || []),
          ...(p.tasks.pr || []),
          ...(p.tasks.l || []),
          ...(p.tasks.ad || []),
        ];
        const overdueTasks = allTasks.filter(
          (t) =>
            !isChecked(p.id, t.code) &&
            t.dueDate &&
            diffDays(getToday(), t.dueDate) < 0,
        );

        if (overdueTasks.length > 0) {
          let overdueScore = 0;
          let criticalOverdue = 0;
          let urgentOverdue = 0;

          overdueTasks.forEach((t) => {
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
          if (criticalOverdue > 0)
            reasons.push(`${criticalOverdue} critical tasks overdue`);
          if (urgentOverdue > 0)
            reasons.push(`${urgentOverdue} urgent tasks overdue`);
          const normalOverdue =
            overdueTasks.length - criticalOverdue - urgentOverdue;
          if (normalOverdue > 0) reasons.push(`${normalOverdue} tasks overdue`);
        }

        // 3. Missing Critical Docs
        const hasICF = p.documents.some((d) => d.category === "ICF");
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
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [filteredPatients, isChecked]);

  // Tracker Columns
  const columns = [
    { id: "scr", label: "Screening" },
    { id: "psb", label: "Asymptomatic (PSB)" },
    { id: "rv", label: "Symptomatic (RV)" },
    { id: "tx", label: "Treatment" },
    { id: "fu", label: "Follow-up" },
  ];

  // Tour State
  const [tourStep, setTourStep] = useState<number>(0);

  const nextTourStep = () => {
    if (tourStep === 1) setTourStep(2);
    else if (tourStep === 2) setTourStep(3);
    else if (tourStep === 3) setTourStep(4);
    else if (tourStep === 4) {
      setIsSettingsOpen(false);
      setTourStep(5);
    } else if (tourStep === 5) {
      setActiveTab("queries");
      setTourStep(6);
    } else setTourStep(0);
  };

  return (
    <div
      className="screen"
      style={{
        background: "#F8FAFC",
        height: "100vh",
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* Toast Notification */}
      {managerToast && (
        <div id="toasts">
          <div className={`toast ${managerToast.type === 'success' ? 'ok' : 'err'}`}>
            {managerToast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {managerToast.message}
          </div>
        </div>
      )}

      {/* Tour Overlay */}
      <TourOverlay
        active={tourStep > 0}
        step={tourStep}
        totalSteps={6}
        targetId={
          tourStep === 1
            ? "manager-tour-settings"
            : tourStep === 2
              ? "manager-tour-keys"
              : tourStep === 3
                ? "manager-tour-compliance"
                : tourStep === 4
                  ? "manager-tour-vault"
                  : tourStep === 5
                    ? "manager-tour-sync"
                    : tourStep === 6
                      ? "manager-tour-export"
                      : null
        }
        position={
          tourStep === 2 || tourStep === 3 ? "right" : tourStep === 4 ? "center" : "right"
        }
        title={
          tourStep === 1
            ? "Access Advanced Settings"
            : tourStep === 2
              ? "Cryptographic Keys"
              : tourStep === 3
                ? "Open Compliance Vault"
                : tourStep === 4
                  ? "Audit Ledger & Session Tracking"
                  : tourStep === 5
                    ? "Data Synchronization"
                    : "Finalize & Export"
        }
        description={
          tourStep === 1
            ? "Click here to expand the global configuration panel where you can manage keys, Firebase identity settings, and data retention."
            : tourStep === 2
              ? "Manage end-to-end encrypted data exchange using site PKI keypairs. CRC keys secure local data packages; Manager keys decrypt them for oversight."
              : tourStep === 3
                ? "Navigate to the Data & Compliance center for audit trail management, session logs, and regulatory reporting tools."
                : tourStep === 4
                  ? "The Compliance Vault provides audit ledger tracking, RBAC session management, and data export tools for GCP/ICH E6(R3) oversight."
                  : tourStep === 5
                    ? "Import data from eCRF and external vendors using standard formats to update your dashboard."
                    : "Export the current filtered query list as an encrypted package using your manager keys."
        }
        buttonText={
          tourStep === 6
            ? "Finish & Export"
            : tourStep === 4
            ? "Explore Compliance"
            : "Next Step"
        }
        onNext={() => {
          if (tourStep === 1)
            document.getElementById("manager-tour-settings")?.click();
          else if (tourStep === 2)
            document.getElementById("manager-tour-keys")?.click();
          else if (tourStep === 3)
            document.getElementById("manager-tour-compliance")?.click();
          else if (tourStep === 4) nextTourStep();
          else if (tourStep === 5) nextTourStep();
          else if (tourStep === 6)
            document.getElementById("manager-tour-export")?.click();
          else nextTourStep();
        }}
        onClose={() => setTourStep(0)}
        isActionRequired={false}
      />

      {/* Left Sidebar Navigation */}
      <aside
        className="sidebar"
        style={{
          width: "260px",
          flexShrink: 0,
          background: "var(--t1)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--t1)",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div
          style={{
            padding: "24px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div className="wordmark" style={{ color: "#fff" }}>
            ALTE<em style={{ color: "#38BDF8" }}>SA</em>
          </div>
          <span
            style={{
              color: "var(--t3)",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            Manager
          </span>
        </div>
        <nav
          style={{
            flex: 1,
            padding: "16px 12px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <button
            className={`sidebar-tab ${activeTab === "tracker" ? "active" : ""}`}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s",
              color: activeTab === "tracker" ? "#fff" : "#94A3B8",
              background: activeTab === "tracker" ? "var(--t1)" : "transparent",
              border: "none",
            }}
            onClick={() => {
              setActiveTab("tracker");
              setIsSettingsOpen(false);
            }}
          >
            <MapIcon size={18} /> Subject Tracker
          </button>
          <button
            className={`sidebar-tab ${activeTab === "risk" ? "active" : ""}`}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s",
              color: activeTab === "risk" ? "#fff" : "#94A3B8",
              background: activeTab === "risk" ? "var(--t1)" : "transparent",
              border: "none",
            }}
            onClick={() => {
              setActiveTab("risk");
              setIsSettingsOpen(false);
            }}
          >
            <AlertTriangle size={18} /> Risk Intelligence
          </button>
          <button
            className={`sidebar-tab ${activeTab === "analytics" ? "active" : ""}`}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s",
              color: activeTab === "analytics" ? "#fff" : "#94A3B8",
              background: activeTab === "analytics" ? "var(--t1)" : "transparent",
              border: "none",
            }}
            onClick={() => {
              setActiveTab("analytics");
              setIsSettingsOpen(false);
            }}
          >
            <BarChart2 size={18} /> Analytics
          </button>
          <button
            className={`sidebar-tab ${activeTab === "queries" ? "active" : ""}`}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.2s",
              color: activeTab === "queries" ? "#fff" : "#94A3B8",
              background: activeTab === "queries" ? "var(--t1)" : "transparent",
              border: "none",
              position: "relative",
              zIndex: 1,
              boxShadow: tourStep === 6 ? "0 0 0 2px #8B5CF6" : "none",
            }}
            onClick={() => {
              setActiveTab("queries");
              setIsSettingsOpen(false);
            }}
          >
            <MessageSquare size={18} /> Queries
          </button>
        </nav>
        <div
          className="sidebar-bottom"
          style={{
            padding: "16px",
            borderTop: "1px solid var(--t1)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            style={{
              padding: "10px 16px",
              fontSize: "13px",
              background: "transparent",
              color: "var(--t3)",
              border: "1px solid #334155",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              justifyContent: "flex-start",
              width: "100%",
              cursor: "pointer",
            }}
            onClick={() => setTourStep(1)}
          >
            <Shield size={16} /> Security Tour
          </button>
          <div
            style={{
              position: "relative",
              zIndex: 1,

              borderRadius: "6px",
            }}
          >
            <button
              id="manager-tour-settings"
              type="button"
              className={`btn ${isSettingsOpen ? "btn-primary" : "btn-secondary"}`}
              style={{
                padding: "10px 16px",
                fontSize: "13px",
                background: isSettingsOpen ? "#38BDF8" : "transparent",
                color: isSettingsOpen ? "var(--t1)" : "var(--border)",
                border: isSettingsOpen ? "none" : "1px solid #334155",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                justifyContent: "flex-start",
                width: "100%",
                cursor: "pointer",
              }}
              onClick={() => {
                setIsSettingsOpen(true);
                if (tourStep === 1) nextTourStep();
              }}
              title="Global Settings"
            >
              <Settings size={16} /> Settings
            </button>
          </div>
          <div
            style={{
              position: "relative",
              zIndex: 1,

              borderRadius: "6px",
            }}
          >
            <button
              type="button"
              className="btn btn-primary"
              style={{
                padding: "10px 16px",
                fontSize: "13px",
                background: "#f0f9ff",
                color: "#0284c7",
                border: "none",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                justifyContent: "flex-start",
                width: "100%",
                cursor: "pointer",
              }}
              onClick={() => {
                setSyncModalOpen(true);
              }}
              id="manager-tour-sync"
              title="Import Data"
            >
              <FileText size={16} /> Data Sync
            </button>
          </div>
          <button
            type="button"
            className="ibtn"
            style={{
              border: "none",
              background: "transparent",
              color: "var(--t3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px",
              marginTop: "8px",
              cursor: "pointer",
            }}
            onClick={onLock}
            title="Lock Session"
          >
            <Lock size={16} />
          </button>
        </div>
      </aside>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Main Content Header */}
        <header
          style={{
            height: "72px",
            background: "#fff",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            padding: "0 32px",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <h1
            style={{
              fontSize: "20px", fontFamily: "var(--fd)",
              fontWeight: 600,
              color: "var(--t1)",
              margin: 0,
            }}
          >
            {activeTab === "tracker" && "Subject Tracker"}
            {activeTab === "risk" && "Risk Intelligence"}
            {activeTab === "analytics" && "Global Analytics"}
            {activeTab === "queries" && "Queries & Flags"}
          </h1>

          <button
            onClick={onOpenHelp}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              background: "#F0Fdfa", /* Teal-50 */
              color: "#0f766e", /* Teal-700 */
              border: "1px solid #ccfbf1", /* Teal-100 */
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#ccfbf1";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#F0Fdfa";
            }}
          >
            <HelpCircle size={18} /> Help &amp; Manuals
          </button>
        </header>

        <main style={{ flex: 1, overflowY: "auto", padding: "32px" }}>
          <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
            {/* Command Center - Bento Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(12, 1fr)",
                gap: "16px",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  gridColumn: "span 4",
                  background:
                    "linear-gradient(135deg, var(--t1) 0%, var(--t1) 100%)",
                  padding: "24px",
                  borderRadius: "16px",
                  color: "#fff",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--t3)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      marginBottom: "8px",
                    }}
                  >
                    Active Participants
                  </div>
                  <div
                    style={{ fontSize: "28px", fontFamily: "var(--fd)", fontWeight: 700, lineHeight: 1 }}
                  >
                    {kpis.active}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "16px",
                    background: "rgba(255,255,255,0.1)",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    width: "fit-content",
                  }}
                >
                  <TrendingUp size={16} color="#38BDF8" />
                  <span style={{ fontSize: "13px", fontWeight: 500 }}>
                    Global Overview
                  </span>
                </div>
              </div>

              <div
                style={{
                  gridColumn: "span 3",
                  background: "#fff",
                  padding: "24px",
                  borderRadius: "16px",
                  border: "1px solid var(--border)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--t3)",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "16px",
                  }}
                >
                  <div
                    style={{
                      background: "#FEF2F2",
                      padding: "6px",
                      borderRadius: "8px",
                    }}
                  >
                    <AlertTriangle size={16} color="#EF4444" />
                  </div>{" "}
                  Overdue
                </div>
                <div
                  style={{
                    fontSize: "28px", fontFamily: "var(--fd)",
                    fontWeight: 700,
                    color: kpis.overdues > 0 ? "#EF4444" : "#10B981",
                    marginBottom: "8px",
                  }}
                >
                  {kpis.overdues}
                </div>
                <div style={{ fontSize: "13px", color: "var(--t3)" }}>
                  Assessments requiring immediate action
                </div>
              </div>

              <div
                style={{
                  gridColumn: "span 2",
                  background: "#fff",
                  padding: "24px",
                  borderRadius: "16px",
                  border: "1px solid var(--border)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--t3)",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "16px",
                  }}
                >
                  <div
                    style={{
                      background: "#FFFBEB",
                      padding: "6px",
                      borderRadius: "8px",
                    }}
                  >
                    <Calendar size={16} color="#F59E0B" />
                  </div>{" "}
                  Today
                </div>
                <div
                  style={{
                    fontSize: "28px", fontFamily: "var(--fd)",
                    fontWeight: 700,
                    color: "var(--t1)",
                    marginBottom: "8px",
                  }}
                >
                  {kpis.todays}
                </div>
                <div style={{ fontSize: "13px", color: "var(--t3)" }}>
                  Scheduled visits
                </div>
              </div>

              <div
                style={{
                  gridColumn: "span 3",
                  background: "#fff",
                  padding: "24px",
                  borderRadius: "16px",
                  border: "1px solid var(--border)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    right: -20,
                    top: -20,
                    opacity: 0.03,
                  }}
                >
                  <MessageSquare size={120} />
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--t3)",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "16px",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <div
                    style={{
                      background: "#F3E8FF",
                      padding: "6px",
                      borderRadius: "8px",
                    }}
                  >
                    <MessageSquare size={16} color="#8B5CF6" />
                  </div>{" "}
                  Open Queries
                </div>
                <div
                  style={{
                    fontSize: "28px", fontFamily: "var(--fd)",
                    fontWeight: 700,
                    color: "var(--t1)",
                    marginBottom: "8px",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {kpis.openQueries}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--t3)",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  Awaiting resolution from sites
                </div>
              </div>
            </div>

            {/* Control Bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
                background: "#fff",
                padding: "12px 16px",
                borderRadius: "12px",
                border: "1px solid var(--border)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              {/* Left: Site Context Filter */}
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--t3)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <MapIcon size={14} /> Site Context
                </div>
                <div style={{ position: "relative" }}>
                  <select
                    value={siteFilter}
                    onChange={(e) => setSiteFilter(e.target.value)}
                    style={{
                      appearance: "none",
                      background: "#F1F5F9",
                      color: "var(--t1)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "8px 32px 8px 12px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      outline: "none",
                      minWidth: "160px"
                    }}
                  >
                    <option value="ALL">Global (All Sites)</option>
                    {sites.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--t3)",
                      pointerEvents: "none",
                    }}
                  />
                </div>
              </div>

              {/* Right: Search and View Toggles */}
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div style={{ position: "relative" }}>
                  <Search
                    size={14}
                    style={{
                      position: "absolute",
                      left: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--t3)",
                    }}
                  />
                  <input
                    aria-label="Search patients"
                    type="text"
                    placeholder="Search patients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      background: "#F8FAFC",
                      color: "var(--t1)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      padding: "6px 12px 6px 30px",
                      fontSize: "13px",
                      outline: "none",
                      width: "200px",
                      transition: "all 0.2s",
                    }}
                  />
                </div>
                {activeTab === "tracker" && (
                  <>
                    <div
                      style={{
                        width: "1px",
                        height: "24px",
                        background: "var(--border)",
                        margin: "0 4px",
                      }}
                    ></div>
                    <div
                      style={{
                        display: "flex",
                        background: "#F1F5F9",
                        borderRadius: "8px",
                        padding: "4px",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <button
                        onClick={() => setTrackerView("board")}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "6px",
                          background:
                            trackerView === "board" ? "#fff" : "transparent",
                          border: "none",
                          boxShadow:
                            trackerView === "board"
                              ? "0 1px 2px rgba(0,0,0,0.05)"
                              : "none",
                          fontSize: "12px",
                          cursor: "pointer",
                          color:
                            trackerView === "board" ? "var(--t1)" : "var(--t3)",
                          fontWeight: trackerView === "board" ? 600 : 400,
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <LayoutGrid size={14} /> Board
                      </button>
                      <button
                        onClick={() => setTrackerView("grid")}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "6px",
                          background:
                            trackerView === "grid" ? "#fff" : "transparent",
                          border: "none",
                          boxShadow:
                            trackerView === "grid"
                              ? "0 1px 2px rgba(0,0,0,0.05)"
                              : "none",
                          fontSize: "12px",
                          cursor: "pointer",
                          color: trackerView === "grid" ? "var(--t1)" : "var(--t3)",
                          fontWeight: trackerView === "grid" ? 600 : 400,
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <List size={14} /> List
                      </button>
                      <button
                        onClick={() => setTrackerView("calendar")}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "6px",
                          background:
                            trackerView === "calendar" ? "#fff" : "transparent",
                          border: "none",
                          boxShadow:
                            trackerView === "calendar"
                              ? "0 1px 2px rgba(0,0,0,0.05)"
                              : "none",
                          fontSize: "12px",
                          cursor: "pointer",
                          color:
                            trackerView === "calendar" ? "var(--t1)" : "var(--t3)",
                          fontWeight: trackerView === "calendar" ? 600 : 400,
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Calendar size={14} /> Calendar
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Tracker */}
            {activeTab === "tracker" && trackerView === "board" && (
              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  overflowX: "auto",
                  paddingBottom: "16px",
                }}
              >
                {columns.map((col) => {
                  const colPatients = filteredPatients.filter(
                    (p) => p.phaseCode === col.id,
                  );
                  return (
                    <div
                      key={col.id}
                      style={{
                        flex: "1",
                        minWidth: "260px",
                        background: "#F8FAFC",
                        borderRadius: "12px",
                        border: "1px solid var(--border)",
                        display: "flex",
                        flexDirection: "column",
                        maxHeight: "calc(100vh - 220px)",
                      }}
                    >
                      <div
                        style={{
                          padding: "16px",
                          borderBottom: "1px solid var(--border)",
                          fontWeight: 600,
                          color: "var(--t2)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        {col.label}
                        <span
                          style={{
                            background: "var(--border)",
                            color: "var(--t2)",
                            fontSize: "12px",
                            padding: "2px 8px",
                            borderRadius: "12px",
                          }}
                        >
                          {colPatients.length}
                        </span>
                      </div>
                      <div
                        style={{
                          padding: "12px",
                          overflowY: "auto",
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                        }}
                      >
                        {colPatients.map((p) => {
                          const isCrit = p.alert === "DTQ_POSITIVE";
                          const isWarn = p.alert && !isCrit;
                          return (
                            <div
                              key={p.id}
                              onClick={() => onOpenPatient(p.id)}
                              style={{
                                cursor: "pointer",
                                background: "#fff",
                                padding: "16px",
                                borderRadius: "12px",
                                border: `1px solid var(--border)`,
                                borderLeft: `4px solid ${isCrit ? "#EF4444" : isWarn ? "#F59E0B" : "#38BDF8"}`,
                                boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
                                transition: "box-shadow 0.2s",
                              }}
                              onMouseOver={(e) =>
                                (e.currentTarget.style.boxShadow =
                                  "0 4px 12px rgba(0,0,0,0.05)")
                              }
                              onMouseOut={(e) =>
                                (e.currentTarget.style.boxShadow =
                                  "0 2px 4px rgba(0,0,0,0.02)")
                              }
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  marginBottom: "8px",
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 600,
                                    fontSize: "13px",
                                    color: "var(--t1)",
                                  }}
                                >
                                  <DLPWrapper onViolation={onDLPViolation}>
                                    {p.id}
                                  </DLPWrapper>
                                </div>
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--t3)",
                                      background: "#F1F5F9",
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                    }}
                                  >
                                    {getSiteId(p)}
                                  </div>
                                  {p.protocolVersion && (
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        color: "#8B5CF6",
                                        background: "#EDE9FE",
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {p.protocolVersion}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "var(--t2)",
                                  marginBottom: "12px",
                                }}
                              >
                                <Shield
                                  size={12}
                                  style={{
                                    display: "inline",
                                    verticalAlign: "text-bottom",
                                    marginRight: "4px",
                                    color: "#10B981",
                                  }}
                                />
                                Secure ID:{" "}
                                <span
                                  style={{
                                    fontFamily: "var(--fm)",
                                    color: "var(--t3)",
                                  }}
                                >
                                  {btoa(p.id).substring(0, 8)}...
                                </span>
                              </div>
                              {isCrit && (
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#DC2626",
                                    background: "#FEF2F2",
                                    padding: "6px 8px",
                                    borderRadius: "4px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <AlertTriangle size={12} /> DTQ+ Window Active
                                </div>
                              )}
                              {isWarn && (
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#D97706",
                                    background: "#FFFBEB",
                                    padding: "6px 8px",
                                    borderRadius: "4px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <Clock size={12} /> Action Needed
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {colPatients.length === 0 && (
                          <div
                            style={{
                              textAlign: "center",
                              padding: "24px 0",
                              color: "var(--t3)",
                              fontSize: "13px",
                            }}
                          >
                            No subjects
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "tracker" && trackerView === "grid" && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "13px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: "#F8FAFC",
                        borderBottom: "1px solid var(--border)",
                        textAlign: "left",
                        color: "var(--t3)",
                      }}
                    >
                      <th style={{ padding: "16px", fontWeight: 500 }}>
                        Secure ID
                      </th>
                      <th style={{ padding: "16px", fontWeight: 500 }}>Site</th>
                      <th style={{ padding: "16px", fontWeight: 500 }}>
                        Protocol V.
                      </th>
                      <th style={{ padding: "16px", fontWeight: 500 }}>
                        Phase
                      </th>
                      <th style={{ padding: "16px", fontWeight: 500 }}>
                        Next Visit
                      </th>
                      <th style={{ padding: "16px", fontWeight: 500 }}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => onOpenPatient(p.id)}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          cursor: "pointer",
                        }}
                      >
                        <td
                          style={{
                            padding: "16px",
                            fontFamily: "var(--fm)",
                            color: "#3B82F6",
                          }}
                        >
                          {btoa(p.id).substring(0, 8)}
                        </td>
                        <td style={{ padding: "16px" }}>
                          {getSiteId(p)}
                        </td>
                        <td style={{ padding: "16px" }}>
                          {p.protocolVersion ? (
                            <span
                              style={{
                                background: "#EDE9FE",
                                color: "#8B5CF6",
                                padding: "2px 8px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: 600,
                              }}
                            >
                              {p.protocolVersion}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td style={{ padding: "16px" }}>{p.phaseLabel}</td>
                        <td style={{ padding: "16px" }}>
                          {p.nextVisit
                            ? new Date(p.nextVisit).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )
                            : "N/A"}
                        </td>
                        <td style={{ padding: "16px" }}>
                          {p.alert === "DTQ_POSITIVE" ? (
                            <span
                              style={{
                                color: "#DC2626",
                                background: "#FEF2F2",
                                padding: "4px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: 500,
                              }}
                            >
                              Critical
                            </span>
                          ) : p.alert ? (
                            <span
                              style={{
                                color: "#D97706",
                                background: "#FFFBEB",
                                padding: "4px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: 500,
                              }}
                            >
                              Warning
                            </span>
                          ) : (
                            <span
                              style={{
                                color: "#10B981",
                                background: "#ECFDF5",
                                padding: "4px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: 500,
                              }}
                            >
                              On Track
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredPatients.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            padding: "24px",
                            textAlign: "center",
                            color: "var(--t3)",
                          }}
                        >
                          No subjects found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "tracker" && trackerView === "calendar" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: "16px",
                }}
              >
                {Array(14)
                  .fill(0)
                  .map((_, i) => {
                    const d = new Date(getToday());
                    d.setDate(d.getDate() + i);
                    const dayPatients = filteredPatients.filter((p) => {
                      if (!p.nextVisit) return false;
                      const nv = new Date(p.nextVisit);
                      return (
                        nv.getFullYear() === d.getFullYear() &&
                        nv.getMonth() === d.getMonth() &&
                        nv.getDate() === d.getDate()
                      );
                    });

                    return (
                      <div
                        key={i}
                        style={{
                          background: "#fff",
                          borderRadius: "8px",
                          border: "1px solid var(--border)",
                          minHeight: "120px",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <div
                          style={{
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--border)",
                            background: "#F8FAFC",
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "var(--t2)",
                            borderTopLeftRadius: "8px",
                            borderTopRightRadius: "8px",
                          }}
                        >
                          {d.toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                        <div
                          style={{
                            padding: "8px",
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          {dayPatients.map((p) => (
                            <div
                              key={p.id}
                              onClick={() => onOpenPatient(p.id)}
                              style={{
                                fontSize: "11px",
                                padding: "4px 8px",
                                background:
                                  p.alert === "DTQ_POSITIVE"
                                    ? "#FEF2F2"
                                    : "#F1F5F9",
                                color:
                                  p.alert === "DTQ_POSITIVE"
                                    ? "#DC2626"
                                    : "#334155",
                                borderRadius: "4px",
                                cursor: "pointer",
                                border: `1px solid ${p.alert === "DTQ_POSITIVE" ? "#FECACA" : "var(--border)"}`,
                              }}
                            >
                              {btoa(p.id).substring(0, 8)} ({getSiteId(p)}
                              )
                            </div>
                          ))}
                          {dayPatients.length === 0 && (
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--t3)",
                                textAlign: "center",
                                marginTop: "8px",
                              }}
                            >
                              No visits
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Risk Intelligence */}
            {activeTab === "risk" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr",
                  gap: "24px",
                }}
              >
                <div
                  style={{
                    background: "#fff",
                    borderRadius: "12px",
                    border: "1px solid var(--border)",
                    padding: "24px",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "13.5px",
                      fontWeight: 600,
                      marginBottom: "20px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <AlertTriangle size={18} color="#EF4444" /> Subject Risk
                    Prioritization
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    {riskIntelligence.map((risk) => (
                      <div
                        key={risk.id}
                        onClick={() => onOpenPatient(risk.id)}
                        style={{
                          cursor: "pointer",
                          padding: "16px",
                          borderRadius: "8px",
                          border: "1px solid var(--border)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          background:
                            risk.score > 70
                              ? "#FEF2F2"
                              : risk.score > 30
                                ? "#FFFBEB"
                                : "#fff",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "16px",
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              width: "48px",
                              height: "48px",
                              borderRadius: "50%",
                              background:
                                risk.score > 70
                                  ? "#FEE2E2"
                                  : risk.score > 30
                                    ? "#FEF3C7"
                                    : "#F1F5F9",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "14px",
                              fontWeight: 700,
                              color:
                                risk.score > 70
                                  ? "#991B1B"
                                  : risk.score > 30
                                    ? "#92400E"
                                    : "#475569",
                              border: `2px solid ${risk.score > 70 ? "#EF4444" : risk.score > 30 ? "#F59E0B" : "var(--border)"}`,
                            }}
                          >
                            <span style={{ margin: "auto" }}>{risk.score}</span>
                          </div>
                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "14px",
                                color: "var(--t1)",
                              }}
                            >
                              {risk.id}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "4px",
                                flexWrap: "wrap",
                                marginTop: "4px",
                              }}
                            >
                              {risk.reasons.map((r, i) => (
                                <span
                                  key={i}
                                  style={{
                                    fontSize: "10px",
                                    background: "rgba(0,0,0,0.05)",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    color: "var(--t3)",
                                  }}
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <ChevronRight size={16} color="#94A3B8" />
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "24px",
                  }}
                >
                  <div
                    style={{
                      background: "#fff",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                      padding: "24px",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 600,
                        marginBottom: "20px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <Calendar size={18} color="#3B82F6" /> Critical Windows
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      {filteredPatients
                        .filter((p) => p.alert === "DTQ_POSITIVE")
                        .map((p) => (
                          <div
                            key={p.id}
                            style={{
                              padding: "12px",
                              background: "#FEF2F2",
                              borderRadius: "8px",
                              borderLeft: "4px solid #EF4444",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "13px",
                                color: "#991B1B",
                              }}
                            >
                              {p.id} — RV Window
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "#B91C1C",
                                marginTop: "2px",
                              }}
                            >
                              Randomization required within 48h+6h of onset.
                            </div>
                          </div>
                        ))}
                      {filteredPatients.filter(
                        (p) => p.alert === "DTQ_POSITIVE",
                      ).length === 0 && (
                        <div
                          style={{
                            textAlign: "center",
                            padding: "20px",
                            color: "var(--t3)",
                            fontSize: "13px",
                            border: "1px dashed var(--border)",
                            borderRadius: "8px",
                          }}
                        >
                          No active critical windows
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#fff",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                      padding: "24px",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 600,
                        marginBottom: "20px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <TrendingUp size={18} color="#8B5CF6" /> Risk Trends
                    </h3>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--t3)",
                        lineHeight: 1.6,
                      }}
                    >
                      Global risk index is <strong>stable</strong>. Site ALTESA
                      shows a slight increase in overdue tasks (+5% vs last
                      sync).
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Analytics */}
            {activeTab === "analytics" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "24px",
                }}
              >
                {/* Top Row: Projections */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      background: "#fff",
                      padding: "20px",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--t3)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        marginBottom: "8px",
                      }}
                    >
                      Enrollment Rate
                    </div>
                    <div
                      style={{
                        fontSize: "24px", fontFamily: "var(--fd)",
                        fontWeight: 700,
                        color: "var(--t1)",
                      }}
                    >
                      {analyticsData.ratePerDay.toFixed(2)}{" "}
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: 400,
                          color: "var(--t3)",
                        }}
                      >
                        subs/day
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      background: "#fff",
                      padding: "20px",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--t3)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        marginBottom: "8px",
                      }}
                    >
                      Projected Target Date
                    </div>
                    <div
                      style={{
                        fontSize: "24px", fontFamily: "var(--fd)",
                        fontWeight: 700,
                        color: "#3B82F6",
                      }}
                    >
                      {analyticsData.projectedDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--t3)",
                        marginTop: "4px",
                      }}
                    >
                      To reach target of {analyticsData.target} subjects
                    </div>
                  </div>
                  <div
                    style={{
                      background: "#fff",
                      padding: "20px",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--t3)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        marginBottom: "8px",
                      }}
                    >
                      Target Completion
                    </div>
                    <div
                      style={{
                        fontSize: "24px", fontFamily: "var(--fd)",
                        fontWeight: 700,
                        color: "#10B981",
                      }}
                    >
                      {Math.round(
                        (patients.length / analyticsData.target) * 100,
                      )}
                      %
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: "6px",
                        background: "var(--border)",
                        borderRadius: "3px",
                        marginTop: "8px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          background: "#10B981",
                          width: `${(patients.length / analyticsData.target) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Middle Row: Charts */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr",
                    gap: "24px",
                  }}
                >
                  <div
                    style={{
                      background: "#fff",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                      padding: "24px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "24px",
                      }}
                    >
                      <h3
                        style={{ fontSize: "13.5px", fontWeight: 600, margin: 0 }}
                      >
                        Enrollment Trend & Projection
                      </h3>
                      <div
                        style={{
                          display: "flex",
                          gap: "16px",
                          fontSize: "12px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <div
                            style={{
                              width: "12px",
                              height: "3px",
                              background: "#3B82F6",
                            }}
                          ></div>
                          <span style={{ color: "var(--t3)" }}>Actual</span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <div
                            style={{
                              width: "12px",
                              height: "3px",
                              background: "#3B82F6",
                              borderTop: "2px dashed #3B82F6",
                              backgroundClip: "padding-box",
                              backgroundColor: "transparent",
                            }}
                          ></div>
                          <span style={{ color: "var(--t3)" }}>Projected</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ height: "300px", width: "100%" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={analyticsData.trend}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#F1F5F9"
                          />
                          <XAxis
                            dataKey="date"
                            fontSize={11}
                            tickMargin={10}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            fontSize={11}
                            axisLine={false}
                            tickLine={false}
                            domain={[0, analyticsData.target + 5]}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: "8px",
                              border: "none",
                              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                            }}
                            labelStyle={{
                              fontWeight: 600,
                              marginBottom: "4px",
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="actual"
                            stroke="#3B82F6"
                            strokeWidth={3}
                            dot={{
                              r: 4,
                              fill: "#3B82F6",
                              strokeWidth: 2,
                              stroke: "#fff",
                            }}
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

                  <div
                    style={{
                      background: "#fff",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                      padding: "24px",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 600,
                        marginBottom: "24px",
                      }}
                    >
                      Phase Distribution
                    </h3>
                    <div style={{ height: "300px", width: "100%" }}>
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
                <div
                  style={{
                    background: "#fff",
                    borderRadius: "12px",
                    border: "1px solid var(--border)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "16px 24px",
                      borderBottom: "1px solid var(--border)",
                      background: "#F8FAFC",
                    }}
                  >
                    <h3
                      style={{ fontSize: "13.5px", fontWeight: 600, margin: 0 }}
                    >
                      Site Benchmarking
                    </h3>
                  </div>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "13px",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          textAlign: "left",
                          color: "var(--t3)",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <th style={{ padding: "16px 24px", fontWeight: 600 }}>
                          Site Name
                        </th>
                        <th style={{ padding: "16px 24px", fontWeight: 600 }}>
                          Subjects
                        </th>
                        <th style={{ padding: "16px 24px", fontWeight: 600 }}>
                          Compliance Index
                        </th>
                        <th style={{ padding: "16px 24px", fontWeight: 600 }}>
                          Avg Tasks/Subject
                        </th>
                        <th style={{ padding: "16px 24px", fontWeight: 600 }}>
                          Open Queries
                        </th>
                        <th style={{ padding: "16px 24px", fontWeight: 600 }}>
                          Last Sync
                        </th>
                        <th style={{ padding: "16px 24px", fontWeight: 600 }}>
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsData.siteStats.map((site) => (
                        <tr
                          key={site.name}
                          style={{ borderBottom: "1px solid #F1F5F9" }}
                        >
                          <td style={{ padding: "16px 24px", fontWeight: 600 }}>
                            {site.name}
                          </td>
                          <td style={{ padding: "16px 24px" }}>
                            {site.subjects}
                          </td>
                          <td style={{ padding: "16px 24px" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              <div
                                style={{
                                  flex: 1,
                                  height: "6px",
                                  background: "var(--border)",
                                  borderRadius: "3px",
                                  overflow: "hidden",
                                  maxWidth: "100px",
                                }}
                              >
                                <div
                                  style={{
                                    height: "100%",
                                    background:
                                      site.compliance > 80
                                        ? "#10B981"
                                        : site.compliance > 50
                                          ? "#F59E0B"
                                          : "#EF4444",
                                    width: `${site.compliance}%`,
                                  }}
                                ></div>
                              </div>
                              <span style={{ fontWeight: 600 }}>
                                {site.compliance}%
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: "16px 24px", color: "var(--t3)" }}>
                            {site.avgTasksCompleted}
                          </td>
                          <td style={{ padding: "16px 24px" }}>
                            {site.queries}
                          </td>
                          <td style={{ padding: "16px 24px", color: "var(--t3)", fontSize: "12px" }}>
                            {site.lastSync}
                          </td>
                          <td style={{ padding: "16px 24px" }}>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: 600,
                                background:
                                  site.compliance > 80 ? "#ECFDF5" : "#FEF2F2",
                                color:
                                  site.compliance > 80 ? "#059669" : "#DC2626",
                              }}
                            >
                              {site.compliance > 80
                                ? "High Performance"
                                : "Needs Attention"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Security Settings & Configuration Overlay */}
            {isSettingsOpen && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 9999,
                  background: "#F8FAFC",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <header
                  style={{
                    height: "72px",
                    background: "#fff",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 32px",
                    justifyContent: "space-between",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                    }}
                  >
                    <div
                      style={{
                        padding: "8px",
                        background: "#F1F5F9",
                        borderRadius: "8px",
                      }}
                    >
                      <Settings size={20} color="#475569" />
                    </div>
                    <h2
                      style={{
                        fontSize: "20px", fontFamily: "var(--fd)",
                        fontWeight: 600,
                        color: "var(--t1)",
                        margin: 0,
                      }}
                    >
                      Global Study Configuration
                    </h2>
                  </div>
                  <button
                    aria-label="Close settings"
                    onClick={() => setIsSettingsOpen(false)}
                    style={{
                      background: "#F1F5F9",
                      border: "1px solid var(--border)",
                      padding: "10px",
                      borderRadius: "8px",
                      color: "var(--t3)",
                      cursor: "pointer",
                      display: "flex",
                    }}
                  >
                    <X size={20} />
                  </button>
                </header>

                <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
                  {/* Sidebar Settings Navigation */}
                  <div
                    style={{
                      width: "280px",
                      background: "#fff",
                      borderRight: "1px solid var(--border)",
                      padding: "32px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--t3)",
                        padding: "0 16px",
                        marginBottom: "8px",
                        letterSpacing: "0.05em",
                      }}
                    >
                      SYSTEM SETTINGS
                    </div>

                    <button
                      onClick={() => setSettingsTab("protocol")}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        border: "none",
                        background:
                          settingsTab === "protocol"
                            ? "#F1F5F9"
                            : "transparent",
                        color:
                          settingsTab === "protocol" ? "var(--t1)" : "#475569",
                        fontWeight: 600,
                        fontSize: "14px",
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        gap: "12px",
                        alignItems: "center",
                        transition: "all 0.2s",
                      }}
                    >
                      <FileText size={18} /> Protocol Amendments
                    </button>
                    <button
                      id="manager-tour-keys"
                      onClick={() => {
                        setSettingsTab("keys");
                        if (tourStep === 2) nextTourStep();
                      }}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        border: "none",
                        background:
                          settingsTab === "keys" ? "#F1F5F9" : "transparent",
                        color: settingsTab === "keys" ? "var(--t1)" : "#475569",
                        fontWeight: 600,
                        fontSize: "14px",
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        gap: "12px",
                        alignItems: "center",
                        transition: "all 0.2s",
                      }}
                    >
                      <Key size={18} /> Cryptographic Keys
                    </button>
                    <button
                      id="manager-tour-compliance"
                      onClick={() => {
                        setSettingsTab("audit");
                        if (tourStep === 3) nextTourStep();
                      }}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        border: "none",
                        background:
                          settingsTab === "audit" ? "#F1F5F9" : "transparent",
                        color: settingsTab === "audit" ? "var(--t1)" : "#475569",
                        fontWeight: 600,
                        fontSize: "14px",
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        gap: "12px",
                        alignItems: "center",
                        transition: "all 0.2s",
                        width: "100%",
                      }}
                    >
                      <Terminal size={18} /> Data & Compliance
                    </button>
                  </div>

                  {/* Main Panel Content */}
                  <div
                    style={{
                      flex: 1,
                      padding: "48px",
                      overflowY: "auto",
                      background: "#F8FAFC",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "900px",
                        margin: "0 auto",
                        display: "flex",
                        flexDirection: "column",
                        gap: "24px",
                      }}
                    >
                      {/* Protocol Amendments Configurator */}
                      <div
                        style={{
                          display:
                            settingsTab === "protocol" ? "block" : "none",
                          background: "#fff",
                          borderRadius: "12px",
                          border: "1px solid var(--border)",
                          padding: "32px",
                          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "24px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                            }}
                          >
                            <div
                              style={{
                                background: "#F3E8FF",
                                padding: "12px",
                                borderRadius: "12px",
                              }}
                            >
                              <FileText size={24} color="#7E22CE" />
                            </div>
                            <div>
                              <h3
                                style={{
                                  fontSize: "20px", fontFamily: "var(--fd)",
                                  fontWeight: 600,
                                  color: "var(--t1)",
                                  margin: 0,
                                }}
                              >
                                Protocol Amendments
                              </h3>
                              <p
                                style={{
                                  fontSize: "14px",
                                  color: "var(--t3)",
                                  margin: "4px 0 0 0",
                                }}
                              >
                                Manage study protocol versions and phase
                                settings dynamically
                              </p>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              className="btn"
                              style={{
                                background: "#fff",
                                color: "var(--t1)",
                                border: "1px solid var(--border)",
                                padding: "8px 16px",
                                borderRadius: "6px",
                                fontSize: "13px",
                                fontWeight: 600,
                                display: "flex",
                                gap: "6px",
                                alignItems: "center",
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                // Export amendments 
                                const blob = new Blob([JSON.stringify(protocolVersions, null, 2)], { type: "application/json" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `ALTESA_Amendments_${new Date().toISOString().split("T")[0]}.json`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              }}
                            >
                              <Download size={16} /> Export
                            </button>
                            <label
                              className="btn"
                              style={{
                                background: "#fff",
                                color: "var(--t1)",
                                border: "1px solid var(--border)",
                                padding: "8px 16px",
                                borderRadius: "6px",
                                fontSize: "13px",
                                fontWeight: 600,
                                display: "flex",
                                gap: "6px",
                                alignItems: "center",
                                cursor: "pointer",
                              }}
                            >
                              <Upload size={16} /> Import
                              <input
                                type="file"
                                accept=".json"
                                style={{ display: "none" }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setIsProcessing({ active: true, message: "Validating Protocol Integrity Map..." });
                                    const reader = new FileReader();
                                    reader.onload = (evt) => {
                                      try {
                                        const imported = JSON.parse(evt.target?.result as string);
                                        if (Array.isArray(imported) && imported.length > 0 && imported[0].id) {
                                          // Idempotent merge: incoming versions upsert by ID, existing local-only versions preserved
                                          setProtocolVersions(prev => {
                                            const merged: Record<string, ProtocolAmendment> = {};
                                            prev.forEach(p => { merged[p.id] = p; });
                                            (imported as ProtocolAmendment[]).forEach(p => { merged[p.id] = p; });
                                            return Object.values(merged);
                                          });
                                          showToast(`${imported.length} amendment(s) imported successfully.`);
                                        } else {
                                          showToast("Invalid file format — expected a non-empty JSON array of amendments.", "error");
                                        }
                                      } catch {
                                        showToast("Failed to parse file. Ensure it is valid JSON.", "error");
                                      } finally {
                                        setIsProcessing({ active: false, message: "" });
                                        if (e.target) e.target.value = '';
                                      }
                                    };
                                    reader.readAsText(file);
                                  }
                                }}
                              />
                            </label>
                            <button
                              className="btn"
                              style={{
                                background: "#7E22CE",
                                color: "#fff",
                                border: "none",
                                padding: "8px 16px",
                                borderRadius: "6px",
                                fontSize: "13px",
                                fontWeight: 600,
                                display: "flex",
                                gap: "6px",
                                alignItems: "center",
                              }}
                              onClick={() => openAmendmentModal()}
                            >
                              <Plus size={16} /> New Version
                            </button>
                          </div>
                        </div>

                        <div
                          style={{
                            background: "#F8FAFC",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            overflow: "hidden",
                          }}
                        >
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              fontSize: "14px",
                            }}
                          >
                            <thead>
                              <tr
                                style={{
                                  background: "#F1F5F9",
                                  borderBottom: "1px solid var(--border)",
                                  color: "var(--t2)",
                                  textAlign: "left",
                                }}
                              >
                                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Version</th>
                                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Label</th>
                                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Release Date</th>
                                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Effective Date</th>
                                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Status</th>
                                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {protocolVersions.length === 0 ? (
                                <tr>
                                  <td colSpan={6} style={{ padding: "48px 24px", textAlign: "center" }}>
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                                      <span style={{ fontSize: "32px" }}>📄</span>
                                      <p style={{ margin: 0, fontSize: "14px", color: "var(--t2)", fontWeight: 600 }}>No protocol versions defined</p>
                                      <p style={{ margin: 0, fontSize: "13px", color: "var(--t3)" }}>Click <b>+ New Version</b> to create the first protocol amendment.</p>
                                    </div>
                                  </td>
                                </tr>
                              ) : protocolVersions.map((pv, i) => (
                                <tr
                                  key={pv.id}
                                  style={{
                                    borderBottom:
                                      i < protocolVersions.length - 1
                                        ? "1px solid var(--border)"
                                        : "none",
                                  }}
                                >
                                  <td
                                    style={{
                                      padding: "16px",
                                      fontWeight: 600,
                                      color: "var(--t1)",
                                    }}
                                  >
                                    {pv.id}
                                  </td>
                                  <td
                                    style={{
                                      padding: "16px",
                                      color: "var(--t2)",
                                    }}
                                  >
                                    {pv.label}
                                  </td>
                                  <td
                                    style={{
                                      padding: "16px",
                                      color: "var(--t2)",
                                    }}
                                  >
                                    {pv.releaseDate}
                                  </td>
                                  <td style={{ padding: "16px", color: "var(--t2)" }}>
                                    {pv.effectiveDate ?? <span style={{ color: "var(--t3)", fontStyle: "italic" }}>Not set</span>}
                                  </td>
                                  <td style={{ padding: "16px" }}>
                                    {(() => {
                                      const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
                                        draft:      { bg: '#F1F5F9', color: '#64748B', label: 'Draft' },
                                        submitted:  { bg: '#EFF6FF', color: '#2563EB', label: 'Submitted' },
                                        approved:   { bg: '#F0FDF4', color: '#15803D', label: 'Approved' },
                                        active:     { bg: '#DCFCE7', color: '#16A34A', label: '● Active' },
                                        superseded: { bg: '#FFF7ED', color: '#C2410C', label: 'Superseded' },
                                        legacy:     { bg: '#F1F5F9', color: '#94A3B8', label: 'Legacy' },
                                      };
                                      const s = STATUS_STYLE[pv.status] ?? STATUS_STYLE.draft;
                                      return (
                                        <span style={{
                                          background: s.bg, color: s.color,
                                          padding: '4px 10px', borderRadius: '12px',
                                          fontSize: '12px', fontWeight: 700,
                                        }}>{s.label}</span>
                                      );
                                    })()}
                                  </td>
                                  <td style={{ padding: "16px" }}>
                                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                                      <button
                                        style={{
                                          background: "transparent", color: "#7E22CE",
                                          border: "none", fontWeight: 600,
                                          cursor: "pointer", fontSize: "13px",
                                          display: "flex", gap: "4px", alignItems: "center",
                                        }}
                                        onClick={() => { setEditingVersion(pv.id); setVisualEditorOpen(true); }}
                                      >
                                        <Settings2 size={14} /> Visual Editor
                                      </button>
                                      {pv.status !== "active" ? (
                                        <button
                                          style={{
                                            background: "transparent",
                                            color: "#3B82F6", border: "none",
                                            fontWeight: 600, cursor: "pointer", fontSize: "13px",
                                          }}
                                          onClick={() => {
                                            const impacted = patients.filter(p => p.protocolVersion && p.protocolVersion !== pv.id).length;
                                            const confirmMsg = impacted > 0
                                              ? `Activate "${pv.id}"? ${impacted} patient(s) enrolled under other versions remain on their current version.`
                                              : `Activate "${pv.id}" as the current protocol version?`;
                                            if (!window.confirm(confirmMsg)) return;
                                            setProtocolVersions((prev) =>
                                              prev.map((p) => ({
                                                ...p,
                                                status: p.id === pv.id ? "active" : p.status === "active" ? "superseded" : p.status,
                                              }))
                                            );
                                            setAuditLogs((logs) => [
                                              {
                                                timestamp: new Date().toISOString(),
                                                event: `Protocol version activated: ${pv.id} ("${pv.label}"). Previous active version superseded. Patients on other versions: ${impacted}.`,
                                                type: "security",
                                              },
                                              ...logs,
                                            ]);
                                          }}
                                        >
                                          Make Active
                                        </button>
                                      ) : (
                                        <span
                                          style={{
                                            color: "var(--t3)",
                                            fontSize: "13px",
                                            fontWeight: 600,
                                          }}
                                        >
                                          Active Version
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Export Key Section */}
                      <div
                        style={{
                          display: settingsTab === "keys" ? "block" : "none",
                          background: "#fff",
                          borderRadius: "12px",
                          border: "1px solid var(--border)",
                          padding: "32px",
                          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            marginBottom: "24px",
                          }}
                        >
                          <div
                            style={{
                              background: "#FEF3C7",
                              padding: "12px",
                              borderRadius: "12px",
                            }}
                          >
                            <Key size={24} color="#D97706" />
                          </div>
                          <div>
                            <h3
                              style={{
                                fontSize: "20px", fontFamily: "var(--fd)",
                                fontWeight: 600,
                                color: "var(--t1)",
                                margin: 0,
                              }}
                            >
                              Export Public Key
                            </h3>
                            <p
                              style={{
                                fontSize: "14px",
                                color: "var(--t3)",
                                margin: "4px 0 0 0",
                              }}
                            >
                              Share this key with Coordinators to allow them to
                              encrypt data for you
                            </p>
                          </div>
                        </div>

                        <div
                          style={{
                            background: "#F8FAFC",
                            padding: "16px",
                            borderRadius: "8px",
                            border: "1px dashed var(--border)",
                            marginBottom: "24px",
                          }}
                        >
                          <p
                            style={{
                              fontSize: "13px",
                              color: "var(--t2)",
                              margin: 0,
                              lineHeight: 1.5,
                            }}
                          >
                            Your public key is required by Coordinators to
                            securely encrypt patient data before sending it to
                            you. Exporting this key is safe; it cannot be used
                            to decrypt data.
                          </p>
                        </div>

                        <button
                          className="btn btn-primary"
                          style={{
                            width: "100%",
                            padding: "12px",
                            fontSize: "14px",
                            background: "#F59E0B",
                            color: "#fff",
                            border: "none",
                            borderRadius: "8px",
                            fontWeight: 600,
                          }}
                          onClick={() => {
                            if (!managerKeys) {
                              showToast("Manager keys not initialized.", "error");
                              return;
                            }
                            const keyData = JSON.stringify({
                              encPublicKey: managerKeys.encPublicKey,
                              signPublicKey: managerKeys.signPublicKey,
                            });
                            const blob = new Blob([keyData], {
                              type: "text/plain",
                            });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `Manager_Public_Key.txt`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                        >
                          <Shield
                            size={16}
                            style={{
                              display: "inline",
                              verticalAlign: "text-bottom",
                              marginRight: "6px",
                            }}
                          />{" "}
                          Download Public Key
                        </button>
                      </div>

                      <div
                        style={{
                          display: settingsTab === "keys" ? "flex" : "none",
                          marginTop: "24px",
                          padding: "16px",
                          background: "#F0F9FF",
                          borderRadius: "8px",
                          border: "1px solid #BAE6FD",
                          gap: "12px",
                        }}
                      >
                        <Shield
                          size={20}
                          color="#0369A1"
                          style={{ flexShrink: 0 }}
                        />
                        <div
                          style={{
                            fontSize: "13px",
                            color: "#0369A1",
                            lineHeight: 1.5,
                          }}
                        >
                          <strong>Access & Recovery:</strong> This instance uses{" "}
                          <strong>Firebase Authentication</strong> (email/password).
                          Coordinators authenticate with the site shared account on
                          first use, then use their local PIN for daily access. PIN
                          recovery also requires Firebase credentials. To add,
                          remove, or reset site accounts, use the Firebase Console.
                        </div>
                      </div>

                      {/* Firebase Identity Provider — replaces Master Key File / JSON config */}
                      <div
                        style={{
                          display: settingsTab === "keys" ? "block" : "none",
                          background: "#F0F9FF",
                          borderRadius: "12px",
                          border: "1px solid #BAE6FD",
                          padding: "32px",
                          marginTop: "48px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
                          <div style={{ background: "#0EA5E9", padding: "12px", borderRadius: "12px" }}>
                            <Shield size={24} color="#fff" />
                          </div>
                          <div>
                            <h3 style={{ fontSize: "20px", fontFamily: "var(--fd)", fontWeight: 600, color: "var(--t1)", margin: 0 }}>
                              Identity Provider
                            </h3>
                            <p style={{ fontSize: "14px", color: "var(--t3)", margin: "4px 0 0 0" }}>
                              Firebase Authentication — Hybrid-Auth Model
                            </p>
                          </div>
                        </div>

                        <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #BAE6FD", overflow: "hidden", marginBottom: "20px" }}>
                          {[
                            ["Project", "altesa-clinical-ops"],
                            ["Auth Domain", "altesa-clinical-ops.firebaseapp.com"],
                            ["Method", "Email / Password"],
                            ["PHI in cloud", "None — keys derived locally from UID"],
                          ].map(([label, value]) => (
                            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #E0F2FE" }}>
                              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--t2)" }}>{label}</span>
                              <span style={{ fontSize: "13px", color: "var(--t3)", fontFamily: label === "Auth Domain" || label === "Project" ? "var(--fm)" : "inherit" }}>{value}</span>
                            </div>
                          ))}
                        </div>

                        <p style={{ fontSize: "13px", color: "#0369A1", lineHeight: 1.6, marginBottom: "20px" }}>
                          User accounts are managed exclusively via the Firebase Console. To add a new site, create a new user with a site email. To revoke access, disable or delete the account — it takes effect immediately on the next login attempt.
                        </p>

                        <a
                          href="https://console.firebase.google.com/project/altesa-clinical-ops/authentication/users"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#0EA5E9", color: "#fff", padding: "10px 20px", borderRadius: "8px", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}
                        >
                          Open Firebase Console →
                        </a>
                      </div>


                      {/* DATA & COMPLIANCE VAULT */}
                      <div
                        style={{
                          display: settingsTab === "audit" ? "block" : "none",
                        }}
                      >
                        <ComplianceVault auditLogs={auditLogs} managerKeysPresent={!!managerKeys} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Queries */}
            {activeTab === "queries" && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "16px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#F8FAFC",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "13.5px",
                      fontWeight: 600,
                      color: "var(--t1)",
                      margin: 0,
                    }}
                  >
                    Active Queries
                  </h3>
                  <div
                    style={{
                      position: "relative",
                      zIndex: tourStep === 6 ? 1000 : 1,

                      borderRadius: "6px",
                    }}
                  >
                    <button
                      id="manager-tour-export"
                      className="btn btn-primary"
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                        background: "#8B5CF6",
                        color: "#fff",
                        border: "none",
                      }}
                      onClick={async () => {
                        try {
                          if (!managerKeys)
                            throw new Error("Manager keys not initialized.");

                          let crcEncKey = "";
                          const { keysStore } = await import('@/lib/db');
                          let storedCrcKeys = await keysStore.getItem<any>("crc_keys");
                          if (!storedCrcKeys) {
                              const keys = await generateCRCKeys();
                              await keysStore.setItem("crc_keys", keys);
                              storedCrcKeys = keys;
                          }
                          if (storedCrcKeys) {
                            if (storedCrcKeys.encPublicKey) crcEncKey = storedCrcKeys.encPublicKey;
                          }

                          const pkg = await encryptAndSign(
                            filteredQueries,
                            crcEncKey,
                            managerKeys.signPrivateKey,
                          );
                          const blob = new Blob(
                            [JSON.stringify(pkg, null, 2)],
                            {
                              type: "application/json",
                            },
                          );
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `ALTESA_Queries_${new Date().toISOString().split("T")[0]}.enc`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                          if (tourStep === 5) nextTourStep();
                        } catch {
                          // SbD: log operation context only — showToast handles user-visible message.
                          console.error('[ALTESA:Manager] Query export encryption failed.');
                          showToast("Failed to export queries.", "error");
                        }
                      }}
                    >
                      <Download
                        size={14}
                        style={{
                          display: "inline",
                          verticalAlign: "text-bottom",
                          marginRight: "4px",
                        }}
                      />{" "}
                      Export Queries
                    </button>
                  </div>
                </div>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "13px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: "#F8FAFC",
                        borderBottom: "1px solid var(--border)",
                        textAlign: "left",
                        color: "var(--t3)",
                      }}
                    >
                      <th style={{ padding: "16px", fontWeight: 500 }}>
                        Query ID
                      </th>
                      <th style={{ padding: "16px", fontWeight: 500 }}>
                        Subject (Secure ID)
                      </th>
                      <th style={{ padding: "16px", fontWeight: 500 }}>Site</th>
                      <th style={{ padding: "16px", fontWeight: 500 }}>
                        Issue
                      </th>
                      <th style={{ padding: "16px", fontWeight: 500 }}>
                        Status
                      </th>
                      <th style={{ padding: "16px", fontWeight: 500 }}>
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQueries.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            padding: "24px",
                            textAlign: "center",
                            color: "var(--t3)",
                          }}
                        >
                          No active queries
                        </td>
                      </tr>
                    ) : (
                      filteredQueries.map((q) => (
                        <tr
                          key={q.id}
                          onClick={() => onOpenPatient(q.pid)}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            cursor: "pointer",
                          }}
                        >
                          <td
                            style={{
                              padding: "16px",
                              fontFamily: "var(--fm)",
                              color: "#3B82F6",
                            }}
                          >
                            {q.id}
                          </td>
                          <td
                            style={{
                              padding: "16px",
                              fontFamily: "var(--fm)",
                              color: "var(--t3)",
                            }}
                          >
                            {btoa(q.pid).substring(0, 8)}
                          </td>
                          <td style={{ padding: "16px" }}>
                            {patients.find(p => p.id === q.pid)?.siteId ?? q.pid.split("-")[0]}
                          </td>
                          <td style={{ padding: "16px", color: "var(--t2)" }}>
                            {q.issue}
                          </td>
                          <td style={{ padding: "16px" }}>
                            <span
                              style={{
                                background:
                                  q.status === "open" ? "#FEF2F2" : "#FFFBEB",
                                color:
                                  q.status === "open" ? "#DC2626" : "#D97706",
                                padding: "4px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: 500,
                              }}
                            >
                              {q.status.charAt(0).toUpperCase() +
                                q.status.slice(1)}
                            </span>
                          </td>
                          <td style={{ padding: "16px" }}>
                            <button
                              style={{
                                background: "transparent",
                                border: "1px solid var(--border)",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                fontSize: "12px",
                                cursor: "pointer",
                                color: "var(--t2)",
                                fontWeight: 500,
                              }}
                            >
                              {q.status === "open" ? "Review" : "Approve"}
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

          {showAmendmentModal && (
            <div
              className="modal-overlay"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.75)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100,
              }}
              onClick={() => setShowAmendmentModal(false)}
            >
              <div
                className="modal-card"
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  width: "500px",
                  maxWidth: "90vw",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                  overflow: "hidden",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    padding: "24px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#F8FAFC",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        background: "#F3E8FF",
                        padding: "8px",
                        borderRadius: "8px",
                      }}
                    >
                      <FileText size={20} color="#7E22CE" />
                    </div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "20px", fontFamily: "var(--fd)",
                        fontWeight: 600,
                        color: "var(--t1)",
                      }}
                    >
                      Create Amendment
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowAmendmentModal(false)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--t3)",
                      cursor: "pointer",
                    }}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div style={{ padding: "24px" }}>
                  <p
                    style={{
                      fontSize: "14px",
                      color: "var(--t2)",
                      marginBottom: "20px",
                      lineHeight: 1.5,
                    }}
                  >
                    Define a new protocol version. Data collected under previous versions remains untouched (ALCOA+ Original). New patients will be assigned to this version automatically.
                  </p>

                  {/* Version ID — controlled + duplicate check */}
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "6px" }}>
                      Version ID <span style={{ color: "#E8324A" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={amendmentForm.id}
                      onChange={e => setAmendmentForm(f => ({ ...f, id: e.target.value }))}
                      placeholder="v3.0"
                      style={{
                        width: "100%", padding: "10px", borderRadius: "8px",
                        border: `1px solid ${amendmentFormErrors.id ? "#FCA5A5" : "var(--border)"}`,
                        fontSize: "14px", outline: "none",
                      }}
                    />
                    {amendmentFormErrors.id && <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#DC2626" }}>{amendmentFormErrors.id}</p>}
                  </div>

                  {/* Label */}
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "6px" }}>
                      Amendment Label <span style={{ color: "#E8324A" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={amendmentForm.label}
                      onChange={e => setAmendmentForm(f => ({ ...f, label: e.target.value }))}
                      placeholder="Amendment 2: Extended Timeline"
                      style={{
                        width: "100%", padding: "10px", borderRadius: "8px",
                        border: `1px solid ${amendmentFormErrors.label ? "#FCA5A5" : "var(--border)"}`,
                        fontSize: "14px", outline: "none",
                      }}
                    />
                    {amendmentFormErrors.label && <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#DC2626" }}>{amendmentFormErrors.label}</p>}
                  </div>

                  {/* Effective Date */}
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "6px" }}>
                      Effective Date at Site <span style={{ color: "#E8324A" }}>*</span>
                    </label>
                    <input
                      type="date"
                      value={amendmentForm.effectiveDate}
                      onChange={e => setAmendmentForm(f => ({ ...f, effectiveDate: e.target.value }))}
                      style={{
                        width: "100%", padding: "10px", borderRadius: "8px",
                        border: `1px solid ${amendmentFormErrors.effectiveDate ? "#FCA5A5" : "var(--border)"}`,
                        fontSize: "14px", outline: "none",
                      }}
                    />
                    {amendmentFormErrors.effectiveDate && <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#DC2626" }}>{amendmentFormErrors.effectiveDate}</p>}
                  </div>

                  {/* Rationale — ICH E6(R3) required */}
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "6px" }}>
                      Rationale <span style={{ color: "#E8324A" }}>*</span>
                      <span style={{ fontWeight: 400, color: "var(--t3)", marginLeft: "6px" }}>— ICH E6(R3) §4.5.3</span>
                    </label>
                    <textarea
                      value={amendmentForm.rationale}
                      onChange={e => setAmendmentForm(f => ({ ...f, rationale: e.target.value }))}
                      placeholder="e.g. Extended observation window per Sponsor request SR-2026-004 following interim safety review."
                      rows={3}
                      style={{
                        width: "100%", padding: "10px", borderRadius: "8px",
                        border: `1px solid ${amendmentFormErrors.rationale ? "#FCA5A5" : "var(--border)"}`,
                        fontSize: "14px", resize: "vertical", fontFamily: "inherit", outline: "none",
                      }}
                    />
                    {amendmentFormErrors.rationale && <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#DC2626" }}>{amendmentFormErrors.rationale}</p>}
                  </div>

                  {/* Approval Reference — optional */}
                  <div style={{ marginBottom: "24px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "6px" }}>
                      IRB / Regulatory Reference <span style={{ fontWeight: 400, color: "var(--t3)" }}>(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={amendmentForm.approvalReference}
                      onChange={e => setAmendmentForm(f => ({ ...f, approvalReference: e.target.value }))}
                      placeholder="IRB-2026-045"
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "14px", outline: "none" }}
                    />
                  </div>

                  <button
                    className="btn"
                    style={{ width: "100%", padding: "12px", background: "#7E22CE", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600 }}
                    onClick={() => {
                      if (!validateAmendmentForm()) return;
                      setPendingAmendmentData({
                        id:                amendmentForm.id.trim(),
                        label:             amendmentForm.label.trim(),
                        effectiveDate:     amendmentForm.effectiveDate,
                        rationale:         amendmentForm.rationale.trim(),
                        approvalReference: amendmentForm.approvalReference.trim(),
                      });
                      setShowAmendmentModal(false);
                    }}
                  >
                    Draft New Amendment
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sync Modal */}
          {syncModalOpen && (
            <div
              className="modal-overlay"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.75)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100,
              }}
              onClick={() => !isSyncing && setSyncModalOpen(false)}
            >
              <div
                className="modal-card"
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  width: "600px",
                  maxWidth: "90vw",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                  overflow: "hidden",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    padding: "24px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#F8FAFC",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        background: "#E0F2FE",
                        padding: "8px",
                        borderRadius: "8px",
                      }}
                    >
                      <Shield size={24} color="#0284C7" />
                    </div>
                    <div>
                      <h2
                        style={{
                          fontSize: "20px", fontFamily: "var(--fd)",
                          fontWeight: 600,
                          color: "var(--t1)",
                          margin: 0,
                        }}
                      >
                        Secure Data Import
                      </h2>
                      <p
                        style={{
                          fontSize: "13px",
                          color: "var(--t3)",
                          margin: "4px 0 0 0",
                        }}
                      >
                        Import encrypted .enc packages from Coordinators
                      </p>
                    </div>
                  </div>
                  {!isSyncing && (
                    <button
                      aria-label="Close"
                      onClick={() => setSyncModalOpen(false)}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--t3)",
                      }}
                    >
                      <X size={20} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div style={{ padding: "24px" }}>
                  {/* File Drop Zone */}
                  <div
                    style={{
                      border: "2px dashed var(--border)",
                      borderRadius: "12px",
                      padding: "40px 24px",
                      textAlign: "center",
                      background: "#F8FAFC",
                      marginBottom: "24px",
                      position: "relative",
                      transition: "all 0.2s",
                    }}
                  >
                    <input
                      aria-label="Upload encrypted package"
                      type="file"
                      multiple
                      accept=".enc"
                      onChange={handleFileUpload}
                      disabled={isSyncing}
                      style={{
                        position: "absolute",
                        inset: 0,
                        opacity: 0,
                        cursor: isSyncing ? "not-allowed" : "pointer",
                        width: "100%",
                      }}
                    />
                    <Upload
                      size={32}
                      color="#94A3B8"
                      style={{ margin: "0 auto 12px auto" }}
                    />
                    <h3
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 600,
                        color: "var(--t2)",
                        margin: "0 0 4px 0",
                      }}
                    >
                      Select or drop .enc files here
                    </h3>
                    <p
                      style={{ fontSize: "13px", color: "var(--t3)", margin: 0 }}
                    >
                      Supports multiple site packages simultaneously
                    </p>
                  </div>
                  
                  {isSyncing && (
                    <div style={{ marginBottom: "24px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--t2)", marginBottom: "8px", fontWeight: 500 }}>
                        {/* 🕵️ A11y: aria-live announces progress to AT without being too noisy */}
                        <span aria-live="polite" aria-atomic="true">
                          Verification &amp; Decryption Progress — {syncProgress}%
                        </span>
                        <span aria-hidden="true">{syncProgress}%</span>
                      </div>
                      {/* 🕵️ role="progressbar" with ARIA values — WCAG 4.1.2 Name/Role/Value */}
                      <div
                        role="progressbar"
                        aria-valuenow={syncProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Decryption and verification progress"
                        style={{ width: "100%", height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden" }}
                      >
                        <div style={{ width: `${syncProgress}%`, height: "100%", background: "var(--blue)", transition: "width 0.3s ease" }} aria-hidden="true" />
                      </div>
                    </div>
                  )}

                  {/* Audit Log Terminal */}
                  <div
                    id="sync-terminal"
                    style={{
                      background: "var(--t1)",
                      borderRadius: "8px",
                      padding: "16px",
                      minHeight: "160px",
                      maxHeight: "240px",
                      overflowY: "auto",
                      fontFamily: "var(--fm)",
                      fontSize: "12px",
                      color: "#10B981",
                      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "12px",
                        color: "var(--t3)",
                        borderBottom: "1px solid #334155",
                        paddingBottom: "8px",
                      }}
                    >
                      <Terminal size={14} /> <span>Security Audit Log</span>
                    </div>
                    {syncLogs.length === 0 ? (
                      <div style={{ color: "var(--t2)" }}>
                        Waiting for input...
                      </div>
                    ) : (
                      syncLogs.map((log, i) => (
                        <div
                          key={i}
                          style={{ marginBottom: "4px", lineHeight: 1.4 }}
                        >
                          <span style={{ color: "var(--t3)" }}>
                            {new Date()
                              .toISOString()
                              .split("T")[1]
                              .substring(0, 8)}
                          </span>{" "}
                          <span
                            style={{
                              color: log.includes("ERROR")
                                ? "#EF4444"
                                : log.includes("SUCCESS")
                                  ? "#34D399"
                                  : log.includes("CRYPTO")
                                    ? "#38BDF8"
                                    : "#10B981",
                            }}
                          >
                            {log}
                          </span>
                        </div>
                      ))
                    )}
                    {isSyncing && (
                      <div
                        style={{
                          marginTop: "8px",
                          display: "flex",
                          gap: "4px",
                        }}
                      >
                        <div
                          className="crit-pulse"
                          style={{
                            width: "8px",
                            height: "8px",
                            background: "#10B981",
                            animationDuration: "1s",
                          }}
                        ></div>
                        <span style={{ color: "#10B981" }}>Processing...</span>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    padding: "16px 24px",
                    background: "#F8FAFC",
                    borderTop: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={() => setSyncModalOpen(false)}
                    disabled={isSyncing}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: 500,
                      background: isSyncing ? "var(--border)" : "#fff",
                      color: isSyncing ? "#94A3B8" : "#334155",
                      border: "1px solid var(--border)",
                      cursor: isSyncing ? "not-allowed" : "pointer",
                    }}
                  >
                    {syncLogs.length > 0 && !isSyncing ? "Close" : "Cancel"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <VisualProtocolEditor
        isOpen={visualEditorOpen}
        onClose={() => setVisualEditorOpen(false)}
        versionId={editingVersion}
        initialEditorState={protocolVersions.find(p => p.id === editingVersion)?.editorState}
        onSave={(editorState) => {
          setProtocolVersions(prev => prev.map(p =>
            p.id === editingVersion ? { ...p, editorState, rationale: p.rationale ?? editorState.rationale } : p
          ));
          setAuditLogs(logs => [{
            timestamp: new Date().toISOString(),
            event: `Protocol Amendment ${editingVersion} — editor changes saved. ${Object.keys(editorState.rules).length} rules, SoA updated.`,
            type: 'security',
          }, ...logs]);
          showToast(`Amendment ${editingVersion} changes saved.`);
        }}
      />

      {showConfigConfirm && (
        <PinConfirmModal
          message="Generating a new Master Configuration File is a highly sensitive action. Please confirm your Manager Passphrase to proceed."
          onCancel={() => setShowConfigConfirm(false)}
          onConfirm={() => {
            handleGenerateMasterConfig();
            setShowConfigConfirm(false);
          }}
        />
      )}

      {isProcessing.active && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(15, 23, 42, 0.75)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100000,
        }}>
          <div style={{
            background: "#fff",
            padding: "32px",
            borderRadius: "16px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            maxWidth: "400px",
            textAlign: "center"
          }}>
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
            <div style={{
              width: "48px",
              height: "48px",
              border: "4px solid #F1F5F9",
              borderTopColor: "#3B82F6",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: "24px"
            }} />
            <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 600, color: "var(--t1)" }}>
              Processing Security Operation
            </h3>
            <p style={{ margin: 0, fontSize: "14px", color: "var(--t3)", lineHeight: 1.5 }}>
              {isProcessing.message || "Please wait while the cryptographic operation completes..."}
            </p>
          </div>
        </div>
      )}

      {pendingAmendmentData && (
        <PinConfirmModal
          message={`Are you sure you want to create Amendment "${pendingAmendmentData.id}"? This action requires verification.`}
          onCancel={() => {
            setPendingAmendmentData(null);
            setShowAmendmentModal(true); // Bring back the form
          }}
          onConfirm={() => {
            const { id, label, effectiveDate, rationale, approvalReference } = pendingAmendmentData;
            setProtocolVersions((prev) => {
              // Idempotent: if version already exists, update in place instead of duplicating
              const exists = prev.some(p => p.id === id);
              const entry = {
                id, label,
                releaseDate:       new Date().toISOString().split('T')[0],
                effectiveDate,
                status:            'draft' as const,   // Starts as draft — Manager activates when ready
                rationale,
                approvalReference: approvalReference || undefined,
              };
              return exists
                ? prev.map(p => p.id === id ? { ...p, ...entry } : p)
                : [...prev, entry];
            });
            setAuditLogs((logs) => [
              {
                timestamp: new Date().toISOString(),
                event: `Protocol Amendment drafted: ${id} — "${label}". Rationale: ${rationale}${approvalReference ? `. Ref: ${approvalReference}` : ''}. Effective: ${effectiveDate}.`,
                type: "security",
              },
              ...logs,
            ]);
            setPendingAmendmentData(null);
          }}
        />
      )}
    </div>
  );
}
