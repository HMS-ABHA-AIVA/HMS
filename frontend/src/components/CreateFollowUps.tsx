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

// ABDM rules for an ABHA address name: 4-18 characters, letters/digits, at most one "." and one "_".
const isValidAddressName = (value: string) =>
  /^(?=.{4,18}$)[a-z0-9]+([._][a-z0-9]+)*$/i.test(value) && (value.match(/\./g)?.length ?? 0) <= 1 && (value.match(/_/g)?.length ?? 0) <= 1;

const OTP_RESEND_SECONDS = 30;

/**
 * Shown right after an ABHA is created. Two optional steps ABDM defines for enrolment:
 *  1. verify the mobile number to link with the ABHA, when it is not the Aadhaar-linked one
 *  2. choose a personalised ABHA address (the ABHA already has a default one)
 */
export function CreateFollowUps({
  transactionId,
  mobile,
  mobileVerified,
  abhaAddress,
  environment,
  onDone,
}: {
  transactionId: string;
  mobile: string;
  mobileVerified: boolean;
  abhaAddress: string | null;
  environment: AbdmEnvironment;
  onDone: () => void;
}) {
  const [verified, setVerified] = useState(mobileVerified);
  const [otpSent, setOtpSent] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  const [otp, setOtp] = useState("");
  const [resendIn, setResendIn] = useState(0);

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

  const sendMobileOtp = () =>
    run(async () => {
      const res = await withAbdmSession(environment, () => requestEnrolMobileOtp({ transactionId, mobile, environment }));
      setOtpMessage(res.message);
      setOtpSent(true);
      setOtp("");
      setResendIn(OTP_RESEND_SECONDS);
    });

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
  const customError = customName && !isValidAddressName(customName)
    ? "4 to 18 characters: letters and numbers, with at most one dot and one underscore."
    : "";

  return (
    <div className="card-form">
      <h2>ABHA created</h2>
      <p className="lead">
        <span className="dot ok" />
        The ABHA is created and linked to this patient. Two optional steps remain.
      </p>

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
            <button className="btn btn-ghost" type="button" onClick={sendMobileOtp} disabled={busy}>
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
                <button className="btn btn-ghost" type="button" onClick={sendMobileOtp} disabled={busy || resendIn > 0}>
                  {resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend OTP"}
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
        <button className="btn btn-primary" type="button" onClick={onDone} disabled={busy}>
          Continue
        </button>
      </div>
    </div>
  );
}
