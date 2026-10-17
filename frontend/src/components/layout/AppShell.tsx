import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useHospitalStore } from '@/store/useHospitalStore';
import { facilityNav, navByRole } from '@/components/layout/navigation';
import type { Role } from '@/types';
import { SyncStatus } from '@/components/ui/SyncStatus';

const ROLE_LABELS: Record<Role, string> = {
  front_office: 'Front Office',
  doctor: 'Doctor',
  nurse: 'Nurse',
  pharmacist: 'Pharmacist',
  biller: 'Biller',
  housekeeping: 'Housekeeping',
  admin: 'Administrator',
};

/** "Asha Rao" becomes "AR". */
function initialsOf(name: string | undefined) {
  const letters = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase());
  return letters.join('') || '?';
}

export function AppShell() {
  const { currentRole, setRole, loadPatients } = useHospitalStore();
  const { session, signOut } = useAuthStore();
  const isStaff = session?.kind === 'staff';

  useEffect(() => {
    if (isStaff) void loadPatients();
  }, [isStaff, loadPatients]);

  const sections = session?.kind === 'facility' ? facilityNav : navByRole[currentRole];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">AO</div>
          <div>
            <div className="brand-name">AIVA OSHealth</div>
            <div className="brand-tag">HMIS · Staff</div>
          </div>
        </div>

        <div className="sidebar-nav">
          {sections.map((section) => (
            <div key={section.section}>
              <div className="nav-section">{section.section}</div>
              <nav>
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="role-block">
          <div className="user-card">
            <div className="avatar">{initialsOf(session?.name)}</div>
            <div className="user-meta">
              <div className="user-name">{session?.name}</div>
              <div className="user-sub">{session?.kind === 'facility' ? `Facility · HFR ${session.hfrId}` : session?.email}</div>
            </div>
          </div>

          {isStaff && (
            <details className="role-preview">
              <summary>Preview menu as another role</summary>
              <div className="role-body">
                <select value={currentRole} onChange={(event) => setRole(event.target.value as Role)}>
                  {Object.entries(ROLE_LABELS).map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
                <div className="role-caption">Only changes the menu. The backend does not have roles yet.</div>
              </div>
            </details>
          )}

          <button className="btn btn-sm logout-btn" onClick={() => void signOut()}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="main-top">
          <SyncStatus />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
