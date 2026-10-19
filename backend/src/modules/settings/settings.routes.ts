import { Router } from "express";
import type { Response, NextFunction } from "express";
import { verifyUserJwt, type userAuthRequest } from "../../common/middlewares/verifyUserJwt.js";
import { requireRole } from "../../common/middlewares/requireRole.js";
import { parseInput } from "../../common/utils/validate.js";
import { logSecurityEvent } from "../../common/utils/securityLog.js";
import { updateSettingsSchema } from "../../common/validators/settings.validator.js";
import { getSettings, updateSettings } from "./settings.service.js";

const settingsRouter = Router();

// Anyone signed in may read them (screens and printouts use the hospital's GSTIN, footer and so on).
settingsRouter.get("/", verifyUserJwt, async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ success: true, message: "Settings retrieved", data: await getSettings(req.user!.facilityId) });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put("/", verifyUserJwt, requireRole("admin"), async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const change = parseInput(updateSettingsSchema, req.body);
    const data = await updateSettings(req.user!.facilityId, req.user!.email, change);
    logSecurityEvent("SETTINGS_UPDATED", req, { fields: Object.keys(change).join(",") });
    res.status(200).json({ success: true, message: "Settings saved", data });
  } catch (error) {
    next(error);
  }
});

export default settingsRouter;
