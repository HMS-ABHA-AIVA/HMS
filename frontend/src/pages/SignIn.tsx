import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { registerFacility } from "@/api/endpoints";

export function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInStaff, signInFacility } = useAuthStore();

  const [tab, setTab] = useState<"staff" | "owner">("staff");
  const [isRegisteringFacility, setIsRegisteringFacility] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Facility registration fields
  const [facName, setFacName] = useState("");
  const [facHfrId, setFacHfrId] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (isRegisteringFacility) {
        if (!facName.trim() || !email.trim() || !facHfrId.trim() || !password.trim()) {
          throw new Error("All fields are required to register a facility.");
        }
        await registerFacility({
          name: facName.trim(),
          email: email.trim(),
          hfrId: facHfrId.trim(),
          password,
        });
        setSuccessMsg("Facility registered successfully. Please sign in as Facility owner.");
        setIsRegisteringFacility(false);
        setTab("owner");
        setLoading(false);
        return;
      }

      if (tab === "staff") {
        await signInStaff(email.trim(), password);
        const from = (location.state as { from?: string } | null)?.from;
        navigate(from || "/", { replace: true });
      } else {
        await signInFacility(email.trim(), password);
        navigate("/facility-setup", { replace: true });
      }
    } catch (err: any) {
      setError(err?.message || "Sign in failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="signin">
      <div className="signin-left">
        <div className="brand">AIVA OSHealth</div>
        <div className="tag">Patient registration and ABHA linking for hospital staff</div>
        <div className="setup">
          <h3>Setting up a new hospital?</h3>
          <p>Do these in order. Staff can only sign in after step 3.</p>
          <ol>
            <li>Register the facility</li>
            <li>Sign in as the facility and save the ABDM client ID and secret</li>
            <li>Create an account for each staff member</li>
            <li>Staff sign in and register patients</li>
          </ol>
        </div>
      </div>
      <div className="signin-right">
        <form className="signin-card" onSubmit={submit}>
          <h1>{isRegisteringFacility ? "Register facility" : "Sign in"}</h1>

          {!isRegisteringFacility && (
            <>
              <div className="seg">
                <button
                  type="button"
                  className={tab === "staff" ? "on" : ""}
                  onClick={() => { setTab("staff"); setError(null); }}
                >
                  Staff
                </button>
                <button
                  type="button"
                  className={tab === "owner" ? "on" : ""}
                  onClick={() => { setTab("owner"); setError(null); }}
                >
                  Facility owner
                </button>
              </div>
              <div className="subtabs">
                {tab === "staff"
                  ? "For receptionists, nurses and other hospital staff."
                  : "For the person who owns the facility and holds the ABDM credentials."}
              </div>
            </>
          )}

          {isRegisteringFacility && (
            <>
              <div className="subtabs">
                Enter your hospital information. Name must be 3–20 characters.
              </div>
              <div className="field">
                <label>Facility name</label>
                <input
                  className="input"
                  placeholder="e.g. City General Hospital"
                  value={facName}
                  onChange={(e) => setFacName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <div className="field">
                <label>HFR ID</label>
                <input
                  className="input mono"
                  placeholder="e.g. IN2410001234"
                  value={facHfrId}
                  onChange={(e) => setFacHfrId(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            </>
          )}

          <div className="field">
            <label>Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
            {isRegisteringFacility && (
              <div className="hint">Password must be 8 to 20 characters.</div>
            )}
          </div>

          {error && <div style={{ color: "var(--error)", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          {successMsg && <div style={{ color: "var(--ok)", fontSize: 12.5, marginBottom: 10 }}><span className="dot ok" />{successMsg}</div>}

          <button className="btn btn-primary" style={{ width: "100%" }} type="submit" disabled={loading}>
            {loading ? "Please wait..." : isRegisteringFacility ? "Register facility" : "Sign in"}
          </button>

          <div style={{ fontSize: 12.5, marginTop: 14 }}>
            {isRegisteringFacility ? (
              <span>Already registered? <a onClick={() => { setIsRegisteringFacility(false); setError(null); }} style={{ cursor: "pointer" }}>Sign in</a></span>
            ) : (
              <span>New hospital? <a onClick={() => { setIsRegisteringFacility(true); setError(null); }} style={{ cursor: "pointer" }}>Register a facility</a></span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
