import { ApiError } from '@/api/client';
import { listPatientTransactions, verifyAbhaCreateOtp, type AbdmEnvironment } from '@/api/endpoints';

/**
 * Ids that could identify a new ABHA enrollment to /abha/create/verify, best first.
 *
 * The backend README doesn't say which id create/verify expects. It has looked up its
 * own internal transaction id, while create/request has returned only ABDM's `txnId`. So:
 * use a `transactionId` if create/request returns one, else map `txnId` to the internal
 * id through the patient's transaction list, and keep ABDM's `txnId` as a last resort.
 */
export async function enrollmentTransactionIds(
  patientId: string,
  requested: { txnId: string; transactionId?: string }
): Promise<string[]> {
  const ids: string[] = [];
  if (requested.transactionId) ids.push(requested.transactionId);

  try {
    const { data } = await listPatientTransactions(patientId);
    const rows = Array.isArray(data) ? data : [];
    const match =
      rows.find((t) => t.txnId === requested.txnId) ??
      rows.find((t) => t.purpose === 'ENROLLMENT' && t.status === 'PENDING');
    if (match?.id) ids.push(match.id);
  } catch {
    // the list only helps to look the id up; ABDM's own id is still tried below
  }

  ids.push(requested.txnId);
  return [...new Set(ids)];
}

/**
 * Tries each candidate id until the backend recognises the transaction. An unknown id
 * is rejected before ABDM is called, so trying the next one can't burn the OTP.
 */
export async function verifyEnrollment(
  candidates: string[],
  body: { otp: string; mobile: string; environment: AbdmEnvironment }
) {
  let lastError: unknown;
  for (const transactionId of candidates) {
    try {
      return await verifyAbhaCreateOtp({ transactionId, ...body });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404 && /transaction not found/i.test(err.message)) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
