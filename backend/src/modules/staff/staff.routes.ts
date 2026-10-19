import { Router } from "express";
import type { Response, NextFunction } from "express";
import { verifyUserJwt, type userAuthRequest } from "../../common/middlewares/verifyUserJwt.js";
import { requireRole } from "../../common/middlewares/requireRole.js";
import { parseInput, uuidParam } from "../../common/utils/validate.js";
import { logSecurityEvent } from "../../common/utils/securityLog.js";
import { createStaffSchema, setLoginSchema, staffListQuerySchema, updateStaffSchema } from "../../common/validators/staff.validator.js";
import { createStaffService, getStaffService, listStaffService, removeLoginService, setLoginService, updateStaffService } from "./staff.service.js";

const staffRouter = Router();
const ROLES_ALL = ["front_office", "doctor", "nurse", "pharmacist", "biller", "housekeeping", "lab", "admin"] as const;

type Handler = (req: userAuthRequest, res: Response) => Promise<void>;
const route = (handler: Handler) => async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    await handler(req, res);
  } catch (error) {
    next(error);
  }
};

// Everyone signed in can list colleagues (to pick a doctor); pay, bank and login details are shown to admins only.
staffRouter.get("/", verifyUserJwt, requireRole(...ROLES_ALL), route(async (req, res) => {
  const { role } = parseInput(staffListQuerySchema, req.query, "query");
  const data = await listStaffService(req.user!.facilityId, req.user!.role === "admin", role);
  res.status(200).json({ success: true, message: "Staff retrieved", data });
}));

staffRouter.get("/:id", verifyUserJwt, requireRole(...ROLES_ALL), route(async (req, res) => {
  const data = await getStaffService(req.user!.facilityId, uuidParam(req.params.id), req.user!.role === "admin");
  res.status(200).json({ success: true, message: "Staff member retrieved", data });
}));

staffRouter.post("/", verifyUserJwt, requireRole("admin"), route(async (req, res) => {
  const input = parseInput(createStaffSchema, req.body);
  const data = await createStaffService(req.user!.facilityId, req.user!.email, input);
  logSecurityEvent("STAFF_CREATED", req, { staffId: data.id, role: data.role, withLogin: Boolean(input.login) });
  res.status(201).json({ success: true, message: "Staff member added", data });
}));

staffRouter.patch("/:id", verifyUserJwt, requireRole("admin"), route(async (req, res) => {
  const change = parseInput(updateStaffSchema, req.body);
  const data = await updateStaffService(req.user!.facilityId, req.user!.email, req.user!.id, uuidParam(req.params.id), change);
  logSecurityEvent("STAFF_UPDATED", req, { staffId: data.id, fields: Object.keys(change).join(",") });
  res.status(200).json({ success: true, message: "Staff member updated", data });
}));

// Give someone a sign-in, or reset their e-mail / password (administrators only).
staffRouter.put("/:id/login", verifyUserJwt, requireRole("admin"), route(async (req, res) => {
  const input = parseInput(setLoginSchema, req.body);
  const data = await setLoginService(req.user!.facilityId, req.user!.email, uuidParam(req.params.id), input);
  logSecurityEvent("STAFF_LOGIN_SET", req, { staffId: data.id });
  res.status(200).json({ success: true, message: "Login saved", data });
}));

staffRouter.delete("/:id/login", verifyUserJwt, requireRole("admin"), route(async (req, res) => {
  const data = await removeLoginService(req.user!.facilityId, req.user!.email, req.user!.id, uuidParam(req.params.id));
  logSecurityEvent("STAFF_LOGIN_REMOVED", req, { staffId: data.id });
  res.status(200).json({ success: true, message: "Login removed", data });
}));

export default staffRouter;
