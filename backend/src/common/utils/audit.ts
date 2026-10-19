import type { Db } from "./counters.js";

/**
 * Appends a line to the hospital's audit trail. Pass the transaction client when the audited change is made in a
 * transaction, so the line exists exactly when the change does. `detail` must never hold passwords, OTPs, tokens or
 * Aadhaar numbers.
 */
export const recordAudit = (db: Db, facilityId: string, actor: string, action: string, detail = "") =>
  db.auditLog.create({ data: { facilityId, actor: actor.slice(0, 200), action: action.slice(0, 120), detail: detail.slice(0, 1000) } });
