import { ApiError } from '@/api/client';
import { retrieveAbdmToken, type AbdmEnvironment } from '@/api/endpoints';

// /abha/retrieve stores ABDM access/refresh tokens as httpOnly cookies that the
// other ABHA routes read. They last 2h, so refresh a little before that.
const ABDM_SESSION_MS = 100 * 60 * 1000;
let validUntil = 0;

async function ensureSession(environment: AbdmEnvironment, force = false) {
  if (!force && Date.now() < validUntil) return;
  await retrieveAbdmToken(environment);
  validUntil = Date.now() + ABDM_SESSION_MS;
}

export function resetAbdmSession() {
  validUntil = 0;
}

/** Runs an ABHA call, fetching the ABDM session first and retrying once if it lapsed. */
export async function withAbdmSession<T>(environment: AbdmEnvironment, call: () => Promise<T>): Promise<T> {
  await ensureSession(environment);
  try {
    return await call();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && /abdm authentication required/i.test(error.message)) {
      await ensureSession(environment, true);
      return call();
    }
    throw error;
  }
}
