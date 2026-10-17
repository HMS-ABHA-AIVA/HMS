import type { Role } from '@/types';

export interface NavItem {
  label: string;
  path: string;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

const ALL: Record<string, NavItem> = {
  dashboard: { label: 'Dashboard', path: '/' },
  registration: { label: 'Registration & Front Office', path: '/registration' },
  // These pages run on demo data until the backend supports them.
  opd: { label: 'OPD Queue', path: '/opd' },
  ipd: { label: 'IPD / Bed Board', path: '/ipd' },
  pharmacy: { label: 'Pharmacy & Inventory', path: '/pharmacy' },
  billing: { label: 'Billing & Insurance', path: '/billing' },
  payroll: { label: 'Payroll & HR', path: '/payroll' },
  roster: { label: 'Staff Roster', path: '/roster' },

  // Hidden for now: these pages need backend support first. Their code is still in src/pages/.
  // To bring one back, uncomment its entry here, its references in navByRole below, and its
  // import and route in src/App.tsx.
  // emergency: { label: 'Emergency / Urgent Care', path: '/emergency' },
  // supplies: { label: 'Supplies & Inventory', path: '/supplies' },
  // housekeeping: { label: 'Housekeeping', path: '/housekeeping' },
  // waste: { label: 'Waste Management', path: '/housekeeping/waste' },
  // audit: { label: 'Audit Log', path: '/audit' },
};

/** A facility login (hospital owner) only manages setup; the HMIS screens run under a staff login. */
export const facilityNav: NavSection[] = [
  { section: 'Facility', items: [{ label: 'Facility Setup', path: '/facility-setup' }] },
];

// Each role's original menu is kept in the comments so hidden modules can be restored.
export const navByRole: Record<Role, NavSection[]> = {
  front_office: [
    { section: 'Workspace', items: [ALL.dashboard, ALL.registration /* , ALL.supplies */, ALL.roster] },
    { section: 'Visibility', items: [ALL.opd /* , ALL.emergency */, ALL.ipd /* , ALL.housekeeping, ALL.waste */] },
  ],
  doctor: [
    { section: 'Workspace', items: [ALL.dashboard, ALL.opd /* , ALL.emergency */, ALL.ipd] },
  ],
  nurse: [
    { section: 'Workspace', items: [ALL.dashboard /* , ALL.emergency */, ALL.ipd /* , ALL.supplies, ALL.housekeeping, ALL.waste */, ALL.roster] },
  ],
  pharmacist: [
    { section: 'Workspace', items: [ALL.dashboard, ALL.pharmacy] },
  ],
  biller: [
    { section: 'Workspace', items: [ALL.dashboard, ALL.billing] },
  ],
  housekeeping: [
    { section: 'Workspace', items: [ALL.dashboard /* , ALL.housekeeping, ALL.waste */, ALL.roster] },
  ],
  admin: [
    {
      section: 'Workspace',
      items: [ALL.dashboard, ALL.registration, ALL.opd /* , ALL.emergency */, ALL.ipd, ALL.pharmacy /* , ALL.supplies, ALL.housekeeping, ALL.waste */, ALL.billing],
    },
    { section: 'HR', items: [ALL.roster, ALL.payroll] },
    // { section: 'Compliance', items: [ALL.audit] },
  ],
};
