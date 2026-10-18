import { Router } from "express";
import { createPatientController,getAllPatientController,getPatientTransactionsController,updatePatientController } from "../patients/patient.controller.js";
import { verifyUserJwt } from "../../common/middlewares/verifyUserJwt.js";

const patientRouter = Router();

patientRouter.get("/",verifyUserJwt,getAllPatientController);
patientRouter.post("/create",verifyUserJwt,createPatientController)
patientRouter.patch("/:patientId",verifyUserJwt,updatePatientController);
patientRouter.get("/:patientId/transactions",verifyUserJwt,getPatientTransactionsController);

export default patientRouter;