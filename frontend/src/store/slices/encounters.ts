import { demoEncounters } from '@/data/demoData';
import { newId } from '@/store/ids';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { Encounter, Order, Prescription, SoapNote, VitalSet } from '@/types';

/** Returns the list with one encounter swapped for an updated copy. */
export function changeEncounter(encounters: Encounter[], encounterId: string, change: (visit: Encounter) => Encounter): Encounter[] {
  return encounters.map((visit) => (visit.id === encounterId ? change(visit) : visit));
}

/**
 * Patient visits (OPD, ER and IPD are all "encounters"). This slice holds the list and the
 * outpatient consultation actions; emergency.ts and inpatient.ts add the rest.
 */
export interface EncountersSlice {
  encounters: Encounter[];

  checkInToOpd: (patientId: string, department: string, doctorId: string) => Encounter;
  startConsult: (encounterId: string) => void;
  saveSoapNote: (encounterId: string, soap: SoapNote) => void;
  addVitals: (encounterId: string, vitals: Omit<VitalSet, 'takenAt'>) => void;
  addPrescription: (encounterId: string, prescription: Omit<Prescription, 'id' | 'dispensed'>) => void;
  addOrder: (encounterId: string, order: Omit<Order, 'id' | 'status'>) => void;
  closeConsult: (encounterId: string) => void;
}

export const createEncountersSlice: SliceCreator<EncountersSlice> = (set, get) => ({
  encounters: demoEncounters,

  checkInToOpd: (patientId, department, doctorId) => {
    const departmentTokens = get()
      .encounters.filter((visit) => visit.department === department && visit.type === 'OPD')
      .map((visit) => visit.tokenNo ?? 0);
    const tokenNo = Math.max(0, ...departmentTokens) + 1;

    const encounter: Encounter = {
      id: newId('e'),
      patientId,
      type: 'OPD',
      status: 'waiting',
      doctorId,
      department,
      tokenNo,
      createdAt: new Date().toISOString(),
      vitals: [],
      prescriptions: [],
      orders: [],
      billed: false,
    };
    set((state) => ({ encounters: [...state.encounters, encounter] }));
    get().logAudit('OPD Check-in', `Token #${tokenNo} — ${department}`);
    return encounter;
  },

  startConsult: (encounterId) => {
    set((state) => ({
      encounters: changeEncounter(state.encounters, encounterId, (visit) => ({ ...visit, status: 'in_consult' })),
    }));
  },

  saveSoapNote: (encounterId, soap) => {
    set((state) => ({
      encounters: changeEncounter(state.encounters, encounterId, (visit) => ({ ...visit, soap })),
    }));
    get().logAudit('SOAP Note Saved', encounterId);
  },

  addVitals: (encounterId, vitals) => {
    const reading: VitalSet = { ...vitals, takenAt: new Date().toISOString() };
    set((state) => ({
      encounters: changeEncounter(state.encounters, encounterId, (visit) => ({ ...visit, vitals: [...visit.vitals, reading] })),
    }));
    get().logAudit('Vitals Recorded', `BP ${reading.bp}, SpO2 ${reading.spo2}%`);
  },

  addPrescription: (encounterId, prescription) => {
    const newPrescription: Prescription = { ...prescription, id: newId('rx'), dispensed: false };
    set((state) => ({
      encounters: changeEncounter(state.encounters, encounterId, (visit) => ({
        ...visit,
        prescriptions: [...visit.prescriptions, newPrescription],
      })),
    }));
    get().logAudit('Prescription Added', `${newPrescription.drugName} — ${newPrescription.dose} ${newPrescription.frequency}`);
  },

  addOrder: (encounterId, order) => {
    const newOrder: Order = { ...order, id: newId('ord'), status: 'ordered' };
    set((state) => ({
      encounters: changeEncounter(state.encounters, encounterId, (visit) => ({ ...visit, orders: [...visit.orders, newOrder] })),
    }));
    get().logAudit('Order Placed', `${newOrder.type.toUpperCase()}: ${newOrder.name}`);
  },

  closeConsult: (encounterId) => {
    set((state) => ({
      encounters: changeEncounter(state.encounters, encounterId, (visit) => ({ ...visit, status: 'closed' })),
    }));
    get().logAudit('Consultation Closed', encounterId);
  },
});
