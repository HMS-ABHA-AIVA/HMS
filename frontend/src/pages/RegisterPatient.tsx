import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuthStore } from "@/store/useAuthStore";
import {
  createPatient,
  requestAbhaCreateOtp,
  verifyAbhaCreateOtp,
  requestAbhaLinkOtp,
  confirmAbhaLink,
  requestAbhaMobileOtp,
  confirmAbhaMobileOtp,
  verifyAbhaMobileUser,
  type AbdmAccountItem,
} from "@/api/endpoints";
import { withAbdmSession } from "@/api/abdmSession";
import { StopState, mapApiError, type MappedErrorState } from "@/pages/ErrorStates";

type Step = 1 | 2 | 3 | 4 | 5;
type AbhaMode = "create_aadhaar" | "link_aadhaar" | "link_mobile";

export function RegisterPatient() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const existingPatientId = searchParams.get("patientId");

  const { session, environment, signOut } = useAuthStore();
  const facilityName = session?.kind === "facility" ? session.name : "City General Hospital";
  const staffName = session?.kind === "staff" ? session.name : "Asha Verma";
  const staffEmail = session?.kind === "staff" ? session.email : "asha.verma@citygeneral.example";
  const envDisplay = environment === "PRODUCTION" ? "Production" : "Sandbox";

  const [step, setStep] = useState<Step>(existingPatientId ? 2 : 1);
  const [mode, setMode] = useState<AbhaMode>("create_aadhaar");

  // Step 1: Patient details
  const [patientId, setPatientId] = useState<string>(existingPatientId || "");
  const [form, setForm] = useState({ name: "", age: "", gender: "Male", mobile: "", email: "" });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Step 3: Identity & Consent
  const [aadhaar, setAadhaar] = useState("");
  const [linkMobileNumber, setLinkMobileNumber] = useState("");
  const [consent, setConsent] = useState(false);

  // Step 4: OTP verification
  const [transactionId, setTransactionId] = useState("");
  const [otp, setOtp] = useState("");
  const [mobileAccounts, setMobileAccounts] = useState<AbhaAccountItem[]>([]);
  const [selectedAbhaNumber, setSelectedAbhaNumber] = useState("");

  // In-flight status and error handling
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<MappedErrorState | null>(null);

  useEffect(() => {
    if (existingPatientId) {
      setPatientId(existingPatientId);
      setStep(2);
    }
  }, [existingPatientId]);

  // Step 1: Create patient
  async function handleSavePatient() {
    setErrorState(null);
    if (!form.name.trim()) {
      setErrorState({ tone: "error", title: "Name is required", body: "Please enter the patient's full name." });
      return;
    }
    const cleanMobile = form.mobile.replace(/\D/g, "");
    if (cleanMobile.length !== 10) {
      setErrorState({ tone: "error", title: "Invalid mobile number", body: "Mobile number must be exactly 10 digits." });
      return;
    }

    setLoading(true);
    try {
      const res = await createPatient({
        name: form.name.trim(),
        phone: cleanMobile,
        email: form.email.trim() || undefined,
      });
      setPatientId(res.data.id);
      setLinkMobileNumber(cleanMobile);
      setStep(2);
    } catch (err) {
      setErrorState(mapApiError(err));
    } finally {
      setLoading(false);
    }
  }

  // Step 3: Send OTP
  async function handleSendOtp() {
    setErrorState(null);
    if (!consent) {
      setErrorState({
        tone: "error",
        title: "Patient consent required",
        body: "Please confirm that the patient consents to using their credentials for ABHA.",
      });
      return;
    }

    if (mode === "create_aadhaar" || mode === "link_aadhaar") {
      const cleanAadhaar = aadhaar.replace(/\D/g, "");
      if (cleanAadhaar.length !== 12) {
        setErrorState({
          tone: "error",
          title: "Invalid Aadhaar number",
          body: "Aadhaar number must be exactly 12 digits.",
        });
        return;
      }
    } else if (mode === "link_mobile") {
      const cleanMobile = (linkMobileNumber || form.mobile).replace(/\D/g, "");
      if (cleanMobile.length !== 10) {
        setErrorState({
          tone: "error",
          title: "Invalid mobile number",
          body: "Mobile number must be exactly 10 digits.",
        });
        return;
      }
    }

    setLoading(true);
    try {
      await withAbdmSession(environment, async () => {
        if (mode === "create_aadhaar") {
          const res = await requestAbhaCreateOtp({
            patientId,
            aadhaar: aadhaar.replace(/\D/g, ""),
            environment,
          });
          setTransactionId(res.data.transactionId);
        } else if (mode === "link_aadhaar") {
          const res = await requestAbhaLinkOtp({
            patientId,
            aadhaar: aadhaar.replace(/\D/g, ""),
            environment,
          });
          setTransactionId(res.data.transactionId);
        } else if (mode === "link_mobile") {
          const res = await requestAbhaMobileOtp({
            patientId,
            mobile: (linkMobileNumber || form.mobile).replace(/\D/g, ""),
            environment,
          });
          setTransactionId(res.data.transactionId);
        }
      });
      setStep(4);
    } catch (err) {
      setErrorState(mapApiError(err, { label: "Try again", onClick: () => setErrorState(null) }));
    } finally {
      setLoading(false);
    }
  }

  // Step 4: Verify OTP
  async function handleVerifyOtp() {
    setErrorState(null);
    const cleanOtp = otp.replace(/\D/g, "");
    if (cleanOtp.length !== 6) {
      setErrorState({
        tone: "error",
        title: "Invalid OTP",
        body: "OTP must be exactly 6 digits.",
      });
      return;
    }

    setLoading(true);
    try {
      await withAbdmSession(environment, async () => {
        if (mode === "create_aadhaar") {
          const mobileForEnrol = (form.mobile || linkMobileNumber).replace(/\D/g, "");
          await verifyAbhaCreateOtp({
            transactionId,
            otp: cleanOtp,
            mobile: mobileForEnrol,
            environment,
          });
          setStep(5);
        } else if (mode === "link_aadhaar") {
          await confirmAbhaLink({
            transactionId,
            otp: cleanOtp,
            environment,
          });
          setStep(5);
        } else if (mode === "link_mobile") {
          // If accounts already retrieved and user selected one:
          if (mobileAccounts.length > 0) {
            if (!selectedAbhaNumber) {
              setErrorState({
                tone: "error",
                title: "Select an ABHA account",
                body: "Please choose which ABHA account to link to this patient.",
              });
              return;
            }
            await verifyAbhaMobileUser({
              abhaNumber: selectedAbhaNumber,
              transactionId,
              environment,
            });
            setStep(5);
          } else {
            // Confirm OTP and retrieve linked accounts
            const res = await confirmAbhaMobileOtp({
              transactionId,
              otp: cleanOtp,
              environment,
            });
            const accounts = res.data?.accounts || [];
            if (accounts.length === 1) {
              // Only 1 account: link directly
              await verifyAbhaMobileUser({
                abhaNumber: accounts[0].ABHANumber,
                transactionId: res.data.transactionId,
                environment,
              });
              setStep(5);
            } else if (accounts.length > 1) {
              setMobileAccounts(accounts);
              setSelectedAbhaNumber(accounts[0].ABHANumber);
            } else {
              throw new Error("No ABHA accounts associated with this mobile number.");
            }
          }
        }
      });
    } catch (err) {
      setErrorState(
        mapApiError(err, {
          label: "Try again",
          onClick: () => setErrorState(null),
        })
      );
    } finally {
      setLoading(false);
    }
  }

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
      <a className="osh-backlink" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
        Back to patients
      </a>
      <h1 className="osh-h1">Register a patient</h1>
      <div className="reg-wrap">
        <ol className="steps">
          <li className={step === 1 ? "current" : "done"}>
            <span className="num">1</span>
            <span>
              <span className="lbl">Patient details</span>
              {step === 1 && <div className="state">In progress</div>}
            </span>
          </li>
          <li className={step === 2 || step === 3 || step === 4 ? "current" : step > 4 ? "done" : ""}>
            <span className="num">2</span>
            <span className="lbl">ABHA</span>
            {(step === 2 || step === 3 || step === 4) && <div className="state">In progress</div>}
          </li>
          <li className={step === 5 ? "current" : ""}>
            <span className="num">3</span>
            <span className="lbl">OPD check-in</span>
            {step === 5 && <div className="state">Complete</div>}
          </li>
        </ol>

        {step === 1 && (
          <div className="card-form">
            <h2>Patient details</h2>
            <p className="lead">The patient record is saved when you continue, so you can add an ABHA next.</p>
            {errorState && (
              <div style={{ marginBottom: 14 }}>
                <StopState {...errorState} />
              </div>
            )}
            <div className="field">
              <label>Full name</label>
              <input
                className="input"
                placeholder="For example, Ramesh Gupta"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="row">
              <div className="field" style={{ width: 110 }}>
                <label>Age</label>
                <input
                  className="input"
                  value={form.age}
                  onChange={(e) => set("age", e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="field">
                <label>Gender</label>
                <div className="seg">
                  {["Male", "Female", "Other"].map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={form.gender === g ? "on" : ""}
                      onClick={() => set("gender", g)}
                      disabled={loading}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <hr className="sep" />
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>How to reach the patient</div>
            <div className="field">
              <label>Mobile number</label>
              <div className="mobile-wrap">
                <span className="mobile-prefix">+91</span>
                <input
                  className="input"
                  placeholder="10 digits"
                  value={form.mobile}
                  onChange={(e) => set("mobile", e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            <div className="field">
              <label>
                Email <span className="opt">(optional)</span>
              </label>
              <input
                className="input"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="form-actions">
              <button className="btn-link" type="button" onClick={() => navigate("/")} disabled={loading}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={handleSavePatient} disabled={loading}>
                {loading ? "Saving..." : "Save and continue"}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card-form">
            <h2>Add an ABHA</h2>
            <p className="lead">Choose how to add this patient's ABHA. You can also skip and do it later.</p>
            {errorState && (
              <div style={{ marginBottom: 14 }}>
                <StopState {...errorState} />
              </div>
            )}
            <button
              className="btn btn-ghost"
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 10 }}
              onClick={() => {
                setMode("create_aadhaar");
                setErrorState(null);
                setStep(3);
              }}
            >
              <div style={{ fontWeight: 600 }}>Create by Aadhaar</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                A new ABHA using the patient's Aadhaar and OTP.
              </div>
            </button>
            <button
              className="btn btn-ghost"
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 10 }}
              onClick={() => {
                setMode("link_aadhaar");
                setErrorState(null);
                setStep(3);
              }}
            >
              <div style={{ fontWeight: 600 }}>Link by Aadhaar</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                Link an ABHA the patient already has, via Aadhaar OTP.
              </div>
            </button>
            <button
              className="btn btn-ghost"
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 10 }}
              onClick={() => {
                setMode("link_mobile");
                setErrorState(null);
                setStep(3);
              }}
            >
              <div style={{ fontWeight: 600 }}>Link by mobile number</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                Link using the mobile number registered with ABHA.
              </div>
            </button>
            <button className="btn-link" type="button" onClick={() => setStep(5)}>
              Skip for now
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="card-form">
            <h2>{mode === "link_mobile" ? "Mobile number" : "Aadhaar number"}</h2>
            <p className="lead">
              {mode === "link_mobile"
                ? "An OTP will be sent to this mobile number registered with ABHA."
                : "An OTP will be sent to the mobile linked with this Aadhaar."}
            </p>
            {errorState && (
              <div style={{ marginBottom: 14 }}>
                <StopState {...errorState} />
              </div>
            )}
            {mode === "link_mobile" ? (
              <div className="field">
                <label>Mobile number</label>
                <div className="mobile-wrap">
                  <span className="mobile-prefix">+91</span>
                  <input
                    className="input mono"
                    placeholder="10 digits"
                    value={linkMobileNumber || form.mobile}
                    onChange={(e) => setLinkMobileNumber(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            ) : (
              <div className="field">
                <label>Aadhaar number</label>
                <input
                  className="input mono"
                  placeholder="12 digits"
                  value={aadhaar}
                  onChange={(e) => setAadhaar(e.target.value)}
                  disabled={loading}
                  maxLength={12}
                />
              </div>
            )}
            <label style={{ display: "flex", gap: 8, fontSize: 12.5, color: "var(--text-dim)", marginTop: 10 }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={loading}
              />
              The patient consents to using their {mode === "link_mobile" ? "mobile number" : "Aadhaar"} to create or link an ABHA.
            </label>
            <div className="form-actions">
              <button className="btn-link" type="button" onClick={() => { setErrorState(null); setStep(2); }} disabled={loading}>
                Back
              </button>
              <button className="btn btn-primary" type="button" onClick={handleSendOtp} disabled={loading}>
                {loading ? "Sending OTP..." : "Send OTP"}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="card-form" style={{ borderStyle: "dashed" }}>
            <h2>Enter the OTP</h2>
            <p className="lead">The patient will have received a 6-digit code. Valid for 10 minutes.</p>
            {errorState && (
              <div style={{ marginBottom: 14 }}>
                <StopState {...errorState} />
              </div>
            )}

            {mobileAccounts.length > 0 ? (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 8 }}>
                  Multiple ABHA accounts found. Select one to link:
                </label>
                {mobileAccounts.map((acc) => (
                  <label
                    key={acc.ABHANumber}
                    style={{
                      display: "block",
                      padding: "8px 12px",
                      border: "1px solid var(--line-2)",
                      borderRadius: 2,
                      marginBottom: 8,
                      cursor: "pointer",
                      background: selectedAbhaNumber === acc.ABHANumber ? "var(--info-bg)" : "var(--paper)",
                    }}
                  >
                    <input
                      type="radio"
                      name="abhaAccount"
                      value={acc.ABHANumber}
                      checked={selectedAbhaNumber === acc.ABHANumber}
                      onChange={() => setSelectedAbhaNumber(acc.ABHANumber)}
                      style={{ marginRight: 8 }}
                    />
                    <strong className="mono">{acc.ABHANumber}</strong>
                    {acc.preferredAbhaAddress && (
                      <span style={{ marginLeft: 8, color: "var(--text-dim)", fontSize: 12 }}>
                        ({acc.preferredAbhaAddress})
                      </span>
                    )}
                    {acc.name && <div style={{ fontSize: 12, marginLeft: 22 }}>Name: {acc.name}</div>}
                  </label>
                ))}
              </div>
            ) : (
              <div className="field" style={{ maxWidth: 220 }}>
                <label>OTP</label>
                <input
                  className="input mono"
                  placeholder="______"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}

            <div className="form-actions">
              <button
                className="btn-link"
                type="button"
                onClick={() => {
                  setErrorState(null);
                  setOtp("");
                  setMobileAccounts([]);
                  setStep(3);
                }}
                disabled={loading}
              >
                Start again
              </button>
              <button className="btn btn-primary" type="button" onClick={handleVerifyOtp} disabled={loading}>
                {loading ? "Verifying..." : mobileAccounts.length > 0 ? "Confirm selection" : "Verify"}
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="card-form">
            <h2>Done</h2>
            <p className="lead">
              <span className="dot ok" />
              ABHA linked to this patient.
            </p>
            <div className="form-actions" style={{ justifyContent: "flex-start", gap: 12 }}>
              <button className="btn btn-primary" onClick={() => navigate(`/record/${patientId}`)}>
                View patient record
              </button>
              <button className="btn btn-ghost" onClick={() => navigate("/opd")}>
                Check in to OPD
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
