import {z} from "zod"

// The patient must have agreed to the consent text shown before any OTP is requested.
const consent = z.literal(true, "Patient consent is required before an OTP is sent");

export const abdmTokenRetrievalSchema = z.object({
    environment: z.enum(["SANDBOX", "PRODUCTION"]),
});

export const aadhaarOtpRequestSchema = z.object({
    environment : z.enum(["SANDBOX","PRODUCTION"]),
    patientId: z.uuid(),
    aadhaar: z.string().regex(/^\d{12}$/, "Aadhaar number must be exactly 12 digits"),
    consent,
});

export const aadharOtpVerifySchema = z.object({
    transactionId : z.uuid("invalid transaction ID"),
    otp : z.string().regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
    mobile : z.string().regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"),
    environment : z.enum(["SANDBOX" ,  "PRODUCTION"])

})

export const existingAbhaAadhaarOtpRequestSchema = z.object({
  patientId: z.uuid("Invalid patient ID"),
  aadhaar: z.string().regex(/^\d{12}$/,"Aadhaar number must be exactly 12 digits"),
  environment: z.enum(["SANDBOX","PRODUCTION"]),
  consent,
});

export const existingAbhaAadhaarOtpVerifySchema = z.object({
    transactionId: z.uuid("Invalid transaction ID"),
    otp: z.string().regex(/^\d{6}$/,"OTP must be exactly 6 digits"),
    environment: z.enum(["SANDBOX","PRODUCTION"]),
  });


export const existingAbhaMobileOtpRequestSchema = z.object({
  patientId: z.uuid("Invalid patient ID"),

  mobile: z.string().regex(/^\d{10}$/, "Mobile number must be 10 digits"),

  environment: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
  consent,
});

export const existingAbhaMobileOtpVerifySchema = z.object({
    transactionId: z.uuid("Invalid transaction ID"),

    otp: z.string().length(6, "OTP must be 6 digits").regex(/^\d+$/, "OTP must contain only digits"),

    environment: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
});

export const verifyExistingAbhaMobileUserSchema = z.object({
    abhaNumber: z.string().min(1, "ABHA number is required"),

    transactionId: z.uuid("Invalid transaction ID"),
    environment: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
});

// Profile / QR are tied to one patient: the X-token cookie is only valid for the patient it was issued for.
export const getAbhaProfileSchema = z.object({

  patientId: z.uuid("Invalid patient ID"),

  environment: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),

});

// --- enrolment follow-ups (after "create ABHA") ---------------------------------------------------

export const enrolMobileRequestSchema = z.object({
    transactionId: z.uuid("Invalid transaction ID"),
    mobile: z.string().regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"),
    environment: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
});

export const enrolMobileVerifySchema = z.object({
    transactionId: z.uuid("Invalid transaction ID"),
    otp: z.string().regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
    environment: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
});

export const abhaAddressSuggestionsQuerySchema = z.object({
    transactionId: z.uuid("Invalid transaction ID"),
    environment: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
});

export const createAbhaAddressSchema = z.object({
    transactionId: z.uuid("Invalid transaction ID"),
    abhaAddress: z.string().trim().min(4, "ABHA address must be at least 4 characters").max(60, "ABHA address is too long"),
    environment: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
});

// --- link an existing ABHA by ABHA number -----------------------------------------------------------

const abhaNumber = z.string().regex(/^\d{2}-?\d{4}-?\d{4}-?\d{4}$/, "ABHA number must be 14 digits (for example 91-1234-5678-9012)");
const loginChannel = z.enum(["aadhaar", "mobile"], "Choose where the OTP is sent (Aadhaar-linked mobile or ABHA mobile)");

export const abhaNumberOtpRequestSchema = z.object({
    patientId: z.uuid("Invalid patient ID"),
    abhaNumber,
    channel: loginChannel,
    environment: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
    consent,
});

export const abhaNumberOtpVerifySchema = z.object({
    transactionId: z.uuid("Invalid transaction ID"),
    otp: z.string().regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
    channel: loginChannel,
    environment: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
});
