"use client";

import React, { useState, useEffect } from "react";
import {
  Archive, Database, History, ShieldCheck,
  CloudLightning, AlertTriangle, Download,
  CheckCircle2, UserCheck, Key, ExternalLink,
  RefreshCw, Clock, Mail, Fingerprint, Lock,
} from "lucide-react";

interface AuditLog { timestamp: string; type: string; event: string; }
interface FirebaseUserInfo { email: string | null; uid: string; lastSignIn: string | null; provider: string; }
interface ComplianceVaultProps {
  auditLogs: AuditLog[];
  /** True when Manager RSA-OAEP/ECDSA keys exist in keysStore. */
  managerKeysPresent?: boolean;
}

/* ── Small shared primitives ───────────────────────────────────────────────── */

const InfoRow = ({ icon, label, value, mono = false, accent }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; mono?: boolean; accent?: string;
}) => (
  <div style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 0", borderBottom:"1px solid #F1F5F9" }}>
    <span style={{ color:"#94A3B8", marginTop:1, flexShrink:0 }}>{icon}</span>
    <span style={{ fontSize:13, color:"#64748B", width:148, flexShrink:0 }}>{label}</span>
    <span style={{ fontSize:13, fontWeight:500, color: accent ?? "#0F172A", fontFamily: mono ? "var(--fm,monospace)" : "inherit" }}>{value}</span>
  </div>
);

const KeyBadge = ({ present, label }: { present: boolean; label: string }) => (
  <div style={{
    display:"flex", alignItems:"center", gap:8, padding:"10px 14px",
    background: present ? "#F0FDF4" : "#FFF7ED",
    border:`1px solid ${present ? "#BBF7D0" : "#FED7AA"}`,
    borderRadius:8,
  }}>
    <span style={{ color: present ? "#16A34A" : "#C2410C", flexShrink:0 }}>
      {present ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>}
    </span>
    <div>
      <div style={{ fontSize:12, fontWeight:700, color: present ? "#166534" : "#9A3412" }}>{label}</div>
      <div style={{ fontSize:11, color: present ? "#4ADE80" : "#FB923C", marginTop:1 }}>
        {present ? "Present in local keysStore" : "Not yet generated"}
      </div>
    </div>
  </div>
);

/* ── Site Authorization tab ────────────────────────────────────────────────── */

const SiteAuthorizationTab = ({ managerKeysPresent }: { managerKeysPresent: boolean }) => {
  const [userInfo,      setUserInfo]      = useState<FirebaseUserInfo | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [crcKeyPresent, setCrcKeyPresent] = useState<boolean | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { auth }              = await import("@/lib/firebase");
      const { onAuthStateChanged } = await import("firebase/auth");
      const user = auth.currentUser;
      setUserInfo(user ? {
        email:      user.email,
        uid:        user.uid,
        lastSignIn: user.metadata?.lastSignInTime ?? null,
        provider:   user.providerData?.[0]?.providerId ?? "password",
      } : null);

      const { keysStore } = await import("@/lib/db");
      setCrcKeyPresent(!!(await keysStore.getItem<unknown>("crc_keys")));
    } catch {
      setUserInfo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

      {/* Info banner */}
      <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:10, padding:"14px 18px", display:"flex", alignItems:"flex-start", gap:12 }}>
        <ShieldCheck size={18} color="#2563EB" style={{ flexShrink:0, marginTop:1 }}/>
        <div>
          <p style={{ margin:0, fontSize:13, fontWeight:600, color:"#1D4ED8" }}>
            Authorization is managed by Firebase Authentication
          </p>
          <p style={{ margin:"4px 0 0", fontSize:12, color:"#3B82F6", lineHeight:1.5 }}>
            User accounts, passwords, and access revocation are controlled in the Firebase Console.
            This panel shows the active session and the local cryptographic keys paired to this Manager device.
          </p>
        </div>
      </div>

      {/* Active session */}
      <div style={{ background:"#fff", border:"1px solid #E2E8F0", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid #F1F5F9", background:"#FAFAFA", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <UserCheck size={15} color="#0EA5E9"/>
            <span style={{ fontSize:14, fontWeight:700, color:"#0F172A" }}>Active Manager Session</span>
          </div>
          <button onClick={load} disabled={loading}
            style={{ display:"flex", alignItems:"center", gap:5, background:"transparent", border:"1px solid #E2E8F0", borderRadius:6, padding:"5px 10px", fontSize:12, color:"#64748B", cursor:"pointer" }}
            aria-label="Refresh session info"
          >
            <RefreshCw size={12} style={loading ? { animation:"spin 1s linear infinite" } : {}}/>
            Refresh
          </button>
        </div>
        <div style={{ padding:"6px 20px 16px" }}>
          {loading ? (
            <p style={{ fontSize:13, color:"#94A3B8", padding:"12px 0" }}>Loading session…</p>
          ) : userInfo ? (
            <>
              <InfoRow icon={<Mail size={14}/>}        label="Site Email"      value={userInfo.email ?? "—"} />
              <InfoRow icon={<Fingerprint size={14}/>} label="Firebase UID"    value={`${userInfo.uid.slice(0,8)}…${userInfo.uid.slice(-4)}`} mono />
              <InfoRow icon={<Clock size={14}/>}       label="Last Sign-In"    value={userInfo.lastSignIn ? new Date(userInfo.lastSignIn).toLocaleString() : "—"} />
              <InfoRow icon={<Lock size={14}/>}        label="Auth Provider"   value={userInfo.provider === "password" ? "Email / Password" : userInfo.provider} />
              <InfoRow icon={<ShieldCheck size={14}/>} label="Role"            value="Site Manager" accent="#7C3AED" />
            </>
          ) : (
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"14px 0", color:"#F59E0B" }}>
              <AlertTriangle size={14}/>
              <span style={{ fontSize:13 }}>
                No active Firebase session. The Manager PIN remains valid for local operations,
                but re-authentication is required for package import/export.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Cryptographic keys */}
      <div style={{ background:"#fff", border:"1px solid #E2E8F0", borderRadius:12, padding:"18px 20px", boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
          <Key size={15} color="#7C3AED"/>
          <span style={{ fontSize:14, fontWeight:700, color:"#0F172A" }}>Device Cryptographic Keys</span>
        </div>
        <p style={{ fontSize:12, color:"#64748B", margin:"0 0 14px", lineHeight:1.5 }}>
          Stored exclusively in this device's IndexedDB — never transmitted to Firebase or any server.
          They authenticate data packages exchanged between CRC and Manager devices.
        </p>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <KeyBadge present={managerKeysPresent}    label="Manager Keys — RSA-OAEP + ECDSA-P256" />
          <KeyBadge present={crcKeyPresent === true} label="CRC Signing Keys — ECDSA-P256" />
        </div>
      </div>

      {/* Firebase Console link */}
      <div style={{ background:"#F8FAFC", border:"1px solid #E2E8F0", borderRadius:10, padding:"14px 18px", display:"flex", alignItems:"center", gap:12 }}>
        <ExternalLink size={15} color="#64748B" style={{ flexShrink:0 }}/>
        <div style={{ flex:1 }}>
          <span style={{ fontSize:13, color:"#0F172A", fontWeight:600 }}>Manage users in Firebase Console</span>
          <p style={{ margin:"3px 0 0", fontSize:12, color:"#64748B" }}>
            To add, disable, or revoke site users: Firebase Console → Authentication → Users.
          </p>
        </div>
        <a href="https://console.firebase.google.com/project/altesa-clinical-ops/authentication/users"
          target="_blank" rel="noopener noreferrer"
          style={{ display:"flex", alignItems:"center", gap:5, background:"#1A6FDB", color:"#fff",
            padding:"8px 14px", borderRadius:7, fontSize:12, fontWeight:600, textDecoration:"none",
            whiteSpace:"nowrap", flexShrink:0 }}
        >
          Firebase Console <ExternalLink size={11}/>
        </a>
      </div>
    </div>
  );
};

/* ── Main export ───────────────────────────────────────────────────────────── */

export const ComplianceVault = ({ auditLogs, managerKeysPresent = false }: ComplianceVaultProps) => {
  const [activeTab, setActiveTab] = useState<"archive"|"users"|"audit">("archive");

  const tabStyle = (t: typeof activeTab) => ({
    background:"transparent" as const, border:"none",
    borderBottom: activeTab === t ? "2px solid #0EA5E9" : "2px solid transparent",
    padding:"0 0 16px 0", cursor:"pointer" as const,
    display:"flex" as const, alignItems:"center" as const, gap:8,
    color: activeTab === t ? "var(--t1)" : "var(--t3)",
    fontWeight: activeTab === t ? 600 : 500, transition:"all 0.2s", fontSize:14,
  });

  return (
    <div id="manager-tour-vault" style={{ background:"#fff", borderRadius:12, border:"1px solid #E2E8F0",
      boxShadow:"0 4px 6px -1px rgba(0,0,0,0.1)", display:"flex", flexDirection:"column",
      minHeight:600, overflow:"hidden" }}>

      {/* Header */}
      <div style={{ borderBottom:"1px solid #E2E8F0" }}>
        <div style={{ padding:"24px 32px 16px 32px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <h3 style={{ fontSize:20, fontWeight:700, color:"var(--t1)", margin:"0 0 4px 0" }}>
              Data Administration &amp; Compliance Vault
            </h3>
            <p style={{ margin:0, fontSize:14, color:"var(--t3)" }}>
              Manage backups, site authorization, and immutable audit ledgers (15-Year Retention).
            </p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, background:"#ECFDF5",
            padding:"8px 16px", borderRadius:8, border:"1px solid #A7F3D0",
            color:"#059669", fontWeight:600, fontSize:13 }}>
            <ShieldCheck size={16}/> FIPS-140-2 Compliant
          </div>
        </div>
        <div style={{ padding:"0 32px", display:"flex", gap:24, marginTop:8 }}>
          <button onClick={() => setActiveTab("archive")} style={tabStyle("archive")}><Archive size={16}/> eTMF &amp; Archive</button>
          <button onClick={() => setActiveTab("users")}   style={tabStyle("users")}  ><UserCheck size={16}/> Site Authorization</button>
          <button onClick={() => setActiveTab("audit")}   style={tabStyle("audit")}  ><History size={16}/> Audit Ledger</button>
        </div>
      </div>

      <div style={{ padding:32, flex:1, background:"#F8FAFC" }}>

        {/* ARCHIVE */}
        {activeTab === "archive" && (
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
            <div style={{ display:"flex", gap:24 }}>
              {[
                { icon:<CloudLightning size={20}/>, bg:"#E0F2FE", color:"#0284C7", title:"Instant Cloud Snapshot", desc:"Creates an immediate encrypted snapshot of all clinical data, eDiary inputs, queries, and audit trails.", btn:<><Database size={16}/> Generate Backup</>, btnStyle:{ background:"var(--t1)", color:"#fff", border:"none" } },
                { icon:<Archive size={20}/>, bg:"#FCE7F3", color:"#DB2777", title:"Generate 15-Year Archive", desc:"Package study data in a regulatory-compliant immutable archive ready for long-term cold storage.", btn:<><Download size={16}/> Download eTMF Package</>, btnStyle:{ background:"#fff", color:"var(--t1)", border:"1px solid #CBD5E1" } },
              ].map(({ icon, bg, color, title, desc, btn, btnStyle }) => (
                <div key={title} style={{ flex:1, background:"#fff", border:"1px solid #E2E8F0", borderRadius:12, padding:24, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ width:40, height:40, borderRadius:8, background:bg, color, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16 }}>{icon}</div>
                  <h4 style={{ margin:"0 0 8px 0", fontSize:16, fontWeight:600, color:"var(--t1)" }}>{title}</h4>
                  <p style={{ margin:"0 0 20px 0", fontSize:14, color:"var(--t3)", lineHeight:1.5 }}>{desc}</p>
                  <button style={{ width:"100%", padding:10, borderRadius:8, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:8, cursor:"pointer", ...btnStyle }}>{btn}</button>
                </div>
              ))}
            </div>
            <div style={{ background:"#fff", border:"1px solid #E2E8F0", borderRadius:12, padding:24, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
              <h4 style={{ margin:"0 0 16px 0", fontSize:15, fontWeight:600, color:"var(--t1)" }}>Recent Archives</h4>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead><tr style={{ background:"#F1F5F9", color:"#475569", textAlign:"left" }}>
                  {["Identifier","Type","Date Created","Size","Auth Hash"].map((h,i) => (
                    <th key={h} style={{ padding:12, fontWeight:600, borderRadius: i===0?"8px 0 0 8px":i===4?"0 8px 8px 0":"0" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {[["ARC-1029-A","15-Year Compliant","May 1, 2026","2.4 GB","0x8f2a…390c"],
                    ["BAK-9902-B","Snapshot","Apr 28, 2026","1.2 MB","0x4e21…1290"]].map(([id,type,date,size,hash],i) => (
                    <tr key={id} style={i===0?{borderBottom:"1px solid #E2E8F0"}:{}}>
                      <td style={{ padding:"16px 12px", fontWeight:500, color:"var(--t1)" }}>{id}</td>
                      <td style={{ padding:"16px 12px", color:"var(--t3)" }}>{type}</td>
                      <td style={{ padding:"16px 12px", color:"var(--t3)" }}>{date}</td>
                      <td style={{ padding:"16px 12px", color:"var(--t3)" }}>{size}</td>
                      <td style={{ padding:"16px 12px", color:"#0EA5E9", fontFamily:"var(--fm)" }}>{hash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SITE AUTHORIZATION */}
        {activeTab === "users" && <SiteAuthorizationTab managerKeysPresent={managerKeysPresent}/>}

        {/* AUDIT LEDGER */}
        {activeTab === "audit" && (
          <div style={{ background:"var(--t1)", borderRadius:12, overflow:"hidden",
            boxShadow:"0 4px 6px -1px rgba(0,0,0,0.1), inset 0 2px 4px rgba(0,0,0,0.5)",
            display:"flex", flexDirection:"column", height:450 }}>
            <div style={{ background:"#1E293B", padding:"10px 16px", borderBottom:"1px solid var(--t2)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ display:"flex", gap:6 }}>
                {["#EF4444","#F59E0B","#10B981"].map(c=><div key={c} style={{ width:10, height:10, borderRadius:"50%", background:c }}/>)}
              </div>
              <button onClick={() => {
                const txt = auditLogs.map(l=>`[${new Date(l.timestamp).toISOString()}] [${l.type.toUpperCase()}] ${l.event}`).join("\n");
                const blob = new Blob([txt],{type:"text/plain"});
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement("a");
                a.href=url; a.download=`ALTESA_Audit_Log_${new Date().toISOString().split("T")[0]}.txt`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
              }} style={{ background:"var(--t2)", border:"none", color:"#F8FAFC", padding:"6px 12px", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                <Download size={12}/> Export Terminal Logs (.txt)
              </button>
            </div>
            <div style={{ padding:20, flex:1, overflowY:"auto", fontFamily:"var(--fm)", fontSize:12, color:"#10B981", lineHeight:1.6 }}>
              {auditLogs.map((log,i) => (
                <div key={i} style={{ marginBottom:8, display:"flex", gap:12 }}>
                  <span style={{ color:"var(--t3)", flexShrink:0 }}>[{new Date(log.timestamp).toISOString().replace("T"," ").substring(0,19)}]</span>
                  <span style={{ color:log.type==="security"?"#F59E0B":"#38BDF8", flexShrink:0, width:80 }}>[{log.type.toUpperCase()}]</span>
                  <span style={{ color:"#F8FAFC" }}>{log.event}</span>
                </div>
              ))}
              <div style={{ marginTop:16, display:"flex", gap:8, alignItems:"center" }}>
                <div className="crit-pulse" style={{ width:8, height:8, background:"#10B981" }}/>
                <span style={{ color:"#10B981" }}>System connected and logging in real-time…</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
