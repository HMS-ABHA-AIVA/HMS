// The ABHA figure comes from the patient list; the OPD, ER, bed, pharmacy and billing figures
// below run on demo data until the backend supports them.
import { Link } from 'react-router-dom';
import { useHospitalStore } from '@/store/useHospitalStore';
import { Badge } from '@/components/ui/Badge';
import { DemoDataNotice } from '@/components/ui/DemoDataNotice';

export function DashboardPage() {
  const { currentStaff, patients, encounters, beds, drugs, bills } = useHospitalStore();

  const opdWaiting = encounters.filter((e) => e.type === 'OPD' && e.status === 'waiting').length;
  const erActive = encounters.filter((e) => e.type === 'ER' && e.status === 'in_er');
  const erRed = erActive.filter((e) => e.triageLevel === 'red').length;
  const occupied = beds.filter((b) => b.status === 'occupied').length;
  const occupancyPct = Math.round((occupied / beds.length) * 100);
  const lowStock = drugs.filter((d) => d.stock <= d.reorderLevel);
  const draftBills = bills.filter((b) => b.status === 'draft').length;
  const abhaLinkedPct = Math.round((patients.filter((p) => p.abhaStatus === 'linked').length / patients.length) * 100);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <DemoDataNotice />
      <div className="topbar">
        <div>
          <h1>Welcome, {currentStaff.name}</h1>
          <div className="sub">{today} · {currentStaff.department}</div>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">OPD Waiting</div>
          <div className="value">{opdWaiting}</div>
          <div className="sub">tokens across all departments</div>
        </div>
        <div className="kpi">
          <div className="label">In ER</div>
          <div className="value">{erActive.length}</div>
          <div className="sub">{erRed > 0 ? `${erRed} red-triage` : 'active cases'}</div>
        </div>
        <div className="kpi">
          <div className="label">Bed Occupancy</div>
          <div className="value">{occupancyPct}%</div>
          <div className="sub">{occupied} of {beds.length} beds occupied</div>
        </div>
        <div className="kpi">
          <div className="label">ABHA Linked</div>
          <div className="value">{abhaLinkedPct}%</div>
          <div className="sub">of registered patients</div>
        </div>
        <div className="kpi">
          <div className="label">Draft Bills</div>
          <div className="value">{draftBills}</div>
          <div className="sub">awaiting finalization</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Today's OPD Queue</h3>
          <div className="card-sub">Live token status across departments</div>
          <table className="table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Patient</th>
                <th>Department</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {encounters
                .filter((e) => e.type === 'OPD')
                .slice(0, 6)
                .map((e) => {
                  const patient = patients.find((p) => p.id === e.patientId);
                  return (
                    <tr key={e.id}>
                      <td className="mono">#{e.tokenNo}</td>
                      <td>{patient?.name}</td>
                      <td>{e.department}</td>
                      <td>
                        {e.status === 'waiting' && <Badge tone="warn">Waiting</Badge>}
                        {e.status === 'in_consult' && <Badge tone="info">In Consult</Badge>}
                        {e.status === 'closed' && <Badge tone="ok">Closed</Badge>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}>
            <Link to="/opd" className="btn btn-sm">Open OPD Queue →</Link>
          </div>
        </div>

        <div className="card">
          <h3>Pharmacy Stock Alerts</h3>
          <div className="card-sub">Items at or below reorder level</div>
          {lowStock.length === 0 && <div className="empty-state">No stock alerts right now.</div>}
          {lowStock.map((d) => (
            <div key={d.id} className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Batch {d.batch} · exp {d.expiry}</div>
              </div>
              <Badge tone="danger">{d.stock} {d.unit} left</Badge>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <Link to="/pharmacy" className="btn btn-sm">Open Pharmacy →</Link>
          </div>
        </div>
      </div>
    </>
  );
}
