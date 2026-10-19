import { z } from "zod";

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const money = z.number().min(0).max(1_000_000);

export const updateSettingsSchema = z
  .object({
    opdDefaultFee: money,
    erFee: money,
    unlistedTestPrice: money,
    unlistedMedicinePrice: money,
    medicineGstPct: z.number().min(0).max(100),
    bedDayCheckoutHour: z.number().int().min(0).max(23),
    gstin: z.string().trim().toUpperCase().refine((v) => v === "" || GSTIN.test(v), "A GSTIN is 15 characters, e.g. 27ABCDE1234F1Z5"),
    registrationNo: z.string().trim().max(60),
    drugLicenseNo: z.string().trim().max(60),
    requireReportVerification: z.boolean(),
    consentText: z.string().trim().min(20).max(4000),
    billFooter: z.string().trim().max(200),
  })
  .partial()
  .strict();

// The facility profile: who the hospital is, as ABDM and printouts need it.
const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const updateFacilityProfileSchema = z
  .object({
    name: z.string().trim().min(3, "must be at least 3 characters long").max(100)
      .regex(/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'&()\-]*$/u, "name contains characters that are not allowed"),
    hfrId: z.string().trim().min(1, "HFR ID is required").max(30).regex(/^[A-Za-z0-9_-]+$/, "HFR ID may contain only letters, numbers, - and _"),
    hipId: z.string().trim().max(60).regex(/^[A-Za-z0-9_@-]*$/, "HIP ID may contain only letters, numbers, - _ and @").nullable(),
    facilityType: optionalText(60),
    address: optionalText(300),
    state: optionalText(80),
    district: optionalText(80),
    pincode: z.string().trim().regex(/^\d{6}$/, "Pincode must be 6 digits").nullable(),
    phone: z.string().trim().regex(/^[\d +()-]{6,20}$/, "Phone number looks invalid").nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  })
  .partial()
  .strict();
