import type { BackendPatientWithAbha } from '@/api/endpoints';
import type { Gender, Patient } from '@/types';

// The backend doesn't store age, gender, allergies or problems yet, so they stay in this
// browser (per staff user, by patient id) and are merged onto the backend's patient list.
export interface PatientExtras {
  age?: number;
  gender?: Gender;
  allergies: string[];
  problemList: string[];
}

const key = (userId: string) => `aiva.patientExtras.${userId}`;

export function loadPatientExtras(userId: string): Record<string, PatientExtras> {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as Record<string, PatientExtras>) : {};
  } catch {
    return {};
  }
}

export function savePatientExtras(userId: string, patientId: string, extras: PatientExtras) {
  try {
    localStorage.setItem(key(userId), JSON.stringify({ ...loadPatientExtras(userId), [patientId]: extras }));
  } catch {
    // storage unavailable: the patient is still saved in the backend
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Backend patients have UUID ids; the demo seed patients (p1, p2, …) don't. */
export const isBackendId = (id: string) => UUID.test(id);

export const mrnFor = (id: string) => `MRN-${id.slice(0, 6).toUpperCase()}`;

export const ageGender = (p: Pick<Patient, 'age' | 'gender'>) => (p.age === undefined ? '—' : `${p.age}${p.gender ?? ''}`);

export function toPatient(remote: BackendPatientWithAbha, extras?: PatientExtras): Patient {
  return {
    id: remote.id,
    mrn: mrnFor(remote.id),
    name: remote.name,
    age: extras?.age,
    gender: extras?.gender,
    phone: remote.phone,
    email: remote.email ?? undefined,
    abhaStatus: remote.abha ? 'linked' : 'none',
    abhaNumber: remote.abha?.abhaNumber,
    abhaAddress: remote.abha?.abhaAddress ?? undefined,
    allergies: extras?.allergies ?? [],
    problemList: extras?.problemList ?? [],
    createdAt: remote.createdAt,
  };
}
