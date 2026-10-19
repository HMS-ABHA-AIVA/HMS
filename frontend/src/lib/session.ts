// The backend authenticates with httpOnly cookies the browser can't read and has
// no "who am I" endpoint, so we remember who logged in ourselves. This is only
// UI state; the cookies remain the real credential.
export type StaffRole = 'front_office' | 'doctor' | 'nurse' | 'pharmacist' | 'biller' | 'housekeeping' | 'lab' | 'admin';

export const ROLE_LABELS: Record<StaffRole, string> = {
  front_office: 'Front office',
  doctor: 'Doctor',
  nurse: 'Nurse',
  pharmacist: 'Pharmacist',
  biller: 'Billing',
  housekeeping: 'Housekeeping',
  lab: 'Lab',
  admin: 'Administrator',
};

export type Session =
  // role is missing in sessions saved before roles existed; those people were administrators
  | { kind: 'staff'; id: string; name: string; email: string; role?: StaffRole }
  | { kind: 'facility'; name: string; email: string; hfrId: string };

const KEY = 'aiva.session';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // storage unavailable (private mode): the session just won't survive a reload
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
