import { z } from "zod";
import { newPasswordSchema, rejectWeakPassword } from "./password.js";

export const staffRoles = ["front_office", "doctor", "nurse", "pharmacist", "biller", "housekeeping", "lab", "admin"] as const;

const email = z.email("must be a valid email address").max(254, "email is too long");

const hprId = z.string().trim().regex(/^[A-Za-z0-9@._-]{3,64}$/, "HPR id looks invalid").nullable();

// Letters (any script), spaces and . ' -
const personName = z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long")
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'’\-]*$/u, "Name may contain only letters, spaces and . ' -");

const login = z.object({ email, password: newPasswordSchema }).superRefine(rejectWeakPassword);

export const createStaffSchema = z.object({
  name: personName,
  role: z.enum(staffRoles),
  department: z.string().trim().min(1, "Department is required").max(80),
  hprId: hprId.optional(),
  employmentType: z.enum(["salaried", "visiting_fee"]).default("salaried"),
  monthlySalary: z.number().min(0).max(100_000_000).nullable().optional(),
  feePerConsult: z.number().min(0).max(100_000_000).nullable().optional(),
  consultationFee: z.number().min(0).max(100_000).nullable().optional(),
  /** Last four digits only: full bank details are never stored. */
  bankAccountLast4: z.string().regex(/^\d{4}$/, "Enter exactly the last 4 digits").nullable().optional(),
  /** Give the person a sign-in at the same time. */
  login: login.optional(),
});

export const updateStaffSchema = createStaffSchema.omit({ login: true }).partial().extend({ active: z.boolean().optional() }).strict();

export const setLoginSchema = login;

export const staffListQuerySchema = z.object({ role: z.enum(staffRoles).optional() });
