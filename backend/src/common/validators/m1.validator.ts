import {z} from "zod"

export const abdmTokenRetrievalSchema = z.object({
    environment: z.enum(["SANDBOX", "PRODUCTION"]),
});

export const aadhaarOtpRequestSchema = z.object({
    environment : z.enum(["SANDBOX","PRODUCTION"]),
    patientId: z.uuid(),
    aadhaar: z.string().regex(/^\d{12}$/, "Aadhaar number must be exactly 12 digits"),
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

export const getAbhaProfileSchema = z.object({

  environment: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),

});