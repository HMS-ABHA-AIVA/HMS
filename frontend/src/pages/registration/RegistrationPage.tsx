// Patient list and search, with New Registration and Link ABHA. Talks to the backend.
import { useMemo, useState } from 'react';
import { useHospitalStore } from '@/store/useHospitalStore';
import { Badge } from '@/components/ui/Badge';
import { NewRegistrationModal } from '@/pages/registration/NewRegistrationModal';
import { Link } from 'react-router-dom';
import { isBackendId } from '@/lib/patientHelpers';
import type { Patient } from '@/types';

export function RegistrationPage() {
  const { patients, encounters, patientsStatus, patientsError, loadPatients } = useHospitalStore();
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [abhaFor, setAbhaFor] = useState<Patient | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return patients;
    const q = query.toLowerCase();
    return patients.filter(
      (p) => p.name.toLowerCase().includes(q) || p.mrn.toLowerCase().includes(q) || p.phone.includes(q)
    );
  }, [patients, query]);

  const sorted = [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Registration & Front Office</h1>
          <div className="sub">Patient search, ABHA creation, and OPD check-in</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Registration</button>
      </div>

      <div className="card">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, MRN, or mobile number…"
          style={{ maxWidth: 420 }}
        />
      </div>

      <div className="card">
        <h3>Patients</h3>
        <div className="card-sub">{sorted.length} record(s)</div>
        {patientsStatus === 'loading' && <div className="notice info">Loading patients from the backend…</div>}
        {patientsStatus === 'error' && (
          <div className="notice error">
            {patientsError}{' '}
            <button className="link-btn" onClick={() => void loadPatients()}>Retry</button>
          </div>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>MRN</th>
              <th>Name</th>
              <th>Age / Gender</th>
              <th>Mobile</th>
              <th>ABHA</th>
              <th>Today's Encounter</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const encounter = encounters.find((e) => e.patientId === p.id);
              return (
                <tr key={p.id}>
                  <td className="mono">{p.mrn}</td>
                  <td>
                    <Link to={`/emr/${p.id}`} style={{ fontWeight: 500 }}>{p.name}</Link>
                  </td>
                  <td>{p.age ?? '—'} / {p.gender ?? '—'}</td>
                  <td className="mono">{p.phone}</td>
                  <td>
                    {p.abhaStatus === 'linked' && <Badge tone="ok">Linked</Badge>}
                    {p.abhaStatus === 'pending' && <Badge tone="warn">Pending</Badge>}
                    {p.abhaStatus === 'none' && (
                      <span className="row">
                        <Badge tone="neutral">Not linked</Badge>
                        {isBackendId(p.id) && (
                          <button className="btn btn-sm" onClick={() => setAbhaFor(p)}>Link ABHA</button>
                        )}
                      </span>
                    )}
                  </td>
                  <td>
                    {encounter ? (
                      <Badge tone="info">{encounter.type} · #{encounter.tokenNo ?? encounter.bedId}</Badge>
                    ) : (
                      <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNew && <NewRegistrationModal onClose={() => setShowNew(false)} />}
      {abhaFor && <NewRegistrationModal patient={abhaFor} onClose={() => setAbhaFor(null)} />}
    </>
  );
}
