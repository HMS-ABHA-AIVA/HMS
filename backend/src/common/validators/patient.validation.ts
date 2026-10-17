import { z } from "zod";

export const createPatientSchema = z.object({

    name: z.string().min(2, "Patient name must be at least 2 characters").max(100, "Patient name cannot exceed 100 characters").trim(),

    phone: z.string().regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),

    email: z.email("Invalid email address").optional()
});