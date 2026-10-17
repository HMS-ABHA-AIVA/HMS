// Registration dialog: save the patient, create or link an ABHA with an Aadhaar OTP, then check in.
// The patient and ABHA steps use the backend; the OPD check-in uses demo data.
import { useState } from 'react';
import { withAbdmSession } from '@/api/abdmSession';
import { confirmAbhaLink, createPatient, requestAbhaCreateOtp, requestAbhaLinkOtp, verifyAbhaCreateOtp } from '@/api/endpoints';
import { Modal } from '@/components/ui/Modal';
import { useAuthStore } from '@/store/useAuthStore';
import { useHospitalStore } from '@/store/useHospitalStore';
import type { Gender, Patient } from '@/types';

const DEPARTMENTS = ['General Medicine', 'Orthopedics', 'Pediatrics', 'Nephrology', 'Gynecology', 'ENT'];

type AbhaMethod = 'create' | 'link' | 'mobile' | 'scan' | 'skip';

const ABHA_OPTIONS: { key: AbhaMethod; title: string; desc: string; supported: boolean }[] = [
  { key: 'create', title: 'Create new ABHA (Aadhaar + OTP)', desc: 'Verify the Aadhaar number with the OTP sent to the Aadhaar-linked mobile.', supported: true },
  { key: 'link', title: 'Link existing ABHA (Aadhaar + OTP)', desc: 'Patient already has an ABHA; verify it with an Aadhaar OTP.', supported: true },
  { key: 'mobile', title: 'Create via Mobile Number', desc: 'Not supported by the backend yet.', supported: false },
  { key: 'scan', title: 'Scan & Share (existing ABHA/Ayushman card)', desc: 'Not supported by the backend yet.', supported: false },
  { key: 'skip', title: 'Skip for now', desc: 'Register without ABHA; it can be linked at a later visit.', supported: true },
];

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

/** With `patient`, opens on the ABHA step for an already-registered patient. */
export function NewRegistrationModal({ onClose, patient }: { onClose: () => void; patient?: Patient }) {
  const { registerPatient, linkAbha, checkInToOpd, staff, patients } = useHospitalStore();
  const environment = useAuthStore((s) => s.environment);

  const [step, setStep] = useState(patient ? 1 : 0);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender>('M');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [patientBusy, setPatientBusy] = useState(false);
  const [patientError, setPatientError] = useState<string | null>(null);
  const [newPatient, setNewPatient] = useState<Patient | null>(patient ?? null);

  const [abhaMethod, setAbhaMethod] = useState<AbhaMethod | null>(null);
  const [aadhaar, setAadhaar] = useState('');
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [mobile, setMobile] = useState(patient?.phone ?? '');
  const [abhaBusy, setAbhaBusy] = useState(false);
  const [abhaError, setAbhaError] = useState<string | null>(null);

  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [doctorId, setDoctorId] = useState(staff.find((s) => s.role === 'doctor')?.id ?? '');

  const doctors = staff.filter((s) => s.role === 'doctor');
  const stepsTotal = 4;

  const demographicsValid =
    name.trim().length >= 2 && Number(age) > 0 && /^\d{10}$/.test(phone) && (!email || /^\S+@\S+\.\S+$/.test(email));
  const otpFlow = abhaMethod === 'create' || abhaMethod === 'link';
  const canSendOtp = /^\d{12}$/.test(aadhaar);
  const canVerify = /^\d{6}$/.test(otp) && (abhaMethod === 'link' || /^\d{10}$/.test(mobile));

  async function handleDemographicsNext() {
    setPatientBusy(true);
    setPatientError(null);
    try {
      const { data } = await createPatient({ name: name.trim(), phone, email: email.trim() || undefined });
      const patient = registerPatient({
        id: data.id,
        name: data.name,
        age: Number(age),
        gender,
        phone: data.phone,
        email: data.email ?? undefined,
        allergies: [],
        problemList: [],
        abhaStatus: 'none',
      });
      setNewPatient(patient);
      setMobile(phone);
      setStep(1);
    } catch (err) {
      setPatientError(errorText(err));
    } finally {
      setPatientBusy(false);
    }
  }

  function chooseMethod(method: AbhaMethod) {
    setAbhaMethod(method);
    setTransactionId(null);
    setOtp('');
    setAadhaar('');
    setAbhaError(null);
  }

  async function handleSendOtp() {
    if (!newPatient) return;
    setAbhaBusy(true);
    setAbhaError(null);
    try {
      if (abhaMethod === 'create') {
        const { data } = await withAbdmSession(environment, () =>
          requestAbhaCreateOtp({ patientId: newPatient.id, aadhaar, environment })
        );
        setTransactionId(data.transactionId);
      } else {
        const { data } = await withAbdmSession(environment, () =>
          requestAbhaLinkOtp({ patientId: newPatient.id, aadhaar, environment })
        );
        setTransactionId(data.transactionId);
      }
      setAadhaar('');
    } catch (err) {
      setAbhaError(errorText(err));
    } finally {
      setAbhaBusy(false);
    }
  }

  async function handleVerifyOtp() {
    if (!newPatient || !transactionId) return;
    setAbhaBusy(true);
    setAbhaError(null);
    try {
      const { data } =
        abhaMethod === 'create'
          ? await withAbdmSession(environment, () => verifyAbhaCreateOtp({ transactionId, otp, mobile, environment }))
          : await withAbdmSession(environment, () => confirmAbhaLink({ transactionId, otp, environment }));
      linkAbha(newPatient.id, { abhaNumber: data.abhaNumber, abhaAddress: data.abhaAddress });
      setStep(2);
    } catch (err) {
      setAbhaError(errorText(err));
    } finally {
      setAbhaBusy(false);
    }
  }

  function handleCheckIn() {
    if (!newPatient) return;
    checkInToOpd(newPatient.id, department, doctorId);
    setStep(3);
  }

  const linkedPatient = newPatient ? patients.find((p) => p.id === newPatient.id) ?? newPatient : null;

  return (
    <Modal title={patient ? `ABHA — ${patient.name}` : 'New Patient Registration'} onClose={onClose} width={620}>
      <div className="steps">
        {Array.from({ length: stepsTotal }).map((_, i) => (
          <div key={i} className={`step${i <= step ? ' done' : ''}`} />
        ))}
      </div>

      {step === 0 && (
        <div>
          {patientError && <div className="notice error">{patientError}</div>}
          <div className="field">
            <label>Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ramesh Gupta" autoFocus />
          </div>
          <div className="two-col">
            <div className="field">
              <label>Age</label>
              <input type="number" value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div className="field">
              <label>Gender</label>
              <select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
              </select>
            </div>
          </div>
          <div className="two-col">
            <div className="field">
              <label>Mobile Number</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" inputMode="numeric" maxLength={10} />
            </div>
            <div className="field">
              <label>Email (optional)</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="flex-between" style={{ marginTop: 18 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!demographicsValid || patientBusy} onClick={handleDemographicsNext}>
              {patientBusy ? 'Saving…' : 'Save & Continue to ABHA →'}
            </button>
          </div>
        </div>
      )}

      {step === 1 && newPatient && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14 }}>
            ABDM Milestone M1 — create or link an ABHA (Ayushman Bharat Health Account) for <b>{newPatient.name}</b>.
          </p>
          <div className="stack">
            {ABHA_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className="row"
                style={{
                  border: `1px solid ${abhaMethod === opt.key ? 'var(--brand)' : 'var(--border)'}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  cursor: opt.supported ? 'pointer' : 'not-allowed',
                  opacity: opt.supported ? 1 : 0.55,
                  background: abhaMethod === opt.key ? 'var(--brand-soft)' : 'var(--surface)',
                }}
              >
                <input
                  type="radio"
                  name="abhaMethod"
                  style={{ width: 'auto' }}
                  disabled={!opt.supported || abhaBusy}
                  checked={abhaMethod === opt.key}
                  onChange={() => chooseMethod(opt.key)}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {otpFlow && !transactionId && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>Aadhaar number</label>
              <input value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} placeholder="12-digit Aadhaar" inputMode="numeric" maxLength={12} autoComplete="off" />
            </div>
          )}

          {otpFlow && transactionId && (
            <div style={{ marginTop: 12 }}>
              <div className="notice info">OTP sent to the Aadhaar-linked mobile number.</div>
              <div className={abhaMethod === 'create' ? 'two-col' : undefined}>
                <div className="field">
                  <label>OTP</label>
                  <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit OTP" inputMode="numeric" maxLength={6} autoComplete="one-time-code" autoFocus />
                </div>
                {abhaMethod === 'create' && (
                  <div className="field">
                    <label>Mobile for ABHA</label>
                    <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit mobile" inputMode="numeric" maxLength={10} />
                  </div>
                )}
              </div>
              <button className="btn btn-ghost btn-sm" disabled={abhaBusy} onClick={() => chooseMethod(abhaMethod!)}>
                ← Use a different Aadhaar number / resend OTP
              </button>
            </div>
          )}

          {abhaError && <div className="notice error" style={{ marginTop: 12 }}>{abhaError}</div>}

          <div className="flex-between" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
            {!otpFlow ? (
              <button className="btn btn-primary" onClick={() => setStep(2)}>
                {abhaMethod === 'skip' ? 'Skip & Continue →' : 'Continue without ABHA →'}
              </button>
            ) : !transactionId ? (
              <button className="btn btn-primary" disabled={!canSendOtp || abhaBusy} onClick={handleSendOtp}>
                {abhaBusy ? 'Contacting ABDM…' : 'Send OTP →'}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={!canVerify || abhaBusy} onClick={handleVerifyOtp}>
                {abhaBusy ? 'Verifying with ABDM…' : 'Verify & Continue →'}
              </button>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          {linkedPatient?.abhaStatus === 'linked' && (
            <div className="card" style={{ background: 'var(--success-soft)', border: '1px solid #86EFAC', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>ABHA linked successfully</div>
              <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
                {linkedPatient.abhaNumber}
                {linkedPatient.abhaAddress ? ` · ${linkedPatient.abhaAddress}` : ''}
              </div>
            </div>
          )}
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14 }}>Check the patient in for today's visit.</p>
          <div className="two-col">
            <div className="field">
              <label>Department</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Consulting Doctor</label>
              <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex-between" style={{ marginTop: 18 }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" onClick={handleCheckIn}>Check In to OPD →</button>
          </div>
        </div>
      )}

      {step === 3 && newPatient && (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <h3 style={{ marginBottom: 6 }}>{newPatient.name} checked in</h3>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>MRN {newPatient.mrn} · {department}</p>
          <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={onClose}>Done</button>
        </div>
      )}
    </Modal>
  );
}
