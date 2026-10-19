import bcrypt from "bcrypt";
import type { Prisma, StaffRole } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { ApiError } from "../../common/errors/appError.js";
import { recordAudit } from "../../common/utils/audit.js";
import { getSettings } from "../settings/settings.service.js";
import type { z } from "zod";
import type { createStaffSchema, updateStaffSchema, setLoginSchema } from "../../common/validators/staff.validator.js";

type StaffWithUser = Prisma.StaffGetPayload<{ include: { user: { select: { email: true } } } }>;

export interface StaffView {
  id: string;
  name: string;
  role: StaffRole;
  department: string;
  hprId: string | null;
  employmentType: "salaried" | "visiting_fee";
  monthlySalary: number | null;
  feePerConsult: number | null;
  consultationFee: number | null;
  /** What a patient pays to see this doctor: their own fee, or the hospital's standard OPD fee. */
  opdFee: number;
  bankAccountLast4: string | null;
  dateOfJoining: string;
  active: boolean;
  /** Sign-in e-mail, administrators only. */
  email: string | null;
  hasLogin: boolean;
}

const num = (value: Prisma.Decimal | null) => (value === null ? null : Number(value));

const toView = (row: StaffWithUser, viewerIsAdmin: boolean, defaultFee: number): StaffView => ({
  id: row.id,
  name: row.name,
  role: row.role,
  department: row.department,
  hprId: row.hprId,
  employmentType: row.employmentType,
  // Pay and login details are for administrators; everyone else sees only what is needed to pick a colleague.
  monthlySalary: viewerIsAdmin ? num(row.monthlySalary) : null,
  feePerConsult: num(row.feePerConsult),
  consultationFee: num(row.consultationFee),
  opdFee: num(row.consultationFee) ?? defaultFee,
  bankAccountLast4: viewerIsAdmin ? row.bankAccountLast4 : null,
  dateOfJoining: row.dateOfJoining.toISOString().slice(0, 10),
  active: row.active,
  email: viewerIsAdmin ? (row.user?.email ?? null) : null,
  hasLogin: viewerIsAdmin ? row.userId !== null : false,
});

const include = { user: { select: { email: true } } } as const;

export const listStaffService = async (facilityId: string, viewerIsAdmin: boolean, role?: StaffRole) => {
  const [rows, settings] = await Promise.all([
    prisma.staff.findMany({ where: { facilityId, ...(role ? { role } : {}) }, include, orderBy: { name: "asc" } }),
    getSettings(facilityId),
  ]);
  return rows.map((row) => toView(row, viewerIsAdmin, settings.opdDefaultFee));
};

const findStaff = async (facilityId: string, id: string) => {
  const row = await prisma.staff.findFirst({ where: { id, facilityId }, include });
  if (!row) throw new ApiError(404, "Staff member not found", [], "STAFF_NOT_FOUND");
  return row;
};

export const getStaffService = async (facilityId: string, id: string, viewerIsAdmin: boolean) => {
  const [row, settings] = await Promise.all([findStaff(facilityId, id), getSettings(facilityId)]);
  return toView(row, viewerIsAdmin, settings.opdDefaultFee);
};

const assertEmailFree = async (email: string, exceptUserId?: string) => {
  const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (taken && taken.id !== exceptUserId) throw new ApiError(409, "A login with this e-mail already exists", [], "EMAIL_IN_USE");
};

export const createStaffService = async (facilityId: string, actor: string, input: z.infer<typeof createStaffSchema>) => {
  if (input.login) await assertEmailFree(input.login.email);
  const passwordHash = input.login ? await bcrypt.hash(input.login.password, 12) : null;

  const id = await prisma.$transaction(async (tx) => {
    const user = input.login && passwordHash
      ? await tx.user.create({ data: { name: input.name, email: input.login.email, passwordHash, facilityId, role: input.role } })
      : null;

    const created = await tx.staff.create({
      data: {
        facilityId,
        userId: user?.id ?? null,
        name: input.name,
        role: input.role,
        department: input.department,
        hprId: input.hprId ?? null,
        employmentType: input.employmentType,
        monthlySalary: input.monthlySalary ?? null,
        feePerConsult: input.feePerConsult ?? null,
        consultationFee: input.consultationFee ?? null,
        bankAccountLast4: input.bankAccountLast4 ?? null,
      },
    });
    await recordAudit(tx, facilityId, actor, "Staff Added", `${input.name} (${input.role})${user ? ", with login" : ""}`);
    return created.id;
  });

  return getStaffService(facilityId, id, true);
};

export const updateStaffService = async (facilityId: string, actor: string, actorUserId: string, id: string, change: z.infer<typeof updateStaffSchema>) => {
  const current = await findStaff(facilityId, id);

  // Nobody can lock themselves out by accident.
  if (current.userId && current.userId === actorUserId && (change.active === false || (change.role && change.role !== "admin"))) {
    throw new ApiError(400, "You cannot deactivate yourself or take away your own administrator role.", [], "SELF_LOCKOUT");
  }

  await prisma.$transaction(async (tx) => {
    await tx.staff.update({
      where: { id },
      data: {
        ...(change.name !== undefined ? { name: change.name } : {}),
        ...(change.role !== undefined ? { role: change.role } : {}),
        ...(change.department !== undefined ? { department: change.department } : {}),
        ...(change.hprId !== undefined ? { hprId: change.hprId } : {}),
        ...(change.employmentType !== undefined ? { employmentType: change.employmentType } : {}),
        ...(change.monthlySalary !== undefined ? { monthlySalary: change.monthlySalary } : {}),
        ...(change.feePerConsult !== undefined ? { feePerConsult: change.feePerConsult } : {}),
        ...(change.consultationFee !== undefined ? { consultationFee: change.consultationFee } : {}),
        ...(change.bankAccountLast4 !== undefined ? { bankAccountLast4: change.bankAccountLast4 } : {}),
        ...(change.active !== undefined ? { active: change.active } : {}),
      },
    });

    // The login follows the staff record: same role, same on/off, same name.
    if (current.userId && (change.role !== undefined || change.active !== undefined || change.name !== undefined)) {
      await tx.user.update({
        where: { id: current.userId },
        data: {
          ...(change.role !== undefined ? { role: change.role } : {}),
          ...(change.active !== undefined ? { active: change.active } : {}),
          ...(change.name !== undefined ? { name: change.name } : {}),
        },
      });
      if (change.active === false) await tx.userRefreshToken.deleteMany({ where: { userId: current.userId } });
    }

    await recordAudit(tx, facilityId, actor, "Staff Updated", `${change.name ?? current.name}: ${Object.keys(change).join(", ")}`);
  });

  return getStaffService(facilityId, id, true);
};

/** Gives someone a sign-in, or changes their e-mail / password. Existing sessions end (the refresh tokens are removed). */
export const setLoginService = async (facilityId: string, actor: string, id: string, input: z.infer<typeof setLoginSchema>) => {
  const current = await findStaff(facilityId, id);
  await assertEmailFree(input.email, current.userId ?? undefined);
  const passwordHash = await bcrypt.hash(input.password, 12);

  await prisma.$transaction(async (tx) => {
    if (current.userId) {
      await tx.user.update({ where: { id: current.userId }, data: { email: input.email, passwordHash, role: current.role, active: current.active } });
      await tx.userRefreshToken.deleteMany({ where: { userId: current.userId } });
    } else {
      const user = await tx.user.create({ data: { name: current.name, email: input.email, passwordHash, facilityId, role: current.role, active: current.active } });
      await tx.staff.update({ where: { id }, data: { userId: user.id } });
    }
    await recordAudit(tx, facilityId, actor, current.userId ? "Staff Login Changed" : "Staff Login Created", current.name);
  });

  return getStaffService(facilityId, id, true);
};

export const removeLoginService = async (facilityId: string, actor: string, actorUserId: string, id: string) => {
  const current = await findStaff(facilityId, id);
  if (!current.userId) throw new ApiError(400, "This person has no login.", [], "NO_LOGIN");
  if (current.userId === actorUserId) throw new ApiError(400, "You cannot remove your own login.", [], "SELF_LOCKOUT");

  await prisma.$transaction(async (tx) => {
    await tx.userRefreshToken.deleteMany({ where: { userId: current.userId! } });
    await tx.staff.update({ where: { id }, data: { userId: null } });
    await tx.user.delete({ where: { id: current.userId! } });
    await recordAudit(tx, facilityId, actor, "Staff Login Removed", current.name);
  });

  return getStaffService(facilityId, id, true);
};
