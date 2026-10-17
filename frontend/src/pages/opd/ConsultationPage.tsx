// A doctor's consultation: notes, vitals, prescriptions and orders. Runs on demo data.
import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useHospitalStore } from '@/store/useHospitalStore';
import { ageGender } from '@/lib/patientHelpers';
import { Badge } from '@/components/ui/Badge';
import { AdmitToIpdModal } from '@/pages/ipd/AdmitToIpdModal';
import { VitalsForm } from '@/components/VitalsForm';
import { DemoDataNotice } from '@/components/ui/DemoDataNotice';

export function ConsultationPage() {
  const { encounterId } = useParams();
  const navigate = useNavigate();
  const {
    encounters,
    patients,
    saveSoapNote,
    addVitals,
    addPrescription,
    addOrder,
    closeConsult,
    generateBill,
  } = useHospitalStore();

  const encounter = encounters.find((e) => e.id === encounterId);
  const patient = patients.find((p) => p.id === encounter?.patientId);

  const [subjective, setSubjective] = useState(encounter?.soap?.subjective ?? '');
  const [objective, setObjective] = useState(encounter?.soap?.objective ?? '');
  const [assessment, setAssessment] = useState(encounter?.soap?.assessment ?? '');
  const [plan, setPlan] = useState(encounter?.soap?.plan ?? '');

  const [drugName, setDrugName] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState('OD');
  const [duration, setDuration] = useState('5 days');

  const [orderType, setOrderType] = useState<'lab' | 'radiology'>('lab');
  const [orderName, setOrderName] = useState('');

  const [showAdmit, setShowAdmit] = useState(false);

  if (!encounter || !patient) {
    return <div className="empty-state">Encounter not found.</div>;
  }

  const enc = encounter;

  function handleSaveSoap() {
    saveSoapNote(enc.id, { subjective, objective, assessment, plan });
  }

  function handleAddPrescription() {
    if (!drugName || !dose) return;
    addPrescription(enc.id, { drugName, dose, frequency, duration });
    setDrugName('');
    setDose('');
  }

  function handleAddOrder() {
    if (!orderName) return;
    addOrder(enc.id, { type: orderType, name: orderName });
    setOrderName('');
  }

  function handleCloseAndBill() {
    handleSaveSoap();
    closeConsult(enc.id);
    generateBill(enc.id);
    navigate('/billing');
  }

  return (
    <>
      <DemoDataNotice />
      <div className="topbar">
        <div>
          <h1>{patient.name} <span style={{ fontWeight: 400, color: 'var(--ink-soft)', fontSize: 16 }}>· Token #{encounter.tokenNo}</span></h1>
          <div className="sub">
            {ageGender(patient)} · MRN {patient.mrn} · {encounter.department}
            {patient.allergies.length > 0 && <> · <Badge tone="danger">Allergy: {patient.allergies.join(', ')}</Badge></>}
          </div>
        </div>
        <div className="row">
          <Link to={`/emr/${patient.id}`} className="btn btn-sm">Full EMR Chart</Link>
          <button className="btn btn-sm" onClick={() => setShowAdmit(true)}>Admit to IPD</button>
          <button className="btn btn-primary btn-sm" onClick={handleCloseAndBill}>Close Consult & Send to Billing</button>
        </div>
      </div>

      <div className="grid-2">
        <div>
          <div className="card">
            <h3>Consultation Notes (SOAP)</h3>
            <div className="card-sub">Structured clinical documentation for this visit</div>
            <div className="field">
              <label>Subjective</label>
              <textarea rows={2} value={subjective} onChange={(e) => setSubjective(e.target.value)} placeholder="Patient's reported symptoms, history…" />
            </div>
            <div className="field">
              <label>Objective</label>
              <textarea rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Exam findings, vitals…" />
            </div>
            <div className="field">
              <label>Assessment</label>
              <textarea rows={2} value={assessment} onChange={(e) => setAssessment(e.target.value)} placeholder="Diagnosis / differential…" />
            </div>
            <div className="field">
              <label>Plan</label>
              <textarea rows={2} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Treatment plan, follow-up…" />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleSaveSoap}>Save Note</button>
          </div>

          <div className="card">
            <h3>e-Prescription</h3>
            <div className="card-sub">Add medications for this visit</div>
            <div className="two-col">
              <div className="field">
                <label>Drug Name</label>
                <input value={drugName} onChange={(e) => setDrugName(e.target.value)} placeholder="e.g. Amoxicillin 500mg" />
              </div>
              <div className="field">
                <label>Dose</label>
                <input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="e.g. 1 tab" />
              </div>
              <div className="field">
                <label>Frequency</label>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  <option>OD</option><option>BD</option><option>TDS</option><option>QID</option><option>SOS</option>
                </select>
              </div>
              <div className="field">
                <label>Duration</label>
                <input value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-sm" onClick={handleAddPrescription}>+ Add to Prescription</button>

            <table className="table" style={{ marginTop: 14 }}>
              <tbody>
                {encounter.prescriptions.map((rx) => (
                  <tr key={rx.id}>
                    <td style={{ fontWeight: 500 }}>{rx.drugName}</td>
                    <td>{rx.dose} · {rx.frequency} · {rx.duration}</td>
                    <td>{rx.dispensed ? <Badge tone="ok">Dispensed</Badge> : <Badge tone="neutral">Pending</Badge>}</td>
                  </tr>
                ))}
                {encounter.prescriptions.length === 0 && <tr><td className="empty-state">No medications added yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card">
            <h3>Vitals</h3>
            <VitalsForm onSubmit={(v) => addVitals(encounter.id, v)} />
            <table className="table" style={{ marginTop: 10 }}>
              <tbody>
                {encounter.vitals.slice().reverse().map((v, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{new Date(v.takenAt).toLocaleTimeString('en-IN')}</td>
                    <td className="mono" style={{ fontSize: 12 }}>T {v.temp}°F · P {v.pulse} · BP {v.bp} · SpO2 {v.spo2}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Orders</h3>
            <div className="card-sub">Lab / radiology orders</div>
            <div className="row">
              <select value={orderType} onChange={(e) => setOrderType(e.target.value as 'lab' | 'radiology')} style={{ maxWidth: 130 }}>
                <option value="lab">Lab</option>
                <option value="radiology">Radiology</option>
              </select>
              <input value={orderName} onChange={(e) => setOrderName(e.target.value)} placeholder="e.g. CBC, Chest X-ray" />
              <button className="btn btn-sm" onClick={handleAddOrder}>Add</button>
            </div>
            <table className="table" style={{ marginTop: 10 }}>
              <tbody>
                {encounter.orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td><Badge tone="neutral">{o.type}</Badge></td>
                    <td><Badge tone={o.status === 'completed' ? 'ok' : 'warn'}>{o.status}</Badge></td>
                  </tr>
                ))}
                {encounter.orders.length === 0 && <tr><td className="empty-state">No orders yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAdmit && <AdmitToIpdModal patientId={patient.id} department={encounter.department} onClose={() => setShowAdmit(false)} />}
    </>
  );
}
