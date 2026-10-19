import { Router } from "express";
import type { Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { verifyUserJwt, type userAuthRequest } from "../../common/middlewares/verifyUserJwt.js";
import { requireRole } from "../../common/middlewares/requireRole.js";
import { parseInput } from "../../common/utils/validate.js";

const auditRouter = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // ISO time: only entries older than this (to page backwards)
  before: z.iso.datetime().optional(),
  search: z.string().trim().max(100).optional(),
});

// The hospital's audit trail, newest first. Administrators only.
auditRouter.get("/", verifyUserJwt, requireRole("admin"), async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { limit, before, search } = parseInput(querySchema, req.query, "query");
    const rows = await prisma.auditLog.findMany({
      where: {
        facilityId: req.user!.facilityId,
        ...(before ? { at: { lt: new Date(before) } } : {}),
        ...(search ? { OR: [{ action: { contains: search, mode: "insensitive" } }, { actor: { contains: search, mode: "insensitive" } }, { detail: { contains: search, mode: "insensitive" } }] } : {}),
      },
      orderBy: { at: "desc" },
      take: limit,
    });
    res.status(200).json({ success: true, message: "Audit log retrieved", data: rows });
  } catch (error) {
    next(error);
  }
});

export default auditRouter;
