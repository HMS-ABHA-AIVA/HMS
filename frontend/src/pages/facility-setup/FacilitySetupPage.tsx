// The facility owner's setup: ABDM credentials and staff accounts. Talks to the backend.
import { useState, type FormEvent } from 'react';
import { addAbdmDetails, createStaffAccount, type AbdmEnvironment } from '@/api/endpoints';
import { useAuthStore } from '@/store/useAuthStore';

type Result = { kind: 'success' | 'error'; text: string } | null;

function Notice({ result }: { result: Result }) {
  return result ? <div className={`notice ${result.kind}`}>{result.text}</div> : null;
}

export function FacilitySetupPage() {
  const session = useAuthStore((s) => s.session);

  const [environment, setEnvironment] = useState<AbdmEnvironment>('SANDBOX');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [abdmBusy, setAbdmBusy] = useState(false);
  const [abdmResult, setAbdmResult] = useState<Result>(null);

  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffResult, setStaffResult] = useState<Result>(null);

  if (session?.kind !== 'facility') return null;

  async function saveAbdm(e: FormEvent) {
    e.preventDefault();
    setAbdmResult(null);
    setAbdmBusy(true);
    try {
      await addAbdmDetails({ clientId, clientSecret, environment });
      setAbdmResult({ kind: 'success', text: `ABDM ${environment.toLowerCase()} credentials verified and saved.` });
      setClientSecret('');
    } catch (err) {
      setAbdmResult({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save credentials.' });
    } finally {
      setAbdmBusy(false);
    }
  }

  async function createStaff(e: FormEvent) {
    e.preventDefault();
    setStaffResult(null);
    setStaffBusy(true);
    try {
      const { data } = await createStaffAccount({ name: staffName, email: staffEmail, password: staffPassword });
      setStaffResult({ kind: 'success', text: `Account created for ${data.name}. They can now use Staff login.` });
      setStaffName('');
      setStaffEmail('');
      setStaffPassword('');
    } catch (err) {
      setStaffResult({ kind: 'error', text: err instanceof Error ? err.message : 'Could not create the account.' });
    } finally {
      setStaffBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Facility Setup</h1>
          <div className="sub">
            {session.name} · HFR ID <span className="mono">{session.hfrId}</span>
          </div>
        </div>
      </div>

      <div className="notice info">
        Patient registration and ABHA run under a <b>staff</b> login. After setting up below, log out and use the Staff login tab.
      </div>

      <div className="card">
        <h3>ABDM credentials</h3>
        <div className="card-sub">
          Client ID and secret issued by ABDM for this facility. They are checked against ABDM when saved, and the secret is stored encrypted.
        </div>
        <form onSubmit={saveAbdm}>
          <Notice result={abdmResult} />
          <div className="field">
            <label htmlFor="abdm-env">Environment</label>
            <select id="abdm-env" value={environment} onChange={(e) => setEnvironment(e.target.value as AbdmEnvironment)}>
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Production</option>
            </select>
          </div>
          <div className="two-col">
            <div className="field">
              <label htmlFor="abdm-client-id">Client ID</label>
              <input id="abdm-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="abdm-client-secret">Client secret</label>
              <input id="abdm-client-secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} required />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={abdmBusy}>
            {abdmBusy ? 'Verifying with ABDM…' : 'Save credentials'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Staff accounts</h3>
        <div className="card-sub">Create a login for a staff member of this facility.</div>
        <form onSubmit={createStaff}>
          <Notice result={staffResult} />
          <div className="two-col">
            <div className="field">
              <label htmlFor="staff-name">Name</label>
              <input id="staff-name" value={staffName} onChange={(e) => setStaffName(e.target.value)} minLength={3} maxLength={20} required />
            </div>
            <div className="field">
              <label htmlFor="staff-email">Email</label>
              <input id="staff-email" type="email" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} required />
            </div>
          </div>
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="staff-password">Password (6–20 characters)</label>
            <input
              id="staff-password"
              type="password"
              value={staffPassword}
              onChange={(e) => setStaffPassword(e.target.value)}
              minLength={6}
              maxLength={20}
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={staffBusy}>
            {staffBusy ? 'Creating…' : 'Create staff account'}
          </button>
        </form>
      </div>
    </>
  );
}
