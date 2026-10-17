import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { listPatients, type BackendPatientWithAbha } from "@/api/endpoints";
import { useAuthStore } from "@/store/useAuthStore";
import { StopState } from "@/pages/ErrorStates";
import { SAMPLE_PATIENTS } from "@/data/samplePatients";

export interface PatientRow {
  id: string;
  name: string;
  mrn: string;
  age?: number | string;
  sex?: string;
  mobile: string;
  abha: "linked" | "not" | "otp";
  abhaNum?: string;
  today: string;
  raw: BackendPatientWithAbha;
}

function AbhaCell({ r, onAddAbha }: { r: PatientRow; onAddAbha: (p: PatientRow) => void }) {
  if (r.abha === "linked") {
    return (
      <>
        <span className="status">
          <span className="dot ok" />Linked
        </span>
        <div className="mono" style={{ marginTop: 2 }}>
          {r.abhaNum}
        </div>
      </>
    );
  }
  if (r.abha === "otp") {
    return (
      <>
        <span className="status">
          <span className="dot pending" />OTP not finished
        </span>
        <a
          className="addlink"
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            onAddAbha(r);
          }}
        >
          Add ABHA
        </a>
      </>
    );
  }
  return (
    <>
      <span className="status">
        <span className="dot pending" />Not linked
      </span>
      <a
        className="addlink"
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          onAddAbha(r);
        }}
      >
        Add ABHA
      </a>
    </>
  );
}

export function PatientList() {
  const navigate = useNavigate();
  const { session, environment, signOut } = useAuthStore();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<PatientRow[]>([]);

  const facilityName = session?.kind === "facility"
    ? session.name
    : "City General Hospital";
  const staffName = session?.kind === "staff" ? session.name : "Asha Verma";
  const staffEmail = session?.kind === "staff" ? session.email : "asha.verma@citygeneral.example";
  const envDisplay = environment === "PRODUCTION" ? "Production" : "Sandbox";


  useEffect(() => {
    let cancelled = false;
    async function fetchPatients() {
      setLoading(true);
      setError(null);
      const isDemoSession =
        (session?.kind === "staff" && session.id === "st7") ||
        session?.email === "admin@hospital.com";

      try {
        const res = await listPatients();
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        if (list.length === 0 && isDemoSession) {
          setPatients(
            SAMPLE_PATIENTS.map((p) => ({
              id: p.id,
              name: p.name,
              mrn: p.mrn,
              age: p.age,
              sex: p.sex,
              mobile: p.phone,
              abha: p.abha ? "linked" : "not",
              abhaNum: p.abha?.abhaNumber,
              today: p.today,
              raw: p,
            }))
          );
          return;
        }

        const rows: PatientRow[] = list.map((p) => {
          const isLinked = Boolean(p.abha?.abhaNumber);
          return {
            id: p.id,
            name: p.name,
            mrn: p.id.slice(0, 6).toUpperCase(),
            age: 34,
            sex: "F",
            mobile: p.phone,
            abha: isLinked ? "linked" : "not",
            abhaNum: p.abha?.abhaNumber,
            today: "None",
            raw: p,
          };
        });
        setPatients(rows);
      } catch (err: any) {
        if (!cancelled) {
          if (isDemoSession) {
            setPatients(
              SAMPLE_PATIENTS.map((p) => ({
                id: p.id,
                name: p.name,
                mrn: p.mrn,
                age: p.age,
                sex: p.sex,
                mobile: p.phone,
                abha: p.abha ? "linked" : "not",
                abhaNum: p.abha?.abhaNumber,
                today: p.today,
                raw: p,
              }))
            );
          } else {
            setError(err?.message || "Failed to load patients from the server.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPatients();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const rows = useMemo(() => {
    return patients.filter((r) =>
      (r.name + r.mrn + r.mobile).toLowerCase().includes(q.toLowerCase())
    );
  }, [patients, q]);

  function handleNavigate(key: string) {
    if (key === "dashboard") navigate("/");
    else if (key === "registration") navigate("/registration");
    else if (key === "opd") navigate("/opd");
  }

  return (
    <AppShell
      active="registration"
      facilityName={facilityName}
      staffName={staffName}
      staffEmail={staffEmail}
      env={envDisplay}
      onNavigate={handleNavigate}
      onLogout={signOut}
    >
      <h1 className="osh-h1">Patients</h1>
      <p className="osh-sub">
        Everyone registered at <b>{facilityName}</b>.
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div style={{ maxWidth: 320, width: "100%" }}>
          <label className="field" style={{ marginBottom: 6, display: "block", fontWeight: 600, fontSize: 12.5 }}>
            Find a patient
          </label>
          <input
            className="input"
            placeholder="Name, MRN or mobile number"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={() => navigate("/register")}>
          Register patient
        </button>
      </div>

      {error ? (
        <div style={{ marginTop: 20 }}>
          <StopState
            tone="error"
            title="Cannot reach the server"
            body={error}
            action={{ label: "Try again", onClick: () => window.location.reload() }}
          />
        </div>
      ) : loading ? (
        <div className="panel" style={{ marginTop: 16, padding: 24, textAlign: "center", color: "var(--text-dim)" }}>
          Loading patients from hospital server...
        </div>
      ) : patients.length === 0 ? (
        <div style={{ marginTop: 20, maxWidth: 520 }}>
          <StopState
            tone="none"
            title="No patients yet"
            body="Patients you register will appear here, with their ABHA status. Start with the first one."
            action={{ label: "Register patient", onClick: () => navigate("/register") }}
          />
        </div>
      ) : (
        <div className="panel" style={{ marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderBottom: "1px solid var(--line-2)",
              fontSize: 12.5,
              color: "var(--text-dim)",
            }}
          >
            <span>{rows.length} patients</span>
            <span>Newest first</span>
          </div>
          <table className="osh-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Age and gender</th>
                <th>Mobile</th>
                <th>ABHA</th>
                <th>Today</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="cell-name">
                    <a
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/record/${r.id}`)}
                    >
                      {r.name}
                    </a>
                    <div className="cell-mrn">MRN·{r.mrn}</div>
                  </td>
                  <td>{r.age} {r.sex}</td>
                  <td className="mono">{r.mobile}</td>
                  <td>
                    <AbhaCell
                      r={r}
                      onAddAbha={(target) => navigate(`/register?patientId=${target.id}`)}
                    />
                  </td>
                  <td>{r.today}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
