import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import {
  addBed,
  clearBedReservation,
  completeBedCleaning,
  listBeds,
  listHousekeepingLog,
  listPatients,
  reserveBed,
  startBedCleaning,
  type Bed,
  type BedStatus,
  type BackendPatientWithAbha,
  type HousekeepingEntry,
} from "@/api/endpoints";
import { mapApiError } from "@/lib/errorHelper";
import { useAuthStore } from "@/store/useAuthStore";
import type { StaffRole } from "@/lib/session";

const POLL_MS = 15_000;

const STATUS: Record<BedStatus, { label: string; badge: string }> = {
  vacant: { label: "Vacant", badge: "ok" },
  occupied: { label: "Occupied", badge: "info" },
  reserved: { label: "Reserved", badge: "brand" },
  dirty: { label: "Needs cleaning", badge: "danger" },
  cleaning: { label: "Being cleaned", badge: "warn" },
};

const ACTION_LABEL: Record<HousekeepingEntry["action"], string> = {
  discharge_release: "Patient left, bed released",
  cleaning_started: "Cleaning started",
  cleaning_completed: "Cleaning completed",
};

const since = (iso: string) => {
  const minutes = Math.max(Math.floor((Date.now() - new Date(iso).getTime()) / 60000), 0);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} days`;
};

export function BedsPage() {
  const navigate = useNavigate();
  const { session, environment, signOut } = useAuthStore();
  const facilityName = session?.kind === "facility" ? session.name : "City General Hospital";
  const staffName = session?.kind === "staff" ? session.name : "Asha Verma";
  const staffEmail = session?.kind === "staff" ? session.email : "asha.verma@citygeneral.example";
  const envDisplay = environment === "PRODUCTION" ? "Production" : "Sandbox";
  // Sessions saved before roles existed belonged to administrators. The server enforces the same rules.
  const role: StaffRole = session?.kind === "staff" ? (session.role ?? "admin") : "admin";
  const canAdd = role === "admin";
  const canReserve = role === "admin" || role === "nurse" || role === "front_office";
  const canClean = role === "admin" || role === "nurse" || role === "housekeeping";

  const [beds, setBeds] = useState<Bed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newWard, setNewWard] = useState("");
  const [newBedNo, setNewBedNo] = useState("");

  const [reserving, setReserving] = useState<string | null>(null);
  const [patients, setPatients] = useState<BackendPatientWithAbha[]>([]);
  const [resPatientId, setResPatientId] = useState("");
  const [resName, setResName] = useState("");
  const [resUntil, setResUntil] = useState("");
  const [resNote, setResNote] = useState("");

  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState<HousekeepingEntry[]>([]);

  const load = useCallback(async () => {
    try {
      setBeds((await listBeds()).data);
      setError("");
    } catch (err) {
      const m = mapApiError(err);
      setError(`${m.title}. ${m.body}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!showLog) return;
    listHousekeepingLog(50).then((r) => setLog(r.data)).catch(() => setLog([]));
  }, [showLog, beds]);

  const wards = useMemo(() => {
    const by = new Map<string, Bed[]>();
    for (const bed of beds) by.set(bed.ward, [...(by.get(bed.ward) ?? []), bed]);
    return [...by.entries()];
  }, [beds]);

  const counts = useMemo(() => {
    const c: Record<BedStatus, number> = { vacant: 0, occupied: 0, reserved: 0, dirty: 0, cleaning: 0 };
    for (const bed of beds) c[bed.status] += 1;
    return c;
  }, [beds]);

  async function act(id: string, action: () => Promise<unknown>, done: string) {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(done);
      await load();
      return true;
    } catch (err) {
      const m = mapApiError(err);
      setError(`${m.title}. ${m.body}`);
      await load();
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function submitBed() {
    setBusyId("new");
    setError("");
    setNotice("");
    try {
      await addBed({ ward: newWard.trim(), bedNo: newBedNo.trim() });
      setNotice(`Bed ${newWard.trim()} ${newBedNo.trim()} added.`);
      setNewBedNo("");
      await load();
    } catch (err) {
      const m = mapApiError(err);
      setError(`${m.title}. ${m.body}`);
    } finally {
      setBusyId(null);
    }
  }

  async function openReserve(id: string) {
    setReserving(id);
    setResPatientId("");
    setResName("");
    setResUntil("");
    setResNote("");
    if (patients.length === 0) listPatients().then((r) => setPatients(r.data)).catch(() => undefined);
  }

  async function submitReserve(bed: Bed) {
    const ok = await act(
      bed.id,
      () =>
        reserveBed(bed.id, {
          ...(resPatientId ? { patientId: resPatientId } : { reservedFor: resName.trim() }),
          ...(resUntil ? { until: new Date(resUntil).toISOString() } : {}),
          ...(resNote.trim() ? { note: resNote.trim() } : {}),
        }),
      `Bed ${bed.ward} ${bed.bedNo} reserved.`,
    );
    if (ok) setReserving(null);
  }

  return (
    <AppShell active="beds" facilityName={facilityName} staffName={staffName} staffEmail={staffEmail} env={envDisplay} onLogout={signOut}>
      <h1 className="osh-h1">Beds</h1>
      <p className="osh-sub">Every bed at <b>{facilityName}</b>, by ward. Beds move from occupied to needs cleaning, being cleaned and vacant.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 12px" }}>
        {(Object.keys(STATUS) as BedStatus[]).map((s) => (
          <span key={s} className={`badge ${STATUS[s].badge}`}>{STATUS[s].label}: {counts[s]}</span>
        ))}
      </div>

      {error && <div className="notice error" style={{ maxWidth: 820 }}>{error}</div>}
      {notice && <div className="notice success" style={{ maxWidth: 820 }}>{notice}</div>}

      <div style={{ display: "flex", gap: 8, margin: "0 0 14px" }}>
        {canAdd && <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}>Add a bed</button>}
        <button className="btn btn-ghost" onClick={() => setShowLog((v) => !v)}>{showLog ? "Hide" : "Show"} housekeeping log</button>
      </div>

      {adding && canAdd && (
        <div className="panel" style={{ padding: 14, maxWidth: 520, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Ward</label>
              <input className="input" list="ward-names" value={newWard} onChange={(e) => setNewWard(e.target.value)} placeholder="e.g. General Ward" />
              <datalist id="ward-names">{wards.map(([w]) => <option key={w} value={w} />)}</datalist>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Bed number</label>
              <input className="input" value={newBedNo} onChange={(e) => setNewBedNo(e.target.value)} placeholder="e.g. 12" style={{ width: 110 }} />
            </div>
            <button className="btn btn-primary" disabled={busyId === "new" || !newWard.trim() || !newBedNo.trim()} onClick={submitBed}>
              {busyId === "new" ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="panel" style={{ padding: 24, textAlign: "center", color: "var(--text-dim)" }}>Loading beds...</div>
      ) : beds.length === 0 ? (
        <div className="panel" style={{ padding: 24, color: "var(--text-dim)" }}>
          No beds yet.{canAdd ? " Use \"Add a bed\" to set up the wards." : " An administrator needs to add them."}
        </div>
      ) : (
        wards.map(([ward, list]) => (
          <div key={ward} style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>{ward} <span className="cell-mrn">({list.length} beds)</span></h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
              {list.map((bed) => (
                <div key={bed.id} className="panel" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <b>Bed {bed.bedNo}</b>
                    <span className={`badge ${STATUS[bed.status].badge}`}>{STATUS[bed.status].label}</span>
                  </div>
                  <div className="cell-mrn" style={{ margin: "2px 0 8px" }}>for {since(bed.statusSince)}</div>

                  {bed.status === "occupied" && bed.patient && (
                    <div style={{ fontSize: 13 }}>
                      <a style={{ cursor: "pointer", fontWeight: 600 }} onClick={() => navigate(`/record/${bed.patient!.id}`)}>{bed.patient.name}</a>
                      <div className="cell-mrn">{bed.patient.mrn ?? ""}</div>
                    </div>
                  )}

                  {bed.status === "reserved" && (
                    <div style={{ fontSize: 13 }}>
                      For <b>{bed.reservedFor}</b>
                      {bed.reservedUntil && <div className="cell-mrn">until {new Date(bed.reservedUntil).toLocaleString()}{bed.reservationLapsed ? " (lapsed)" : ""}</div>}
                      {bed.reservedNote && <div className="cell-mrn">{bed.reservedNote}</div>}
                      {canReserve && (
                        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} disabled={busyId === bed.id} onClick={() => act(bed.id, () => clearBedReservation(bed.id), "Reservation cleared.")}>
                          Clear reservation
                        </button>
                      )}
                    </div>
                  )}

                  {bed.status === "dirty" && canClean && (
                    <button className="btn btn-primary btn-sm" disabled={busyId === bed.id} onClick={() => act(bed.id, () => startBedCleaning(bed.id), "Cleaning started.")}>Start cleaning</button>
                  )}
                  {bed.status === "cleaning" && canClean && (
                    <button className="btn btn-primary btn-sm" disabled={busyId === bed.id} onClick={() => act(bed.id, () => completeBedCleaning(bed.id), "Bed is clean and vacant.")}>Mark clean</button>
                  )}

                  {bed.status === "vacant" && canReserve && reserving !== bed.id && (
                    <button className="btn btn-ghost btn-sm" onClick={() => openReserve(bed.id)}>Reserve...</button>
                  )}
                  {reserving === bed.id && (
                    <div style={{ marginTop: 6 }}>
                      <select className="input" value={resPatientId} onChange={(e) => setResPatientId(e.target.value)}>
                        <option value="">Not registered: type a name</option>
                        {patients.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.mrn ?? p.phone})</option>)}
                      </select>
                      {!resPatientId && <input className="input" style={{ marginTop: 6 }} placeholder="Name" value={resName} onChange={(e) => setResName(e.target.value)} />}
                      <input className="input" style={{ marginTop: 6 }} type="datetime-local" value={resUntil} onChange={(e) => setResUntil(e.target.value)} title="Keep until (optional)" />
                      <input className="input" style={{ marginTop: 6 }} placeholder="Note (optional)" value={resNote} onChange={(e) => setResNote(e.target.value)} />
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button className="btn btn-primary btn-sm" disabled={busyId === bed.id || (!resPatientId && resName.trim().length < 2)} onClick={() => submitReserve(bed)}>Reserve</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setReserving(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {showLog && (
        <div className="panel" style={{ marginTop: 8 }}>
          <table className="osh-table">
            <thead><tr><th>When</th><th>Bed</th><th>What</th><th>By</th></tr></thead>
            <tbody>
              {log.map((e) => (
                <tr key={e.id}>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{new Date(e.at).toLocaleString()}</td>
                  <td>{e.ward} {e.bedNo}</td>
                  <td>{ACTION_LABEL[e.action]}</td>
                  <td>{e.by}</td>
                </tr>
              ))}
              {log.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", padding: 16, color: "var(--text-faint)" }}>Nothing yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
