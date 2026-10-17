// Ward bed board with live occupancy. Runs on demo data.
import { useNavigate } from 'react-router-dom';
// When the housekeeping page is switched back on, also restore this import and the button below:
// import { Link } from 'react-router-dom';
import { useHospitalStore } from '@/store/useHospitalStore';
import type { BedStatus } from '@/types';
import { DemoDataNotice } from '@/components/ui/DemoDataNotice';

const STATUS_LABEL: Record<BedStatus, string> = {
  occupied: 'Occupied',
  dirty: 'Dirty',
  cleaning: 'Cleaning',
  vacant: 'Vacant & Ready',
};

export function BedBoardPage() {
  const { beds, patients, encounters } = useHospitalStore();
  const navigate = useNavigate();

  const wards = Array.from(new Set(beds.map((b) => b.ward)));
  const occupied = beds.filter((b) => b.status === 'occupied').length;
  const vacant = beds.filter((b) => b.status === 'vacant').length;
  const dirty = beds.filter((b) => b.status === 'dirty').length;
  const cleaning = beds.filter((b) => b.status === 'cleaning').length;

  function openBed(encounterId?: string) {
    if (encounterId) navigate(`/ipd/patient/${encounterId}`);
  }

  return (
    <>
      <DemoDataNotice />
      <div className="topbar">
        <div>
          <h1>IPD / Bed Board</h1>
          <div className="sub">Real-time ward occupancy</div>
        </div>
        {/* <Link to="/housekeeping" className="btn btn-sm">Housekeeping Turnover →</Link> */}
      </div>

      <div className="kpi-row">
        <div className="kpi"><div className="label">Occupied</div><div className="value">{occupied}</div></div>
        <div className="kpi"><div className="label">Awaiting Cleaning</div><div className="value">{dirty}</div></div>
        <div className="kpi"><div className="label">Cleaning In Progress</div><div className="value">{cleaning}</div></div>
        <div className="kpi"><div className="label">Vacant & Ready</div><div className="value">{vacant}</div></div>
      </div>

      <div className="status-legend" style={{ marginBottom: 16 }}>
        <span className="item"><span className="swatch occupied" /> Occupied</span>
        <span className="item"><span className="swatch dirty" /> Dirty — awaiting cleaning</span>
        <span className="item"><span className="swatch cleaning" /> Cleaning in progress</span>
        <span className="item"><span className="swatch vacant" /> Vacant & ready</span>
      </div>

      {wards.map((ward) => (
        <div key={ward} className="card">
          <h3>{ward}</h3>
          <div className="bed-grid" style={{ marginTop: 12 }}>
            {beds.filter((b) => b.ward === ward).map((b) => {
              const patient = patients.find((p) => p.id === b.patientId);
              const encounter = encounters.find((e) => e.id === b.encounterId);
              return (
                <div key={b.id} className={`bed-card ${b.status}`} onClick={() => openBed(b.encounterId)}>
                  <div className="bno">{b.bedNo}</div>
                  <div className="bst">{STATUS_LABEL[b.status]}</div>
                  {patient && <div className="bwho">{patient.name}</div>}
                  {encounter?.admittedAt && (
                    <div className="bwho">since {new Date(encounter.admittedAt).toLocaleDateString('en-IN')}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
