import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import { errorHandler } from "./common/middlewares/errorHandler.middleware.js";
import { csrfGuard } from "./common/middlewares/csrfGuard.middleware.js";
import { apiRateLimit, noStore } from "./common/middlewares/apiProtection.middleware.js";
import { getCookieSecret } from "./common/utils/cookieSecret.js";
import cookieParser from "cookie-parser";
import facilityRouter from "./modules/facility/facility.routes.js";
import patientRouter from "./modules/patients/patient.routes.js";
import abdmRouter from "./integration/Abha/m1/m1.routes.js";
import adminRouter from "./modules/users/admin/admin.routes.js";
import staffRouter from "./modules/staff/staff.routes.js";
import settingsRouter from "./modules/settings/settings.routes.js";
import profileRouter from "./modules/facility/profile.routes.js";
import auditRouter from "./modules/audit/audit.routes.js";
import bedsRouter from "./modules/beds/beds.routes.js";
import dashboardRouter from "./modules/dashboard/dashboard.routes.js";
import { bridgeRouter, shareStaffRouter } from "./integration/Abha/share/share.routes.js";

dotenv.config();

const app = express();

app.use(helmet());
// One address, or several separated by commas (for example localhost and the Wi-Fi address). Trailing slashes are ignored.
const frontendOrigin = (process.env.FRONTEND_URL || "http://localhost:5180,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const isDev = process.env.NODE_ENV !== "production";
const isLocalNetwork = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || frontendOrigin.includes(origin) || (isDev && isLocalNetwork(origin))) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use("/api", apiRateLimit);
app.use("/api", noStore);
app.use(csrfGuard(frontendOrigin));

// Behind Render's proxy req.ip would otherwise be the proxy for everyone, collapsing the per-IP OTP rate limit.
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

// The secret signs the cookie that binds an ABHA X-token to one patient (see abdmCookies.ts).
app.use(cookieParser(getCookieSecret()));
// JSON only: form-encoded bodies are not accepted (see csrfGuard).
app.use(express.json({ limit: "100kb" }));

app.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "HMS API",
    health: "/health",
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "HMS API is running",
  });
});

//facility
app.use("/api/facility", facilityRouter);

//user/staff
app.use("/api/user/admin",adminRouter);

//patients
app.use("/api/patient",patientRouter);

//hospital foundation: staff and roles, settings, facility profile, audit trail
app.use("/api/staff", staffRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/facility-profile", profileRouter);
app.use("/api/audit-log", auditRouter);

//beds and housekeeping
app.use("/api/beds", bedsRouter);

//dashboard counts
app.use("/api/dashboard", dashboardRouter);

//scan & share: staff queue, and the callback ABDM makes on the bridge URL
app.use("/api/abha/shares", shareStaffRouter);
app.use("/api/v3/hip", bridgeRouter);

//abha-module
app.use("/api/abha",abdmRouter);

app.use(errorHandler);
export default app;
