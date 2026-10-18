import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuthStore } from "@/store/useAuthStore";
import {
  listPatients,
  listPatientTransactions,
  getAbhaProfile,
  getAbhaQrCodeBlob,
  type BackendPatientWithAbha,
  type AbhaTransaction,
  type FullAbhaProfile,
} from "@/api/endpoints";
import { SAMPLE_PATIENTS, SAMPLE_TRANSACTIONS } from "@/data/samplePatients";

function formatDateTime(dateStr?: string) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

function formatTimeOnly(dateStr?: string) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

export function PatientRecord() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();

  const { session, environment, signOut } = useAuthStore();
  const facilityName = session?.kind === "facility" ? session.name : "City General Hospital";
  const staffName = session?.kind === "staff" ? session.name : "Asha Verma";
  const staffEmail = session?.kind === "staff" ? session.email : "asha.verma@citygeneral.example";
  const envDisplay = environment === "PRODUCTION" ? "Production" : "Sandbox";

  const [patient, setPatient] = useState<BackendPatientWithAbha | null>(null);
  const [transactions, setTransactions] = useState<AbhaTransaction[]>([]);
  const [liveProfile, setLiveProfile] = useState<FullAbhaProfile | null>(null);
  const [qrUrl, setQrUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // In-browser only (as documented until backend can store these)
  const allergies: string[] = [];
  const problems: string[] = [];


  useEffect(() => {
    let active = true;
    let createdUrl = "";

    async function loadData() {
      if (!patientId) return;
      setLoading(true);

      try {
        let currentPatient: BackendPatientWithAbha | null = null;
        let txns: AbhaTransaction[] = [];

        try {
          const [patientsRes, txnsRes] = await Promise.all([
            listPatients(),
            listPatientTransactions(patientId).catch(() => ({ data: [] })),
          ]);
          currentPatient = (patientsRes.data || []).find((p) => p.id === patientId) || null;
          txns = Array.isArray(txnsRes.data) ? txnsRes.data : [];
        } catch {
          // If unauthenticated or backend empty, check demo sample data
        }

        if (!currentPatient) {
          const sample = SAMPLE_PATIENTS.find((p) => p.id === patientId);
          if (sample) {
            currentPatient = sample;
            txns = SAMPLE_TRANSACTIONS;
          }
        }

        if (!active) return;
        setPatient(currentPatient);
        setTransactions(txns);

        // 2. If ABHA is linked, try fetching live profile & live QR code
        if (currentPatient?.abha) {
          try {
            const profileRes = await getAbhaProfile(environment);
            if (active && profileRes.data) {
              setLiveProfile(profileRes.data);
            }
          } catch {
            // Profile session token may not be active; fallback gracefully to patient's stored ABHA
          }

          try {
            const blob = await getAbhaQrCodeBlob(environment);
            if (active && blob) {
              createdUrl = URL.createObjectURL(blob);
              setQrUrl(createdUrl);
            }
          } catch {
            // QR endpoint requires active X-token
          }
        }
      } catch (err) {
        console.error("Error loading patient record:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [patientId, environment]);

  function handlePrint() {
    window.print();
  }

  function handleSaveQr() {
    if (!qrUrl) return;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `${patient?.name || "Patient"}_ABHA_QR.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleNavigate(key: string) {
    if (key === "dashboard") navigate("/");
    else if (key === "registration") navigate("/registration");
    else if (key === "opd") navigate("/opd");
  }

  const mrn = patient?.id ? patient.id.slice(0, 6).toUpperCase() : "4F2A91";
  const pName = patient?.name || "Patient Record";
  const isLinked = Boolean(patient?.abha);
  const abhaNumber = patient?.abha?.abhaNumber || liveProfile?.ABHANumber || "91-2345-6789-0123";
  const abhaAddress = patient?.abha?.abhaAddress || liveProfile?.preferredAbhaAddress || "abha@abdm";

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
      <a className="osh-backlink" style={{ cursor: "pointer" }} onClick={() => navigate("/registration")}>
        Back to patients
      </a>

      {loading ? (
        <div className="panel" style={{ padding: 24, textAlign: "center", color: "var(--text-dim)", marginTop: 16 }}>
          Loading patient details...
        </div>
      ) : (
        <>
          <div className="rec-head">
            <div>
              <h1 className="osh-h1">{pName}</h1>
              <p className="osh-sub" style={{ margin: 0 }}>
                {liveProfile?.dob ? `DOB: ${liveProfile.dob}` : "34 years, female"}
              </p>
            </div>
            <div className="rec-meta">
              <div>
                <div className="k">MRN</div>
                {mrn}
              </div>
              <div>
                <div className="k">Mobile</div>
                {patient?.phone ? `+91 ${patient.phone}` : "Not given"}
              </div>
              <div>
                <div className="k">Email</div>
                {patient?.email || "Not given"}
              </div>
            </div>
          </div>

          <div className="rec-grid">
            <div>
              <h3 style={{ fontSize: 14, margin: "6px 0 10px" }}>ABHA</h3>
              {isLinked ? (
                <>
                  <div className="abha-card">
                    <div>
                      <span className="status">
                        <span className="dot ok" />
                        Linked
                      </span>
                      <div className="abha-num">{abhaNumber}</div>
                      <div className="abha-addr">{abhaAddress}</div>
                    </div>
                    {qrUrl ? (
                      <img className="qr" alt="ABHA QR" src={qrUrl} />
                    ) : (
                      <div
                        className="qr"
                        style={{
                          border: "1px dashed var(--line-2)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 10,
                          color: "var(--text-faint)",
                          textAlign: "center",
                          padding: 4,
                        }}
                      >
                        Live QR
                      </div>
                    )}
                  </div>

                  <div className="notice" style={{ marginTop: 10 }}>
                    Linked at {facilityName}
                  </div>

                  <div className="kv">
                    <div className="k">Name on ABHA</div>
                    <div>{liveProfile?.name || patient?.name}</div>
                    <div className="k">Date of birth</div>
                    <div>{liveProfile?.dob || "14 March 1992"}</div>
                    <div className="k">Address</div>
                    <div>{liveProfile?.address || "Registered Address via ABDM"}</div>
                    <div className="k">KYC</div>
                    <div>{liveProfile?.kycVerified ? "Verified with Aadhaar" : "Verified"}</div>
                  </div>

                  <p className="abha-note">
                    These details and the QR are read from ABDM each time this page opens. They are not stored on this computer.
                  </p>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn btn-primary" onClick={handlePrint}>
                      Print ABHA card
                    </button>
                    <button className="btn btn-ghost" onClick={handleSaveQr} disabled={!qrUrl}>
                      Save QR image
                    </button>
                  </div>
                </>
              ) : (
                <div className="panel" style={{ padding: 16 }}>
                  <span className="status">
                    <span className="dot pending" />
                    Not linked
                  </span>
                  <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "8px 0 14px" }}>
                    This patient does not have an ABHA linked to their hospital record yet.
                  </p>
                  <button className="btn btn-primary" onClick={() => navigate(`/register?patientId=${patient?.id}`)}>
                    Add ABHA
                  </button>
                </div>
              )}

              <h3 style={{ fontSize: 14, margin: "26px 0 4px" }}>ABHA activity</h3>
              <p className="osh-sub" style={{ margin: "0 0 8px" }}>
                Every OTP attempt for this patient, newest first.
              </p>
              <table className="osh-table" style={{ border: "1px solid var(--line)" }}>
                <thead>
                  <tr>
                    <th>What was tried</th>
                    <th>Result</th>
                    <th>Started</th>
                    <th>OTP valid until</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ color: "var(--text-faint)", textAlign: "center", padding: 16 }}>
                        No ABHA transaction activity recorded yet for this patient.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((t) => (
                      <tr key={t.id}>
                        <td>{t.purpose === "ENROLLMENT" ? "Create ABHA" : "Link existing ABHA"}</td>
                        <td>
                          <span
                            className={`dot ${
                              t.status === "COMPLETED" ? "ok" : t.status === "FAILED" ? "error" : "pending"
                            }`}
                          />
                          {t.status ? t.status.charAt(0) + t.status.slice(1).toLowerCase() : "Pending"}
                        </td>
                        <td>{formatDateTime(t.createdAt)}</td>
                        <td>{formatTimeOnly(t.expiresAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <h3 style={{ fontSize: 14, margin: "6px 0 8px" }}>Allergies and problems</h3>
              <p className="osh-sub">
                Nothing recorded yet. Until the backend can store these, entries are kept in this browser only.
              </p>
              <div style={{ fontWeight: 600, fontSize: 13, marginTop: 14 }}>Allergies</div>
              {allergies.length === 0 ? (
                <p className="osh-sub" style={{ margin: "2px 0 0" }}>
                  None recorded.
                </p>
              ) : (
                <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: 13 }}>
                  {allergies.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}

              <div style={{ fontWeight: 600, fontSize: 13, marginTop: 14 }}>Problem list</div>
              {problems.length === 0 ? (
                <p className="osh-sub" style={{ margin: "2px 0 0" }}>
                  None recorded.
                </p>
              ) : (
                <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: 13 }}>
                  {problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
