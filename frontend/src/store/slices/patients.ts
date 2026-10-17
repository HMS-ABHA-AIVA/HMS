import { listPatients } from '@/api/endpoints';
import { loadPatientExtras, mrnFor, savePatientExtras, toPatient } from '@/lib/patientHelpers';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { Patient } from '@/types';

export interface PatientsSlice {
  patients: Patient[];
  patientsStatus: 'idle' | 'loading' | 'ready' | 'error';
  patientsError: string | null;
  /** Clear live patients when someone signs in. */
  resetPatients: () => void;
  /** Loads this facility's patients from the backend. */
  loadPatients: () => Promise<void>;
  /** `data.id` is the patient's backend id: the patient must already exist in the backend. */
  registerPatient: (data: Omit<Patient, 'mrn' | 'createdAt' | 'abhaStatus'> & { abhaStatus: Patient['abhaStatus'] }) => Patient;
  linkAbha: (patientId: string, abha: { abhaNumber: string; abhaAddress: string | null }) => void;
}

export const createPatientsSlice: SliceCreator<PatientsSlice> = (set, get) => ({
  patients: [],
  patientsStatus: 'idle',
  patientsError: null,

  resetPatients: () => set({ patients: [], patientsStatus: 'idle', patientsError: null }),

  loadPatients: async () => {
    set({ patientsStatus: 'loading', patientsError: null });
    try {
      const { data } = await listPatients();
      const savedExtras = loadPatientExtras(get().currentStaff.id);
      const backendPatients = (Array.isArray(data) ? data : []).map((patient) => toPatient(patient, savedExtras[patient.id]));
      set({ patients: backendPatients, patientsStatus: 'ready' });
    } catch (error) {
      set({ patientsStatus: 'error', patientsError: error instanceof Error ? error.message : 'Could not load patients.' });
    }
  },

  registerPatient: (data) => {
    const patient: Patient = {
      ...data,
      mrn: mrnFor(data.id),
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ patients: [...state.patients, patient] }));
    // The backend does not keep these yet, so remember them in this browser.
    savePatientExtras(get().currentStaff.id, patient.id, {
      age: patient.age,
      gender: patient.gender,
      allergies: patient.allergies,
      problemList: patient.problemList,
    });
    get().logAudit('Patient Registered', `${patient.name} (${patient.mrn})`);
    return patient;
  },

  linkAbha: (patientId, abha) => {
    set((state) => ({
      patients: state.patients.map((patient) =>
        patient.id === patientId
          ? { ...patient, abhaStatus: 'linked', abhaNumber: abha.abhaNumber, abhaAddress: abha.abhaAddress ?? undefined }
          : patient
      ),
    }));
    get().logAudit('ABHA Linked', abha.abhaNumber);
  },
});
