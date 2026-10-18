import axios from "axios";
import { randomUUID } from "crypto";
import { ApiError } from "../errors/appError.js";

type AbdmEnvironment = "SANDBOX" | "PRODUCTION";

type AbdmErrorBody = { error?: { code?: string; message?: string }; message?: string; [field: string]: unknown };

// Apply one timeout and one safe error translation policy to every ABDM request.
// Do not log request bodies or headers: they can contain Aadhaar and OTP data.
const abdmHttp = axios.create({ timeout: 15_000 });

// Optional NHA-evidence audit trail. Metadata only (never bodies, tokens or PII).
// Enable with ABDM_AUDIT_LOG=true while running the sandbox test cases.
const AUDIT_LOG_ENABLED = process.env.ABDM_AUDIT_LOG === "true";

// QR requests use responseType "arraybuffer", so error bodies can arrive as bytes.
function parseAbdmBody(raw: unknown): AbdmErrorBody | undefined {
  if (!raw) return undefined;
  if (typeof raw === "object" && !(raw instanceof ArrayBuffer) && !Buffer.isBuffer(raw)) return raw as AbdmErrorBody;
  try {
    const text = Buffer.isBuffer(raw)
      ? raw.toString("utf8")
      : raw instanceof ArrayBuffer
        ? Buffer.from(raw).toString("utf8")
        : String(raw);
    return JSON.parse(text) as AbdmErrorBody;
  } catch {
    return undefined;
  }
}

// ABDM error bodies come in three shapes:
//   { error: { code, message } }        e.g. UIDAI errors (HTTP 422, ABDM-1204)
//   { message, timestamp }              e.g. OTP cool-down (HTTP 429)
//   { <field>: "reason", timestamp }    e.g. { loginId: "Invalid Mobile Number" } (HTTP 400)
function extractAbdmMessage(data: AbdmErrorBody | undefined): string | undefined {
  if (!data) return undefined;
  if (typeof data.error?.message === "string" && data.error.message) return data.error.message;
  if (typeof data.message === "string" && data.message) return data.message;
  const fieldMessages = Object.entries(data)
    .filter(([key, value]) => key !== "timestamp" && key !== "error" && typeof value === "string" && value)
    .map(([, value]) => value as string);
  return fieldMessages.length ? fieldMessages.join(", ") : undefined;
}

abdmHttp.interceptors.response.use((response) => {
    if (AUDIT_LOG_ENABLED) {
      const h = response.config?.headers as Record<string, unknown> | undefined;
      console.info("ABDM_AUDIT", JSON.stringify({
        requestId: h?.["REQUEST-ID"],
        timestamp: h?.["TIMESTAMP"],
        cmId: h?.["X-CM-ID"],
        method: response.config?.method?.toUpperCase(),
        url: response.config?.url,
        status: response.status,
      }));
    }
    return response;
  },(error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const data = parseAbdmBody(error.response?.data);
    const message = extractAbdmMessage(data);
    const requestId = error.config?.headers?.["REQUEST-ID"];
    console.error("ABDM request failed", {
      requestId: typeof requestId === "string" ? requestId : undefined,
      status,
      code: data?.error?.code,
      url: error.config?.url,
      timedOut: error.code === "ECONNABORTED",
    });

    // Network failure, timeout or gateway/server fault: genuinely "try again later".
    if (!error.response || (status !== undefined && status >= 500) || error.code === "ECONNABORTED") {
      return Promise.reject(new ApiError(503, "ABHA service is temporarily unavailable. Please try again."));
    }

    // 401 from ABDM = our gateway access token is missing/expired. The frontend refreshes the ABDM
    // session and retries when it sees this exact message. X-token callers translate it themselves.
    if (status === 401) {
      return Promise.reject(new ApiError(401, "ABDM authentication required"));
    }

    if (status === 403) {
      return Promise.reject(new ApiError(502, "ABDM rejected authentication. Check the configured credentials and environment."));
    }

    if (status === 429) {
      return Promise.reject(new ApiError(429, message || "Too many attempts. Please wait 30 seconds before requesting a new OTP."));
    }

    // 400/422 carry ABDM/UIDAI's own explanation (wrong Aadhaar, wrong OTP, invalid mobile ...).
    // Pass it through instead of masking it as an outage.
    if (status === 400 || status === 422) {
      return Promise.reject(new ApiError(status, message || "ABDM rejected the request. Check the details entered and try again."));
    }

    return Promise.reject(new ApiError(502, message || "ABDM could not complete the request. Please try again."));
  },
);

// ABDM gateway CM-ID: "sbx" for Sandbox, "abdm" for Production.
export const getCmId = (environment: AbdmEnvironment) =>
  environment === "SANDBOX" ? "sbx" : "abdm";

// Consent artifact sent to ABDM on ABHA enrolment. Persisted on the AbhaTransaction as well.
export const ABHA_ENROLLMENT_CONSENT = { code: "abha-enrollment", version: "1.4" } as const;

const getBaseUrl = (environment: AbdmEnvironment) => {
    if (environment === "SANDBOX") {
        return "https://abhasbx.abdm.gov.in/abha/api";
    }

    return "https://abha.abdm.gov.in/api/abha";
};

const baseHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
  "REQUEST-ID": randomUUID(),
  TIMESTAMP: new Date().toISOString(),
});

export const getAbdmPublicKey = async (environment: AbdmEnvironment,accessToken: string) => {
  const baseUrl = getBaseUrl(environment);

  const response = await abdmHttp.get(
    `${baseUrl}/v3/profile/public/certificate`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
         "REQUEST-ID": randomUUID(),
        TIMESTAMP: new Date().toISOString(),
        "X-CM-ID": getCmId(environment),
      },
    }
  );

  return response.data as {
    publicKey: string;
    encryptionAlgorithm: string;
  };
};

//creation of ABHA using Aadhaar
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
        { headers: baseHeaders(accessToken) },
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
  const url = `${baseUrl}/v3/enrollment/enrol/byAadhaar`;

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
      consent: { ...ABHA_ENROLLMENT_CONSENT },
    },
    {
      headers: {
        ...baseHeaders(accessToken),
        "X-CM-ID": getCmId(environment),
      },
    }
  );

  return response.data;
};

//verification of an existing ABHA using Aadhaar
export const requestExistingAbhaAadhaarOtp = async ({
  accessToken,
  encryptedAadhaar,
  environment,
}: {
  accessToken: string;
  encryptedAadhaar: string;
  environment: AbdmEnvironment;
}) => {
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
    { headers: baseHeaders(accessToken) }
  );

  return response.data as {
    txnId: string;
    message: string;
  };
};


// Verifies the Aadhaar OTP. ABDM answers with a short-lived T-token and the ABHA account list;
// the T-token must be exchanged for an X-token through verifyExistingAbhaUser.
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
    { headers: baseHeaders(accessToken) }
  );

  return response.data as {
    txnId: string;
    authResult: string;
    message: string;
    token?: string;
    expiresIn?: number;
    accounts?: { ABHANumber: string; [key: string]: unknown }[];
  };
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
        { headers: baseHeaders(accessToken) }
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
        { headers: baseHeaders(accessToken) }
    );

    return response.data;
};

// Exchanges the T-token (from Aadhaar or mobile OTP verification) for the X-token
// used by the profile / QR APIs. The ABHA number is sent as returned in the account list.
export const verifyExistingAbhaUser = async (environment: AbdmEnvironment,accessToken: string, tToken: string, abhaNumber: string, txnId: string) => {
  const baseUrl = getBaseUrl(environment);

  const response = await abdmHttp.post(
    `${baseUrl}/v3/profile/login/verify/user`,
    {
      ABHANumber: abhaNumber,
      txnId,
    },
    {
      headers: {
        ...baseHeaders(accessToken),
        "T-token": `Bearer ${tToken}`,
      },
    }
  );

  return response.data;
};

//generate ABHA QR code

export const generateAbhaQr = async ({accessToken, xToken, environment}: {accessToken: string, xToken: string, environment: AbdmEnvironment}) => {
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
