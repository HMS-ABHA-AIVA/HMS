import { create } from 'zustand';
import { createAuditSlice, type AuditSlice } from '@/store/slices/audit';
import { createBedsSlice, type BedsSlice } from '@/store/slices/beds';
import { createBillingSlice, type BillingSlice } from '@/store/slices/billing';
import { createEmergencySlice, type EmergencySlice } from '@/store/slices/emergency';
import { createEncountersSlice, type EncountersSlice } from '@/store/slices/encounters';
import { createInpatientSlice, type InpatientSlice } from '@/store/slices/inpatient';
import { createPatientsSlice, type PatientsSlice } from '@/store/slices/patients';
import { createPayrollSlice, type PayrollSlice } from '@/store/slices/payroll';
import { createPharmacySlice, type PharmacySlice } from '@/store/slices/pharmacy';
import { createRosterSlice, type RosterSlice } from '@/store/slices/roster';
import { createSessionSlice, type SessionSlice } from '@/store/slices/session';
import { createStaffSlice, type StaffSlice } from '@/store/slices/staff';
import { createSuppliesSlice, type SuppliesSlice } from '@/store/slices/supplies';
import { createWasteSlice, type WasteSlice } from '@/store/slices/waste';

// The whole app's data and actions live in one store, written as small files in store/slices/,
// one per area. Pages read what they need with useHospitalStore().
//
// Only patients come from the real backend (see slices/patients.ts). Everything else runs on
// demo data from src/data/demoData.ts and resets when the page reloads.
export type HospitalState = SessionSlice &
  AuditSlice &
  PatientsSlice &
  EncountersSlice &
  EmergencySlice &
  InpatientSlice &
  BedsSlice &
  WasteSlice &
  PharmacySlice &
  SuppliesSlice &
  BillingSlice &
  StaffSlice &
  RosterSlice &
  PayrollSlice;

export const useHospitalStore = create<HospitalState>()((...args) => ({
  ...createSessionSlice(...args),
  ...createAuditSlice(...args),
  ...createPatientsSlice(...args),
  ...createEncountersSlice(...args),
  ...createEmergencySlice(...args),
  ...createInpatientSlice(...args),
  ...createBedsSlice(...args),
  ...createWasteSlice(...args),
  ...createPharmacySlice(...args),
  ...createSuppliesSlice(...args),
  ...createBillingSlice(...args),
  ...createStaffSlice(...args),
  ...createRosterSlice(...args),
  ...createPayrollSlice(...args),
}));
