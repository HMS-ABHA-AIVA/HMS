import {z} from 'zod';

export const registerFacilitySchema = z.object({
    name : z.string().min(3,"must be atleast 3 characters long").max(20,"name can be max 20 characters long"),
    email : z.email("must be a valid email address"),
    hfrId: z.string().trim().min(1, "HFR ID is required"),
    password : z.string().min(8,"password must be atleast 8 characters long").max(20,"password can be max 20 characters long"),
})


export const loginFacilitySchema = z.object({
  email: z.email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});


export const addAbdmDetailsSchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client secret is required"),
    environment: z.enum(["SANDBOX", "PRODUCTION"]),
});

export const createAdminSchema = z.object({
  name : z.string().min(3,"must be atleast 3 characters long").max(20,"name can be max 20 characters long"),
  email : z.email("must be a valid email address"),
  password : z.string().min(6,"password must be atleast 6 characters long").max(20,"password can be max 20 characters long"),
})