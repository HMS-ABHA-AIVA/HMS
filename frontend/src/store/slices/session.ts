import { demoStaff } from '@/data/demoData';
import { loadSession } from '@/lib/session';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { Role, Staff } from '@/types';

// The backend has no roles yet, so a real staff login acts as an administrator.
function staffFromLogin(user: { id: string; name: string }): Staff {
  return {
    id: user.id,
    name: user.name,
    role: 'admin',
    department: 'Administration',
    employmentType: 'salaried',
    dateOfJoining: new Date().toISOString().slice(0, 10),
  };
}

// A staff member who was already logged in before this page load.
const savedSession = loadSession();
const savedStaffLogin = savedSession?.kind === 'staff' ? savedSession : null;

export interface SessionSlice {
  currentRole: Role;
  currentStaff: Staff;
  signInAs: (user: { id: string; name: string }) => void;
  /** Only changes which menu is shown; the backend does not enforce roles yet. */
  setRole: (role: Role) => void;
}

export const createSessionSlice: SliceCreator<SessionSlice> = (set, get) => ({
  currentRole: savedStaffLogin ? 'admin' : 'front_office',
  currentStaff: savedStaffLogin ? staffFromLogin(savedStaffLogin) : demoStaff[3],

  signInAs: (user) => {
    set({ currentRole: 'admin', currentStaff: staffFromLogin(user) });
    get().resetPatients();
  },

  setRole: (role) => set({ currentRole: role }),
});
