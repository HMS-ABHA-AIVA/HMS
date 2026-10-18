import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { AppShell } from "../components/AppShell";
import {
  dismissSharedProfile,
  getShareConfig,
  listSharedProfiles,
  registerSharedProfile,
  type SharedProfile,
} from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { mapApiError, type MappedErrorState } from "@/lib/errorHelper";
import { useAuthStore } from "@/store/useAuthStore";

const POLL_MS = 10_000;

function formatDob(s: SharedProfile): string {
  const { dayOfBirth: d, monthOfBirth: m, yearOfBirth: y } = s;
  if (d && m) return `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`;
  return String(y);
}

function countdown(expiresAt: string, now: number): string {
  const left = Math.max(Math.floor((new Date(expiresAt).getTime() - now) / 1000), 0);
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

export function SharedProfiles() {
  const navigate = useNavigate();
  const { session, environment, signOut } = useAuthStore();
  const facilityName = session?.kind === "facility" ? session.name : "City General Hospital";
  const staffName = session?.kind === "staff" ? session.name : "Asha Verma";
  const staffEmail = session?.kind === "staff" ? session.email : "asha.verma@citygeneral.example";
  const envDisplay = environment === "PRODUCTION" ? "Production" : "Sandbox";

  const [shares, setShares] = useState<SharedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<MappedErrorState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  // a share that needs a mobile number from staff before it can be registered
  const [needsPhone, setNeedsPhone] = useState<{ id: string; message: string } | null>(null);
  const [phone, setPhone] = useState("");

  const [config, setConfig] = useState<{ hipId: string; qrBaseUrl: string } | null>(null);
  const [counter, setCounter] = useState("OPD1");

  const load = useCallback(async () => {
    try {
      const res = await listSharedProfiles();
      setShares(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  useEffect(() => {
    getShareConfig(environment)
      .then((res) => setConfig(res.data))
      .catch(() => setConfig(null));
  }, [environment]);

  async function register(share: SharedProfile, phoneOverride?: string) {
    setBusyId(share.id);
    setError(null);
    try {
      const res = await registerSharedProfile(share.id, phoneOverride ? { phone: phoneOverride } : {});
      navigate(`/record/${res.data.patientId}`);
    } catch (err) {
      if (err instanceof ApiError && (err.code === "PHONE_REQUIRED" || err.code === "PHONE_IN_USE")) {
        setNeedsPhone({ id: share.id, message: err.message });
        setPhone("");
      } else {
        setError(mapApiError(err));
        void load();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(share: SharedProfile) {
    if (!window.confirm(`Dismiss the shared profile of ${share.name}? The patient will need to scan again.`)) return;
    setBusyId(share.id);
    try {
      await dismissSharedProfile(share.id);
      setShares((list) => list.filter((s) => s.id !== share.id));
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setBusyId(null);
    }
  }

  function handleNavigate(key: string) {
    if (key === "dashboard") navigate("/");
    else if (key === "registration") navigate("/registration");
    else if (key === "shared") navigate("/shared-profiles");
    else if (key === "opd") navigate("/opd");
  }

  const counterOk = /^[A-Za-z0-9]{1,20}$/.test(counter);
  const qrUrl =
    config && counterOk
      ? `${config.qrBaseUrl}?hip-id=${encodeURIComponent(config.hipId)}&counter-id=${encodeURIComponent(counter)}`
      : null;
  const live = shares.filter((s) => new Date(s.expiresAt).getTime() > now);

  return (
    <AppShell
      active="shared"
      facilityName={facilityName}
      staffName={staffName}
      staffEmail={staffEmail}
      env={envDisplay}
      onNavigate={handleNavigate}
      onLogout={signOut}
    >
      <style>{`@media print { body * { visibility: hidden; } .qr-print, .qr-print * { visibility: visible; } .qr-print { position: absolute; left: 0; top: 0; padding: 24px; } }`}</style>

      <h1 className="osh-h1">Shared profiles</h1>
      <p className="osh-sub">
        Patients who scanned a counter QR code and chose to share their ABHA profile with <b>{facilityName}</b>. Each one holds a token
        for 30 minutes; register the patient while it is valid.
      </p>

      {error && (
        <div className="notice error" style={{ maxWidth: 760 }}>
          <b>{error.title}.</b> {error.body}
        </div>
      )}

      <div className="panel" style={{ marginTop: 8 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-dim)" }}>Loading shared profiles...</div>
        ) : live.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-dim)" }}>
            Nobody is waiting. Shared profiles appear here by themselves a few seconds after the patient scans.
          </div>
        ) : (
          <table className="osh-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Patient</th>
                <th>ABHA</th>
                <th>Mobile</th>
                <th>Valid for</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {live.map((s) => (
                <tr key={s.id}>
                  <td>
                    <b style={{ fontSize: 16 }}>#{s.tokenNumber}</b>
                    <div className="cell-mrn">{s.counterCode}</div>
                  </td>
                  <td className="cell-name">
                    {s.name}
                    <div className="cell-mrn">
                      {s.gender ?? "—"} · born {formatDob(s)}
                    </div>
                    {s.address && <div className="cell-mrn">{s.address}</div>}
                  </td>
                  <td>
                    <div className="mono">{s.abhaNumber ?? "ABHA number not shared"}</div>
                    <div className="cell-mrn">{s.abhaAddress}</div>
                  </td>
                  <td className="mono">{s.phone ?? "—"}</td>
                  <td className="mono">{countdown(s.expiresAt, now)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {needsPhone?.id === s.id ? (
                      <div style={{ maxWidth: 260 }}>
                        <div className="notice error" style={{ marginBottom: 6 }}>{needsPhone.message}</div>
                        <input
                          className="input"
                          inputMode="numeric"
                          maxLength={10}
                          placeholder="10-digit mobile"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={phone.length !== 10 || busyId === s.id}
                            onClick={() => register(s, phone)}
                          >
                            Register
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setNeedsPhone(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {s.matchedPatient ? (
                          <button className="btn btn-primary btn-sm" disabled={busyId === s.id} onClick={() => register(s)}>
                            Open {s.matchedPatient.name}
                          </button>
                        ) : (
                          <button className="btn btn-primary btn-sm" disabled={busyId === s.id} onClick={() => register(s)}>
                            Register patient
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" disabled={busyId === s.id} onClick={() => dismiss(s)}>
                          Dismiss
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="osh-h1" style={{ fontSize: 18, marginTop: 28 }}>Counter QR code</h2>
      <p className="osh-sub">
        Print one code per counter and put it where patients wait. The counter id becomes the queue the token belongs to.
      </p>
      <div className="panel" style={{ padding: 16, display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 240 }}>
          <div className="field">
            <label htmlFor="counter">Counter id</label>
            <input
              id="counter"
              className="input"
              maxLength={20}
              value={counter}
              onChange={(e) => setCounter(e.target.value.trim())}
            />
            <div className="cell-mrn" style={{ marginTop: 4 }}>
              {counterOk ? "Letters and digits only, for example OPD1 or LAB2." : "Use 1 to 20 letters or digits, no spaces."}
            </div>
          </div>
          <button className="btn btn-ghost" disabled={!qrUrl} onClick={() => window.print()}>
            Print this code
          </button>
        </div>
        <div className="qr-print" style={{ textAlign: "center" }}>
          {qrUrl ? (
            <>
              <QRCodeSVG value={qrUrl} size={200} marginSize={2} />
              <div style={{ marginTop: 6, fontWeight: 600 }}>{facilityName}</div>
              <div className="cell-mrn">Counter {counter}: scan with the ABHA / PHR app to share your profile</div>
            </>
          ) : (
            <div style={{ color: "var(--text-dim)", maxWidth: 220 }}>
              {config ? "Enter a valid counter id to see its QR code." : "The QR code could not be prepared. Check that you are signed in and the server is running."}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
