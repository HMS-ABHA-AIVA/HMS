import { useEffect, useState } from "react";
import {
  createAbhaAddress,
  getAbhaAddressSuggestions,
  requestEnrolMobileOtp,
  verifyEnrolMobileOtp,
  type AbdmEnvironment,
} from "@/api/endpoints";
import { withAbdmSession } from "@/api/abdmSession";
import { StopState } from "@/pages/ErrorStates";
import { mapApiError, type MappedErrorState } from "@/lib/errorHelper";

import { ABHA_ADDRESS_POLICY, MAX_OTP_RESENDS, OTP_RESEND_SECONDS, isValidAbhaAddressName } from "@/lib/abhaRules";

/**
 * Shown right after an ABHA is created. Two optional steps ABDM defines for enrolment:
 *  1. verify the mobile number to link with the ABHA, when it is not the Aadhaar-linked one
 *  2. choose a personalised ABHA address (the ABHA already has a default one)
 */
export function CreateFollowUps({
  transactionId,
  mobile,
  mobileVerified,
  abhaNumber,
  abhaAddress,
  environment,
  onDone,
}: {
  transactionId: string;
  mobile: string;
  mobileVerified: boolean;
  abhaNumber: string;
  abhaAddress: string | null;
  environment: AbdmEnvironment;
  /** Called with the ABHA address as it stands when the user continues. */
  onDone: (abhaAddress: string | null) => void;
}) {
  const [verified, setVerified] = useState(mobileVerified);
  const [otpSent, setOtpSent] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  const [otp, setOtp] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [resendCount, setResendCount] = useState(0);

  const [address, setAddress] = useState(abhaAddress);
  const [choosing, setChoosing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [custom, setCustom] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedErrorState | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function run(task: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await task();
    } catch (err) {
      setError(mapApiError(err, { label: "Try again", onClick: () => setError(null) }));
    } finally {
      setBusy(false);
    }
  }

  const sendMobileOtp = (isResend = false) => {
    if (isResend && resendCount >= MAX_OTP_RESENDS) return Promise.resolve();
    return run(async () => {
      const res = await withAbdmSession(environment, () => requestEnrolMobileOtp({ transactionId, mobile, environment }));
      setOtpMessage(res.message);
      setOtpSent(true);
      setOtp("");
      setResendCount(isResend ? resendCount + 1 : 0);
      setResendIn(OTP_RESEND_SECONDS);
    });
  };

  const confirmMobileOtp = () => {
    const clean = otp.replace(/\D/g, "");
    if (clean.length !== 6) {
      setError({ tone: "error", title: "Invalid OTP", body: "OTP must be exactly 6 digits." });
      return Promise.resolve();
    }
    return run(async () => {
      await withAbdmSession(environment, () => verifyEnrolMobileOtp({ transactionId, otp: clean, environment }));
      setVerified(true);
      setOtpSent(false);
    });
  };

  const openAddressChooser = () =>
    run(async () => {
      const res = await withAbdmSession(environment, () => getAbhaAddressSuggestions(transactionId, environment));
      setSuggestions(res.data.suggestions);
      setChoosing(true);
    });

  const saveAddress = (name: string) =>
    run(async () => {
      const res = await withAbdmSession(environment, () => createAbhaAddress({ transactionId, abhaAddress: name, environment }));
      setAddress(res.data.abhaAddress);
      setChoosing(false);
    });

  const customName = custom.trim().toLowerCase();
  const customError = customName && !isValidAbhaAddressName(customName) ? "This does not follow the ABHA address rules below." : "";

  return (
    <div className="card-form">
      <h2>ABHA created</h2>
      <p className="lead">
        <span className="dot ok" />
        The ABHA is created and linked to this patient. Two optional steps remain.
      </p>
      <div className="kv" style={{ marginBottom: 16 }}>
        <div className="k">ABHA number</div>
        <div className="mono">{abhaNumber}</div>
        <div className="k">ABHA address</div>
        <div className="mono">{address ?? "—"}</div>
      </div>

      {error && (
        <div style={{ marginBottom: 14 }}>
          <StopState {...error} />
        </div>
      )}

      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>1. Mobile number</div>
      {verified ? (
        <p className="osh-sub" style={{ margin: "0 0 16px" }}>
          <span className="dot ok" />
          +91 {mobile} is verified for this ABHA.
        </p>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <p className="osh-sub" style={{ margin: "0 0 8px" }}>
            +91 {mobile} is not the mobile linked to the Aadhaar, so it must be verified with an OTP.
          </p>
          {!otpSent ? (
            <button className="btn btn-ghost" type="button" onClick={() => sendMobileOtp()} disabled={busy}>
              {busy ? "Sending..." : "Send OTP to this mobile"}
            </button>
          ) : (
            <>
              {otpMessage && <p className="osh-sub" style={{ margin: "0 0 8px" }}>{otpMessage}</p>}
              <div className="field" style={{ maxWidth: 220 }}>
                <label>OTP</label>
                <input
                  className="input mono"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="______"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  disabled={busy}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" type="button" onClick={confirmMobileOtp} disabled={busy}>
                  {busy ? "Verifying..." : "Verify mobile"}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => sendMobileOtp(true)}
                  disabled={busy || resendIn > 0 || resendCount >= MAX_OTP_RESENDS}
                >
                  {resendCount >= MAX_OTP_RESENDS
                    ? "Resend limit reached"
                    : resendIn > 0
                      ? `Resend OTP in ${resendIn}s`
                      : `Resend OTP (${MAX_OTP_RESENDS - resendCount} left)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>2. ABHA address</div>
      <p className="osh-sub" style={{ margin: "0 0 8px" }}>
        Current address: <span className="mono">{address ?? "—"}</span>
      </p>
      {!choosing ? (
        <button className="btn btn-ghost" type="button" onClick={openAddressChooser} disabled={busy}>
          {busy ? "Loading..." : "Choose a personalised address"}
        </button>
      ) : (
        <div>
          {suggestions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {suggestions.map((s) => (
                <button key={s} className="btn btn-ghost" type="button" onClick={() => saveAddress(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="field" style={{ maxWidth: 320 }}>
            <label>Or type your own</label>
            <input
              className="input mono"
              placeholder="for example ramesh.gupta"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              disabled={busy}
            />
            {customError && <div className="hint" style={{ color: "var(--error)" }}>{customError}</div>}
            <ul className="hint" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {ABHA_ADDRESS_POLICY.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => saveAddress(customName)}
              disabled={busy || !customName || Boolean(customError)}
            >
              {busy ? "Saving..." : "Use this address"}
            </button>
            <button className="btn-link" type="button" onClick={() => setChoosing(false)} disabled={busy}>
              Keep the current address
            </button>
          </div>
        </div>
      )}

      <div className="form-actions" style={{ justifyContent: "flex-start", marginTop: 24 }}>
        <button className="btn btn-primary" type="button" onClick={() => onDone(address)} disabled={busy}>
          Continue
        </button>
      </div>
    </div>
  );
}
