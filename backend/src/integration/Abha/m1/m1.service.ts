import { prisma } from "../../../config/db.js";
import { ApiError } from "../../../common/errors/appError.js";
import { generateAbdmSessionToken } from "../../../common/client/facility.client.js";
import { decrypt, encryptWithAbdmPublicKey } from "../../../common/utils/encryption.js";
import { findAbhaMismatches, type AbhaDemographics } from "../../../common/utils/abhaMatch.js";
import { getAbdmPublicKey, requestAadhaarOtp, aadharCreationClient, requestExistingAbhaAadhaarOtp, verifyExistingAbhaAadhaarOtp, getExistingAbhaProfile, requestExistingAbhaMobileOtp, verifyExistingAbhaMobileOtp, verifyExistingAbhaUser, generateAbhaQr, getAbhaCard, requestEnrolMobileOtp, verifyEnrolMobileOtp, getAbhaAddressSuggestions, createAbhaAddress, requestAbhaNumberOtp, verifyAbhaNumberOtp, ABHA_ENROLLMENT_CONSENT, HOSPITAL_LINK_CONSENT, getCmId, type AbhaLoginChannel } from "../../../common/client/abdm.client.js";

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
    throw new ApiError(404, "Patient not found", [], "PATIENT_NOT_FOUND");
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
    throw new ApiError(400, `This OTP request was already used (${transaction.status.toLowerCase()}). Request a new OTP to continue.`, [], "TRANSACTION_USED");
  }

  if (transaction.expiresAt <= new Date()) {
    await prisma.abhaTransaction.update({
      where: { id: transaction.id },
      data: { status: "EXPIRED" },
    });

    throw new ApiError(400, "This OTP request has expired. Request a new OTP and try again.", [], "OTP_EXPIRED");
  }

  return transaction;
};

const setTransactionStatus = (id: string, status: "COMPLETED" | "FAILED", extra: Record<string, unknown> = {}) =>
  prisma.abhaTransaction.update({ where: { id }, data: { status, ...extra } });

// Links an ABHA to the patient, refusing to attach one ABHA to two patients.
// ABDM has already authenticated the user at this point, so a conflict is recorded as FAILED.
// The patient's name and date of birth must also agree with the ABHA's demographics (abhaMatch.ts).
const linkAbhaToPatient = async (
  transactionId: string,
  patientId: string,
  abhaNumber: string,
  abhaAddress: string | null,
  demographics: AbhaDemographics,
  newlyCreated = false,
) => {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { name: true, dateOfBirth: true } });
  if (!patient) {
    throw new ApiError(404, "Patient not found", [], "PATIENT_NOT_FOUND");
  }

  const mismatches = findAbhaMismatches(patient, demographics);
  if (mismatches.length > 0) {
    await setTransactionStatus(transactionId, "FAILED");
    const fields = mismatches.join(" and ");
    // Only the field names are reported; the ABHA's own details belong to whoever owns it.
    throw new ApiError(
      422,
      `The patient's ${fields} on the hospital record ${mismatches.length > 1 ? "do" : "does"} not match this ABHA, so nothing was linked. ` +
        (newlyCreated
          ? "The ABHA was created from the Aadhaar details you entered; check the patient record and that this is the patient's own Aadhaar."
          : "Check the patient's details, or confirm you are using the right ABHA."),
      [],
      "DETAILS_MISMATCH",
    );
  }

  const existing = await prisma.abhaPatient.findUnique({ where: { abhaNumber } });

  if (existing && existing.patientId !== patientId) {
    await setTransactionStatus(transactionId, "FAILED");
    throw new ApiError(409, "This ABHA is already linked to another patient", [], "ABHA_LINKED_TO_OTHER_PATIENT");
  }

  const patientAbha = await prisma.abhaPatient.findUnique({ where: { patientId } });

  if (patientAbha && patientAbha.abhaNumber !== abhaNumber) {
    await setTransactionStatus(transactionId, "FAILED");
    throw new ApiError(409, "Patient is already linked to a different ABHA", [], "PATIENT_ALREADY_LINKED");
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
    throw new ApiError(401, "ABHA verification session expired", [], "ABHA_SESSION_EXPIRED");
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
    throw new ApiError(409, "Patient already has an ABHA linked", [], "PATIENT_ALREADY_LINKED");
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
      consentCode: ABHA_ENROLLMENT_CONSENT.code,
      consentVersion: ABHA_ENROLLMENT_CONSENT.version,
      consentAcceptedAt: new Date(),
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
    throw new ApiError(409, "Patient already has an ABHA linked", [], "PATIENT_ALREADY_LINKED");
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

  const abhaPatient = await linkAbhaToPatient(transaction.id, transaction.patientId, abhaNumber, abhaAddress, abdmResponse.ABHAProfile, true);

  // ABDM treats the mobile as verified when it is the Aadhaar-linked one; otherwise it must be verified by OTP.
  const mobileVerified = digitsOnly(String(abdmResponse.ABHAProfile.mobile ?? "")) === digitsOnly(mobile);

  // Mark transaction as completed; keep ABDM's enrolment txnId for the mobile-verification / address follow-ups.
  await setTransactionStatus(transaction.id, "COMPLETED", {
    consentCode: ABHA_ENROLLMENT_CONSENT.code,
    consentVersion: ABHA_ENROLLMENT_CONSENT.version,
    consentAcceptedAt: new Date(),
    enrolTxnId: typeof abdmResponse.txnId === "string" ? abdmResponse.txnId : null,
    mobileVerified,
  });

  // Return only what the application needs (not the ABDM photo/address payload).
  return {
    patientId: transaction.patientId,
    abhaNumber: abhaPatient.abhaNumber,
    abhaAddress: abhaPatient.abhaAddress,
    isNew: Boolean(abdmResponse.isNew),
    transactionId: transaction.id,
    mobileVerified,
    hasFollowUp: typeof abdmResponse.txnId === "string",
    // Enrolment already authenticates the user; keep the X-token so the profile / QR work straight away.
    xToken: (abdmResponse.tokens?.token as string | undefined) ?? null,
    xTokenExpiresIn: abdmResponse.tokens?.expiresIn as number | undefined,
  };
};

// Shared by every "login with an OTP, then link" flow (Aadhaar, ABHA number): ABDM answers with a T-token and the
// account list; the X-token is issued by "verify user" for the chosen ABHA. Then the profile is read, the patient's
// name/DOB are compared with it, and the ABHA is linked.
const finishLoginVerification = async (
  transaction: { id: string; patientId: string; txnId: string },
  abdmResponse: { txnId?: string; authResult?: string; message?: string; token?: string; expiresIn?: number; accounts?: { ABHANumber: string }[] },
  abdmAccessToken: string,
  environment: Environment,
) => {
  if (abdmResponse.authResult !== "success") {
    throw new ApiError(422, abdmResponse.message || "The OTP could not be verified. Check it and try again.", [], "OTP_INVALID");
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
    throw new ApiError(409, "Multiple ABHA accounts exist for this Aadhaar. Use mobile-number linking to choose one.", [], "MULTIPLE_ACCOUNTS");
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
    profile,
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
// verification (link existing ABHA) - aadhaar
// ---------------------------------------------------------------------------

export const requestExistingAbhaAadhaarOtpService = async (patientId: string, facilityId: string, abdmAccessToken: string, environment: Environment, aadhaar: string) => {
  const patient = await findPatientInFacility(patientId, facilityId);

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
      consentCode: HOSPITAL_LINK_CONSENT.code,
      consentVersion: HOSPITAL_LINK_CONSENT.version,
      consentAcceptedAt: new Date(),
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

  const encryptedOtp = await encryptForAbdm(environment, abdmAccessToken, otp);

  const abdmResponse = await verifyExistingAbhaAadhaarOtp({
    accessToken: abdmAccessToken,
    txnId: transaction.txnId,
    encryptedOtp,
    environment,
  });

  return finishLoginVerification(transaction, abdmResponse, abdmAccessToken, environment);
};

// ---------------------------------------------------------------------------
// verification (link existing ABHA) - mobile number
// ---------------------------------------------------------------------------

//step 1 - request otp
export const requestExistingAbhaMobileOtpService = async (patientId: string, facilityId: string, abdmAccessToken: string, environment: Environment, mobile: string) => {
  await findPatientInFacility(patientId, facilityId);

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
      consentCode: HOSPITAL_LINK_CONSENT.code,
      consentVersion: HOSPITAL_LINK_CONSENT.version,
      consentAcceptedAt: new Date(),
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
    throw new ApiError(422, abdmResponse?.message || "The OTP could not be verified. Check it and try again.", [], "OTP_INVALID");
  }

  if (!abdmResponse?.token) {
    throw new ApiError(502, "ABDM did not return the authentication token");
  }

  if (!abdmResponse?.accounts?.length) {
    throw new ApiError(404, "No ABHA accounts were found for this mobile number. Check the number, or create a new ABHA.", [], "ABHA_NOT_FOUND");
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
    profile,
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
    throw new ApiError(404, "This patient has no ABHA linked", [], "NO_ABHA_LINKED");
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
    throw new ApiError(401, "ABHA verification session expired", [], "ABHA_SESSION_EXPIRED");
  }

  return profile;
};

// ---------------------------------------------------------------------------
// ABHA card
// ---------------------------------------------------------------------------

export const getAbhaCardService = async (patientId: string, facilityId: string, abdmAccessToken: string, abhaXToken: string, environment: Environment) => {
  await requireLinkedAbha(patientId, facilityId);

  return getAbhaCard({ accessToken: abdmAccessToken, xToken: abhaXToken, environment }).catch(asAbhaSessionError);
};

// ---------------------------------------------------------------------------
// enrolment follow-ups: verify the communication mobile, then choose an ABHA address.
// They continue on ABDM's enrolment txnId, kept on the COMPLETED ENROLLMENT transaction.
// ---------------------------------------------------------------------------

const FOLLOW_UP_WINDOW_MS = 30 * 60 * 1000;

const loadEnrolmentForFollowUp = async (transactionId: string, facilityId: string) => {
  const transaction = await prisma.abhaTransaction.findUnique({ where: { id: transactionId } });

  if (!transaction) {
    throw new ApiError(404, "ABHA transaction not found", [], "TRANSACTION_NOT_FOUND");
  }
  if (transaction.facilityId !== facilityId) {
    throw new ApiError(403, "Transaction does not belong to this facility");
  }
  if (transaction.purpose !== "ENROLLMENT" || transaction.status !== "COMPLETED" || !transaction.enrolTxnId) {
    throw new ApiError(400, "This ABHA was not created in this session, so it cannot be changed here.", [], "ENROLMENT_SESSION_INVALID");
  }
  if (Date.now() - transaction.updatedAt.getTime() > FOLLOW_UP_WINDOW_MS) {
    throw new ApiError(400, "The ABHA creation session has ended (30 minutes). The ABHA is created and linked; this step can no longer be done here.", [], "ENROLMENT_SESSION_EXPIRED");
  }

  return { ...transaction, enrolTxnId: transaction.enrolTxnId };
};

//step 1 - send an OTP to the mobile number to be linked with the new ABHA
export const requestEnrolMobileVerificationService = async (transactionId: string, facilityId: string, abdmAccessToken: string, environment: Environment, mobile: string) => {
  const transaction = await loadEnrolmentForFollowUp(transactionId, facilityId);

  const encryptedMobile = await encryptForAbdm(environment, abdmAccessToken, mobile);

  const abdmResponse = await requestEnrolMobileOtp({
    accessToken: abdmAccessToken,
    txnId: transaction.enrolTxnId,
    encryptedMobile,
    environment,
  });

  if (!abdmResponse.txnId) {
    throw new ApiError(502, "ABDM did not return a transaction ID");
  }

  await prisma.abhaTransaction.update({
    where: { id: transaction.id },
    data: { mobileOtpTxnId: abdmResponse.txnId },
  });

  return { transactionId: transaction.id, message: abdmResponse.message };
};

//step 2 - verify that OTP
export const verifyEnrolMobileService = async (transactionId: string, facilityId: string, abdmAccessToken: string, environment: Environment, otp: string) => {
  const transaction = await loadEnrolmentForFollowUp(transactionId, facilityId);

  if (!transaction.mobileOtpTxnId) {
    throw new ApiError(400, "Request an OTP for the mobile number first.", [], "OTP_NOT_REQUESTED");
  }

  const encryptedOtp = await encryptForAbdm(environment, abdmAccessToken, otp);

  const abdmResponse = await verifyEnrolMobileOtp({
    accessToken: abdmAccessToken,
    txnId: transaction.mobileOtpTxnId,
    encryptedOtp,
    environment,
  });

  if (abdmResponse.authResult && abdmResponse.authResult !== "success") {
    throw new ApiError(422, abdmResponse.message || "The OTP could not be verified. Check it and try again.", [], "OTP_INVALID");
  }

  await prisma.abhaTransaction.update({
    where: { id: transaction.id },
    data: {
      mobileVerified: true,
      mobileOtpTxnId: null,
      // ABDM may hand back a fresh txnId to continue with (address creation)
      enrolTxnId: abdmResponse.txnId ?? transaction.enrolTxnId,
    },
  });

  return { transactionId: transaction.id, message: abdmResponse.message ?? "Mobile number verified" };
};

// ABHA address rules (NHA M1 sheet): 8-18 characters, letters/digits, at most one "." and one "_", not at the ends.
export const isValidAbhaAddressName = (value: string) =>
  /^(?=.{8,18}$)[a-z0-9]+([._][a-z0-9]+)*$/i.test(value) && (value.match(/\./g)?.length ?? 0) <= 1 && (value.match(/_/g)?.length ?? 0) <= 1;

export const getAbhaAddressSuggestionsService = async (transactionId: string, facilityId: string, abdmAccessToken: string, environment: Environment) => {
  const transaction = await loadEnrolmentForFollowUp(transactionId, facilityId);

  const abdmResponse = await getAbhaAddressSuggestions({
    accessToken: abdmAccessToken,
    txnId: transaction.enrolTxnId,
    environment,
  });

  return { suggestions: Array.isArray(abdmResponse.abhaAddressList) ? abdmResponse.abhaAddressList : [] };
};

export const createAbhaAddressService = async (transactionId: string, facilityId: string, abdmAccessToken: string, environment: Environment, abhaAddress: string) => {
  const transaction = await loadEnrolmentForFollowUp(transactionId, facilityId);

  // Suggestions come back as "name@domain"; ABDM wants just the name part.
  const name = abhaAddress.split("@")[0] ?? "";
  if (!isValidAbhaAddressName(name)) {
    throw new ApiError(400, "ABHA address must be 8-18 characters: letters and numbers, with at most one dot and one underscore, not at the start or end.", [], "ABHA_ADDRESS_INVALID");
  }

  const abdmResponse = await createAbhaAddress({
    accessToken: abdmAccessToken,
    txnId: transaction.enrolTxnId,
    abhaAddress: name,
    environment,
  });

  const preferred = abdmResponse.preferredAbhaAddress ?? `${name}@${getCmId(environment)}`;

  await prisma.abhaPatient.update({
    where: { patientId: transaction.patientId },
    data: { abhaAddress: preferred },
  });

  return { abhaAddress: preferred };
};

// ---------------------------------------------------------------------------
// verification (link existing ABHA) - ABHA number, OTP via Aadhaar or via the ABHA's mobile
// ---------------------------------------------------------------------------

// Accepts "91-1234-5678-9012" or 14 digits; ABDM wants the hyphenated form.
export const formatAbhaNumber = (value: string) => {
  const d = value.replace(/\D/g, "");
  return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}-${d.slice(10, 14)}`;
};

export const requestAbhaNumberOtpService = async (patientId: string, facilityId: string, abdmAccessToken: string, environment: Environment, abhaNumber: string, channel: AbhaLoginChannel) => {
  const patient = await findPatientInFacility(patientId, facilityId);

  const encryptedAbhaNumber = await encryptForAbdm(environment, abdmAccessToken, formatAbhaNumber(abhaNumber));

  const abdmResponse = await requestAbhaNumberOtp({
    accessToken: abdmAccessToken,
    encryptedAbhaNumber,
    channel,
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
      consentCode: HOSPITAL_LINK_CONSENT.code,
      consentVersion: HOSPITAL_LINK_CONSENT.version,
      consentAcceptedAt: new Date(),
    },
  });

  return {
    transactionId: transaction.id,
    message: abdmResponse.message,
  };
};

export const verifyAbhaNumberOtpService = async (transactionId: string, facilityId: string, abdmAccessToken: string, environment: Environment, otp: string, channel: AbhaLoginChannel) => {
  const transaction = await loadPendingTransaction(transactionId, facilityId, "VERIFICATION");

  const encryptedOtp = await encryptForAbdm(environment, abdmAccessToken, otp);

  const abdmResponse = await verifyAbhaNumberOtp({
    accessToken: abdmAccessToken,
    txnId: transaction.txnId,
    encryptedOtp,
    channel,
    environment,
  });

  return finishLoginVerification(transaction, abdmResponse, abdmAccessToken, environment);
};
