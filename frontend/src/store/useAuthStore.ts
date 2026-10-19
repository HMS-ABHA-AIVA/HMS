import { create } from 'zustand';
import { resetAbdmSession } from '@/api/abdmSession';
import { setSessionExpiredHandler } from '@/api/client';
import { loginFacility, loginStaff, logoutFacility, logoutStaff, type AbdmEnvironment } from '@/api/endpoints';
import { clearSession, loadSession, saveSession, type Session } from '@/lib/session';
import { useHospitalStore } from '@/store/useHospitalStore';

const ENVIRONMENT: AbdmEnvironment = import.meta.env.VITE_ABDM_ENVIRONMENT === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';

interface AuthState {
  session: Session | null;
  /** Which ABDM environment ABHA calls run against (VITE_ABDM_ENVIRONMENT). */
  environment: AbdmEnvironment;
  signInStaff: (email: string, password: string) => Promise<void>;
  signInFacility: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

// Both logins set the same `accessToken` cookie, so only one can be active at a time.
export const useAuthStore = create<AuthState>((set, get) => ({
  session: loadSession(),
  environment: ENVIRONMENT,

  signInStaff: async (email, password) => {
    const { data } = await loginStaff({ email, password });
    const session: Session = { kind: 'staff', id: data.id, name: data.name, email: data.email, role: data.role };
    saveSession(session);
    resetAbdmSession();
    useHospitalStore.getState().signInAs(session);
    set({ session });
  },

  signInFacility: async (email, password) => {
    const { data } = await loginFacility({ email, password });
    const session: Session = { kind: 'facility', name: data.name, email: data.email, hfrId: data.hfrId };
    saveSession(session);
    resetAbdmSession();
    set({ session });
  },

  signOut: async () => {
    const { session } = get();
    try {
      if (session?.kind === 'staff') await logoutStaff(get().environment);
      if (session?.kind === 'facility') await logoutFacility();
    } catch {
      // the cookie may already have expired; we are logging out locally regardless
    }
    clearSession();
    resetAbdmSession();
    // Full reload so no in-memory patient data outlives the login.
    window.location.assign('/login');
  },
}));

// A lapsed login cookie: forget the session and reload so the previous user's data leaves memory.
setSessionExpiredHandler(() => {
  clearSession();
  resetAbdmSession();
  window.location.assign('/login');
});
