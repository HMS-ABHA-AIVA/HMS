// Today's OPD queue. Runs on demo data.
import { useNavigate } from 'react-router-dom';
import { useHospitalStore } from '@/store/useHospitalStore';
import { Badge } from '@/components/ui/Badge';
import { DemoDataNotice } from '@/components/ui/DemoDataNotice';

export function OpdQueuePage() {
  const { encounters, patients, staff, currentRole, startConsult } = useHospitalStore();
  const navigate = useNavigate();

  const opd = encounters
    .filter((e) => e.type === 'OPD' && e.status !== 'closed' && e.status !== 'billed')
    .sort((a, b) => (a.tokenNo ?? 0) - (b.tokenNo ?? 0));

  function openConsult(encounterId: string) {
    startConsult(encounterId);
    navigate(`/opd/consult/${encounterId}`);
  }

  return (
    <>
      <DemoDataNotice />
      <div className="topbar">
        <div>
          <h1>OPD Queue</h1>
          <div className="sub">Live token status across all departments</div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Patient</th>
              <th>Department</th>
              <th>Doctor</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {opd.map((e) => {
              const patient = patients.find((p) => p.id === e.patientId);
              const doctor = staff.find((s) => s.id === e.doctorId);
              return (
                <tr key={e.id} className="clickable" onClick={() => openConsult(e.id)}>
                  <td className="mono">#{e.tokenNo}</td>
                  <td style={{ fontWeight: 500 }}>{patient?.name}</td>
                  <td>{e.department}</td>
                  <td>{doctor?.name}</td>
                  <td>
                    {e.status === 'waiting' && <Badge tone="warn">Waiting</Badge>}
                    {e.status === 'in_consult' && <Badge tone="info">In Consult</Badge>}
                  </td>
                  <td>
                    <button className="btn btn-sm" disabled={currentRole !== 'doctor' && currentRole !== 'admin'} onClick={(ev) => { ev.stopPropagation(); openConsult(e.id); }}>
                      {e.status === 'in_consult' ? 'Resume' : 'Start Consult'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {opd.length === 0 && (
              <tr><td colSpan={6} className="empty-state">No patients waiting.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
