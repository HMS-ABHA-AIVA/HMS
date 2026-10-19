import type { Response, NextFunction } from "express";
import type { StaffRole } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { ApiError } from "../errors/appError.js";
import type { userAuthRequest } from "./verifyUserJwt.js";

/**
 * Allows only the listed roles. Use after verifyUserJwt. The role is read from the database on every call, so a
 * role change or a deactivation takes effect at once and not when the sign-in token runs out.
 * Admins are not implied: list `"admin"` wherever admins are allowed.
 */
export const requireRole = (...roles: StaffRole[]) => async (req: userAuthRequest, _res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized access");

    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true, active: true, facilityId: true } });
    if (!user || !user.active || user.facilityId !== req.user.facilityId) throw new ApiError(401, "unauthorized access");

    req.user.role = user.role;
    if (!roles.includes(user.role)) {
      throw new ApiError(403, "You do not have permission to do this.", [], "FORBIDDEN");
    }
    next();
  } catch (error) {
    next(error);
  }
};
