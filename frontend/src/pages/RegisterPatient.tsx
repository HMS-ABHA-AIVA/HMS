import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuthStore } from "@/store/useAuthStore";
import {
  createPatient,
  listPatients,
  requestAbhaCreateOtp,
  verifyAbhaCreateOtp,
  requestAbhaLinkOtp,
  confirmAbhaLink,
  requestAbhaMobileOtp,
  confirmAbhaMobileOtp,
  verifyAbhaMobileUser,
  requestAbhaNumberOtp,
  confirmAbhaNumberOtp,
  requestAbhaAddressOtp,
  confirmAbhaAddressOtp,
  type AbhaAccountItem,
  type AbhaLoginChannel,
} from "@/api/endpoints";
import { CreateFollowUps } from "@/components/CreateFollowUps";
import { ConsentBox } from "@/components/ConsentBox";
import type { ConsentLanguage } from "@/lib/consentText";
import { formatOtpMessage } from "@/lib/otpMessage";
import { ContactUpdate } from "@/components/ContactUpdate";
import { withAbdmSession } from "@/api/abdmSession";
import { StopState } from "@/pages/ErrorStates";
import { mapApiError, type MappedErrorState } from "@/lib/errorHelper";

import { OTP_RESEND_SECONDS, MAX_OTP_RESENDS } from "@/lib/abhaRules";

// 6 = optional follow-ups after creating an ABHA (verify mobile, choose ABHA address)
type Step = 1 | 2 | 3 | 4 | 5 | 6;
type AbhaMode = "create_aadhaar" | "link_aadhaar" | "link_mobile" | "link_number" | "link_address";

export function RegisterPatient() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const existingPatientId = searchParams.get("patientId");
  // Re-verifying an already linked patient: only link modes, and nothing new is created.
  const refresh = searchParams.get("refresh") === "1";

  const { session, environment, signOut } = useAuthStore();
  const facilityName = session?.kind === "facility" ? session.name : "City General Hospital";
  const staffName = session?.kind === "staff" ? session.name : "Asha Verma";
  const staffEmail = session?.kind === "staff" ? session.email : "asha.verma@citygeneral.example";
  const envDisplay = environment === "PRODUCTION" ? "Production" : "Sandbox";

  const [step, setStep] = useState<Step>(existingPatientId ? 2 : 1);
  const [mode, setMode] = useState<AbhaMode>(refresh ? "link_aadhaar" : "create_aadhaar");

  // Step 1: Patient details
  const [patientId, setPatientId] = useState<string>(existingPatientId || "");
  const [form, setForm] = useState({ name: "", dob: "", gender: "Male", mobile: "", email: "" });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Step 3: Identity & Consent
  const [aadhaar, setAadhaar] = useState("");
  const [linkMobileNumber, setLinkMobileNumber] = useState("");
  const [abhaNumber, setAbhaNumber] = useState("");
  const [abhaAddressInput, setAbhaAddressInput] = useState("");
  const [channel, setChannel] = useState<AbhaLoginChannel>("aadhaar");
  const [consent, setConsent] = useState(false);
  const [consentLanguage, setConsentLanguage] = useState<ConsentLanguage>("en");

  // Step 4: OTP verification
  const [transactionId, setTransactionId] = useState("");
  const [otp, setOtp] = useState("");
  // ABDM's own wording after an OTP is sent, e.g. "...mobile number ending with ******6375" (already masked)
  const [otpMessage, setOtpMessage] = useState("");
  // set after "create ABHA" succeeds; drives the optional follow-up step
  const [created, setCreated] = useState<{
    transactionId: string;
    mobileVerified: boolean;
    abhaNumber: string;
    abhaAddress: string | null;
  } | null>(null);
  const [mobileAccounts, setMobileAccounts] = useState<AbhaAccountItem[]>([]);
  const [selectedAbhaNumber, setSelectedAbhaNumber] = useState("");

  // In-flight status and error handling
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<MappedErrorState | null>(null);

  const [resendIn, setResendIn] = useState(0);
  // resends used for the current OTP request (NHA: at most 2, each after 60 s)
  const [resendCount, setResendCount] = useState(0);
  // the ABHA that was just created / linked, shown on the success screen
  const [linked, setLinked] = useState<{ abhaNumber: string; abhaAddress: string | null; mobileMatchesRecord?: boolean | undefined } | null>(null);
  // Link flows: when the ABHA's mobile differs from the hospital record, offer (Yes/No) to update the ABHA
  const [contactPrompt, setContactPrompt] = useState<"ask" | "update" | "no">("ask");

  // Counts down the OTP resend cool-down.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // "Add ABHA" on an existing patient skips step 1, so pick up the mobile number from their record.
  useEffect(() => {
    if (!existingPatientId) return;
    let cancelled = false;
    listPatients()
      .then((res) => {
        const p = (res.data || []).find((x) => x.id === existingPatientId);
        if (!cancelled && p) {
          setLinkMobileNumber((current) => current || p.phone);
          // verifying an ABHA that is already linked: start from the address on record
          if (p.abha?.abhaAddress) setAbhaAddressInput((current) => current || p.abha?.abhaAddress || "");
        }
      })
      .catch(() => {
        // the mobile number can still be typed in on the next step
      });
    return () => {
      cancelled = true;
    };
  }, [existingPatientId]);

  // Step 1: Create patient
  async function handleSavePatient() {
    setErrorState(null);
    if (!form.name.trim()) {
      setErrorState({ tone: "error", title: "Name is required", body: "Please enter the patient's full name." });
      return;
    }
    if (!form.dob) {
      setErrorState({
        tone: "error",
        title: "Date of birth is required",
        body: "It is checked against the ABHA before the ABHA can be linked.",
      });
      return;
    }
    if (form.dob > new Date().toISOString().slice(0, 10)) {
      setErrorState({ tone: "error", title: "Invalid date of birth", body: "Date of birth cannot be in the future." });
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
        dateOfBirth: form.dob,
      });
      const createdId = res.data.id;
      setPatientId(createdId);
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
    }

    if (mode === "link_address") {
      const address = abhaAddressInput.trim();
      if (address.includes("@") && !/@(sbx|abdm)$/i.test(address)) {
        setErrorState({
          tone: "error",
          title: "That is an email address, not an ABHA address",
          body: "An ABHA address ends with @sbx (sandbox) or @abdm (production), for example name@sbx. The email saved on the ABHA cannot be used to find it.",
        });
        return;
      }
      if (!/^[A-Za-z0-9._]{3,40}(@(sbx|abdm))?$/i.test(address)) {
        setErrorState({
          tone: "error",
          title: "Invalid ABHA address",
          body: "Enter the ABHA address, for example name@sbx. The part after @ can be left out.",
        });
        return;
      }
    }

    if (mode === "link_number" && abhaNumber.replace(/\D/g, "").length !== 14) {
      setErrorState({
        tone: "error",
        title: "Invalid ABHA number",
        body: "ABHA number must be 14 digits, for example 91-1234-5678-9012.",
      });
      return;
    }

    // The mobile number is what ABHA is linked to (create) or searched by (link by mobile).
    if (mode === "create_aadhaar" || mode === "link_mobile") {
      if (linkMobileNumber.replace(/\D/g, "").length !== 10) {
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
      await requestOtp();
      setResendCount(0);
      setOtp("");
      setStep(4);
    } catch (err) {
      setErrorState(mapApiError(err, { label: "Try again", onClick: () => setErrorState(null) }));
    } finally {
      setLoading(false);
    }
  }

  // Asks ABDM for an OTP for the current mode and remembers the transaction it belongs to.
  async function requestOtp() {
    await withAbdmSession(environment, async () => {
      const cleanAadhaar = aadhaar.replace(/\D/g, "");
      const cleanMobile = linkMobileNumber.replace(/\D/g, "");
      const res =
        mode === "create_aadhaar"
          ? await requestAbhaCreateOtp({ patientId, aadhaar: cleanAadhaar, environment, consent: true, consentLanguage })
          : mode === "link_aadhaar"
            ? await requestAbhaLinkOtp({ patientId, aadhaar: cleanAadhaar, environment, consent: true, consentLanguage })
            : mode === "link_address"
              ? await requestAbhaAddressOtp({ patientId, abhaAddress: abhaAddressInput.trim(), channel, environment, consent: true, consentLanguage })
              : mode === "link_number"
              ? await requestAbhaNumberOtp({ patientId, abhaNumber: abhaNumber.replace(/\D/g, ""), channel, environment, consent: true, consentLanguage })
              : await requestAbhaMobileOtp({ patientId, mobile: cleanMobile, environment, consent: true, consentLanguage });
      setTransactionId(res.data.transactionId);
      setOtpMessage(formatOtpMessage(mode, res.message ?? "", channel));
    });
    setResendIn(OTP_RESEND_SECONDS);
  }

  async function handleResendOtp() {
    if (resendCount >= MAX_OTP_RESENDS) return;
    setErrorState(null);
    setLoading(true);
    try {
      await requestOtp();
      setResendCount((n) => n + 1);
      setOtp("");
    } catch (err) {
      setErrorState(mapApiError(err));
    } finally {
      setLoading(false);
    }
  }

  // Step 4: Verify OTP
  async function handleVerifyOtp() {
    setErrorState(null);

    // If mobile accounts have already been loaded, proceed with user selection
    if (mode === "link_mobile" && mobileAccounts.length > 0) {
      if (!selectedAbhaNumber) {
        setErrorState({
          tone: "error",
          title: "Select an ABHA account",
          body: "Please choose which ABHA account to link to this patient.",
        });
        return;
      }
      setLoading(true);
      try {
        await withAbdmSession(environment, async () => {
          const res = await verifyAbhaMobileUser({
            abhaNumber: selectedAbhaNumber,
            transactionId,
            environment,
          });
          setLinked({ abhaNumber: res.data.abhaNumber, abhaAddress: res.data.abhaAddress, mobileMatchesRecord: res.data.mobileMatchesRecord });
        });
        setStep(5);
      } catch (err) {
        setErrorState(mapApiError(err, { label: "Try again", onClick: () => setErrorState(null) }));
      } finally {
        setLoading(false);
      }
      return;
    }

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
          const mobileForEnrol = linkMobileNumber.replace(/\D/g, "");
          const res = await verifyAbhaCreateOtp({
            transactionId,
            otp: cleanOtp,
            mobile: mobileForEnrol,
            environment,
          });
          if (res.data.hasFollowUp) {
            setCreated({
              transactionId: res.data.transactionId,
              mobileVerified: res.data.mobileVerified,
              abhaNumber: res.data.abhaNumber,
              abhaAddress: res.data.abhaAddress,
            });
            setStep(6);
          } else {
            setLinked({ abhaNumber: res.data.abhaNumber, abhaAddress: res.data.abhaAddress, mobileMatchesRecord: res.data.mobileMatchesRecord });
            setStep(5);
          }
        } else if (mode === "link_aadhaar") {
          const res = await confirmAbhaLink({
            transactionId,
            otp: cleanOtp,
            environment,
          });
          setLinked({ abhaNumber: res.data.abhaNumber, abhaAddress: res.data.abhaAddress, mobileMatchesRecord: res.data.mobileMatchesRecord });
          setStep(5);
        } else if (mode === "link_address") {
          const res = await confirmAbhaAddressOtp({
            transactionId,
            otp: cleanOtp,
            channel,
            environment,
          });
          setLinked({ abhaNumber: res.data.abhaNumber, abhaAddress: res.data.abhaAddress, mobileMatchesRecord: res.data.mobileMatchesRecord });
          setStep(5);
        } else if (mode === "link_number") {
          const res = await confirmAbhaNumberOtp({
            transactionId,
            otp: cleanOtp,
            channel,
            environment,
          });
          setLinked({ abhaNumber: res.data.abhaNumber, abhaAddress: res.data.abhaAddress, mobileMatchesRecord: res.data.mobileMatchesRecord });
          setStep(5);
        } else if (mode === "link_mobile") {
            // Confirm OTP and retrieve linked accounts
            const res = await confirmAbhaMobileOtp({
              transactionId,
              otp: cleanOtp,
              environment,
            });
            const accounts = res.data?.accounts || [];
            if (accounts.length === 1) {
              // Only 1 account: link directly
              const linkedRes = await verifyAbhaMobileUser({
                abhaNumber: accounts[0].ABHANumber,
                transactionId: res.data.transactionId,
                environment,
              });
              setLinked({ abhaNumber: linkedRes.data.abhaNumber, abhaAddress: linkedRes.data.abhaAddress, mobileMatchesRecord: linkedRes.data.mobileMatchesRecord });
              setStep(5);
            } else if (accounts.length > 1) {
              setMobileAccounts(accounts);
              setSelectedAbhaNumber(accounts[0].ABHANumber);
            } else {
              throw new Error("No ABHA accounts associated with this mobile number.");
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
            <div className="step-text">
              <span className="lbl">Patient details</span>
              {step === 1 && <div className="state">In progress</div>}
            </div>
          </li>
          <li className={step === 2 || step === 3 || step === 4 || step === 6 ? "current" : step === 5 ? "done" : ""}>
            <span className="num">2</span>
            <div className="step-text">
              <span className="lbl">ABHA</span>
              {(step === 2 || step === 3 || step === 4 || step === 6) && <div className="state">In progress</div>}
            </div>
          </li>
          <li className={step === 5 ? "current" : ""}>
            <span className="num">3</span>
            <div className="step-text">
              <span className="lbl">OPD check-in</span>
              {step === 5 && <div className="state">Complete</div>}
            </div>
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
                placeholder="As on the patient's Aadhaar / ABHA"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="row">
              <div className="field" style={{ width: 170 }}>
                <label>Date of birth</label>
                <input
                  className="input"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={form.dob}
                  onChange={(e) => set("dob", e.target.value)}
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
            <h2>{refresh ? "Verify this patient's ABHA" : "Add an ABHA"}</h2>
            <p className="lead">
              {refresh
                ? "Verify the ABHA already on this record so its live details and QR code can be shown."
                : "Choose how to add this patient's ABHA. You can also skip and do it later."}
            </p>
            {errorState && (
              <div style={{ marginBottom: 14 }}>
                <StopState {...errorState} />
              </div>
            )}
            {!refresh && (
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
            )}
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
            <button
              className="btn btn-ghost"
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 10 }}
              onClick={() => {
                setMode("link_number");
                setErrorState(null);
                setStep(3);
              }}
            >
              <div style={{ fontWeight: 600 }}>Link by ABHA number</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                Link using the 14-digit ABHA number, with an OTP to the Aadhaar-linked or ABHA mobile.
              </div>
            </button>
            <button
              className="btn btn-ghost"
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 10 }}
              onClick={() => {
                setMode("link_address");
                setErrorState(null);
                setStep(3);
              }}
            >
              <div style={{ fontWeight: 600 }}>Link by ABHA address</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                Link using the ABHA address (name@sbx), with an OTP to the Aadhaar-linked or ABHA mobile.
              </div>
            </button>
            {refresh ? (
              <button className="btn-link" type="button" onClick={() => navigate(`/record/${patientId}`)}>
                Back to patient record
              </button>
            ) : (
              <button className="btn-link" type="button" onClick={() => setStep(5)}>
                Skip for now
              </button>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="card-form">
            <h2>
              {mode === "link_mobile"
                ? "Mobile number"
                : mode === "link_address"
                  ? "ABHA address"
                : mode === "link_number"
                  ? "ABHA number"
                  : mode === "create_aadhaar"
                    ? "Aadhaar and mobile number"
                    : "Aadhaar number"}
            </h2>
            <p className="lead">
              {mode === "link_mobile"
                ? "An OTP will be sent to this mobile number registered with ABHA."
                : mode === "link_number" || mode === "link_address"
                  ? "An OTP will be sent to the mobile you choose below."
                  : "An OTP will be sent to the mobile linked with this Aadhaar."}
            </p>
            {errorState && (
              <div style={{ marginBottom: 14 }}>
                <StopState {...errorState} />
              </div>
            )}
            {(mode === "link_number" || mode === "link_address") && (
              <>
                {mode === "link_number" ? (
                  <div className="field">
                    <label>ABHA number</label>
                    <input
                      className="input mono"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="91-1234-5678-9012"
                      value={abhaNumber}
                      onChange={(e) => setAbhaNumber(e.target.value.replace(/[^\d-]/g, "").slice(0, 17))}
                      disabled={loading}
                    />
                  </div>
                ) : (
                  <div className="field">
                    <label>ABHA address</label>
                    <input
                      className="input mono"
                      autoComplete="off"
                      autoCapitalize="none"
                      placeholder="name@sbx"
                      value={abhaAddressInput}
                      onChange={(e) => setAbhaAddressInput(e.target.value.replace(/[^A-Za-z0-9._@]/g, "").slice(0, 50))}
                      disabled={loading}
                    />
                    <div className="hint">
                      This is the ABHA address (for example name@sbx), not the email. The part after @ can be left out; it is added for the
                      sandbox or production automatically.
                    </div>
                  </div>
                )}
                <div className="field">
                  <label>Send the OTP to</label>
                  <div className="seg">
                    <button type="button" className={channel === "aadhaar" ? "on" : ""} onClick={() => setChannel("aadhaar")} disabled={loading}>
                      Aadhaar-linked mobile
                    </button>
                    <button type="button" className={channel === "mobile" ? "on" : ""} onClick={() => setChannel("mobile")} disabled={loading}>
                      ABHA mobile
                    </button>
                  </div>
                </div>
              </>
            )}
            {(mode === "create_aadhaar" || mode === "link_aadhaar") && (
              <div className="field">
                <label>Aadhaar number</label>
                <input
                  className="input mono"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="12 digits"
                  value={aadhaar}
                  onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  disabled={loading}
                  maxLength={12}
                />
                <div className="hint">Hidden as you type. It is sent to ABDM encrypted and is not stored here.</div>
              </div>
            )}
            {(mode === "create_aadhaar" || mode === "link_mobile") && (
              <div className="field">
                <label>{mode === "create_aadhaar" ? "Mobile number to link with the new ABHA" : "Mobile number"}</label>
                <div className="mobile-wrap">
                  <span className="mobile-prefix">+91</span>
                  <input
                    className="input mono"
                    inputMode="numeric"
                    placeholder="10 digits"
                    value={linkMobileNumber}
                    onChange={(e) => setLinkMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    disabled={loading}
                  />
                </div>
              </div>
            )}
            <ConsentBox
              kind={mode === "create_aadhaar" ? "create" : "link"}
              language={consentLanguage}
              onLanguageChange={setConsentLanguage}
              checked={consent}
              onChange={setConsent}
              disabled={loading}
            />
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
            <p className="lead">
              {otpMessage || "The patient will have received a 6-digit code."} Valid for 10 minutes.
            </p>
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
              {mobileAccounts.length === 0 && (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading || resendIn > 0 || resendCount >= MAX_OTP_RESENDS}
                >
                  {resendCount >= MAX_OTP_RESENDS
                    ? "Resend limit reached"
                    : resendIn > 0
                      ? `Resend OTP in ${resendIn}s`
                      : `Resend OTP (${MAX_OTP_RESENDS - resendCount} left)`}
                </button>
              )}
              <button className="btn btn-primary" type="button" onClick={handleVerifyOtp} disabled={loading}>
                {loading ? "Verifying..." : mobileAccounts.length > 0 ? "Confirm selection" : "Verify"}
              </button>
            </div>
          </div>
        )}

        {step === 6 && created && (
          <CreateFollowUps
            transactionId={created.transactionId}
            mobile={linkMobileNumber.replace(/\D/g, "")}
            mobileVerified={created.mobileVerified}
            abhaNumber={created.abhaNumber}
            abhaAddress={created.abhaAddress}
            environment={environment}
            onDone={(finalAddress) => {
              setLinked({ abhaNumber: created.abhaNumber, abhaAddress: finalAddress });
              setStep(5);
            }}
          />
        )}

        {step === 5 && (
          <div className="card-form">
            <h2>Done</h2>
            <p className="lead">
              <span className="dot ok" />
              {refresh ? "ABHA verified. Live details and the QR code are now available on the record." : "ABHA linked to this patient."}
            </p>
            {linked && (
              <div className="kv" style={{ marginBottom: 14 }}>
                <div className="k">ABHA number</div>
                <div className="mono">{linked.abhaNumber}</div>
                <div className="k">ABHA address</div>
                <div className="mono">{linked.abhaAddress ?? "—"}</div>
              </div>
            )}
            {linked?.mobileMatchesRecord === false && contactPrompt !== "no" && (
              <div style={{ marginBottom: 14 }}>
                {contactPrompt === "ask" ? (
                  <div className="notice">
                    <div style={{ marginBottom: 8 }}>
                      The mobile number held on this ABHA is different from the number on the hospital record (+91{" "}
                      {linkMobileNumber.replace(/\D/g, "")}). Update the ABHA to use the hospital's number?
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn btn-primary" type="button" onClick={() => setContactPrompt("update")}>
                        Yes, update the ABHA
                      </button>
                      <button className="btn btn-ghost" type="button" onClick={() => setContactPrompt("no")}>
                        No, keep it as it is
                      </button>
                    </div>
                  </div>
                ) : (
                  <ContactUpdate
                    patientId={patientId}
                    type="mobile"
                    environment={environment}
                    initialValue={linkMobileNumber.replace(/\D/g, "")}
                    intro="An OTP is sent to the new number. This changes the mobile on the patient's ABHA at ABDM."
                    onDone={() => undefined}
                    onCancel={() => setContactPrompt("no")}
                  />
                )}
              </div>
            )}
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
