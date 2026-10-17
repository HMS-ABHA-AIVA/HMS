// Dialog to admit a patient to a bed. Runs on demo data.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { useHospitalStore } from '@/store/useHospitalStore';
import type { Encounter } from '@/types';

export function AdmitToIpdModal({
  patientId,
  department,
  onClose,
  onAdmitted,
}: {
  patientId: string;
  department: string;
  onClose: () => void;
  /** Called with the new IPD encounter right after admission succeeds, before navigating — e.g. to link a source ER encounter. */
  onAdmitted?: (encounter: Encounter) => void;
}) {
  const { beds, staff, admitPatient } = useHospitalStore();
  const navigate = useNavigate();
  const vacantBeds = beds.filter((b) => b.status === 'vacant');
  const [bedId, setBedId] = useState(vacantBeds[0]?.id ?? '');
  const [dept, setDept] = useState(department);
  const doctors = staff.filter((s) => s.role === 'doctor');
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? '');

  function handleAdmit() {
    if (!bedId) return;
    const encounter = admitPatient(patientId, dept, doctorId, bedId);
    onAdmitted?.(encounter);
    onClose();
    navigate(`/ipd/patient/${encounter.id}`);
  }

  return (
    <Modal title="Admit to IPD" onClose={onClose} width={480}>
      {vacantBeds.length === 0 ? (
        <div className="empty-state">No vacant beds available right now.</div>
      ) : (
        <>
          <div className="field">
            <label>Department</label>
            <input value={dept} onChange={(e) => setDept(e.target.value)} />
          </div>
          <div className="field">
            <label>Attending Doctor</label>
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Bed</label>
            <select value={bedId} onChange={(e) => setBedId(e.target.value)}>
              {vacantBeds.map((b) => <option key={b.id} value={b.id}>{b.ward} — {b.bedNo}</option>)}
            </select>
          </div>
          <div className="flex-between" style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdmit}>Confirm Admission</button>
          </div>
        </>
      )}
    </Modal>
  );
}
