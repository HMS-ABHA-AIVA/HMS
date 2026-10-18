import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../../../common/errors/appError.js";
import type { userAuthRequest } from "../../../common/middlewares/verifyUserJwt.js"
import { abdmTokenRetrievalSchema, aadhaarOtpRequestSchema, aadharOtpVerifySchema, existingAbhaAadhaarOtpRequestSchema, existingAbhaAadhaarOtpVerifySchema, existingAbhaMobileOtpRequestSchema, existingAbhaMobileOtpVerifySchema, verifyExistingAbhaMobileUserSchema,getAbhaProfileSchema } from "../../../common/validators/m1.validator.js"
import { abdmTokenRetrievalService, aadhaarOtpRequestService, aadhaarOtpVerifyService, requestExistingAbhaAadhaarOtpService, verifyExistingAbhaAadhaarOtpService, requestExistingAbhaMobileOtpService, verifyExistingAbhaMobileOtpService, verifyExistingAbhaMobileUserService,generateAbhaQrService, getAbhaProfileService } from "./m1.service.js";


export const abdmTokenRetrievalRequest = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = abdmTokenRetrievalSchema.safeParse(req.body)

    if (!result.success) {
      const message = result.error.issues
        .map((issue: any) => issue.message)
        .join(", ");

      throw new ApiError(400, `Invalid request body: ${message}`);
    }
    const environment = result.data.environment
    if (!req.user) {
      throw new ApiError(401, "unauthorized access");
    }

    const facilityId = req.user.facilityId;
    const userId = req.user.id;

    const adbmTokenResponse = await abdmTokenRetrievalService(facilityId, userId, environment);

    res.cookie("abdmAccessToken", adbmTokenResponse.abdmAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 2 * 60 * 60 * 1000,
    });

    res.cookie("abdmRefreshToken", adbmTokenResponse.abdmRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });


    res.status(200).json({
      status: "success",
      message: "ABDM login success",
      // data: adbmTokenResponse
    })
  } catch (error) {
    next(error);
  }
}

//creation
export const aadhaarOtpRequestController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized access");
    }

    const result = aadhaarOtpRequestSchema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => issue.message)
        .join(", ");

      throw new ApiError(
        400,
        `Invalid request body: ${message}`,
      );
    }

    const { environment, patientId, aadhaar } = result.data;

    const abdmAccessToken = req.cookies.abdmAccessToken;

    if (!abdmAccessToken) {
      throw new ApiError(
        401,
        "ABDM authentication required",
      );
    }

    const facilityId = req.user.facilityId;



    const resultData = await aadhaarOtpRequestService(
      patientId,
      facilityId,
      abdmAccessToken,
      environment,
      aadhaar,
    );

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

    if (!req.user) {
      throw new ApiError(401, "unauthorized access");
    }

    const result = aadharOtpVerifySchema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => issue.message)
        .join(", ");

      throw new ApiError(
        400,
        `Invalid request body: ${message}`,
      );
    }

    const abdmAccessToken = req.cookies.abdmAccessToken;
    if (!abdmAccessToken) {
      throw new ApiError(401, "abdm authentication required");
    }

    const facilityId = req.user.facilityId
    const { transactionId, otp, mobile, environment } = result.data;

    const resultData = await aadhaarOtpVerifyService(
      transactionId,
      facilityId,
      abdmAccessToken,
      environment,
      otp,
      mobile,
    );

    return res.status(200).json({
      status: "success",
      message: "ABHA account created successfully",
      data: resultData,
    });
  } catch (error) {
    next(error);
  }
}

//VERIFICATION
export const requestExistingAbhaAadhaarOtpController = async (req: userAuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized access");
    }

    const result = existingAbhaAadhaarOtpRequestSchema.safeParse(
      req.body
    );

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => issue.message)
        .join(", ");

      throw new ApiError(
        400,
        `Invalid request body: ${message}`
      );
    }

    const {
      patientId,
      aadhaar,
      environment,
    } = result.data;

    const abdmAccessToken = req.cookies.abdmAccessToken;

    if (!abdmAccessToken) {
      throw new ApiError(
        401,
        "ABDM authentication required"
      );
    }

    const facilityId = req.user.facilityId;

    const resultData =
      await requestExistingAbhaAadhaarOtpService(
        patientId,
        facilityId,
        abdmAccessToken,
        environment,
        aadhaar
      );

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
    if (!req.user) {
      throw new ApiError(
        401,
        "Unauthorized access"
      );
    }

    const result = existingAbhaAadhaarOtpVerifySchema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues
        .map((issue: any) => issue.message)
        .join(", ");

      throw new ApiError(
        400,
        `Invalid request body: ${message}`
      );
    }

    const { transactionId, otp, environment } = result.data;

    const abdmAccessToken = req.cookies.abdmAccessToken;

    if (!abdmAccessToken) {
      throw new ApiError(401, "ABDM authentication required");
    }

    const facilityId = req.user.facilityId;

    const resultData = await verifyExistingAbhaAadhaarOtpService(
      transactionId,
      facilityId,
      abdmAccessToken,
      environment,
      otp
    );

    res.cookie("abhaXToken", resultData.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });


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
    if (!req.user) {
      throw new ApiError(
        401,
        "Unauthorized access"
      );
    }

    const result = existingAbhaMobileOtpRequestSchema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => issue.message)
        .join(", ");

      throw new ApiError(
        400,
        `Invalid request body: ${message}`
      );
    }

    const { patientId, mobile, environment } = result.data;

    const abdmAccessToken = req.cookies.abdmAccessToken;

    if (!abdmAccessToken) {
      throw new ApiError(401, "ABDM authentication required");
    }

    const facilityId = req.user.facilityId;

    const resultData = await requestExistingAbhaMobileOtpService(
      patientId,
      facilityId,
      abdmAccessToken,
      environment,
      mobile
    );

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
    if (!req.user) {
      throw new ApiError(401, "Unauthorized access");
    }

    const result = existingAbhaMobileOtpVerifySchema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues
        .map((issue: any) => issue.message)
        .join(", ");

      throw new ApiError(400, `Invalid request body: ${message}`);
    }

    const { transactionId, otp, environment } = result.data;

    const abdmAccessToken = req.cookies.abdmAccessToken;

    if (!abdmAccessToken) {
      throw new ApiError(401, "ABDM authentication required");
    }

    const facilityId = req.user.facilityId;

    const resultData = await verifyExistingAbhaMobileOtpService(
      transactionId,
      facilityId,
      abdmAccessToken,
      environment,
      otp
    );

    res.cookie("t_token", resultData.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: resultData.expiresIn * 1000,
    });

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
    if (!req.user) {
      throw new ApiError(401, "Unauthorized access");
    }

    const result = verifyExistingAbhaMobileUserSchema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues
        .map((issue: any) => issue.message)
        .join(", ");

      throw new ApiError(400, `Invalid request body: ${message}`);
    }

    const { abhaNumber, transactionId, environment } = result.data;

    const abdmAccessToken = req.cookies.abdmAccessToken;

    if (!abdmAccessToken) {
      throw new ApiError(
        401,
        "ABDM authentication required"
      );
    }

    const t_token = req.cookies.t_token;

    if (!t_token) {
      throw new ApiError(
        401,
        "ABHA verification session expired"
      );
    }

    const facilityId = req.user.facilityId;

    const resultData = await verifyExistingAbhaMobileUserService(
      abhaNumber,
      transactionId,
      facilityId,
      abdmAccessToken,
      environment,
      t_token
    );
    //set x-token for abha profile auth
    res.cookie("abhaXToken", resultData.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: resultData.expiresIn * 1000,
    });
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
    if (!req.user) {
      throw new ApiError(401, "Unauthorized access");
    }

    const abdmAccessToken = req.cookies.abdmAccessToken;

    if (!abdmAccessToken) {
      throw new ApiError(
        401,
        "ABDM authentication required"
      );
    }
    const abhaXToken = req.cookies.abhaXToken;

    if (!abhaXToken) {
      throw new ApiError(
        401,
        "ABHA verification session expired"
      );
    }

    const { facilityId } = req.user;

    const qrQuery = getAbhaProfileSchema.safeParse(req.query);

    if (!qrQuery.success) {
      throw new ApiError(400, `Invalid query parameters: ${qrQuery.error.issues.map((issue: any) => issue.message).join(", ")}`);
    }

    const resultData = await generateAbhaQrService(
      facilityId,
      abdmAccessToken,
      abhaXToken,
      qrQuery.data.environment
    );

    res.setHeader(
      "Content-Type",
      resultData.contentType
    );

    return res.status(200).send(resultData.data);

  } catch (error) {

    next(error);

  }

};


//GET abha profile

export const getAbhaProfileController = async (req: userAuthRequest, res: Response, next: NextFunction) => {

  try {

    if (!req.user) {

      throw new ApiError(401, "Unauthorized access");

    }

    const result = getAbhaProfileSchema.safeParse(req.query);

    if (!result.success) {

      const message = result.error.issues
        .map((issue: any) => issue.message)
        .join(", ");

      throw new ApiError(400, `Invalid query parameters: ${message}`);

    }

    const { environment } = result.data;

    const abdmAccessToken = req.cookies.abdmAccessToken;

    if (!abdmAccessToken) {

      throw new ApiError(
        401,
        "ABDM authentication required"
      );

    }

    const abhaXToken = req.cookies.abhaXToken;

    if (!abhaXToken) {

      throw new ApiError(
        401,
        "ABHA verification session expired"
      );

    }

    const facilityId = req.user.facilityId;

    const resultData = await getAbhaProfileService(
       facilityId,
      abdmAccessToken,
      abhaXToken,
      environment 
    );

    return res.status(200).json({
      status: "success",
      message: "ABHA profile retrieved successfully",
      data: resultData,
    });

  } catch (error) {

    next(error);

  }

};