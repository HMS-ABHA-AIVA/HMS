import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { listAuditLog, type AuditEntry } from "@/api/endpoints";
import { mapApiError } from "@/lib/errorHelper";
import { useAuthStore } from "@/store/useAuthStore";

const PAGE = 50;

export function AuditLogPage() {
  const { session, environment, signOut } = useAuthStore();
  const facilityName = session?.kind === "facility" ? session.name : "City General Hospital";
  const staffName = session?.kind === "staff" ? session.name : "Asha Verma";
  const staffEmail = session?.kind === "staff" ? session.email : "asha.verma@citygeneral.example";
  const envDisplay = environment === "PRODUCTION" ? "Production" : "Sandbox";

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (query: string, before?: string) => {
    setLoading(true);
    try {
      const rows = (await listAuditLog({ limit: PAGE, ...(before ? { before } : {}), ...(query ? { search: query } : {}) })).data;
      setEntries((prev) => (before ? [...prev, ...rows] : rows));
      setMore(rows.length === PAGE);
      setError("");
    } catch (err) {
      const m = mapApiError(err);
      setError(`${m.title}. ${m.body}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(applied);
  }, [load, applied]);

  return (
    <AppShell active="audit" facilityName={facilityName} staffName={staffName} staffEmail={staffEmail} env={envDisplay} onLogout={signOut}>
      <h1 className="osh-h1">Audit log</h1>
      <p className="osh-sub">Who changed what, newest first. Passwords, OTPs and Aadhaar numbers are never recorded here.</p>

      <form
        style={{ display: "flex", gap: 8, maxWidth: 520, marginBottom: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(search.trim());
        }}
      >
        <input className="input" placeholder="Search action, person or detail" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-primary" type="submit">Search</button>
        {applied && <button className="btn btn-ghost" type="button" onClick={() => { setSearch(""); setApplied(""); }}>Clear</button>}
      </form>

      {error && <div className="notice error" style={{ maxWidth: 820 }}>{error}</div>}

      <div className="panel">
        <table className="osh-table">
          <thead>
            <tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>{new Date(e.at).toLocaleString()}</td>
                <td>{e.actor}</td>
                <td>{e.action}</td>
                <td>{e.detail || "—"}</td>
              </tr>
            ))}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", padding: 20, color: "var(--text-faint)" }}>Nothing recorded{applied ? " for this search" : " yet"}.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div style={{ padding: 14, textAlign: "center", color: "var(--text-dim)" }}>Loading...</div>}
      </div>

      {more && !loading && (
        <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => load(applied, entries[entries.length - 1]?.at)}>
          Show older entries
        </button>
      )}
    </AppShell>
  );
}
