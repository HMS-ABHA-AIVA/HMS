import { ageGender } from '@/lib/patientHelpers';
import { newId } from '@/store/ids';
import { changeEncounter } from '@/store/slices/encounters';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { Encounter } from '@/types';

/** Admission, bed transfer and discharge. The encounters live in encounters.ts, the beds in beds.ts. */
export interface InpatientSlice {
  admitPatient: (patientId: string, department: string, doctorId: string, bedId: string) => Encounter;
  transferBed: (encounterId: string, newBedId: string) => void;
  generateDischargeDraft: (encounterId: string) => void;
  acceptDischargeSummary: (encounterId: string, finalText: string) => void;
}

export const createInpatientSlice: SliceCreator<InpatientSlice> = (set, get) => ({
  admitPatient: (patientId, department, doctorId, bedId) => {
    const now = new Date().toISOString();
    const encounter: Encounter = {
      id: newId('e'),
      patientId,
      type: 'IPD',
      status: 'admitted',
      doctorId,
      department,
      bedId,
      admittedAt: now,
      createdAt: now,
      vitals: [],
      prescriptions: [],
      orders: [],
      billed: false,
    };
    set((state) => ({
      encounters: [...state.encounters, encounter],
      beds: state.beds.map((bed) =>
        bed.id === bedId ? { ...bed, status: 'occupied', patientId, encounterId: encounter.id, statusSince: now } : bed
      ),
    }));
    get().logAudit('Patient Admitted', `Bed ${bedId} — ${department}`);
    return encounter;
  },

  transferBed: (encounterId, newBedId) => {
    const encounter = get().encounters.find((visit) => visit.id === encounterId);
    if (!encounter) return;
    const oldBedId = encounter.bedId;
    const now = new Date().toISOString();

    set((state) => ({
      encounters: changeEncounter(state.encounters, encounterId, (visit) => ({ ...visit, bedId: newBedId })),
      beds: state.beds.map((bed) => {
        if (bed.id === newBedId) return { ...bed, status: 'occupied', patientId: encounter.patientId, encounterId, statusSince: now };
        // The bed being left goes to housekeeping.
        if (bed.id === oldBedId) return { ...bed, status: 'dirty', patientId: undefined, encounterId: undefined, statusSince: now };
        return bed;
      }),
      housekeepingLog: oldBedId
        ? [{ id: newId('hk'), bedId: oldBedId, action: 'discharge_release', at: now, by: get().currentStaff.name }, ...state.housekeepingLog]
        : state.housekeepingLog,
    }));
    get().logAudit('Bed Transfer', `${oldBedId} -> ${newBedId}`);
  },

  generateDischargeDraft: (encounterId) => {
    const encounter = get().encounters.find((visit) => visit.id === encounterId);
    const patient = get().patients.find((person) => person.id === encounter?.patientId);
    if (!encounter || !patient) return;

    const latestVitals = encounter.vitals[encounter.vitals.length - 1];
    const draft = `DISCHARGE SUMMARY (AI DRAFT — requires clinician review before finalizing)

Patient: ${patient.name}, ${ageGender(patient)} | MRN: ${patient.mrn}
Admitted: ${encounter.admittedAt ? new Date(encounter.admittedAt).toLocaleString('en-IN') : '-'}
Department: ${encounter.department}

Diagnosis / Problem List: ${patient.problemList.join(', ') || 'Not documented'}
Allergies: ${patient.allergies.join(', ') || 'NKDA'}

Course in Hospital: Patient was admitted and managed per department protocol. ${encounter.orders.length} investigation(s) ordered. Vitals at last recording: Temp ${latestVitals?.temp ?? '-'}°F, BP ${latestVitals?.bp ?? '-'}, SpO2 ${latestVitals?.spo2 ?? '-'}%.

Medications on Discharge: ${encounter.prescriptions.map((rx) => `${rx.drugName} ${rx.dose} ${rx.frequency} x ${rx.duration}`).join('; ') || 'None recorded'}

Follow-up: Advised OPD follow-up in 7 days.

— AI-generated draft. Edit and sign off before adding to the medical record.`;

    set((state) => ({
      encounters: changeEncounter(state.encounters, encounterId, (visit) => ({ ...visit, aiDischargeSummaryDraft: draft })),
    }));
    get().logAudit('AI Discharge Draft Generated', encounterId);
  },

  acceptDischargeSummary: (encounterId, finalText) => {
    const encounter = get().encounters.find((visit) => visit.id === encounterId);
    const dischargedBed = get().beds.find((bed) => bed.id === encounter?.bedId);
    const now = new Date().toISOString();

    set((state) => ({
      encounters: changeEncounter(state.encounters, encounterId, (visit) => ({
        ...visit,
        dischargeSummary: finalText,
        status: 'discharged',
      })),
      // The bed is now empty but dirty, and waits for housekeeping.
      beds: state.beds.map((bed) =>
        bed.id === encounter?.bedId ? { ...bed, status: 'dirty', patientId: undefined, encounterId: undefined, statusSince: now } : bed
      ),
      housekeepingLog: dischargedBed
        ? [{ id: newId('hk'), bedId: dischargedBed.id, action: 'discharge_release', at: now, by: get().currentStaff.name }, ...state.housekeepingLog]
        : state.housekeepingLog,
    }));
    get().logAudit('Discharge Summary Signed Off', `Clinician-approved, encounter ${encounterId}`);
    if (dischargedBed) get().logAudit('Bed Released for Housekeeping', `${dischargedBed.ward} ${dischargedBed.bedNo} — discharge release`);
  },
});
