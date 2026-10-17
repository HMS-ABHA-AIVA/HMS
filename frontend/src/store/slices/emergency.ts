import { newId } from '@/store/ids';
import { changeEncounter } from '@/store/slices/encounters';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { ArrivalMode, Encounter, ErDisposition, TriageLevel } from '@/types';

/** Emergency-room actions. The encounters themselves live in encounters.ts. */
export interface EmergencySlice {
  checkInToEr: (patientId: string, chiefComplaint: string, triageLevel: TriageLevel, arrivalMode: ArrivalMode, doctorId: string) => Encounter;
  updateTriage: (encounterId: string, triageLevel: TriageLevel) => void;
  resolveErEncounter: (encounterId: string, disposition: ErDisposition, note: string, referredTo?: string) => void;
  linkAdmission: (sourceEncounterId: string, newEncounterId: string) => void;
}

const DISPOSITION_LABELS: Record<ErDisposition, string> = {
  discharged: 'ER Patient Discharged',
  referred: 'ER Patient Referred Out',
  lama: 'ER Patient Left Against Medical Advice',
  deceased: 'ER Patient Deceased',
};

export const createEmergencySlice: SliceCreator<EmergencySlice> = (set, get) => ({
  checkInToEr: (patientId, chiefComplaint, triageLevel, arrivalMode, doctorId) => {
    const encounter: Encounter = {
      id: newId('e'),
      patientId,
      type: 'ER',
      status: 'in_er',
      doctorId,
      department: 'Emergency',
      chiefComplaint,
      triageLevel,
      arrivalMode,
      createdAt: new Date().toISOString(),
      vitals: [],
      prescriptions: [],
      orders: [],
      billed: false,
    };
    set((state) => ({ encounters: [...state.encounters, encounter] }));
    get().logAudit('ER Check-in', `${chiefComplaint} — triage ${triageLevel.toUpperCase()}`);
    return encounter;
  },

  updateTriage: (encounterId, triageLevel) => {
    set((state) => ({
      encounters: changeEncounter(state.encounters, encounterId, (visit) => ({ ...visit, triageLevel })),
    }));
    get().logAudit('ER Triage Updated', `${encounterId} -> ${triageLevel.toUpperCase()}`);
  },

  resolveErEncounter: (encounterId, disposition, note, referredTo) => {
    set((state) => ({
      encounters: changeEncounter(state.encounters, encounterId, (visit) => ({
        ...visit,
        status: disposition,
        dispositionNote: note,
        referredTo,
      })),
    }));
    get().logAudit(DISPOSITION_LABELS[disposition], referredTo ? `${note} — referred to ${referredTo}` : note);
    get().generateBill(encounterId);
  },

  linkAdmission: (sourceEncounterId, newEncounterId) => {
    set((state) => ({
      encounters: changeEncounter(state.encounters, sourceEncounterId, (visit) => ({
        ...visit,
        status: 'admitted',
        linkedEncounterId: newEncounterId,
      })),
    }));
    get().logAudit('ER Patient Admitted to IPD', `${sourceEncounterId} -> ${newEncounterId}`);
    get().generateBill(sourceEncounterId);
  },
});
