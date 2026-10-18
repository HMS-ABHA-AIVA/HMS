import express from "express";
import {aadhaarOtpRequestController, aadhaarOtpVerifyController, abdmTokenRetrievalRequest, generateAbhaQrController, getAbhaProfileController, requestExistingAbhaAadhaarOtpController, requestExistingAbhaMobileOtpController, verifyExistingAbhaAadhaarOtpController, verifyExistingAbhaMobileOtpController, verifyExistingAbhaMobileUserController} from "./m1.controller.js";
import {verifyUserJwt} from "../../../common/middlewares/verifyUserJwt.js"
import {rateLimit} from "../../../common/middlewares/rateLimit.middleware.js"

const abdmRouter = express.Router();

// OTP abuse protection: 10 requests/minute per IP per route
const otpLimiter = rateLimit({ windowMs: 60_000, max: 10 });

abdmRouter.post("/retrieve",verifyUserJwt, abdmTokenRetrievalRequest);

abdmRouter.post("/create/aadhar/request",otpLimiter,verifyUserJwt,aadhaarOtpRequestController);

abdmRouter.post("/create/aadhar/verify",otpLimiter,verifyUserJwt,aadhaarOtpVerifyController);


// EXISTING ABHA VERIFICATION

//aadhar number verification
abdmRouter.post("/verify/aadhar/request",otpLimiter,verifyUserJwt,requestExistingAbhaAadhaarOtpController);

abdmRouter.post("/verify/aadhar/confirm",otpLimiter,verifyUserJwt,verifyExistingAbhaAadhaarOtpController);

//mobile number verification
abdmRouter.post("/verify/mobile/request",otpLimiter,verifyUserJwt,requestExistingAbhaMobileOtpController);
abdmRouter.post("/verify/mobile/confirm",otpLimiter,verifyUserJwt,verifyExistingAbhaMobileOtpController);
abdmRouter.post("/verify/mobile/user",otpLimiter,verifyUserJwt,verifyExistingAbhaMobileUserController);

//generate QR code
//generate ABHA QR code
abdmRouter.get("/profile/qr",verifyUserJwt,generateAbhaQrController);
//get ABHA profile
abdmRouter.get("/profile",verifyUserJwt,getAbhaProfileController);
export default abdmRouter;