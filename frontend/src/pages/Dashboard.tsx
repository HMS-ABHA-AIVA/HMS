import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { getDashboard, type DashboardData } from "@/api/endpoints";
import { mapApiError, type MappedErrorState } from "@/lib/errorHelper";
import { useAuthStore } from "@/store/useAuthStore";

const REFRESH_MS = 30_000;

// Audit action codes -> staff-readable text
const ACTION_LABELS: Record<string, string> = {
  CREATE_AADHAAR_OTP_REQUEST: "ABHA creation: Aadhaar OTP requested",
  CREATE_AADHAAR_OTP_VERIFY: "ABHA creation: Aadhaar OTP verified",
  CREATE_MOBILE_OTP_REQUEST: "ABHA creation: mobile OTP requested",
  CREATE_MOBILE_OTP_VERIFY: "ABHA creation: mobile OTP verified",
  ABHA_ADDRESS_SUGGESTIONS: "ABHA address suggestions viewed",
  ABHA_ADDRESS_CREATE: "ABHA address created",
  LINK_AADHAAR_OTP_REQUEST: "Link by Aadhaar: OTP requested",
  LINK_AADHAAR_OTP_VERIFY: "Link by Aadhaar: OTP verified",
  LINK_MOBILE_OTP_REQUEST: "Link by mobile: OTP requested",
  LINK_MOBILE_OTP_VERIFY: "Link by mobile: OTP verified",
  LINK_MOBILE_SELECT_ACCOUNT: "Link by mobile: ABHA chosen",
  LINK_ABHA_NUMBER_OTP_REQUEST: "Link by ABHA number: OTP requested",
  LINK_ABHA_NUMBER_OTP_VERIFY: "Link by ABHA number: OTP verified",
  LINK_ABHA_ADDRESS_OTP_REQUEST: "Link by ABHA address: OTP requested",
  LINK_ABHA_ADDRESS_OTP_VERIFY: "Link by ABHA address: OTP verified",
  ABHA_PROFILE_VIEW: "ABHA profile viewed",
  ABHA_QR_VIEW: "ABHA QR viewed",
  ABHA_CARD_DOWNLOAD: "ABHA card downloaded",
  ABHA_CONTACT_UPDATE_OTP_REQUEST: "ABHA contact update: OTP requested",
  ABHA_CONTACT_UPDATE_OTP_VERIFY: "ABHA contact updated",
  SHARE_REGISTER: "Shared profile registered",
  SHARE_DISMISS: "Shared profile dismissed",
  ABDM_SESSION: "ABDM session started",
};

const labelFor = (action: string) => ACTION_LABELS[action] ?? action.toLowerCase().replace(/_/g, " ");

function Tile({ label, value, hint, onClick }: { label: string; value: number | string; hint?: string; onClick?: () => void }) {
  return (
    <div
      className="panel"
      style={{ padding: 16, minWidth: 190, flex: "1 1 190px", cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
    >
      <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint && <div className="cell-mrn" style={{ marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { session, environment, signOut } = useAuthStore();
  const facilityName = session?.kind === "facility" ? session.name : "City General Hospital";
  const staffName = session?.kind === "staff" ? session.name : "Asha Verma";
  const staffEmail = session?.kind === "staff" ? session.email : "asha.verma@citygeneral.example";
  const envDisplay = environment === "PRODUCTION" ? "Production" : "Sandbox";

  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<MappedErrorState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getDashboard()
        .then((res) => {
          if (cancelled) return;
          setData(res.data);
          setError(null);
        })
        .catch((err) => {
          if (!cancelled) setError(mapApiError(err));
        });
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  function handleNavigate(key: string) {
    if (key === "dashboard") navigate("/");
    else if (key === "registration") navigate("/registration");
    else if (key === "shared") navigate("/shared-profiles");
    else if (key === "opd") navigate("/opd");
  }

  const linkedPct = data && data.totalPatients > 0 ? Math.round((data.abhaLinked / data.totalPatients) * 100) : 0;

  return (
    <AppShell
      active="dashboard"
      facilityName={facilityName}
      staffName={staffName}
      staffEmail={staffEmail}
      env={envDisplay}
      onNavigate={handleNavigate}
      onLogout={signOut}
    >
      <h1 className="osh-h1">Dashboard</h1>
      <p className="osh-sub">
        Today at <b>{facilityName}</b>. Numbers refresh every 30 seconds.
      </p>

      {error && (
        <div className="notice error" style={{ maxWidth: 760 }}>
          <b>{error.title}.</b> {error.body}
        </div>
      )}

      {!data && !error ? (
        <div className="panel" style={{ padding: 24, textAlign: "center", color: "var(--text-dim)" }}>Loading...</div>
      ) : data ? (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Tile label="Patients registered" value={data.totalPatients} hint={`${data.registeredToday} today`} onClick={() => navigate("/registration")} />
            <Tile label="With an ABHA" value={data.abhaLinked} hint={`${linkedPct}% of patients`} />
            <Tile label="Without an ABHA" value={data.withoutAbha} hint="Add one from the patient list" onClick={() => navigate("/registration")} />
            <Tile
              label="Shared profiles waiting"
              value={data.pendingShares}
              hint="Scan & Share queue"
              onClick={() => navigate("/shared-profiles")}
            />
          </div>

          <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
            <button className="btn btn-primary" onClick={() => navigate("/register")}>Register patient</button>
            <button className="btn btn-ghost" onClick={() => navigate("/shared-profiles")}>Shared profiles</button>
          </div>

          <h2 className="osh-h1" style={{ fontSize: 18 }}>Recent ABHA activity</h2>
          <div className="panel">
            {data.recentActivity.length === 0 ? (
              <div style={{ padding: 20, color: "var(--text-dim)" }}>No ABHA activity yet.</div>
            ) : (
              <table className="osh-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>What</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentActivity.map((a) => (
                    <tr key={a.id}>
                      <td className="mono">{new Date(a.createdAt).toLocaleString()}</td>
                      <td>{labelFor(a.action)}</td>
                      <td>
                        <span className="status">
                          <span className={`dot ${a.outcome === "SUCCESS" ? "ok" : "pending"}`} />
                          {a.outcome === "SUCCESS" ? "Done" : `Failed${a.errorCode ? ` (${a.errorCode})` : ""}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
