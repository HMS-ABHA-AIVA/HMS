import axios from "axios";
import { randomUUID } from "crypto";
import { ApiError } from "../errors/appError.js";
// import crypto from "crypto"

type AbdmEnvironment = "SANDBOX" | "PRODUCTION";

// Apply one timeout and one safe error translation policy to every ABDM request.
// Do not log request bodies or headers: they can contain Aadhaar and OTP data.
const abdmHttp = axios.create({ timeout: 15_000 });

abdmHttp.interceptors.response.use((response) => response,(error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const data = error.response?.data as { error?: { code?: string; message?: string }; message?: string } | undefined;
    const requestId = error.config?.headers?.["REQUEST-ID"];
    console.error("ABDM request failed", {
      requestId: typeof requestId === "string" ? requestId : undefined,
      status,
      code: data?.error?.code,
      url: error.config?.url,
      timedOut: error.code === "ECONNABORTED",
    });

    if (data?.error?.code === "ABDM-1204") {
      return Promise.reject(new ApiError(503, "ABHA service is temporarily unavailable. Please try again."));
    }

    if (!error.response || status === 502 || status === 503 || status === 504 || error.code === "ECONNABORTED") {
      return Promise.reject(new ApiError(503, "ABHA service is temporarily unavailable. Please try again."));
    }

    const message = data?.error?.message ?? data?.message;
    if (status === 400) {
      return Promise.reject(new ApiError(400, message || "ABDM rejected the request. Check the OTP and request details."));
    }

    if (status === 401 || status === 403) {
      return Promise.reject(new ApiError(502, "ABDM rejected authentication. Check the configured credentials and environment."));
    }

    return Promise.reject(new ApiError(502, "ABDM could not complete the request. Please try again."));
  },
);

const getBaseUrl = (environment: AbdmEnvironment) => {
    if (environment === "SANDBOX") {
        return "https://abhasbx.abdm.gov.in/abha/api";
    }

    return "https://abha.abdm.gov.in/api/abha";
};

export const getAbdmPublicKey = async (environment: AbdmEnvironment,accessToken: string) => {
  const baseUrl = getBaseUrl(environment);

  const response = await abdmHttp.get(
    `${baseUrl}/v3/profile/public/certificate`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
         "REQUEST-ID": randomUUID(),
        TIMESTAMP: new Date().toISOString(),
        "X-CM-ID": environment === "SANDBOX" ? "sbx" : "abdm",
      },
    }
  );

  return response.data as {
    publicKey: string;
    encryptionAlgorithm: string;
  };
};

//creation + verification of ABHA using Aadhaar
export const requestAadhaarOtp = async ({accessToken,encryptedAadhaar,environment}: {
    accessToken: string;
    encryptedAadhaar: string;
    environment: AbdmEnvironment;
}) => {
    const baseUrl = getBaseUrl(environment);

    const response = await abdmHttp.post(
        `${baseUrl}/v3/enrollment/request/otp`,
        {
            scope: ["abha-enrol"],
            loginHint: "aadhaar",
            loginId: encryptedAadhaar,
            otpSystem: "aadhaar",
        },
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "REQUEST-ID": randomUUID(),
                TIMESTAMP: new Date().toISOString(),
                "Content-Type": "application/json",
            },
        },
    );

    return response.data as {
        txnId: string;
        message: string;
    };
};

export const aadharCreationClient = async ({accessToken,txnId,encryptedOtp,mobile,environment}: {
  accessToken: string;
  txnId: string;
  encryptedOtp: string;
  mobile: string;
  environment: "SANDBOX" | "PRODUCTION";
}) => {

    const baseUrl = getBaseUrl(environment);
  const url =
    environment === "SANDBOX"
      ? `${baseUrl}/v3/enrollment/enrol/byAadhaar`
      : `${baseUrl}/v3/enrollment/enrol/byAadhaar`;

  const response = await abdmHttp.post(
    url,
    {
      authData: {
        authMethods: ["otp"],
        otp: {
          txnId,
          otpValue: encryptedOtp,
          mobile,
        },
      },
      consent: {
        code: "abha-enrollment",
        version: "1.4",
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "REQUEST-ID": randomUUID(),
        TIMESTAMP: new Date().toISOString(),
        "X-CM-ID": environment === "SANDBOX" ? "sbx" : "PROD",
      },
    }
  );

  return response.data;
};

export const requestExistingAbhaAadhaarOtp = async ({
  accessToken,
  encryptedAadhaar,
  environment,
}: {
  accessToken: string;
  encryptedAadhaar: string;
  environment: AbdmEnvironment;
}) => {
  try {
    const baseUrl = getBaseUrl(environment);

    const response = await abdmHttp.post(
      `${baseUrl}/v3/profile/login/request/otp`,
      {
        scope: [
          "abha-login",
          "aadhaar-verify",
        ],
        loginHint: "aadhaar",
        loginId: encryptedAadhaar,
        otpSystem: "aadhaar",
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "REQUEST-ID": randomUUID(),
          TIMESTAMP: new Date().toISOString(),
        },
      }
    );

    return response.data as {
      txnId: string;
      message: string;
    };

  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data?.error?.code === "ABDM-1204") {
      throw new ApiError(503, "ABHA service is temporarily unavailable. Please try again.");
    }
    throw error;
  }
};


export const verifyExistingAbhaAadhaarOtp = async ({
  accessToken,
  txnId,
  encryptedOtp,
  environment,
}: {
  accessToken: string;
  txnId: string;
  encryptedOtp: string;
  environment: AbdmEnvironment;
}) => {
  try {
    const baseUrl = getBaseUrl(environment);

    const response = await abdmHttp.post(
      `${baseUrl}/v3/profile/login/verify`,
      {
        scope: [
          "abha-login",
          "aadhaar-verify",
        ],
        authData: {
          authMethods: ["otp"],
          otp: {
            txnId,
            otpValue: encryptedOtp,
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "REQUEST-ID": randomUUID(),
          TIMESTAMP: new Date().toISOString(),
        },
      }
    );

    return response.data as {
      txnId: string;
      authResult: string;
      message: string;
      token?: string;
    };

  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data?.error?.code === "ABDM-1204") {
      throw new ApiError(503, "ABHA service is temporarily unavailable. Please try again.");
    }
    throw error;
  }
};

// GET abha profile
export const getExistingAbhaProfile = async ({accessToken,xToken,environment}: {
  accessToken: string;
  xToken: string;
  environment: AbdmEnvironment;
}) => {
  const baseUrl = getBaseUrl(environment);

  const response = await abdmHttp.get(
    `${baseUrl}/v3/profile/account`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-token": `Bearer ${xToken}`,
        "REQUEST-ID": randomUUID(),
        TIMESTAMP: new Date().toISOString(),
      },
    }
  );

  return response.data;
};


//mobile verification (linking + x token recieved)
export const requestExistingAbhaMobileOtp = async (environment: AbdmEnvironment,accessToken: string,encryptedMobile: string) => {
    const baseUrl = getBaseUrl(environment);

    const response = await abdmHttp.post(
        `${baseUrl}/v3/profile/login/request/otp`,
        {
            scope: [
                "abha-login",
                "mobile-verify",
            ],
            loginHint: "mobile",
            loginId: encryptedMobile,
            otpSystem: "abdm",
        },
        {
            headers: {
                "REQUEST-ID": randomUUID(),
                "TIMESTAMP": new Date().toISOString(),
                "Authorization": `Bearer ${accessToken}`,
            },
        }
    );

    return response.data;
};

export const verifyExistingAbhaMobileOtp = async (environment: AbdmEnvironment,accessToken: string,txnId: string,encryptedOtp: string) => {
    const baseUrl = getBaseUrl(environment);

    const response = await abdmHttp.post(
        `${baseUrl}/v3/profile/login/verify`,
        {
            scope: [
                "abha-login",
                "mobile-verify",
            ],
            authData: {
                authMethods: [
                    "otp",
                ],
                otp: {
                    txnId,
                    otpValue: encryptedOtp,
                },
            },
        },
        {
            headers: {
                "REQUEST-ID": randomUUID(),
                "TIMESTAMP": new Date().toISOString(),
                "Authorization": `Bearer ${accessToken}`,
            },
        }
    );

    return response.data;
};

export const verifyExistingAbhaMobileUser = async (environment: AbdmEnvironment,accessToken: string, tToken: string, abhaNumber: string, txnId: string) => {
  const baseUrl = getBaseUrl(environment);

  const response = await abdmHttp.post(
    `${baseUrl}/v3/profile/login/verify/user`,
    {
      ABHANumber: abhaNumber,
      txnId,
    },
    {
      headers: {
        "REQUEST-ID": randomUUID(),
        "TIMESTAMP": new Date().toISOString(),
        "Authorization": `Bearer ${accessToken}`,
        "T-token": `Bearer ${tToken}`,
      },
    }
  );

  return response.data;
};

//generate ABHA QR code

export const generateAbhaQr = async ({accessToken, xToken}: {accessToken: string, xToken: string}) => {
  let environment: AbdmEnvironment = "SANDBOX";
  const baseUrl = getBaseUrl(environment);

  const response = await abdmHttp.get(
    `${baseUrl}/v3/profile/account/qrCode`,
    {
      responseType: "arraybuffer",
      headers: {
        "REQUEST-ID": randomUUID(),
        "TIMESTAMP": new Date().toISOString(),
        "X-token": `Bearer ${xToken}`,
        "Authorization": `Bearer ${accessToken}`,
      },
    }
  );

  return {
    data: response.data,
    contentType: String(
      response.headers["content-type"] ?? "image/png"
    ),
  };
};