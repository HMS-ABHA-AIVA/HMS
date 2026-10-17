import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuthStore } from "@/store/useAuthStore";

export function OpdQueue() {
  const navigate = useNavigate();
  const { session, environment, signOut } = useAuthStore();
  const facilityName = session?.kind === "facility" ? session.name : "City General Hospital";
  const staffName = session?.kind === "staff" ? session.name : "Asha Verma";
  const staffEmail = session?.kind === "staff" ? session.email : "asha.verma@citygeneral.example";
  const envDisplay = environment === "PRODUCTION" ? "Production" : "Sandbox";

  const rows = [
    ["#11", "Harpreet Singh", "Orthopedics", "Dr. Vivek Menon", "doc", "With the doctor", "Resume consult"],
    ["#14", "Meera Iyer", "General Medicine", "Dr. Anita Rao", "wait", "Waiting", "Start consult"],
    ["#15", "Sana Qureshi", "Pediatrics", "Dr. Farah Khan", "wait", "Waiting", "Start consult"],
  ];

  function handleNavigate(key: string) {
    if (key === "dashboard") navigate("/");
    else if (key === "registration") navigate("/registration");
    else if (key === "opd") navigate("/opd");
  }

  return (
    <AppShell
      active="opd"
      facilityName={facilityName}
      staffName={staffName}
      staffEmail={staffEmail}
      env={envDisplay}
      onNavigate={handleNavigate}
      onLogout={signOut}
    >
      <h1 className="osh-h1">OPD queue</h1>
      <p className="osh-sub">Who is waiting, by token number.</p>
      <div className="notice" style={{ maxWidth: 760, marginBottom: 14 }}>
        This screen runs on demo data. Changes are temporary and are not saved to the backend.
      </div>
      <div className="panel">
        <table className="osh-table">
          <thead><tr><th>Token</th><th>Patient</th><th>Department</th><th>Doctor</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                <td className="mono">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td>
                <td><span className={`dot ${r[4] === "doc" ? "ok" : "pending"}`} />{r[5]}</td>
                <td><button className="btn btn-ghost" disabled>{r[6]}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="osh-sub" style={{ marginTop: 10 }}>Only doctors and administrators can start a consult.</p>
    </AppShell>
  );
}
