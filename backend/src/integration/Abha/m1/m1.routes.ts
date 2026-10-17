import express from "express";
import {aadhaarOtpRequestController, aadhaarOtpVerifyController, abdmTokenRetrievalRequest, generateAbhaQrController, getAbhaProfileController, requestExistingAbhaAadhaarOtpController, requestExistingAbhaMobileOtpController, verifyExistingAbhaAadhaarOtpController, verifyExistingAbhaMobileOtpController, verifyExistingAbhaMobileUserController} from "./m1.controller.js";
import {verifyUserJwt} from "../../../common/middlewares/verifyUserJwt.js"

const abdmRouter = express.Router();

abdmRouter.post("/retrieve",verifyUserJwt, abdmTokenRetrievalRequest);

abdmRouter.post("/create/aadhar/request",verifyUserJwt,aadhaarOtpRequestController);

abdmRouter.post("/create/aadhar/verify",verifyUserJwt,aadhaarOtpVerifyController);


// EXISTING ABHA VERIFICATION

//aadhar number verification
abdmRouter.post("/verify/aadhar/request",verifyUserJwt,requestExistingAbhaAadhaarOtpController);

abdmRouter.post("/verify/aadhar/confirm",verifyUserJwt,verifyExistingAbhaAadhaarOtpController);

//mobile number verification
abdmRouter.post("/verify/mobile/request",verifyUserJwt,requestExistingAbhaMobileOtpController);
abdmRouter.post("/verify/mobile/confirm",verifyUserJwt,verifyExistingAbhaMobileOtpController);
abdmRouter.post("/verify/mobile/user",verifyUserJwt,verifyExistingAbhaMobileUserController);

//generate QR code
//generate ABHA QR code
abdmRouter.get("/profile/qr",verifyUserJwt,generateAbhaQrController);
//get ABHA profile
abdmRouter.get("/profile",verifyUserJwt,getAbhaProfileController);
export default abdmRouter;