import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import { errorHandler } from "./common/middlewares/errorHandler.middleware.js";
import cookieParser from "cookie-parser";
import facilityRouter from "./modules/facility/facility.routes.js";
import patientRouter from "./modules/patients/patient.routes.js";
import abdmRouter from "./integration/Abha/m1/m1.routes.js";
import adminRouter from "./modules/users/admin/admin.routes.js";

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use("/api/patient",patientRouter)

//abha-module
app.use("/api/abha",abdmRouter)


app.use(errorHandler);
export default app;
