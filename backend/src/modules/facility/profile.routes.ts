import { Router } from "express";
import type { Response, NextFunction } from "express";
import { verifyUserJwt, type userAuthRequest } from "../../common/middlewares/verifyUserJwt.js";
import { requireRole } from "../../common/middlewares/requireRole.js";
import { parseInput } from "../../common/utils/validate.js";
import { logSecurityEvent } from "../../common/utils/securityLog.js";
import { updateFacilityProfileSchema } from "../../common/validators/settings.validator.js";
import { getFacilityProfileService, updateFacilityProfileService } from "./profile.service.js";

const profileRouter = Router();

// Anyone signed in may see the hospital's profile (printouts, the ABDM screens); only administrators change it.
profileRouter.get("/", verifyUserJwt, async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ success: true, message: "Facility profile retrieved", data: await getFacilityProfileService(req.user!.facilityId) });
  } catch (error) {
    next(error);
  }
});

profileRouter.put("/", verifyUserJwt, requireRole("admin"), async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const change = parseInput(updateFacilityProfileSchema, req.body);
    const data = await updateFacilityProfileService(req.user!.facilityId, req.user!.email, change);
    logSecurityEvent("FACILITY_PROFILE_UPDATED", req, { fields: Object.keys(change).join(",") });
    res.status(200).json({ success: true, message: "Facility profile saved", data });
  } catch (error) {
    next(error);
  }
});

export default profileRouter;
