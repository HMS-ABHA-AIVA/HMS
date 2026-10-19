import type { Prisma, PrismaClient } from "@prisma/client";

export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Next number of a per-hospital running sequence (MRN, bill number ...). The increment is atomic, so two requests
 * can never receive the same number. Numbers are never reused, so a failed save leaves a gap, not a clash.
 * `start` is the value before the first number: start 10000 issues 10001 first.
 */
export const nextNumber = async (db: Db, facilityId: string, key: string, start = 0): Promise<number> => {
  for (let attempt = 1; ; attempt++) {
    try {
      const row = await db.facilityCounter.upsert({
        where: { facilityId_key: { facilityId, key } },
        create: { facilityId, key, value: start + 1 },
        update: { value: { increment: 1 } },
      });
      return row.value;
    } catch (error) {
      // two requests created the first row of this sequence at the same moment: the retry increments it
      if ((error as { code?: string } | null)?.code !== "P2002" || attempt >= 3) throw error;
    }
  }
};

/** "MRN-10001": the hospital's medical record number for a new patient. */
export const nextMrn = async (db: Db, facilityId: string) => `MRN-${await nextNumber(db, facilityId, "mrn", 10000)}`;
