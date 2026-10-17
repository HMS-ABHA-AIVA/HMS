// An admitted patient: notes, vitals, prescriptions and the discharge summary. Runs on demo data.
import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useHospitalStore } from '@/store/useHospitalStore';
import { ageGender } from '@/lib/patientHelpers';
import { Badge } from '@/components/ui/Badge';
import { VitalsForm } from '@/components/VitalsForm';
import { AiSuggestion } from '@/components/ui/AiSuggestion';
import { DemoDataNotice } from '@/components/ui/DemoDataNotice';

export function IpdPatientPage() {
  const { encounterId } = useParams();
  const navigate = useNavigate();
  const {
    encounters,
    patients,
    beds,
    addVitals,
    addPrescription,
    addOrder,
    dispensePrescription,
    generateDischargeDraft,
    acceptDischargeSummary,
    generateBill,
  } = useHospitalStore();

  const [tab, setTab] = useState<'clinical' | 'nursing' | 'discharge'>('clinical');
  const [drugName, setDrugName] = useState('');
  const [dose, setDose] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [noteText, setNoteText] = useState('');

  const encounter = encounters.find((e) => e.id === encounterId);
  const patient = patients.find((p) => p.id === encounter?.patientId);
  const bed = beds.find((b) => b.id === encounter?.bedId);

  if (!encounter || !patient) return <div className="empty-state">IPD encounter not found.</div>;

  const enc = encounter;

  function handleGenerateDraft() {
    generateDischargeDraft(enc.id);
  }

  function handleAcceptDischarge(finalText: string) {
    acceptDischargeSummary(enc.id, finalText);
    generateBill(enc.id);
    navigate('/billing');
  }

  return (
    <>
      <DemoDataNotice />
      <div className="topbar">
        <div>
          <h1>{patient.name} <span style={{ fontWeight: 400, color: 'var(--ink-soft)', fontSize: 16 }}>· {bed?.ward} {bed?.bedNo}</span></h1>
          <div className="sub">
            {ageGender(patient)} · MRN {patient.mrn} · {encounter.department} · Admitted {encounter.admittedAt ? new Date(encounter.admittedAt).toLocaleDateString('en-IN') : '-'}
            {patient.allergies.length > 0 && <> · <Badge tone="danger">Allergy: {patient.allergies.join(', ')}</Badge></>}
          </div>
        </div>
        <Link to={`/emr/${patient.id}`} className="btn btn-sm">Full EMR Chart</Link>
      </div>

      <div className="tabs">
        <div className={`tab${tab === 'clinical' ? ' active' : ''}`} onClick={() => setTab('clinical')}>Doctor Rounds</div>
        <div className={`tab${tab === 'nursing' ? ' active' : ''}`} onClick={() => setTab('nursing')}>Nursing Station</div>
        <div className={`tab${tab === 'discharge' ? ' active' : ''}`} onClick={() => setTab('discharge')}>Discharge</div>
      </div>

      {tab === 'clinical' && (
        <div className="grid-2">
          <div className="card">
            <h3>Medications (MAR)</h3>
            <div className="card-sub">Medication administration record for this stay</div>
            <div className="two-col">
              <div className="field"><label>Drug Name</label><input value={drugName} onChange={(e) => setDrugName(e.target.value)} /></div>
              <div className="field"><label>Dose</label><input value={dose} onChange={(e) => setDose(e.target.value)} /></div>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => {
                if (!drugName || !dose) return;
                addPrescription(encounter.id, { drugName, dose, frequency: 'BD', duration: 'Ongoing' });
                setDrugName(''); setDose('');
              }}
            >
              + Add Medication
            </button>
            <table className="table" style={{ marginTop: 12 }}>
              <tbody>
                {encounter.prescriptions.map((rx) => (
                  <tr key={rx.id}>
                    <td style={{ fontWeight: 500 }}>{rx.drugName}</td>
                    <td>{rx.dose} · {rx.frequency}</td>
                    <td>{rx.dispensed ? <Badge tone="ok">Administered</Badge> : <Badge tone="neutral">Pending</Badge>}</td>
                    <td>
                      {!rx.dispensed && (
                        <button className="btn btn-sm" onClick={() => dispensePrescription(encounter.id, rx.id)}>Mark Given</button>
                      )}
                    </td>
                  </tr>
                ))}
                {encounter.prescriptions.length === 0 && <tr><td className="empty-state">No medications recorded.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Orders</h3>
            <OrderQuickAdd onAdd={(type, name) => addOrder(encounter.id, { type, name })} />
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
      )}

      {tab === 'nursing' && (
        <div className="grid-2">
          <div className="card">
            <h3>Vitals Charting</h3>
            <VitalsForm onSubmit={(v) => addVitals(encounter.id, v)} />
            <table className="table" style={{ marginTop: 10 }}>
              <tbody>
                {encounter.vitals.slice().reverse().map((v, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{new Date(v.takenAt).toLocaleString('en-IN')}</td>
                    <td className="mono" style={{ fontSize: 12 }}>T {v.temp}°F · P {v.pulse} · BP {v.bp} · SpO2 {v.spo2}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Task / Handover List</h3>
            <div className="row">
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. Reposition patient at 2pm" />
              <button
                className="btn btn-sm"
                onClick={() => { if (noteText.trim()) { setNotes([noteText, ...notes]); setNoteText(''); } }}
              >
                Add
              </button>
            </div>
            <div className="stack" style={{ marginTop: 12 }}>
              {notes.map((n, i) => (
                <div key={i} className="row" style={{ fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <input type="checkbox" style={{ width: 'auto' }} />
                  {n}
                </div>
              ))}
              {notes.length === 0 && <div className="empty-state">No pending tasks.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'discharge' && (
        <div className="card">
          <h3>Discharge Summary</h3>
          <div className="card-sub">FHIR Bundle-ready structure · AI-assisted drafting with mandatory clinician sign-off</div>

          {encounter.dischargeSummary ? (
            <div className="empty-state">Discharged — summary signed off and sent to billing.</div>
          ) : encounter.aiDischargeSummaryDraft ? (
            <AiSuggestion
              label="Draft discharge summary"
              draft={encounter.aiDischargeSummaryDraft}
              onAccept={handleAcceptDischarge}
              acceptLabel="Sign Off & Discharge"
            />
          ) : (
            <button className="btn btn-primary" onClick={handleGenerateDraft}>
              ✨ Generate AI Draft Discharge Summary
            </button>
          )}
        </div>
      )}
    </>
  );
}

function OrderQuickAdd({ onAdd }: { onAdd: (type: 'lab' | 'radiology', name: string) => void }) {
  const [type, setType] = useState<'lab' | 'radiology'>('lab');
  const [name, setName] = useState('');
  return (
    <div className="row">
      <select value={type} onChange={(e) => setType(e.target.value as 'lab' | 'radiology')} style={{ maxWidth: 130 }}>
        <option value="lab">Lab</option>
        <option value="radiology">Radiology</option>
      </select>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Test name" />
      <button className="btn btn-sm" onClick={() => { if (name) { onAdd(type, name); setName(''); } }}>Add</button>
    </div>
  );
}
