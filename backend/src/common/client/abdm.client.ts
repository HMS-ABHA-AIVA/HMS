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
      message,
      url: error.config?.url,
      timedOut: error.code === "ECONNABORTED",
    });

    // Network failure, timeout or gateway/server fault: genuinely "try again later".
    if (!error.response || (status !== undefined && status >= 500) || error.code === "ECONNABORTED") {
      return Promise.reject(new ApiError(503, "ABHA service is temporarily unavailable. Please try again.", [], "ABDM_UNAVAILABLE"));
    }

    // 401 from ABDM = our gateway access token is missing/expired. The frontend refreshes the ABDM
    // session and retries when it sees this exact message. X-token callers translate it themselves.
    if (status === 401) {
      return Promise.reject(new ApiError(401, "ABDM authentication required", [], "ABDM_AUTH_REQUIRED"));
    }

    if (status === 403) {
      return Promise.reject(new ApiError(502, "ABDM rejected authentication. Check the configured credentials and environment.", [], "ABDM_AUTH_REJECTED"));
    }

    // Every other 4xx carries ABDM/UIDAI's own explanation (wrong Aadhaar, wrong OTP, no ABHA for this
    // number, cool-down ...). Classify it into a specific, staff-readable error instead of masking it.
    return Promise.reject(classifyAbdmClientError(status ?? 400, data?.error?.code, message));
  },
);

// Turns an ABDM 4xx into an ApiError with a specific message and a stable `code`.
// ABDM's wording is inconsistent, so known cases are matched on code first, then on text.
// Anything unrecognised keeps ABDM's own message rather than a generic one.
function classifyAbdmClientError(status: number, abdmCode: string | undefined, message: string | undefined): ApiError {
  const text = message ?? "";
  const fail = (httpStatus: number, code: string, friendly: string) => new ApiError(httpStatus, friendly, [], code);

  if (status === 429) {
    return fail(429, "OTP_COOLDOWN", "An OTP was requested a moment ago. Wait about 30 seconds before requesting another.");
  }
  // ABDM answers 400 "Invalid X-token" (not 401) for a missing/expired/wrong ABHA session token.
  if (/\b[xt]-?token\b/i.test(text)) {
    return new ApiError(401, "ABHA verification session expired", [], "ABHA_SESSION_EXPIRED");
  }
  if (abdmCode === "ABDM-1115" || /does not match with any|no (abha|account)s? (found|exist)|not (registered|found).*abha|abha.*not found/i.test(text)) {
    return fail(404, "ABHA_NOT_FOUND", "No ABHA is registered with these details. Check the number with the patient, or create a new ABHA for them.");
  }
  if (/aadhaar number is incorrect|invalid aadhaar|aadhaar.*(not valid|incorrect)/i.test(text)) {
    return fail(422, "AADHAAR_INVALID", "The Aadhaar number is not valid. Check it with the patient and try again.");
  }
  if (/mobile.*(not (linked|registered|available|updated)|does not exist)|no mobile|mobile number.*aadhaar/i.test(text) && /aadhaar|uidai/i.test(text)) {
    return fail(422, "AADHAAR_MOBILE_NOT_LINKED", "No mobile number is linked to this Aadhaar, so UIDAI cannot send an OTP. The patient must link a mobile to their Aadhaar first.");
  }
  if (/invalid mobile|mobile number.*(invalid|incorrect)/i.test(text)) {
    return fail(400, "MOBILE_INVALID", "The mobile number is not valid. Check it and try again.");
  }
  if (/otp.*expired|expired.*otp|txn.*expired|transaction.*(expired|not found|invalid)|invalid.*transaction/i.test(text)) {
    return fail(400, "OTP_EXPIRED", "This OTP is no longer valid. Request a new OTP and try again.");
  }
  if (/otp/i.test(text) && /(invalid|incorrect|wrong|mismatch|not match|does not match|failed)/i.test(text)) {
    return fail(422, "OTP_INVALID", "The OTP entered is incorrect. Check the 6 digits with the patient and try again.");
  }
  if (abdmCode === "ABDM-1027" || /(too many|maximum|exceeded|blocked|locked|try after|attempts)/i.test(text)) {
    return fail(429, "TOO_MANY_ATTEMPTS", text ? `Too many attempts: ${text}` : "Too many attempts. This request is blocked for now; try again later.");
  }
  if (/suspend|deactivat|cancel|disabled|not active/i.test(text)) {
    return fail(422, "ACCOUNT_INACTIVE", `This Aadhaar/ABHA cannot be used right now: ${text}`);
  }
  if (status === 404) {
    return fail(404, "ABDM_NOT_FOUND", text || "ABDM could not find the requested record.");
  }
  if (status === 409) {
    return fail(409, "ABDM_CONFLICT", text || "ABDM reports a conflict with an existing record.");
  }

  return fail(status === 400 ? 400 : 422, "ABDM_REJECTED", text || "ABDM rejected the request. Check the details entered and try again.");
}

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
        // axios would otherwise send "application/json, text/plain"; ABDM's binary endpoints answer 406 to that.
        Accept: "*/*",
      },
    }
  );

  return normalizeQrResponse(Buffer.from(response.data), String(response.headers["content-type"] ?? ""));
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

// ABDM has returned QR codes as raw image bytes, and gateways sometimes wrap them as base64 text or JSON.
// Always hand the browser real image bytes with a matching content type.
function normalizeQrResponse(body: Buffer, contentType: string): { data: Buffer; contentType: string } {
  const imageType = (buf: Buffer) =>
    buf.subarray(0, 4).equals(PNG_MAGIC) ? "image/png" : buf.subarray(0, 3).equals(JPEG_MAGIC) ? "image/jpeg" : undefined;

  const direct = imageType(body);
  if (direct) return { data: body, contentType: direct };

  let text = body.toString("utf8").trim();
  if (text.startsWith("{")) {
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      const candidate = Object.values(json).find((value) => typeof value === "string" && value.length > 100);
      if (typeof candidate === "string") text = candidate;
    } catch {
      // not JSON; fall through to the base64 attempt
    }
  }

  const base64 = text.replace(/^data:image\/\w+;base64,/, "").replace(/\s/g, "");
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(base64) && base64.length > 100) {
    const decoded = Buffer.from(base64, "base64");
    const decodedType = imageType(decoded);
    if (decodedType) return { data: decoded, contentType: decodedType };
  }

  console.error("ABDM QR response was not an image", { contentType, bytes: body.length });
  throw new ApiError(502, "ABDM returned the QR code in an unexpected format.", [], "QR_FORMAT");
}
