import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { ApiError } from "../../common/errors/appError.js";
import { recordAudit } from "../../common/utils/audit.js";
import type { z } from "zod";
import type { updateFacilityProfileSchema } from "../../common/validators/settings.validator.js";

const select = {
  name: true, hfrId: true, hipId: true, facilityType: true, address: true, state: true, district: true,
  pincode: true, phone: true, email: true, latitude: true, longitude: true,
} as const;

type ProfileRow = Prisma.FacilityGetPayload<{ select: typeof select }>;

const toView = (row: ProfileRow) => ({
  ...row,
  latitude: row.latitude === null ? null : Number(row.latitude),
  longitude: row.longitude === null ? null : Number(row.longitude),
});

export const getFacilityProfileService = async (facilityId: string) => {
  const row = await prisma.facility.findUnique({ where: { id: facilityId }, select });
  if (!row) throw new ApiError(404, "Facility not found");
  return toView(row);
};

/**
 * Updates who the hospital is. Changing the HFR id changes which ABDM callbacks reach this hospital (callbacks are routed
 * by it), so it is audited like any other change.
 */
export const updateFacilityProfileService = async (facilityId: string, actor: string, change: z.infer<typeof updateFacilityProfileSchema>) => {
  if (change.hfrId) {
    const taken = await prisma.facility.findUnique({ where: { hfrId: change.hfrId }, select: { id: true } });
    if (taken && taken.id !== facilityId) throw new ApiError(409, "This HFR ID is already used by another hospital.", [], "HFR_ID_IN_USE");
  }

  await prisma.$transaction(async (tx) => {
    // only the fields that were sent
    const data = Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined)) as Prisma.FacilityUpdateInput;
    await tx.facility.update({ where: { id: facilityId }, data });
    await recordAudit(tx, facilityId, actor, "Facility Profile Updated", Object.keys(change).join(", "));
  });

  return getFacilityProfileService(facilityId);
};
