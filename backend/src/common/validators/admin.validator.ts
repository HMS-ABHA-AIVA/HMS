import {z} from 'zod';

export const loginAdminSchema = z.object({
  email: z.email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});