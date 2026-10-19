import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import {
  addStaff,
  listStaff,
  removeStaffLogin,
  setStaffLogin,
  updateStaff,
  type StaffInput,
  type StaffMember,
} from "@/api/endpoints";
import { mapApiError } from "@/lib/errorHelper";
import { ROLE_LABELS, type StaffRole } from "@/lib/session";
import { useAuthStore } from "@/store/useAuthStore";

const ROLES = Object.keys(ROLE_LABELS) as StaffRole[];

interface Draft {
  name: string;
  role: StaffRole;
  department: string;
  hprId: string;
  employmentType: "salaried" | "visiting_fee";
  monthlySalary: string;
  feePerConsult: string;
  consultationFee: string;
  bankAccountLast4: string;
  loginEmail: string;
  loginPassword: string;
}

const emptyDraft = (): Draft => ({
  name: "", role: "front_office", department: "", hprId: "", employmentType: "salaried",
  monthlySalary: "", feePerConsult: "", consultationFee: "", bankAccountLast4: "", loginEmail: "", loginPassword: "",
});

const draftOf = (s: StaffMember): Draft => ({
  name: s.name, role: s.role, department: s.department, hprId: s.hprId ?? "", employmentType: s.employmentType,
  monthlySalary: s.monthlySalary?.toString() ?? "", feePerConsult: s.feePerConsult?.toString() ?? "",
  consultationFee: s.consultationFee?.toString() ?? "", bankAccountLast4: s.bankAccountLast4 ?? "", loginEmail: s.email ?? "", loginPassword: "",
});

const num = (v: string) => (v.trim() === "" ? null : Number(v));

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="field" style={{ marginBottom: 10 }}>
      <label>{label}</label>
      {children}
      {hint && <div className="cell-mrn" style={{ marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

export function StaffPage() {
  const { session, environment, signOut } = useAuthStore();
  const facilityName = session?.kind === "facility" ? session.name : "City General Hospital";
  const staffName = session?.kind === "staff" ? session.name : "Asha Verma";
  const staffEmail = session?.kind === "staff" ? session.email : "asha.verma@citygeneral.example";
  const envDisplay = environment === "PRODUCTION" ? "Production" : "Sandbox";

  const [rows, setRows] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // null = form closed, "new" = adding, otherwise the id being edited
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const current = rows.find((r) => r.id === editing) ?? null;

  const load = useCallback(async () => {
    try {
      setRows((await listStaff()).data);
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
  }, [load]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function open(target: "new" | StaffMember) {
    setNotice("");
    setError("");
    if (target === "new") {
      setEditing("new");
      setDraft(emptyDraft());
    } else {
      setEditing(target.id);
      setDraft(draftOf(target));
    }
  }

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      setNotice(done);
      await load();
      return true;
    } catch (err) {
      const m = mapApiError(err);
      setError(`${m.title}. ${m.body}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const bodyOf = (): Omit<StaffInput, "login"> => ({
    name: draft.name.trim(),
    role: draft.role,
    department: draft.department.trim(),
    hprId: draft.hprId.trim() || null,
    employmentType: draft.employmentType,
    monthlySalary: num(draft.monthlySalary),
    feePerConsult: num(draft.feePerConsult),
    consultationFee: num(draft.consultationFee),
    bankAccountLast4: draft.bankAccountLast4.trim() || null,
  });

  async function save() {
    if (editing === "new") {
      const login = draft.loginEmail.trim() && draft.loginPassword ? { email: draft.loginEmail.trim(), password: draft.loginPassword } : undefined;
      if (await run(() => addStaff({ ...bodyOf(), ...(login ? { login } : {}) }), "Staff member added.")) setEditing(null);
    } else if (editing) {
      if (await run(() => updateStaff(editing, bodyOf()), "Changes saved.")) setEditing(null);
    }
  }

  const saveLogin = () =>
    editing && run(() => setStaffLogin(editing, { email: draft.loginEmail.trim(), password: draft.loginPassword }), "Login saved. Any open session of this person has ended.").then(() => set("loginPassword", ""));

  const toggleActive = (s: StaffMember) =>
    window.confirm(`${s.active ? "Deactivate" : "Reactivate"} ${s.name}?${s.active && s.hasLogin ? " They will be signed out and cannot sign in." : ""}`) &&
    run(() => updateStaff(s.id, { active: !s.active }), s.active ? "Deactivated." : "Reactivated.");

  const removeLogin = (s: StaffMember) =>
    window.confirm(`Remove the login of ${s.name}? They stay on the staff list but can no longer sign in.`) &&
    run(() => removeStaffLogin(s.id), "Login removed.").then(() => setEditing(null));

  return (
    <AppShell active="staff" facilityName={facilityName} staffName={staffName} staffEmail={staffEmail} env={envDisplay} onLogout={signOut}>
      <h1 className="osh-h1">Staff</h1>
      <p className="osh-sub">Everyone who works at <b>{facilityName}</b>, what they may do, and who can sign in.</p>

      {error && <div className="notice error" style={{ maxWidth: 820 }}>{error}</div>}
      {notice && <div className="notice success" style={{ maxWidth: 820 }}>{notice}</div>}

      <div style={{ margin: "0 0 12px" }}>
        <button className="btn btn-primary" onClick={() => open("new")}>Add staff member</button>
      </div>

      {editing && (
        <div className="panel" style={{ padding: 16, marginBottom: 16, maxWidth: 820 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>{editing === "new" ? "New staff member" : `Edit ${current?.name ?? ""}`}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 16px" }}>
            <Field label="Full name"><input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Role" hint="What they can do in the system">
              <select className="input" value={draft.role} onChange={(e) => set("role", e.target.value as StaffRole)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </Field>
            <Field label="Department"><input className="input" value={draft.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Medicine" /></Field>
            <Field label="HPR id" hint="Health Professional Registry id (ABDM), if registered"><input className="input" value={draft.hprId} onChange={(e) => set("hprId", e.target.value)} /></Field>
            <Field label="Employment">
              <select className="input" value={draft.employmentType} onChange={(e) => set("employmentType", e.target.value as Draft["employmentType"])}>
                <option value="salaried">Salaried</option>
                <option value="visiting_fee">Visiting (paid per consult)</option>
              </select>
            </Field>
            <Field label="Monthly salary (₹)"><input className="input" inputMode="decimal" value={draft.monthlySalary} onChange={(e) => set("monthlySalary", e.target.value)} /></Field>
            <Field label="Doctor's fee per consult (₹)" hint="Paid to the doctor"><input className="input" inputMode="decimal" value={draft.feePerConsult} onChange={(e) => set("feePerConsult", e.target.value)} /></Field>
            <Field label="Patient consultation fee (₹)" hint="Empty = the hospital's standard fee"><input className="input" inputMode="decimal" value={draft.consultationFee} onChange={(e) => set("consultationFee", e.target.value)} /></Field>
            <Field label="Bank account, last 4 digits" hint="Only the last four digits are stored"><input className="input" maxLength={4} inputMode="numeric" value={draft.bankAccountLast4} onChange={(e) => set("bankAccountLast4", e.target.value.replace(/\D/g, ""))} /></Field>
          </div>

          <div style={{ borderTop: "1px solid var(--line-2)", marginTop: 8, paddingTop: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              Sign-in {current?.hasLogin ? "(has a login)" : editing === "new" ? "(optional)" : "(none yet)"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 16px" }}>
              <Field label="E-mail"><input className="input" type="email" value={draft.loginEmail} onChange={(e) => set("loginEmail", e.target.value)} autoComplete="off" /></Field>
              <Field label={current?.hasLogin ? "New password" : "Password"} hint="At least 10 characters, letters and digits">
                <input className="input" type="password" value={draft.loginPassword} onChange={(e) => set("loginPassword", e.target.value)} autoComplete="new-password" />
              </Field>
            </div>
            {editing !== "new" && (
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="btn btn-ghost btn-sm" disabled={busy || !draft.loginEmail.trim() || !draft.loginPassword} onClick={saveLogin}>
                  {current?.hasLogin ? "Change e-mail / password" : "Give a login"}
                </button>
                {current?.hasLogin && <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => current && removeLogin(current)}>Remove login</button>}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn btn-primary" disabled={busy || draft.name.trim().length < 2 || !draft.department.trim()} onClick={save}>
              {busy ? "Saving..." : editing === "new" ? "Add" : "Save changes"}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="panel">
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-dim)" }}>Loading staff...</div>
        ) : (
          <table className="osh-table">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Department</th><th>HPR id</th><th>Patient fee</th><th>Sign-in</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} style={s.active ? undefined : { opacity: 0.55 }}>
                  <td className="cell-name">{s.name}{!s.active && <div className="cell-mrn">Inactive</div>}</td>
                  <td>{ROLE_LABELS[s.role]}</td>
                  <td>{s.department}</td>
                  <td className="mono">{s.hprId ?? "—"}</td>
                  <td>{s.role === "doctor" ? `₹${s.opdFee}${s.consultationFee === null ? " (standard)" : ""}` : "—"}</td>
                  <td>{s.hasLogin ? <><span className="dot ok" /> {s.email}</> : <span className="cell-mrn">No login</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => open(s)}>Edit</button>{" "}
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => toggleActive(s)}>{s.active ? "Deactivate" : "Reactivate"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
