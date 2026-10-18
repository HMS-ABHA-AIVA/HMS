// Same-origin by default: the Vite dev/preview server proxies `/api` to the
// backend (see vite.config.ts), which sidesteps the backend's bare `cors()`
// and lets its httpOnly auth cookies work. Set VITE_API_URL only when the
// frontend is served from a different origin than the API.
const BASE: string = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  status: number;
  /** Stable reason from the backend (e.g. "ABHA_NOT_FOUND"), when it gave one. */
  code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let onSessionExpired: (() => void) | null = null;

/** Registered by the auth store so a lapsed login cookie sends the user back to /login. */
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that the backend is running.');
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : res.status >= 500
          ? 'The server is unavailable. Check that the backend is running.'
          : `Request failed (${res.status})`;
    // Backend auth middleware answers "unauthorized access"; ABDM-token problems say
    // "ABDM authentication required" and must not log the user out.
    if (res.status === 401 && /unauthor/i.test(message)) onSessionExpired?.();
    throw new ApiError(res.status, message, typeof payload?.code === 'string' ? payload.code : undefined);
  }

  return payload as T;
}

export const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body);
export const get = <T>(path: string) => request<T>('GET', path);

export async function getBlob(path: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'GET',
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that the backend is running.');
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : res.status >= 500
          ? 'The server is unavailable. Check that the backend is running.'
          : `Request failed (${res.status})`;
    if (res.status === 401 && /unauthor/i.test(message)) onSessionExpired?.();
    throw new ApiError(res.status, message, typeof payload?.code === 'string' ? payload.code : undefined);
  }

  return await res.blob();
}

