// Login screen: staff login, facility login, and registering a new facility. Talks to the backend.
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { registerFacility } from '@/api/endpoints';
import { useAuthStore } from '@/store/useAuthStore';

type Mode = 'staff' | 'facility' | 'register';

export function LoginPage() {
  const { session, signInStaff, signInFacility } = useAuthStore();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [mode, setMode] = useState<Mode>('staff');
  const [name, setName] = useState('');
  const [hfrId, setHfrId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (session) return <Navigate to={session.kind === 'facility' ? '/facility-setup' : (from ?? '/')} replace />;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'staff') await signInStaff(email, password);
      else if (mode === 'facility') await signInFacility(email, password);
      else {
        await registerFacility({ name, hfrId, email, password });
        setMode('facility');
        setPassword('');
        setNotice('Facility registered. Log in with the same email and password.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">AO</div>
          <div>
            <div className="brand-name">AIVA OSHealth</div>
            <div className="brand-tag">HMIS · Staff</div>
          </div>
        </div>

        <div className="card">
          {mode !== 'register' && (
            <div style={{ marginBottom: 16 }}>
              <h2 className="auth-title">Sign in</h2>
              <div className="card-sub" style={{ marginBottom: 0 }}>Use your staff or facility account.</div>
            </div>
          )}

          {mode !== 'register' ? (
            <div className="tabs">
              <button type="button" className={`tab${mode === 'staff' ? ' active' : ''}`} onClick={() => switchMode('staff')}>
                Staff login
              </button>
              <button type="button" className={`tab${mode === 'facility' ? ' active' : ''}`} onClick={() => switchMode('facility')}>
                Facility login
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <h3>Register a facility</h3>
              <div className="card-sub">Creates the hospital account. Then log in as the facility to add ABDM credentials and staff accounts.</div>
            </div>
          )}

          {notice && <div className="notice success">{notice}</div>}
          {error && <div className="notice error">{error}</div>}

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <>
                <div className="field">
                  <label htmlFor="facility-name">Facility name</label>
                  <input id="facility-name" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={20} required />
                </div>
                <div className="field">
                  <label htmlFor="facility-hfr">HFR ID</label>
                  <input id="facility-hfr" value={hfrId} onChange={(e) => setHfrId(e.target.value)} required />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
            </div>
            <div className="field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={mode === 'register' ? 8 : undefined}
                maxLength={mode === 'register' ? 20 : undefined}
                required
              />
              {mode === 'register' && <div className="card-sub" style={{ margin: '5px 0 0' }}>8–20 characters.</div>}
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? 'Please wait…' : mode === 'register' ? 'Register facility' : 'Log in'}
            </button>
          </form>
        </div>

        <div className="auth-foot">
          {mode === 'register' ? (
            <>
              Already registered?{' '}
              <button type="button" className="link-btn" onClick={() => switchMode('facility')}>
                Facility login
              </button>
            </>
          ) : (
            <>
              New hospital?{' '}
              <button type="button" className="link-btn" onClick={() => switchMode('register')}>
                Register a facility
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
