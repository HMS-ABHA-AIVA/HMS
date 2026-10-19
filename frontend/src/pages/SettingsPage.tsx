import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import {
  getFacilityProfile,
  getHospitalSettings,
  saveFacilityProfile,
  saveHospitalSettings,
  type FacilityProfile,
  type HospitalSettings,
} from "@/api/endpoints";
import { mapApiError } from "@/lib/errorHelper";
import { useAuthStore } from "@/store/useAuthStore";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field" style={{ marginBottom: 10 }}>
      <label>{label}</label>
      {children}
      {hint && <div className="cell-mrn" style={{ marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 16px" } as const;
const text = (v: string) => (v.trim() === "" ? null : v.trim());

export function SettingsPage() {
  const { session, environment, signOut } = useAuthStore();
  const facilityName = session?.kind === "facility" ? session.name : "City General Hospital";
  const staffName = session?.kind === "staff" ? session.name : "Asha Verma";
  const staffEmail = session?.kind === "staff" ? session.email : "asha.verma@citygeneral.example";
  const envDisplay = environment === "PRODUCTION" ? "Production" : "Sandbox";

  const [profile, setProfile] = useState<FacilityProfile | null>(null);
  const [settings, setSettings] = useState<HospitalSettings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"" | "profile" | "settings">("");

  useEffect(() => {
    Promise.all([getFacilityProfile(), getHospitalSettings()])
      .then(([p, s]) => {
        setProfile(p.data);
        setSettings(s.data);
      })
      .catch((err) => {
        const m = mapApiError(err);
        setError(`${m.title}. ${m.body}`);
      });
  }, []);

  async function saveProfile() {
    if (!profile) return;
    setBusy("profile");
    setError("");
    setNotice("");
    try {
      const { email: _email, ...body } = profile;
      setProfile((await saveFacilityProfile(body)).data);
      setNotice("Hospital profile saved.");
    } catch (err) {
      const m = mapApiError(err);
      setError(`${m.title}. ${m.body}`);
    } finally {
      setBusy("");
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setBusy("settings");
    setError("");
    setNotice("");
    try {
      setSettings((await saveHospitalSettings(settings)).data);
      setNotice("Settings saved.");
    } catch (err) {
      const m = mapApiError(err);
      setError(`${m.title}. ${m.body}`);
    } finally {
      setBusy("");
    }
  }

  const p = (key: keyof FacilityProfile, value: string | number | null) => setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
  const s = <K extends keyof HospitalSettings>(key: K, value: HospitalSettings[K]) => setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  const money = (key: "opdDefaultFee" | "erFee" | "unlistedTestPrice" | "unlistedMedicinePrice" | "medicineGstPct", v: string) => s(key, Number(v));

  return (
    <AppShell active="settings" facilityName={facilityName} staffName={staffName} staffEmail={staffEmail} env={envDisplay} onLogout={signOut}>
      <h1 className="osh-h1">Hospital settings</h1>
      <p className="osh-sub">Who the hospital is, and the fees and print text the system uses.</p>

      {error && <div className="notice error" style={{ maxWidth: 820 }}>{error}</div>}
      {notice && <div className="notice success" style={{ maxWidth: 820 }}>{notice}</div>}

      {profile && (
        <div className="panel" style={{ padding: 16, maxWidth: 820, marginBottom: 18 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>Hospital profile</h3>
          <div style={grid}>
            <Field label="Hospital name"><input className="input" value={profile.name} onChange={(e) => p("name", e.target.value)} /></Field>
            <Field label="HFR id" hint="Health Facility Registry id. ABDM callbacks are routed by it."><input className="input" value={profile.hfrId} onChange={(e) => p("hfrId", e.target.value)} /></Field>
            <Field label="HIP id" hint="What ABDM's gateway calls this facility"><input className="input" value={profile.hipId ?? ""} onChange={(e) => p("hipId", text(e.target.value))} /></Field>
            <Field label="Facility type"><input className="input" value={profile.facilityType ?? ""} onChange={(e) => p("facilityType", text(e.target.value))} placeholder="Hospital, clinic..." /></Field>
            <Field label="Address"><input className="input" value={profile.address ?? ""} onChange={(e) => p("address", text(e.target.value))} /></Field>
            <Field label="State"><input className="input" value={profile.state ?? ""} onChange={(e) => p("state", text(e.target.value))} /></Field>
            <Field label="District"><input className="input" value={profile.district ?? ""} onChange={(e) => p("district", text(e.target.value))} /></Field>
            <Field label="Pincode"><input className="input" maxLength={6} inputMode="numeric" value={profile.pincode ?? ""} onChange={(e) => p("pincode", text(e.target.value.replace(/\D/g, "")))} /></Field>
            <Field label="Phone"><input className="input" value={profile.phone ?? ""} onChange={(e) => p("phone", text(e.target.value))} /></Field>
            <Field label="Latitude"><input className="input" inputMode="decimal" value={profile.latitude ?? ""} onChange={(e) => p("latitude", e.target.value === "" ? null : Number(e.target.value))} /></Field>
            <Field label="Longitude"><input className="input" inputMode="decimal" value={profile.longitude ?? ""} onChange={(e) => p("longitude", e.target.value === "" ? null : Number(e.target.value))} /></Field>
          </div>
          <button className="btn btn-primary" disabled={busy !== ""} onClick={saveProfile}>{busy === "profile" ? "Saving..." : "Save profile"}</button>
        </div>
      )}

      {settings && (
        <div className="panel" style={{ padding: 16, maxWidth: 820 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>Fees and billing</h3>
          <div style={grid}>
            <Field label="Standard OPD consultation fee (₹)" hint="For a doctor with no fee of their own"><input className="input" inputMode="decimal" value={settings.opdDefaultFee} onChange={(e) => money("opdDefaultFee", e.target.value)} /></Field>
            <Field label="Emergency fee (₹)"><input className="input" inputMode="decimal" value={settings.erFee} onChange={(e) => money("erFee", e.target.value)} /></Field>
            <Field label="Unlisted test price (₹)" hint="A test typed in free text"><input className="input" inputMode="decimal" value={settings.unlistedTestPrice} onChange={(e) => money("unlistedTestPrice", e.target.value)} /></Field>
            <Field label="Unlisted medicine price (₹ per unit)"><input className="input" inputMode="decimal" value={settings.unlistedMedicinePrice} onChange={(e) => money("unlistedMedicinePrice", e.target.value)} /></Field>
            <Field label="GST on unlisted medicine (%)"><input className="input" inputMode="decimal" value={settings.medicineGstPct} onChange={(e) => money("medicineGstPct", e.target.value)} /></Field>
            <Field label="Bed-day checkout hour (0-23)" hint="Staying past this hour on a later date charges another day"><input className="input" inputMode="numeric" value={settings.bedDayCheckoutHour} onChange={(e) => s("bedDayCheckoutHour", Number(e.target.value))} /></Field>
            <Field label="GSTIN"><input className="input" maxLength={15} value={settings.gstin} onChange={(e) => s("gstin", e.target.value.toUpperCase())} placeholder="27ABCDE1234F1Z5" /></Field>
            <Field label="Registration number"><input className="input" value={settings.registrationNo} onChange={(e) => s("registrationNo", e.target.value)} /></Field>
            <Field label="Drug licence number"><input className="input" value={settings.drugLicenseNo} onChange={(e) => s("drugLicenseNo", e.target.value)} /></Field>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0 12px", fontSize: 13 }}>
            <input type="checkbox" checked={settings.requireReportVerification} onChange={(e) => s("requireReportVerification", e.target.checked)} />
            A lab report must be signed by someone other than the person who entered the results
          </label>
          <Field label="Bill footer"><input className="input" value={settings.billFooter} onChange={(e) => s("billFooter", e.target.value)} /></Field>
          <Field label="Admission consent wording">
            <textarea className="input" rows={5} value={settings.consentText} onChange={(e) => s("consentText", e.target.value)} />
          </Field>
          <button className="btn btn-primary" disabled={busy !== ""} onClick={saveSettings}>{busy === "settings" ? "Saving..." : "Save settings"}</button>
        </div>
      )}
    </AppShell>
  );
}
