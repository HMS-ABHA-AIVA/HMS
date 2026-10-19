import type { Prisma, BedStatus, HousekeepingAction } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { ApiError } from "../../common/errors/appError.js";
import { recordAudit } from "../../common/utils/audit.js";

type Tx = Prisma.TransactionClient;

const include = {
  patient: { select: { id: true, name: true, mrn: true } },
  reservedPatient: { select: { id: true, name: true, mrn: true } },
} as const;

type BedWithPatients = Prisma.BedGetPayload<{ include: typeof include }>;

export interface BedView {
  id: string;
  ward: string;
  bedNo: string;
  status: BedStatus;
  statusSince: string;
  patient: { id: string; name: string; mrn: string | null } | null;
  encounterId: string | null;
  reservedPatient: { id: string; name: string; mrn: string | null } | null;
  reservedFor: string | null;
  reservedUntil: string | null;
  reservedNote: string | null;
  /** A reservation whose time has passed: the bed can still be taken, and should be cleared. */
  reservationLapsed: boolean;
}

const toView = (bed: BedWithPatients): BedView => ({
  id: bed.id,
  ward: bed.ward,
  bedNo: bed.bedNo,
  status: bed.status,
  statusSince: bed.statusSince.toISOString(),
  patient: bed.patient,
  encounterId: bed.encounterId,
  reservedPatient: bed.reservedPatient,
  reservedFor: bed.reservedFor,
  reservedUntil: bed.reservedUntil?.toISOString() ?? null,
  reservedNote: bed.reservedNote,
  reservationLapsed: bed.status === "reserved" && bed.reservedUntil !== null && bed.reservedUntil < new Date(),
});

const label = (bed: { ward: string; bedNo: string }) => `${bed.ward} ${bed.bedNo}`;

export const listBedsService = async (facilityId: string) =>
  (await prisma.bed.findMany({ where: { facilityId }, include, orderBy: [{ ward: "asc" }, { bedNo: "asc" }] })).map(toView);

const viewOf = async (facilityId: string, id: string) => toView((await prisma.bed.findFirstOrThrow({ where: { id, facilityId }, include })));

/** Locks the bed row for the rest of the transaction, so two people cannot take the same bed at once. */
export const lockBed = async (tx: Tx, facilityId: string, id: string) => {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Bed" WHERE "id" = ${id} AND "facilityId" = ${facilityId} FOR UPDATE`;
  if (rows.length === 0) throw new ApiError(404, "Bed not found", [], "BED_NOT_FOUND");
  return tx.bed.findUniqueOrThrow({ where: { id } });
};

export const addBedService = async (facilityId: string, actor: string, ward: string, bedNo: string) => {
  try {
    const bed = await prisma.$transaction(async (tx) => {
      const created = await tx.bed.create({ data: { facilityId, ward, bedNo }, include });
      await recordAudit(tx, facilityId, actor, "Bed Added", `${ward} ${bedNo}`);
      return created;
    });
    return toView(bed);
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "P2002") {
      throw new ApiError(409, `Bed ${ward} ${bedNo} already exists.`, [], "BED_EXISTS");
    }
    throw error;
  }
};

/** Keeps a vacant bed for a patient who is coming (a planned admission). An admission takes it, or the reservation is cleared. */
export const reserveBedService = async (
  facilityId: string,
  actor: string,
  id: string,
  input: { patientId?: string | undefined; reservedFor?: string | undefined; until?: string | undefined; note?: string | undefined },
) => {
  if (input.until && new Date(input.until) < new Date()) {
    throw new ApiError(409, "The reservation cannot end in the past.", [], "RESERVATION_IN_PAST");
  }

  await prisma.$transaction(async (tx) => {
    const bed = await lockBed(tx, facilityId, id);
    if (bed.status !== "vacant") {
      throw new ApiError(409, `Bed ${label(bed)} is ${bed.status}: only a vacant bed can be reserved.`, [], "BED_NOT_VACANT");
    }
    const patient = input.patientId ? await tx.patient.findFirst({ where: { id: input.patientId, facilityId }, select: { id: true, name: true } }) : null;
    if (input.patientId && !patient) throw new ApiError(404, "Patient not found", [], "PATIENT_NOT_FOUND");
    const who = patient?.name ?? input.reservedFor!;

    await tx.bed.update({
      where: { id },
      data: {
        status: "reserved",
        statusSince: new Date(),
        reservedPatientId: patient?.id ?? null,
        reservedFor: who,
        reservedUntil: input.until ? new Date(input.until) : null,
        reservedNote: input.note ?? null,
      },
    });
    await recordAudit(tx, facilityId, actor, "Bed Reserved", `${label(bed)} for ${who}`);
  });
  return viewOf(facilityId, id);
};

export const clearReservationService = async (facilityId: string, actor: string, id: string) => {
  await prisma.$transaction(async (tx) => {
    const bed = await lockBed(tx, facilityId, id);
    if (bed.status !== "reserved") throw new ApiError(409, `Bed ${label(bed)} is not reserved.`, [], "BED_NOT_RESERVED");
    await tx.bed.update({
      where: { id },
      data: { status: "vacant", statusSince: new Date(), reservedPatientId: null, reservedFor: null, reservedUntil: null, reservedNote: null },
    });
    await recordAudit(tx, facilityId, actor, "Bed Reservation Cleared", `${label(bed)} (was for ${bed.reservedFor ?? "someone"})`);
  });
  return viewOf(facilityId, id);
};

/** One step of the housekeeping pipeline. Refuses to skip steps (a bed nobody started cannot be "completed"). */
const moveBed = async (facilityId: string, actor: string, id: string, from: "dirty" | "cleaning", to: "cleaning" | "vacant", action: string) => {
  await prisma.$transaction(async (tx) => {
    const bed = await lockBed(tx, facilityId, id);
    if (bed.status !== from) throw new ApiError(409, `Bed ${label(bed)} is ${bed.status}, not ${from}.`, [], "BED_WRONG_STATE");
    await tx.bed.update({ where: { id }, data: { status: to, statusSince: new Date() } });
    await tx.housekeepingLog.create({ data: { facilityId, bedId: id, action: to === "cleaning" ? "cleaning_started" : "cleaning_completed", by: actor } });
    await recordAudit(tx, facilityId, actor, action, label(bed));
  });
  return viewOf(facilityId, id);
};

export const startCleaningService = (facilityId: string, actor: string, id: string) => moveBed(facilityId, actor, id, "dirty", "cleaning", "Bed Cleaning Started");
export const completeCleaningService = (facilityId: string, actor: string, id: string) => moveBed(facilityId, actor, id, "cleaning", "vacant", "Bed Cleaning Completed");

export const listHousekeepingLogService = async (facilityId: string, limit: number) =>
  (await prisma.housekeepingLog.findMany({ where: { facilityId }, include: { bed: { select: { ward: true, bedNo: true } } }, orderBy: { at: "desc" }, take: limit })).map((row) => ({
    id: row.id,
    bedId: row.bedId,
    ward: row.bed.ward,
    bedNo: row.bed.bedNo,
    action: row.action,
    at: row.at.toISOString(),
    by: row.by,
  }));

// ---- used by the visits stage (admission, transfer, discharge) -----------------------------------------------------------------------

/** A bed can be taken when it is vacant, or reserved for this patient, or its reservation has lapsed. */
export const bedIsTakeable = (bed: { status: BedStatus; reservedPatientId: string | null; reservedUntil: Date | null }, patientId: string) =>
  bed.status === "vacant" ||
  (bed.status === "reserved" && (bed.reservedPatientId === patientId || (bed.reservedUntil !== null && bed.reservedUntil < new Date())));

export const occupyBed = (tx: Tx, id: string, patientId: string, encounterId: string) =>
  tx.bed.update({
    where: { id },
    data: { status: "occupied", patientId, encounterId, statusSince: new Date(), reservedPatientId: null, reservedFor: null, reservedUntil: null, reservedNote: null },
  });

/** A patient has left: the bed becomes "dirty" and appears in housekeeping's queue. */
export const releaseBed = async (tx: Tx, facilityId: string, id: string, actor: string) => {
  await tx.bed.update({ where: { id }, data: { status: "dirty", patientId: null, encounterId: null, statusSince: new Date() } });
  await tx.housekeepingLog.create({ data: { facilityId, bedId: id, action: "discharge_release" as HousekeepingAction, by: actor } });
};
