import { z } from "zod";

// "YYYY-MM-DD" that is a real calendar date, not in the future, and not absurdly old.
const dateOfBirth = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be in YYYY-MM-DD format")
    .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Date of birth is not a valid date")
    .refine((value) => value <= new Date().toISOString().slice(0, 10), "Date of birth cannot be in the future")
    .refine((value) => value >= "1900-01-01", "Date of birth is too far in the past");

export const createPatientSchema = z.object({

    name: z.string().min(2, "Patient name must be at least 2 characters").max(100, "Patient name cannot exceed 100 characters").trim(),

    phone: z.string().regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),

    email: z.email("Invalid email address").optional(),

    dateOfBirth: dateOfBirth.optional(),
});
