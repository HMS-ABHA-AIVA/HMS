export type Role = 'front_office' | 'doctor' | 'nurse' | 'pharmacist' | 'biller' | 'housekeeping' | 'admin';

export type Gender = 'M' | 'F' | 'O';

export interface Patient {
  id: string;
  mrn: string;
  name: string;
  /** Not stored by the backend yet, so unknown for patients registered elsewhere. */
  age?: number;
  gender?: Gender;
  phone: string;
  email?: string;
  abhaNumber?: string;
  abhaAddress?: string;
  abhaStatus: 'none' | 'pending' | 'linked';
  allergies: string[];
  problemList: string[];
  createdAt: string;
}

export type EncounterType = 'OPD' | 'IPD' | 'ER';
export type EncounterStatus =
  | 'waiting'
  | 'in_consult'
  | 'in_er'
  | 'admitted'
  | 'discharged'
  | 'referred'
  | 'lama'
  | 'deceased'
  | 'billed'
  | 'closed';

/** Standard 4-color emergency triage scale: Red = immediate, Yellow = urgent, Green = non-urgent, Black = deceased/expectant. */
export type TriageLevel = 'red' | 'yellow' | 'green' | 'black';

export type ArrivalMode = 'walk_in' | 'ambulance' | 'referred_in';

export type ErDisposition = 'discharged' | 'referred' | 'lama' | 'deceased';

export interface VitalSet {
  takenAt: string;
  temp: number;
  pulse: number;
  bp: string;
  spo2: number;
  rr: number;
}

export interface SoapNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface Prescription {
  id: string;
  drugName: string;
  dose: string;
  frequency: string;
  duration: string;
  dispensed: boolean;
}

export interface Order {
  id: string;
  type: 'lab' | 'radiology';
  name: string;
  status: 'ordered' | 'in_progress' | 'completed';
}

export interface Encounter {
  id: string;
  patientId: string;
  type: EncounterType;
  status: EncounterStatus;
  doctorId?: string;
  department: string;
  tokenNo?: number;
  bedId?: string;
  admittedAt?: string;
  createdAt: string;
  soap?: SoapNote;
  vitals: VitalSet[];
  prescriptions: Prescription[];
  orders: Order[];
  aiDischargeSummaryDraft?: string;
  dischargeSummary?: string;
  billed: boolean;

  // Emergency / urgent care fields (type: 'ER')
  chiefComplaint?: string;
  triageLevel?: TriageLevel;
  arrivalMode?: ArrivalMode;
  dispositionNote?: string;
  referredTo?: string;
  /** Links an ER encounter to the IPD encounter it was admitted into, or vice versa. */
  linkedEncounterId?: string;
}

/**
 * Bed turnover color code: occupied = blue, dirty = red (just vacated, awaiting
 * housekeeping), cleaning = yellow (in progress), vacant = green (clean & ready).
 */
export type BedStatus = 'occupied' | 'dirty' | 'cleaning' | 'vacant';

export interface Bed {
  id: string;
  ward: string;
  bedNo: string;
  status: BedStatus;
  patientId?: string;
  encounterId?: string;
  statusSince: string;
}

export interface HousekeepingLogEntry {
  id: string;
  bedId: string;
  action: 'discharge_release' | 'cleaning_started' | 'cleaning_completed';
  at: string;
  by: string;
}

export interface Drug {
  id: string;
  name: string;
  batch: string;
  expiry: string;
  stock: number;
  reorderLevel: number;
  unit: string;
  mrp: number;
}

export type SupplyCategory =
  | 'Surgical Consumables'
  | 'PPE'
  | 'Linen & Housekeeping'
  | 'Equipment'
  | 'Stationery & Admin'
  | 'Diagnostic Consumables';

export interface Supply {
  id: string;
  name: string;
  category: SupplyCategory;
  unit: string;
  stock: number;
  reorderLevel: number;
  location: string;
  lastRestockedAt: string;
}

export interface SupplyLogEntry {
  id: string;
  supplyId: string;
  type: 'issue' | 'restock';
  qty: number;
  department: string;
  at: string;
  by: string;
}

/**
 * Bio-medical waste color categories per CPCB's Bio-Medical Waste Management
 * Rules, 2016 (Schedule I) — the standard India color-coded segregation scheme.
 */
export type WasteCategory = 'yellow' | 'red' | 'white' | 'blue';

export type WasteStage = 'segregated' | 'stored' | 'pretreated' | 'disposed';

export interface WasteBatch {
  id: string;
  category: WasteCategory;
  department: string;
  weightKg: number;
  stage: WasteStage;
  segregatedAt: string;
  segregatedBy: string;
  storageLocation?: string;
  storedAt?: string;
  pretreatmentMethod?: string;
  pretreatedAt?: string;
  pretreatedBy?: string;
  disposalVendor?: string;
  manifestNo?: string;
  disposedAt?: string;
  disposedBy?: string;
}

export type EmploymentType = 'salaried' | 'visiting_fee';

export interface Staff {
  id: string;
  name: string;
  role: Role;
  department: string;
  hprId?: string;
  employmentType: EmploymentType;
  monthlySalary?: number;
  feePerConsult?: number;
  bankAccountLast4?: string;
  dateOfJoining: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'leave' | 'half_day';

/** A hospital typically runs 3 daily shifts; staff can be marked for more than one on the same date (a double shift). */
export type Shift = 'morning' | 'evening' | 'night';

export interface AttendanceEntry {
  id: string;
  staffId: string;
  date: string;
  shift: Shift;
  status: AttendanceStatus;
}

/** A planned duty assignment — the schedule, as distinct from AttendanceEntry which records what actually happened. */
export interface RosterEntry {
  id: string;
  staffId: string;
  date: string;
  shift: Shift;
  department: string;
}

export interface PayrollLineItem {
  staffId: string;
  staffName: string;
  role: Role;
  employmentType: EmploymentType;
  daysPresent: number;
  doubleShiftDays: number;
  workingDays: number;
  consultCount: number;
  grossPay: number;
  deductions: number;
  netPay: number;
}

export type PayrollStatus = 'draft' | 'finalized' | 'paid';

export interface PayrollRun {
  id: string;
  month: string;
  generatedAt: string;
  generatedBy: string;
  status: PayrollStatus;
  lines: PayrollLineItem[];
}

export interface BillLineItem {
  label: string;
  qty: number;
  rate: number;
  gstPct: number;
}

export interface Bill {
  id: string;
  encounterId: string;
  patientId: string;
  items: BillLineItem[];
  status: 'draft' | 'finalized' | 'paid';
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  user: string;
  action: string;
  detail: string;
}
