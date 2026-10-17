// Hidden for now (not routed): a log of who did what in the app.
import { useHospitalStore } from '@/store/useHospitalStore';

export function AuditPage() {
  const { auditLog } = useHospitalStore();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Audit Log</h1>
          <div className="sub">Immutable trail of clinical & financial record changes (who, when, what) — NABH/ABDM audit readiness</div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr>
          </thead>
          <tbody>
            {auditLog.map((a) => (
              <tr key={a.id}>
                <td className="mono" style={{ fontSize: 11.5 }}>{new Date(a.at).toLocaleString('en-IN')}</td>
                <td>{a.user}</td>
                <td style={{ fontWeight: 500 }}>{a.action}</td>
                <td style={{ color: 'var(--ink-soft)' }}>{a.detail}</td>
              </tr>
            ))}
            {auditLog.length === 0 && <tr><td colSpan={4} className="empty-state">No actions logged yet this session.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
