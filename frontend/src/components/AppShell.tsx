import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLE_LABELS, type StaffRole } from "@/lib/session";

// `roles`: who sees the entry (left out = everyone). The server enforces the same rules; this only keeps the menu tidy.
type Item = { key: string; label: string; demo?: boolean; group?: string; roles?: StaffRole[] };

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
  { key: "staff", label: "Staff", group: "Administration", roles: ["admin"] },
  { key: "settings", label: "Hospital settings", roles: ["admin"] },
  { key: "audit", label: "Audit log", roles: ["admin"] },
];

// Menu entries that open a real screen. Entries without a path (the demo modules) do nothing.
const PATHS: Record<string, string> = {
  dashboard: "/",
  registration: "/registration",
  shared: "/shared-profiles",
  opd: "/opd",
  staff: "/staff",
  settings: "/settings",
  audit: "/audit-log",
};

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
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  // Sessions saved before roles existed belonged to administrators.
  const role: StaffRole = session?.kind === "staff" ? (session.role ?? "admin") : "admin";
  const visible = nav.filter((it) => !it.roles || it.roles.includes(role));

  function go(key: string) {
    const path = PATHS[key];
    if (path) navigate(path);
    else onNavigate?.(key);
  }

  return (
    <div className="osh-app">
      <aside className="osh-sidebar">
        <div className="osh-brand">
          <div className="osh-brand-name">AIVA OSHealth</div>
          <div className="osh-brand-fac">{facilityName}</div>
        </div>
        <span className="osh-env">{env}</span>
        <nav className="osh-nav">
          {visible.map((it) => (
            <div key={it.key}>
              {it.group && <div className="osh-nav-group">{it.group}</div>}
              <a
                className={`osh-nav-item${it.demo ? " demo" : ""}${active === it.key ? " active" : ""}`}
                onClick={() => go(it.key)}
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
          <div className="em">{ROLE_LABELS[role]}</div>
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
