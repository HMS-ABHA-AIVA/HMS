// One patient's chart. ABHA activity comes from the backend; visit history uses demo data.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { listPatientTransactions, type AbhaTransaction } from '@/api/endpoints';
import { useHospitalStore } from '@/store/useHospitalStore';
import { ageGender, isBackendId } from '@/lib/patientHelpers';
import { Badge } from '@/components/ui/Badge';
import type { EncounterStatus } from '@/types';

const STATUS_TONE: Record<EncounterStatus, 'ok' | 'info' | 'warn' | 'danger' | 'neutral' | 'black'> = {
  waiting: 'warn',
  in_consult: 'info',
  in_er: 'warn',
  admitted: 'info',
  discharged: 'ok',
  referred: 'info',
  lama: 'neutral',
  deceased: 'black',
  billed: 'ok',
  closed: 'ok',
};

const TX_TONE: Record<NonNullable<AbhaTransaction['status']>, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  COMPLETED: 'ok',
  PENDING: 'warn',
  FAILED: 'danger',
  EXPIRED: 'neutral',
};

export function PatientChartPage() {
  const { patientId } = useParams();
  const { patients, encounters, staff } = useHospitalStore();
  const [transactions, setTransactions] = useState<AbhaTransaction[] | null>(null);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId || !isBackendId(patientId)) return;
    listPatientTransactions(patientId)
      .then(({ data }) => setTransactions(Array.isArray(data) ? data : []))
      .catch((err: unknown) => setTransactionsError(err instanceof Error ? err.message : 'Could not load ABHA activity.'));
  }, [patientId]);
  const patient = patients.find((p) => p.id === patientId);
  const history = encounters
    .filter((e) => e.patientId === patientId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  if (!patient) return <div className="empty-state">Patient not found.</div>;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{patient.name}</h1>
          <div className="sub">
            {ageGender(patient)} · MRN <span className="mono">{patient.mrn}</span> · {patient.phone}
          </div>
        </div>
        <div>
          {patient.abhaStatus === 'linked' ? (
            <Badge tone="ok">ABHA {patient.abhaAddress}</Badge>
          ) : (
            <Badge tone="neutral">ABHA not linked</Badge>
          )}
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h3>Problem List</h3>
          {patient.problemList.length === 0 ? (
            <div className="empty-state">No active problems documented.</div>
          ) : (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {patient.problemList.map((p) => <Badge key={p} tone="info">{p}</Badge>)}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Allergies</h3>
          {patient.allergies.length === 0 ? (
            <div className="empty-state">NKDA — no known drug allergies.</div>
          ) : (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {patient.allergies.map((a) => <Badge key={a} tone="danger">{a}</Badge>)}
            </div>
          )}
        </div>
      </div>

      {isBackendId(patient.id) && (
        <div className="card">
          <h3>ABHA Activity</h3>
          <div className="card-sub">Aadhaar OTP transactions for this patient, newest first</div>
          {transactionsError && <div className="notice error">{transactionsError}</div>}
          {!transactionsError && transactions === null && <div className="empty-state">Loading…</div>}
          {transactions?.length === 0 && <div className="empty-state">No ABHA transactions yet.</div>}
          {transactions && transactions.length > 0 && (
            <table className="table">
              <thead>
                <tr><th>Purpose</th><th>Status</th><th>Started</th><th>Expires</th></tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{t.purpose === 'ENROLLMENT' ? 'Create ABHA' : t.purpose === 'VERIFICATION' ? 'Link existing ABHA' : '—'}</td>
                    <td>{t.status ? <Badge tone={TX_TONE[t.status]}>{t.status.toLowerCase()}</Badge> : '—'}</td>
                    <td>{t.createdAt ? new Date(t.createdAt).toLocaleString('en-IN') : '—'}</td>
                    <td>{t.expiresAt ? new Date(t.expiresAt).toLocaleTimeString('en-IN') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card">
        <h3>Encounter History</h3>
        <div className="card-sub">All OPD/IPD/ER visits, structured close to FHIR R4 resources for future ABDM export</div>
        {history.map((e) => {
          const doctor = staff.find((s) => s.id === e.doctorId);
          return (
            <div key={e.id} className="card" style={{ boxShadow: 'none', background: 'var(--bg)' }}>
              <div className="flex-between">
                <div>
                  <b>{e.type}</b> · {e.department} · {doctor?.name}
                  {e.type === 'ER' && e.triageLevel && (
                    <> · <Badge tone={e.triageLevel === 'red' ? 'danger' : e.triageLevel === 'yellow' ? 'warn' : e.triageLevel === 'black' ? 'black' : 'ok'}>{e.triageLevel} triage</Badge></>
                  )}
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{new Date(e.createdAt).toLocaleString('en-IN')}</div>
                  {e.chiefComplaint && <div style={{ fontSize: 12.5, marginTop: 3 }}>Chief complaint: {e.chiefComplaint}</div>}
                </div>
                <Badge tone={STATUS_TONE[e.status] ?? 'info'}>{e.status.replace('_', ' ')}</Badge>
              </div>

              {(e.status === 'referred' || e.status === 'lama' || e.status === 'deceased') && e.dispositionNote && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ink-soft)' }}>
                  {e.status === 'referred' && e.referredTo && <>Referred to <b>{e.referredTo}</b> — </>}
                  {e.dispositionNote}
                </div>
              )}

              {e.soap && (
                <div style={{ marginTop: 10, fontSize: 12.5 }}>
                  <div><b>A:</b> {e.soap.assessment || '—'}</div>
                  <div><b>P:</b> {e.soap.plan || '—'}</div>
                </div>
              )}

              {e.vitals.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12 }} className="mono">
                  Latest vitals: T {e.vitals[e.vitals.length - 1].temp}°F · BP {e.vitals[e.vitals.length - 1].bp} · SpO2 {e.vitals[e.vitals.length - 1].spo2}%
                </div>
              )}

              {e.prescriptions.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12.5 }}>
                  <b>Medications:</b> {e.prescriptions.map((p) => `${p.drugName} (${p.dose} ${p.frequency})`).join(', ')}
                </div>
              )}

              {e.dischargeSummary && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Discharge Summary</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, fontFamily: 'IBM Plex Mono, monospace', marginTop: 6 }}>{e.dischargeSummary}</pre>
                </details>
              )}
            </div>
          );
        })}
        {history.length === 0 && <div className="empty-state">No encounters recorded yet.</div>}
      </div>
    </>
  );
}
