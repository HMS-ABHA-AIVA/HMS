// Hidden for now (not routed): dialog to start an emergency case. A new patient here is saved to the backend.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPatient } from '@/api/endpoints';
import { Modal } from '@/components/ui/Modal';
import { useHospitalStore } from '@/store/useHospitalStore';
import { ageGender } from '@/lib/patientHelpers';
import type { ArrivalMode, Gender, TriageLevel } from '@/types';

const TRIAGE_OPTIONS: { key: TriageLevel; label: string; desc: string }[] = [
  { key: 'red', label: 'Red — Immediate', desc: 'Life-threatening, needs care now' },
  { key: 'yellow', label: 'Yellow — Urgent', desc: 'Serious, can wait briefly' },
  { key: 'green', label: 'Green — Non-urgent', desc: 'Stable, minor complaint' },
  { key: 'black', label: 'Black — Deceased/Expectant', desc: 'Beyond resuscitation' },
];

export function NewErCaseModal({ onClose }: { onClose: () => void }) {
  const { patients, staff, registerPatient, checkInToEr } = useHospitalStore();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [query, setQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender>('M');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chiefComplaint, setChiefComplaint] = useState('');
  const [triageLevel, setTriageLevel] = useState<TriageLevel>('yellow');
  const [arrivalMode, setArrivalMode] = useState<ArrivalMode>('walk_in');
  const doctors = staff.filter((s) => s.role === 'doctor');
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? '');

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const queryDigits = q.replace(/\D/g, "");
    return patients
      .filter((p) => {
        const name = (p.name || "").toLowerCase();
        const mrn = (p.mrn || "").toLowerCase();
        const phone = (p.phone || "").toLowerCase();
        const abhaNumber = (p.abhaNumber || "").toLowerCase();
        const abhaAddress = (p.abhaAddress || "").toLowerCase();

        if (
          name.includes(q) ||
          mrn.includes(q) ||
          phone.includes(q) ||
          abhaNumber.includes(q) ||
          abhaAddress.includes(q)
        ) {
          return true;
        }

        if (queryDigits.length > 0) {
          const cleanAbha = abhaNumber.replace(/\D/g, "");
          if (cleanAbha && cleanAbha.includes(queryDigits)) return true;

          const cleanPhone = phone.replace(/\D/g, "");
          if (cleanPhone && cleanPhone.includes(queryDigits)) return true;
        }

        return false;
      })
      .slice(0, 6);
  }, [patients, query]);

  const canSubmit = mode === 'existing' ? !!selectedPatientId : name.trim().length >= 2 && age && /^\d{10}$/.test(phone);
  const readyToTriage = canSubmit && chiefComplaint.trim() && doctorId;

  async function handleSubmit() {
    let patientId = selectedPatientId;
    if (mode === 'new') {
      setSaving(true);
      setError(null);
      try {
        const { data } = await createPatient({ name: name.trim(), phone });
        patientId = registerPatient({ id: data.id, name: data.name, age: Number(age), gender, phone: data.phone, allergies: [], problemList: [], abhaStatus: 'none' }).id;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the patient.');
        return;
      } finally {
        setSaving(false);
      }
    }
    if (!patientId) return;
    const encounter = checkInToEr(patientId, chiefComplaint, triageLevel, arrivalMode, doctorId);
    onClose();
    navigate(`/emergency/case/${encounter.id}`);
  }

  return (
    <Modal title="New Emergency Case" onClose={onClose} width={560}>
      <div className="tabs">
        <div className={`tab${mode === 'existing' ? ' active' : ''}`} onClick={() => setMode('existing')}>Existing Patient</div>
        <div className={`tab${mode === 'new' ? ' active' : ''}`} onClick={() => setMode('new')}>New Patient</div>
      </div>

      {mode === 'existing' ? (
        <div className="field">
          <label>Search by name, MRN, or mobile</label>
          <input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedPatientId(null); }} placeholder="Start typing…" autoFocus />
          {matches.length > 0 && (
            <div className="stack" style={{ marginTop: 8 }}>
              {matches.map((p) => (
                <label
                  key={p.id}
                  className="row"
                  style={{
                    border: `1px solid ${selectedPatientId === p.id ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    background: selectedPatientId === p.id ? 'var(--brand-soft)' : 'var(--surface)',
                  }}
                >
                  <input type="radio" style={{ width: 'auto' }} checked={selectedPatientId === p.id} onChange={() => setSelectedPatientId(p.id)} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>MRN {p.mrn} · {ageGender(p)} · {p.phone}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="field">
            <label>Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Patient name" autoFocus />
          </div>
          <div className="two-col">
            <div className="field"><label>Age</label><input type="number" value={age} onChange={(e) => setAge(e.target.value)} /></div>
            <div className="field">
              <label>Gender</label>
              <select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
                <option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Mobile Number</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" inputMode="numeric" maxLength={10} />
          </div>
          <p className="sample-note">ABHA creation can be completed later once the patient is stabilized — not required to start emergency care.</p>
        </div>
      )}

      <div className="field" style={{ marginTop: 6 }}>
        <label>Chief Complaint</label>
        <input value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} placeholder="e.g. Chest pain, road traffic accident, high fever" />
      </div>

      <div className="field">
        <label>Triage Level</label>
        <div className="two-col">
          {TRIAGE_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className="row"
              style={{
                border: `1px solid ${triageLevel === opt.key ? 'var(--brand)' : 'var(--border)'}`,
                borderRadius: 8,
                padding: '8px 10px',
                cursor: 'pointer',
                background: triageLevel === opt.key ? 'var(--brand-soft)' : 'var(--surface)',
              }}
            >
              <input type="radio" name="triage" style={{ width: 'auto' }} checked={triageLevel === opt.key} onChange={() => setTriageLevel(opt.key)} />
              <span className={`triage-swatch ${opt.key}`} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="two-col">
        <div className="field">
          <label>Arrival Mode</label>
          <select value={arrivalMode} onChange={(e) => setArrivalMode(e.target.value as ArrivalMode)}>
            <option value="walk_in">Walk-in</option>
            <option value="ambulance">Ambulance</option>
            <option value="referred_in">Referred from another facility</option>
          </select>
        </div>
        <div className="field">
          <label>Attending Doctor</label>
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="flex-between" style={{ marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!readyToTriage || saving} onClick={handleSubmit}>
          {saving ? 'Saving…' : 'Admit to ER →'}
        </button>
      </div>
    </Modal>
  );
}
