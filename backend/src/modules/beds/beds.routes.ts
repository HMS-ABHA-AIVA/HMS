import { Router } from "express";
import type { Response, NextFunction } from "express";
import { z } from "zod";
import { verifyUserJwt, type userAuthRequest } from "../../common/middlewares/verifyUserJwt.js";
import { requireRole } from "../../common/middlewares/requireRole.js";
import { parseInput, uuidParam } from "../../common/utils/validate.js";
import { logSecurityEvent } from "../../common/utils/securityLog.js";
import {
  addBedService, clearReservationService, completeCleaningService, listBedsService, listHousekeepingLogService, reserveBedService, startCleaningService,
} from "./beds.service.js";

const bedsRouter = Router();

type Handler = (req: userAuthRequest, res: Response) => Promise<void>;
const route = (handler: Handler) => async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    await handler(req, res);
  } catch (error) {
    next(error);
  }
};

const facility = (req: userAuthRequest) => req.user!.facilityId;
const actor = (req: userAuthRequest) => req.user!.email;
const ok = (res: Response, message: string, data: unknown, status = 200) => void res.status(status).json({ success: true, message, data });

// Who may do what (the prototype's rules): everyone on the ward side sees beds; adding a bed is for admins;
// cleaning steps for housekeeping, nurses and admins; reservations for the front desk, nurses and admins.
const SEE = ["front_office", "doctor", "nurse", "housekeeping", "admin"] as const;

bedsRouter.get("/", verifyUserJwt, requireRole(...SEE), route(async (req, res) => {
  ok(res, "Beds retrieved", await listBedsService(facility(req)));
}));

// Bed turnover history for the housekeeping screen (newest first).
bedsRouter.get("/housekeeping-log", verifyUserJwt, requireRole(...SEE), route(async (req, res) => {
  const { limit } = parseInput(z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }), req.query, "query");
  ok(res, "Housekeeping log retrieved", await listHousekeepingLogService(facility(req), limit));
}));

bedsRouter.post("/", verifyUserJwt, requireRole("admin"), route(async (req, res) => {
  const { ward, bedNo } = parseInput(z.object({ ward: z.string().trim().min(1).max(60), bedNo: z.string().trim().min(1).max(20) }), req.body);
  const bed = await addBedService(facility(req), actor(req), ward, bedNo);
  logSecurityEvent("BED_ADDED", req, { bedId: bed.id });
  ok(res, "Bed added", bed, 201);
}));

bedsRouter.post("/:id/reserve", verifyUserJwt, requireRole("front_office", "nurse", "admin"), route(async (req, res) => {
  const input = parseInput(
    z.object({
      patientId: z.uuid().optional(),
      reservedFor: z.string().trim().min(2).max(120).optional(),
      until: z.iso.datetime({ offset: true }).optional(),
      note: z.string().trim().max(200).optional(),
    }).refine((v) => v.patientId || v.reservedFor, { message: "Say who the bed is for" }),
    req.body,
  );
  ok(res, "Bed reserved", await reserveBedService(facility(req), actor(req), uuidParam(req.params.id), input));
}));

bedsRouter.post("/:id/clear-reservation", verifyUserJwt, requireRole("front_office", "nurse", "admin"), route(async (req, res) => {
  ok(res, "Reservation cleared", await clearReservationService(facility(req), actor(req), uuidParam(req.params.id)));
}));

bedsRouter.post("/:id/start-cleaning", verifyUserJwt, requireRole("housekeeping", "nurse", "admin"), route(async (req, res) => {
  ok(res, "Cleaning started", await startCleaningService(facility(req), actor(req), uuidParam(req.params.id)));
}));

bedsRouter.post("/:id/complete-cleaning", verifyUserJwt, requireRole("housekeeping", "nurse", "admin"), route(async (req, res) => {
  ok(res, "Cleaning completed", await completeCleaningService(facility(req), actor(req), uuidParam(req.params.id)));
}));

export default bedsRouter;
