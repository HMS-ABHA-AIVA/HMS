// The backend authenticates with httpOnly cookies the browser can't read and has
// no "who am I" endpoint, so we remember who logged in ourselves. This is only
// UI state; the cookies remain the real credential.
export type Session =
  | { kind: 'staff'; id: string; name: string; email: string }
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
