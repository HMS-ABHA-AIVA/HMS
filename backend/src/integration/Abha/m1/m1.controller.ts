import type { Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../../../common/errors/appError.js";
import type { userAuthRequest } from "../../../common/middlewares/verifyUserJwt.js"
import { abdmTokenRetrievalSchema, aadhaarOtpRequestSchema, aadharOtpVerifySchema, existingAbhaAadhaarOtpRequestSchema, existingAbhaAadhaarOtpVerifySchema, existingAbhaMobileOtpRequestSchema, existingAbhaMobileOtpVerifySchema, verifyExistingAbhaMobileUserSchema,getAbhaProfileSchema, enrolMobileRequestSchema, enrolMobileVerifySchema, abhaAddressSuggestionsQuerySchema, createAbhaAddressSchema, abhaNumberOtpRequestSchema, abhaNumberOtpVerifySchema } from "../../../common/validators/m1.validator.js"
import { abdmTokenRetrievalService, aadhaarOtpRequestService, aadhaarOtpVerifyService, requestExistingAbhaAadhaarOtpService, verifyExistingAbhaAadhaarOtpService, requestExistingAbhaMobileOtpService, verifyExistingAbhaMobileOtpService, verifyExistingAbhaMobileUserService,generateAbhaQrService, getAbhaProfileService, getAbhaCardService, requestEnrolMobileVerificationService, verifyEnrolMobileService, getAbhaAddressSuggestionsService, createAbhaAddressService, requestAbhaNumberOtpService, verifyAbhaNumberOtpService } from "./m1.service.js";
import { prisma } from "../../../config/db.js";
import { readSafeCookie, setAbdmSessionCookies, setAbhaSessionCookies, setTTokenCookie, getAbhaSessionToken } from "../../../common/utils/abdmCookies.js";

// Validates request input and returns the typed result, or throws a 400 with every zod message.
const parseOrThrow = <T>(schema: ZodType<T>, input: unknown, label = "body"): T => {
  const result = schema.safeParse(input);

  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(", ");
    throw new ApiError(400, `Invalid request ${label}: ${message}`, [], "VALIDATION");
  }

  return result.data;
};

const requireUser = (req: userAuthRequest) => {
  if (!req.user) {
    throw new ApiError(401, "Unauthorized access");
  }
  return req.user;
};

// Every ABHA route except /retrieve needs the ABDM gateway token issued by /retrieve.
const requireAbdmAccessToken = (req: userAuthRequest): string => {
  const token = readSafeCookie(req.cookies?.abdmAccessToken);
  if (!token) {
    throw new ApiError(401, "ABDM authentication required", [], "ABDM_AUTH_REQUIRED");
  }
  return token;
};

export const abdmTokenRetrievalRequest = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { environment } = parseOrThrow(abdmTokenRetrievalSchema, req.body);
    const user = requireUser(req);

    const tokens = await abdmTokenRetrievalService(user.facilityId, user.id, environment);

    setAbdmSessionCookies(res, tokens);

    res.status(200).json({
      status: "success",
      message: "ABDM login success",
    })
  } catch (error) {
    next(error);
  }
}

//creation
export const aadhaarOtpRequestController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { environment, patientId, aadhaar } = parseOrThrow(aadhaarOtpRequestSchema, req.body);
    const abdmAccessToken = requireAbdmAccessToken(req);

    const resultData = await aadhaarOtpRequestService(patientId, user.facilityId, abdmAccessToken, environment, aadhaar);

    res.status(200).json({
      status: "success",
      message: resultData.message,
      data: {
        transactionId: resultData.transactionId,
        txnId: resultData.txnId,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const aadhaarOtpVerifyController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { transactionId, otp, mobile, environment } = parseOrThrow(aadharOtpVerifySchema, req.body);
    const abdmAccessToken = requireAbdmAccessToken(req);

    const resultData = await aadhaarOtpVerifyService(transactionId, user.facilityId, abdmAccessToken, environment, otp, mobile);

    // Enrolment already authenticates the user, so the profile / QR can be read straight away.
    if (resultData.xToken) {
      setAbhaSessionCookies(res, resultData.xToken, resultData.patientId, resultData.xTokenExpiresIn);
    }

    return res.status(200).json({
      status: "success",
      message: "ABHA account created successfully",
      data: {
        patientId: resultData.patientId,
        abhaNumber: resultData.abhaNumber,
        abhaAddress: resultData.abhaAddress,
        isNew: resultData.isNew,
        transactionId: resultData.transactionId,
        mobileVerified: resultData.mobileVerified,
        hasFollowUp: resultData.hasFollowUp,
      },
    });
  } catch (error) {
    next(error);
  }
}

//VERIFICATION
export const requestExistingAbhaAadhaarOtpController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { patientId, aadhaar, environment } = parseOrThrow(existingAbhaAadhaarOtpRequestSchema, req.body);
    const abdmAccessToken = requireAbdmAccessToken(req);

    const resultData = await requestExistingAbhaAadhaarOtpService(patientId, user.facilityId, abdmAccessToken, environment, aadhaar);

    return res.status(200).json({
      status: "success",
      message: resultData.message,
      data: {
        transactionId: resultData.transactionId,
      },
    });
  } catch (error) {
    next(error);
  }
};

//WE RECIEVE LOGIN TOKEN + WE RETURN PROFILE
export const verifyExistingAbhaAadhaarOtpController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { transactionId, otp, environment } = parseOrThrow(existingAbhaAadhaarOtpVerifySchema, req.body);
    const abdmAccessToken = requireAbdmAccessToken(req);

    const resultData = await verifyExistingAbhaAadhaarOtpService(transactionId, user.facilityId, abdmAccessToken, environment, otp);

    setAbhaSessionCookies(res, resultData.token, resultData.patientId, resultData.expiresIn);

    return res.status(200).json({
      status: "success",
      message: resultData.message,
      data: {
        patientId: resultData.patientId,
        transactionId: resultData.transactionId,
        abhaNumber: resultData.abhaNumber,
        abhaAddress: resultData.abhaAddress,
      },
    });
  } catch (error) {
    next(error);
  }
};

//verification - mobile number
//step 1 - request otp
export const requestExistingAbhaMobileOtpController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { patientId, mobile, environment } = parseOrThrow(existingAbhaMobileOtpRequestSchema, req.body);
    const abdmAccessToken = requireAbdmAccessToken(req);

    const resultData = await requestExistingAbhaMobileOtpService(patientId, user.facilityId, abdmAccessToken, environment, mobile);

    return res.status(200).json({
      status: "success",
      message: resultData.message,
      data: {
        transactionId: resultData.transactionId,
      },
    });
  } catch (error) {
    next(error);
  }
};

//step 2 - verify otp and get T token
export const verifyExistingAbhaMobileOtpController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { transactionId, otp, environment } = parseOrThrow(existingAbhaMobileOtpVerifySchema, req.body);
    const abdmAccessToken = requireAbdmAccessToken(req);

    const resultData = await verifyExistingAbhaMobileOtpService(transactionId, user.facilityId, abdmAccessToken, environment, otp);

    setTTokenCookie(res, resultData.token, resultData.expiresIn);

    return res.status(200).json({
      status: "success",
      message: resultData.message,
      data: {
        transactionId: resultData.transactionId,
        accounts: resultData.accounts,
      },
    });

  } catch (error) {
    next(error);
  }
};

//step 3 - verify user and link internally
export const verifyExistingAbhaMobileUserController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { abhaNumber, transactionId, environment } = parseOrThrow(verifyExistingAbhaMobileUserSchema, req.body);
    const abdmAccessToken = requireAbdmAccessToken(req);

    const tToken = readSafeCookie(req.cookies?.t_token);
    if (!tToken) {
      throw new ApiError(401, "ABHA verification session expired", [], "ABHA_SESSION_EXPIRED");
    }

    const resultData = await verifyExistingAbhaMobileUserService(abhaNumber, transactionId, user.facilityId, abdmAccessToken, environment, tToken);

    //set x-token for abha profile auth
    setAbhaSessionCookies(res, resultData.token, resultData.patientId, resultData.expiresIn);
    // T-token is only needed for Step 3
    res.clearCookie("t_token");

    return res.status(200).json({
      status: "success",
      message: resultData.message,
      data: {
        transactionId: resultData.transactionId,
        abhaNumber: resultData.abhaNumber,
        abhaAddress: resultData.abhaAddress,
        name: resultData.name,
        gender: resultData.gender,
        dob: resultData.dob,
        kycVerified: resultData.kycVerified,
      },
    });
  } catch (error) {
    next(error);
  }
};


//generate QR code for abha number
export const generateAbhaQrController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { patientId, environment } = parseOrThrow(getAbhaProfileSchema, req.query, "query parameters");
    const abdmAccessToken = requireAbdmAccessToken(req);
    const abhaXToken = getAbhaSessionToken(req, patientId);

    const resultData = await generateAbhaQrService(patientId, user.facilityId, abdmAccessToken, abhaXToken, environment);

    res.setHeader("Content-Type", resultData.contentType);
    // Patient-specific, never cache in shared caches.
    res.setHeader("Cache-Control", "private, no-store");

    return res.status(200).send(resultData.data);
  } catch (error) {
    next(error);
  }
};


//GET abha profile
export const getAbhaProfileController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { patientId, environment } = parseOrThrow(getAbhaProfileSchema, req.query, "query parameters");
    const abdmAccessToken = requireAbdmAccessToken(req);
    const abhaXToken = getAbhaSessionToken(req, patientId);

    const resultData = await getAbhaProfileService(patientId, user.facilityId, abdmAccessToken, abhaXToken, environment);

    res.setHeader("Cache-Control", "private, no-store");

    return res.status(200).json({
      status: "success",
      message: "ABHA profile retrieved successfully",
      data: resultData,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// enrolment follow-ups: verify the mobile number, choose an ABHA address
// ---------------------------------------------------------------------------

export const enrolMobileRequestController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { transactionId, mobile, environment } = parseOrThrow(enrolMobileRequestSchema, req.body);
    const abdmAccessToken = requireAbdmAccessToken(req);

    const resultData = await requestEnrolMobileVerificationService(transactionId, user.facilityId, abdmAccessToken, environment, mobile);

    return res.status(200).json({
      status: "success",
      message: resultData.message,
      data: { transactionId: resultData.transactionId },
    });
  } catch (error) {
    next(error);
  }
};

export const enrolMobileVerifyController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { transactionId, otp, environment } = parseOrThrow(enrolMobileVerifySchema, req.body);
    const abdmAccessToken = requireAbdmAccessToken(req);

    const resultData = await verifyEnrolMobileService(transactionId, user.facilityId, abdmAccessToken, environment, otp);

    return res.status(200).json({
      status: "success",
      message: resultData.message,
      data: { transactionId: resultData.transactionId },
    });
  } catch (error) {
    next(error);
  }
};

export const abhaAddressSuggestionsController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { transactionId, environment } = parseOrThrow(abhaAddressSuggestionsQuerySchema, req.query, "query parameters");
    const abdmAccessToken = requireAbdmAccessToken(req);

    const resultData = await getAbhaAddressSuggestionsService(transactionId, user.facilityId, abdmAccessToken, environment);

    return res.status(200).json({
      status: "success",
      message: "ABHA address suggestions retrieved",
      data: resultData,
    });
  } catch (error) {
    next(error);
  }
};

export const createAbhaAddressController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { transactionId, abhaAddress, environment } = parseOrThrow(createAbhaAddressSchema, req.body);
    const abdmAccessToken = requireAbdmAccessToken(req);

    const resultData = await createAbhaAddressService(transactionId, user.facilityId, abdmAccessToken, environment, abhaAddress);

    return res.status(200).json({
      status: "success",
      message: "ABHA address created",
      data: resultData,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// link an existing ABHA by ABHA number
// ---------------------------------------------------------------------------

export const abhaNumberOtpRequestController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { patientId, abhaNumber, channel, environment } = parseOrThrow(abhaNumberOtpRequestSchema, req.body);
    const abdmAccessToken = requireAbdmAccessToken(req);

    const resultData = await requestAbhaNumberOtpService(patientId, user.facilityId, abdmAccessToken, environment, abhaNumber, channel);

    return res.status(200).json({
      status: "success",
      message: resultData.message,
      data: { transactionId: resultData.transactionId },
    });
  } catch (error) {
    next(error);
  }
};

export const abhaNumberOtpVerifyController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { transactionId, otp, channel, environment } = parseOrThrow(abhaNumberOtpVerifySchema, req.body);
    const abdmAccessToken = requireAbdmAccessToken(req);

    const resultData = await verifyAbhaNumberOtpService(transactionId, user.facilityId, abdmAccessToken, environment, otp, channel);

    setAbhaSessionCookies(res, resultData.token, resultData.patientId, resultData.expiresIn);

    return res.status(200).json({
      status: "success",
      message: resultData.message,
      data: {
        patientId: resultData.patientId,
        transactionId: resultData.transactionId,
        abhaNumber: resultData.abhaNumber,
        abhaAddress: resultData.abhaAddress,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// ABHA card
// ---------------------------------------------------------------------------

export const getAbhaCardController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { patientId, environment } = parseOrThrow(getAbhaProfileSchema, req.query, "query parameters");
    const abdmAccessToken = requireAbdmAccessToken(req);
    const abhaXToken = getAbhaSessionToken(req, patientId);

    const card = await getAbhaCardService(patientId, user.facilityId, abdmAccessToken, abhaXToken, environment);

    res.setHeader("Content-Type", card.contentType);
    res.setHeader("Cache-Control", "private, no-store");

    return res.status(200).send(card.data);
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// audit trail (read-only, scoped to the caller's facility)
// ---------------------------------------------------------------------------

export const listAbhaAuditController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;

    const entries = await prisma.abhaAuditLog.findMany({
      where: { facilityId: user.facilityId, ...(patientId ? { patientId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return res.status(200).json({
      status: "success",
      message: "ABHA audit trail retrieved",
      data: entries,
    });
  } catch (error) {
    next(error);
  }
};
