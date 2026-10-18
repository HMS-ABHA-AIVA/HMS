import { prisma } from "../../../config/db.js";
import { ApiError } from "../../../common/errors/appError.js";
import { generateAbdmSessionToken } from "../../../common/client/facility.client.js";
import { decrypt, encryptWithAbdmPublicKey } from "../../../common/utils/encryption.js";
import { getAbdmPublicKey, requestAadhaarOtp, aadharCreationClient, requestExistingAbhaAadhaarOtp, verifyExistingAbhaAadhaarOtp, getExistingAbhaProfile, requestExistingAbhaMobileOtp, verifyExistingAbhaMobileOtp, verifyExistingAbhaUser, generateAbhaQr, ABHA_ENROLLMENT_CONSENT } from "../../../common/client/abdm.client.js";

type Environment = "SANDBOX" | "PRODUCTION";

const OTP_VALIDITY_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

// ABDM expects Aadhaar / mobile / OTP values encrypted with its current public key.
const encryptForAbdm = async (environment: Environment, abdmAccessToken: string, value: string) => {
  const { publicKey } = await getAbdmPublicKey(environment, abdmAccessToken);

  if (!publicKey) {
    throw new ApiError(502, "Failed to retrieve ABDM public key");
  }

  return encryptWithAbdmPublicKey(value, publicKey);
};

const findPatientInFacility = async (patientId: string, facilityId: string) => {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, facilityId },
    include: { abha: true },
  });

  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  return patient;
};

// Loads a pending transaction and enforces facility, purpose, status and expiry.
const loadPendingTransaction = async (transactionId: string, facilityId: string, purpose: "ENROLLMENT" | "VERIFICATION") => {
  const transaction = await prisma.abhaTransaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) {
    throw new ApiError(404, "ABHA transaction not found");
  }

  if (transaction.facilityId !== facilityId) {
    throw new ApiError(403, "Transaction does not belong to this facility");
  }

  if (transaction.purpose !== purpose) {
    throw new ApiError(400, "Invalid transaction purpose");
  }

  if (transaction.status !== "PENDING") {
    throw new ApiError(400, `ABHA transaction is already ${transaction.status.toLowerCase()}`);
  }

  if (transaction.expiresAt <= new Date()) {
    await prisma.abhaTransaction.update({
      where: { id: transaction.id },
      data: { status: "EXPIRED" },
    });

    throw new ApiError(400, "ABHA transaction has expired. Please request a new OTP.");
  }

  return transaction;
};

const setTransactionStatus = (id: string, status: "COMPLETED" | "FAILED", extra: Record<string, unknown> = {}) =>
  prisma.abhaTransaction.update({ where: { id }, data: { status, ...extra } });

// Links an ABHA to the patient, refusing to attach one ABHA to two patients.
// ABDM has already authenticated the user at this point, so a conflict is recorded as FAILED.
const linkAbhaToPatient = async (transactionId: string, patientId: string, abhaNumber: string, abhaAddress: string | null) => {
  const existing = await prisma.abhaPatient.findUnique({ where: { abhaNumber } });

  if (existing && existing.patientId !== patientId) {
    await setTransactionStatus(transactionId, "FAILED");
    throw new ApiError(409, "This ABHA is already linked to another patient");
  }

  const patientAbha = await prisma.abhaPatient.findUnique({ where: { patientId } });

  if (patientAbha && patientAbha.abhaNumber !== abhaNumber) {
    await setTransactionStatus(transactionId, "FAILED");
    throw new ApiError(409, "Patient is already linked to a different ABHA");
  }

  return prisma.abhaPatient.upsert({
    where: { patientId },
    update: { abhaAddress },
    create: { patientId, abhaNumber, abhaAddress },
  });
};

// The X-token calls (profile / QR) answer 401 when the token is missing or stale.
// That is an ABHA-session problem, not an ABDM-gateway one, so word it accordingly.
const asAbhaSessionError = (error: unknown): never => {
  if (error instanceof ApiError && error.statusCode === 401) {
    throw new ApiError(401, "ABHA verification session expired");
  }
  throw error;
};

const digitsOnly = (value: string) => value.replace(/\D/g, "");

// ---------------------------------------------------------------------------
// ABDM gateway session
// ---------------------------------------------------------------------------

export const abdmTokenRetrievalService = async (facilityId: string, userId: string, environment: Environment) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.facilityId !== facilityId) {
    throw new ApiError(401, "User does not belong to the specified facility");
  }

  const facilityAbdm = await prisma.facilityAbdmData.findUnique({
    where: {
      facilityId_environment: {
        facilityId: facilityId,
        environment: environment
      }
    }
  })

  if (!facilityAbdm) {
    throw new ApiError(404, "configure abdm details before this action.");
  }

  const clientId = facilityAbdm.clientId;
  const clientSecret = decrypt(facilityAbdm.clientSecret);

  const abdmResponse = await generateAbdmSessionToken({ clientId, clientSecret, environment })

  if (!abdmResponse.accessToken || !abdmResponse.refreshToken) {
    throw new ApiError(400, "ABDM authentication failed");
  }

  return {
    abdmAccessToken: abdmResponse.accessToken as string,
    abdmRefreshToken: abdmResponse.refreshToken as string,
    expiresIn: abdmResponse.expiresIn as number | undefined,
    refreshExpiresIn: abdmResponse.refreshExpiresIn as number | undefined,
  };

}

// ---------------------------------------------------------------------------
// creation - aadhaar
// ---------------------------------------------------------------------------

export const aadhaarOtpRequestService = async (patientId: string, facilityId: string, abdmAccessToken: string, environment: Environment, aadhaar: string) => {
  // Make sure patient belongs to authenticated user's facility
  const patient = await findPatientInFacility(patientId, facilityId);

  if (patient.abha) {
    throw new ApiError(409, "Patient already has an ABHA linked");
  }

  const encryptedAadhaar = await encryptForAbdm(environment, abdmAccessToken, aadhaar);

  // Ask ABDM to send the OTP
  const abdmResponse = await requestAadhaarOtp({
    accessToken: abdmAccessToken,
    encryptedAadhaar,
    environment,
  });

  if (!abdmResponse.txnId) {
    throw new ApiError(502, "ABDM did not return a transaction ID");
  }

  const transaction = await prisma.abhaTransaction.create({
    data: {
      txnId: abdmResponse.txnId,
      patientId: patient.id,
      facilityId,
      purpose: "ENROLLMENT",
      status: "PENDING",
      expiresAt: new Date(Date.now() + OTP_VALIDITY_MS),
    },
  });

  return {
    transactionId: transaction.id,
    txnId: transaction.txnId,
    message: abdmResponse.message,
  };
};


export const aadhaarOtpVerifyService = async (transactionId: string, facilityId: string, abdmAccessToken: string, environment: Environment, otp: string, mobile: string) => {
  const transaction = await loadPendingTransaction(transactionId, facilityId, "ENROLLMENT");

  const existingLink = await prisma.abhaPatient.findUnique({ where: { patientId: transaction.patientId } });
  if (existingLink) {
    throw new ApiError(409, "Patient already has an ABHA linked");
  }

  const encryptedOtp = await encryptForAbdm(environment, abdmAccessToken, otp);

  const abdmResponse = await aadharCreationClient({
    accessToken: abdmAccessToken,
    txnId: transaction.txnId,
    encryptedOtp,
    mobile,
    environment,
  });

  // Make sure ABDM actually returned an ABHA number
  const abhaNumber = abdmResponse?.ABHAProfile?.ABHANumber as string | undefined;
  if (!abhaNumber) {
    throw new ApiError(502, "ABDM enrollment failed");
  }

  const abhaAddress: string | null =
    abdmResponse.ABHAProfile.phrAddress?.[0] ?? abdmResponse.ABHAProfile.preferredAbhaAddress ?? null;

  const abhaPatient = await linkAbhaToPatient(transaction.id, transaction.patientId, abhaNumber, abhaAddress);

  // Mark transaction as completed and persist the consent that was sent to ABDM
  await setTransactionStatus(transaction.id, "COMPLETED", {
    consentCode: ABHA_ENROLLMENT_CONSENT.code,
    consentVersion: ABHA_ENROLLMENT_CONSENT.version,
    consentAcceptedAt: new Date(),
  });

  // Return only what the application needs (not the ABDM photo/address payload).
  return {
    patientId: transaction.patientId,
    abhaNumber: abhaPatient.abhaNumber,
    abhaAddress: abhaPatient.abhaAddress,
    isNew: Boolean(abdmResponse.isNew),
    // Enrolment already authenticates the user; keep the X-token so the profile / QR work straight away.
    xToken: (abdmResponse.tokens?.token as string | undefined) ?? null,
    xTokenExpiresIn: abdmResponse.tokens?.expiresIn as number | undefined,
  };
};

// ---------------------------------------------------------------------------
// verification (link existing ABHA) - aadhaar
// ---------------------------------------------------------------------------

export const requestExistingAbhaAadhaarOtpService = async (patientId: string, facilityId: string, abdmAccessToken: string, environment: Environment, aadhaar: string) => {
  const patient = await findPatientInFacility(patientId, facilityId);

  // Don't allow linking another ABHA if this patient is already linked.
  if (patient.abha) {
    throw new ApiError(409, "Patient is already linked to an ABHA");
  }

  const encryptedAadhaar = await encryptForAbdm(environment, abdmAccessToken, aadhaar);

  const abdmResponse = await requestExistingAbhaAadhaarOtp({
    accessToken: abdmAccessToken,
    encryptedAadhaar,
    environment,
  });

  if (!abdmResponse.txnId) {
    throw new ApiError(502, "ABDM did not return a transaction ID");
  }

  const transaction = await prisma.abhaTransaction.create({
    data: {
      txnId: abdmResponse.txnId,
      patientId: patient.id,
      facilityId,
      purpose: "VERIFICATION",
      status: "PENDING",
      expiresAt: new Date(Date.now() + OTP_VALIDITY_MS),
    },
  });

  return {
    transactionId: transaction.id,
    txnId: transaction.txnId,
    message: abdmResponse.message,
  };
};


export const verifyExistingAbhaAadhaarOtpService = async (transactionId: string, facilityId: string, abdmAccessToken: string, environment: Environment, otp: string) => {
  const transaction = await loadPendingTransaction(transactionId, facilityId, "VERIFICATION");

  const existingAbha = await prisma.abhaPatient.findUnique({ where: { patientId: transaction.patientId } });
  if (existingAbha) {
    throw new ApiError(409, "Patient is already linked to an ABHA");
  }

  const encryptedOtp = await encryptForAbdm(environment, abdmAccessToken, otp);

  const abdmResponse = await verifyExistingAbhaAadhaarOtp({
    accessToken: abdmAccessToken,
    txnId: transaction.txnId,
    encryptedOtp,
    environment,
  });

  if (abdmResponse.authResult !== "success") {
    throw new ApiError(400, abdmResponse.message || "ABHA verification failed");
  }

  if (!abdmResponse.token) {
    throw new ApiError(502, "ABDM authentication succeeded but no token was returned");
  }

  // ABDM returns a T-token plus the ABHA account list. The profile / QR APIs need an X-token,
  // which is issued by "verify user" for the chosen ABHA.
  const accounts = abdmResponse.accounts ?? [];
  let xToken = abdmResponse.token;
  let expiresIn: number | undefined = abdmResponse.expiresIn;

  if (accounts.length > 1) {
    throw new ApiError(409, "Multiple ABHA accounts exist for this Aadhaar. Use mobile-number linking to choose one.");
  }

  if (accounts.length === 1) {
    const verifiedUser = await verifyExistingAbhaUser(
      environment,
      abdmAccessToken,
      abdmResponse.token,
      accounts[0]!.ABHANumber,
      transaction.txnId,
    );

    if (!verifiedUser?.token) {
      throw new ApiError(502, "ABDM verification succeeded but no session token was returned");
    }

    xToken = verifiedUser.token;
    expiresIn = verifiedUser.expiresIn;
  }

  const profile = await getExistingAbhaProfile({
    accessToken: abdmAccessToken,
    xToken,
    environment,
  }).catch(asAbhaSessionError);

  if (!profile?.ABHANumber) {
    throw new ApiError(502, "ABDM profile did not contain an ABHA number");
  }

  const abhaPatient = await linkAbhaToPatient(
    transaction.id,
    transaction.patientId,
    profile.ABHANumber,
    profile.preferredAbhaAddress ?? null,
  );

  await setTransactionStatus(transaction.id, "COMPLETED");

  return {
    patientId: transaction.patientId,
    transactionId: transaction.id,
    message: abdmResponse.message,
    abhaNumber: abhaPatient.abhaNumber,
    abhaAddress: abhaPatient.abhaAddress,
    token: xToken,
    expiresIn,
  };
};

// ---------------------------------------------------------------------------
// verification (link existing ABHA) - mobile number
// ---------------------------------------------------------------------------

//step 1 - request otp
export const requestExistingAbhaMobileOtpService = async (patientId: string, facilityId: string, abdmAccessToken: string, environment: Environment, mobile: string) => {
  const patient = await findPatientInFacility(patientId, facilityId);

  if (patient.abha) {
    throw new ApiError(409, "Patient is already linked to an ABHA");
  }

  const encryptedMobile = await encryptForAbdm(environment, abdmAccessToken, mobile);

  const abdmResponse = await requestExistingAbhaMobileOtp(environment, abdmAccessToken, encryptedMobile);

  if (!abdmResponse?.txnId) {
    throw new ApiError(502, "ABDM did not return a transaction ID");
  }

  const transaction = await prisma.abhaTransaction.create({
    data: {
      txnId: abdmResponse.txnId,
      patientId,
      facilityId,
      purpose: "VERIFICATION",
      status: "PENDING",
      expiresAt: new Date(Date.now() + OTP_VALIDITY_MS),
    },
  });

  return {
    transactionId: transaction.id,
    txnId: abdmResponse.txnId,
    message: abdmResponse.message,
  };
};

//step 2 - verify otp
export const verifyExistingAbhaMobileOtpService = async (transactionId: string, facilityId: string, abdmAccessToken: string, environment: Environment, otp: string) => {
  const transaction = await loadPendingTransaction(transactionId, facilityId, "VERIFICATION");

  const encryptedOtp = await encryptForAbdm(environment, abdmAccessToken, otp);

  const abdmResponse = await verifyExistingAbhaMobileOtp(environment, abdmAccessToken, transaction.txnId, encryptedOtp);

  if (abdmResponse?.authResult !== "success") {
    throw new ApiError(400, abdmResponse?.message || "OTP verification failed");
  }

  if (!abdmResponse?.token) {
    throw new ApiError(502, "ABDM did not return the authentication token");
  }

  if (!abdmResponse?.accounts?.length) {
    throw new ApiError(404, "No ABHA accounts found for this mobile number");
  }

  return {
    transactionId: transaction.id,
    txnId: abdmResponse.txnId,
    token: abdmResponse.token as string,
    expiresIn: abdmResponse.expiresIn as number | undefined,
    accounts: abdmResponse.accounts,
    message: abdmResponse.message,
  };
};

//step 3 - verify user and link internally
export const verifyExistingAbhaMobileUserService = async (abhaNumber: string, transactionId: string, facilityId: string, abdmAccessToken: string, environment: Environment, tToken: string) => {
  const transaction = await loadPendingTransaction(transactionId, facilityId, "VERIFICATION");

  const existingAbha = await prisma.abhaPatient.findUnique({ where: { patientId: transaction.patientId } });
  if (existingAbha) {
    throw new ApiError(409, "Patient is already linked to an ABHA");
  }

  const abdmResponse = await verifyExistingAbhaUser(
    environment,
    abdmAccessToken,
    tToken,
    abhaNumber,
    transaction.txnId,
  );

  if (!abdmResponse?.token) {
    throw new ApiError(502, "ABDM verification succeeded but no session token was returned");
  }

  // Step 3 generates the final ABHA session (X-token)
  const xToken = abdmResponse.token as string;

  // Get authoritative ABHA profile using the generated session
  const profile = await getExistingAbhaProfile({
    accessToken: abdmAccessToken,
    xToken,
    environment,
  }).catch(asAbhaSessionError);

  if (!profile?.ABHANumber) {
    throw new ApiError(502, "ABDM profile did not contain an ABHA number");
  }

  const abhaPatient = await linkAbhaToPatient(
    transaction.id,
    transaction.patientId,
    profile.ABHANumber,
    profile.preferredAbhaAddress ?? null,
  );

  await setTransactionStatus(transaction.id, "COMPLETED");

  return {
    patientId: transaction.patientId,
    transactionId: transaction.id,
    token: xToken,
    expiresIn: abdmResponse.expiresIn as number | undefined,
    message: "ABHA verified and linked successfully",

    abhaNumber: abhaPatient.abhaNumber,
    abhaAddress: abhaPatient.abhaAddress,

    name: profile.name,
    gender: profile.gender,
    dob: profile.dob,
    kycVerified: profile.kycVerified,
  };
};

// ---------------------------------------------------------------------------
// profile + QR (X-token is bound to one patient, see abdmCookies.ts)
// ---------------------------------------------------------------------------

const requireLinkedAbha = async (patientId: string, facilityId: string) => {
  const patient = await findPatientInFacility(patientId, facilityId);

  if (!patient.abha) {
    throw new ApiError(404, "This patient has no ABHA linked");
  }

  return patient.abha;
};

//generate QR code
export const generateAbhaQrService = async (patientId: string, facilityId: string, abdmAccessToken: string, abhaXToken: string, environment: Environment) => {
  await requireLinkedAbha(patientId, facilityId);

  return generateAbhaQr({ accessToken: abdmAccessToken, xToken: abhaXToken, environment }).catch(asAbhaSessionError);
};

//GET abha profile
export const getAbhaProfileService = async (patientId: string, facilityId: string, accessToken: string, xToken: string, environment: Environment) => {
  const linked = await requireLinkedAbha(patientId, facilityId);

  const profile = await getExistingAbhaProfile({ accessToken, xToken, environment }).catch(asAbhaSessionError);

  if (!profile?.ABHANumber) {
    throw new ApiError(502, "ABDM profile did not contain an ABHA number");
  }

  // Never show a profile that belongs to a different ABHA than the one linked to this patient.
  if (digitsOnly(profile.ABHANumber) !== digitsOnly(linked.abhaNumber)) {
    throw new ApiError(401, "ABHA verification session expired");
  }

  return profile;
};
