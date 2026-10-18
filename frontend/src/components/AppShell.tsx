import type { ReactNode } from "react";

type Item = { key: string; label: string; demo?: boolean; group?: string };

const STAFF_NAV: Item[] = [
  { key: "dashboard", label: "Dashboard", group: "Front desk" },
  { key: "registration", label: "Registration" },
  { key: "shared", label: "Shared profiles" },
  { key: "opd", label: "OPD queue", demo: true, group: "Clinical" },
  { key: "beds", label: "Beds", demo: true },
  { key: "pharmacy", label: "Pharmacy", demo: true, group: "Back office" },
  { key: "billing", label: "Billing", demo: true },
  { key: "payroll", label: "Payroll", demo: true },
  { key: "roster", label: "Roster", demo: true },
];

export function AppShell({
  active,
  onNavigate,
  facilityName = "City General Hospital", // TODO: from session
  env = "Sandbox",                          // TODO: from FacilityAbdmData / session
  staffName = "Asha Verma",                 // TODO: from session
  staffEmail = "asha.verma@citygeneral.example", // TODO: from session
  nav = STAFF_NAV,
  onLogout,
  children,
}: {
  active: string;
  onNavigate?: (key: string) => void;
  facilityName?: string;
  env?: "Sandbox" | "Production";
  staffName?: string;
  staffEmail?: string;
  nav?: Item[];
  onLogout?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="osh-app">
      <aside className="osh-sidebar">
        <div className="osh-brand">
          <div className="osh-brand-name">AIVA OSHealth</div>
          <div className="osh-brand-fac">{facilityName}</div>
        </div>
        <span className="osh-env">{env}</span>
        <nav className="osh-nav">
          {nav.map((it) => (
            <div key={it.key}>
              {it.group && <div className="osh-nav-group">{it.group}</div>}
              <a
                className={`osh-nav-item${it.demo ? " demo" : ""}${active === it.key ? " active" : ""}`}
                onClick={() => onNavigate?.(it.key)}
              >
                {it.label}
                {it.demo && <span className="osh-demo-tag"> (demo)</span>}
              </a>
            </div>
          ))}
        </nav>
        <div className="osh-side-foot">
          <div className="nm">{staffName}</div>
          <div className="em">{staffEmail}</div>
          <button className="osh-logout" onClick={onLogout}>Log out</button>
        </div>
      </aside>
      <main className="osh-main">{children}</main>
    </div>
  );
}

// Owner shell for Facility setup (simpler nav)
export function OwnerShell({
  facilityName = "City General Hospital",
  onLogout,
  children,
}: { facilityName?: string; onLogout?: () => void; children: ReactNode }) {
  return (
    <div className="osh-app">
      <aside className="osh-sidebar">
        <div className="osh-brand">
          <div className="osh-brand-name">AIVA OSHealth</div>
          <div className="osh-brand-fac">{facilityName}</div>
        </div>
        <nav className="osh-nav">
          <div className="osh-nav-group">Facility</div>
          <a className="osh-nav-item active">Facility setup</a>
        </nav>
        {onLogout && (
          <div className="osh-side-foot">
            <button className="osh-logout" onClick={onLogout}>Log out</button>
          </div>
        )}
      </aside>
      <main className="osh-main">{children}</main>
    </div>
  );
}
