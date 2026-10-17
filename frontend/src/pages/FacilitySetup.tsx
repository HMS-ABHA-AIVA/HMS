import { useState } from "react";
import { OwnerShell } from "../components/AppShell";
import { useAuthStore } from "@/store/useAuthStore";
import { addAbdmDetails, createStaffAccount } from "@/api/endpoints";

export function FacilitySetup() {
  const { session, signOut } = useAuthStore();
  const facilityName = session?.kind === "facility" ? session.name : "City General Hospital";
  const hfrId = session?.kind === "facility" ? session.hfrId : "IN2410001234";

  const [env, setEnv] = useState<"Sandbox" | "Production">("Sandbox");

  // ABDM credentials form
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [credLoading, setCredLoading] = useState(false);
  const [credSuccess, setCredSuccess] = useState<string | null>(null);
  const [credError, setCredError] = useState<string | null>(null);

  // Staff account form
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffSuccess, setStaffSuccess] = useState<string | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);

  async function handleSaveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setCredError(null);
    setCredSuccess(null);

    if (!clientId.trim() || !clientSecret.trim()) {
      setCredError("Both Client ID and Client Secret are required.");
      return;
    }

    setCredLoading(true);
    try {
      await addAbdmDetails({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        environment: env.toUpperCase() as "SANDBOX" | "PRODUCTION",
      });
      // The secret is cleared from this screen after saving (never echoed back)
      setClientSecret("");
      setCredSuccess(`ABDM ${env.toLowerCase()} credentials verified and saved.`);
    } catch (err: any) {
      setCredError(err?.message || "Failed to verify and save ABDM credentials.");
    } finally {
      setCredLoading(false);
    }
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    setStaffError(null);
    setStaffSuccess(null);

    if (!staffName.trim() || !staffEmail.trim() || !staffPassword.trim()) {
      setStaffError("Name, email, and password are required.");
      return;
    }

    if (staffName.trim().length < 3 || staffName.trim().length > 20) {
      setStaffError("Name must be between 3 and 20 characters.");
      return;
    }

    if (staffPassword.length < 6 || staffPassword.length > 20) {
      setStaffError("Password must be between 6 and 20 characters.");
      return;
    }

    setStaffLoading(true);
    try {
      await createStaffAccount({
        name: staffName.trim(),
        email: staffEmail.trim(),
        password: staffPassword,
      });
      setStaffSuccess(`Staff account for ${staffName} created successfully.`);
      setStaffName("");
      setStaffEmail("");
      setStaffPassword("");
    } catch (err: any) {
      setStaffError(err?.message || "Failed to create staff account.");
    } finally {
      setStaffLoading(false);
    }
  }

  return (
    <OwnerShell facilityName={facilityName} onLogout={signOut}>
      <h1 className="osh-h1">Facility setup</h1>
      <p className="osh-sub">{facilityName}, HFR ID {hfrId}</p>
      <div className="info-strip" style={{ maxWidth: 680 }}>
        Patient registration and ABHA work under a staff sign-in. When you finish here, log out and sign in as staff.
      </div>

      <hr className="sep" />
      <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>ABDM credentials</h3>
      <div className="reg-wrap" style={{ gridTemplateColumns: "1fr 1fr", maxWidth: 680 }}>
        <p className="osh-sub">The client ID and secret ABDM issued for this hospital. They are checked with ABDM when you save, and the secret is stored encrypted.</p>
        <form onSubmit={handleSaveCredentials}>
          <div className="field">
            <label>Environment</label>
            <div className="seg">
              <button type="button" className={env === "Sandbox" ? "on" : ""} onClick={() => { setEnv("Sandbox"); setCredSuccess(null); setCredError(null); }}>Sandbox</button>
              <button type="button" className={env === "Production" ? "on" : ""} onClick={() => { setEnv("Production"); setCredSuccess(null); setCredError(null); }}>Production</button>
            </div>
          </div>
          <div className="field">
            <label>Client ID</label>
            <input
              className="input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={credLoading}
            />
          </div>
          <div className="field">
            <label>Client secret</label>
            <input
              className="input"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              disabled={credLoading}
            />
            <div className="hint">The secret is cleared from this screen after saving.</div>
          </div>
          {credError && <div style={{ color: "var(--error)", fontSize: 12.5, marginBottom: 10 }}>{credError}</div>}
          <button className="btn btn-primary" type="submit" disabled={credLoading}>
            {credLoading ? "Verifying..." : "Save credentials"}
          </button>
          {credSuccess && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <span className="dot ok" />{credSuccess}
            </div>
          )}
        </form>
      </div>

      <hr className="sep" />
      <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>Staff accounts</h3>
      <div className="reg-wrap" style={{ gridTemplateColumns: "1fr 1fr", maxWidth: 680 }}>
        <p className="osh-sub">Create a sign-in for each person who registers patients or works with ABHA.</p>
        <form onSubmit={handleAddStaff}>
          <div className="field">
            <label>Name</label>
            <input
              className="input"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              disabled={staffLoading}
            />
            <div className="hint">3 to 20 characters</div>
          </div>
          <div className="field">
            <label>Email</label>
            <input
              className="input"
              type="email"
              value={staffEmail}
              onChange={(e) => setStaffEmail(e.target.value)}
              disabled={staffLoading}
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              className="input"
              type="password"
              value={staffPassword}
              onChange={(e) => setStaffPassword(e.target.value)}
              disabled={staffLoading}
            />
            <div className="hint">6 to 20 characters</div>
          </div>
          {staffError && <div style={{ color: "var(--error)", fontSize: 12.5, marginBottom: 10 }}>{staffError}</div>}
          <button className="btn btn-primary" type="submit" disabled={staffLoading}>
            {staffLoading ? "Creating..." : "Add staff member"}
          </button>
          {staffSuccess && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <span className="dot ok" />{staffSuccess}
            </div>
          )}
        </form>
      </div>
    </OwnerShell>
  );
}
