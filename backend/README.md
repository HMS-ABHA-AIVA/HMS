# HMS---ABHA-INTEGRATION

## API endpoints

The API runs on port `5000` by default. Unless noted otherwise, request and response
bodies use JSON. Authenticated routes require the relevant `httpOnly` cookie set by
the login endpoint; the backend also accepts a bearer token in the `Authorization`
header. Successful responses generally contain `success`, `message`, and (when
applicable) `data`. Errors contain a message.

### Health

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/health` | None | Check that the API is running. |

### Facility

| Method | Endpoint | Authentication | Request body | Purpose |
|---|---|---|---|---|
| `POST` | `/api/facility/register` | None | `{ "name", "email", "hfrId", "password" }` | Register a facility. Name: 3–20 characters; password: 8–20 characters. |
| `POST` | `/api/facility/login` | None | `{ "email", "password" }` | Log in as a facility; sets the facility `accessToken` and `refreshToken` cookies. |
| `POST` | `/api/facility/logout` | Facility | None | Log out the facility and clear its cookies. |
| `POST` | `/api/facility/add-abdm-details` | Facility | `{ "clientId", "clientSecret", "environment": "SANDBOX" | "PRODUCTION" }` | Save ABDM credentials for the facility. |
| `POST` | `/api/facility/create-admin` | Facility | `{ "name", "email", "password" }` | Create a staff/admin login under this facility. Name: 3–20 characters; password: 6–20 characters. |

### Staff/admin

| Method | Endpoint | Authentication | Request body | Purpose |
|---|---|---|---|---|
| `POST` | `/api/user/admin/login` | None | `{ "email", "password" }` | Log in as staff/admin; sets the user `accessToken` and `refreshToken` cookies. |
| `POST` | `/api/user/admin/logout` | Staff/admin | None | Log out and clear the user cookies. |

### Patients

| Method | Endpoint | Authentication | Request body | Purpose |
|---|---|---|---|---|
| `POST` | `/api/patient/create` | Staff/admin | `{ "name", "phone", "email?" }` | Create a patient for the authenticated user's facility. Phone must be 10 digits. |
| `GET` | `/api/patient` | Staff/admin | None | Return patients belonging to the authenticated user's facility, including their ABHA record when present.|
| `GET` | `/api/patient/:patientId/transactions` | Staff/admin | None | Return that patient's ABHA transactions for the authenticated facility, newest first.|

### Staff, roles, settings, facility profile, audit log

Every staff login has a **role**: `front_office`, `doctor`, `nurse`, `pharmacist`, `biller`, `housekeeping`, `lab` or `admin`. Logins that existed before roles are admins.
Role-protected routes read the role from the database on every call, so a role change or deactivation takes effect at once.
All these routes need a staff sign-in; the role column says who may change things.

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| `GET` | `/api/staff?role=` | any | Staff list. Pay, bank and login details are shown to admins only. |
| `GET` | `/api/staff/:id` | any | One staff member. |
| `POST` | `/api/staff` | admin | Add staff, optionally with a login (`login: { email, password }`). |
| `PATCH` | `/api/staff/:id` | admin | Change role, department, HPR id, fees, `active`. The login follows (role, on/off). You cannot deactivate yourself or drop your own admin role. |
| `PUT` / `DELETE` | `/api/staff/:id/login` | admin | Give or change a login (ends that person's sessions) / remove it. |
| `GET` / `PUT` | `/api/settings` | any / admin | Hospital settings: fees, GSTIN, bed-day hour, print text. Unset values use defaults. |
| `GET` / `PUT` | `/api/facility-profile` | any / admin | Hospital name, HFR id, HIP id, address, location. |
| `GET` | `/api/audit-log?limit=&before=&search=` | admin | The hospital audit trail, newest first (no passwords, OTPs or Aadhaar numbers). |

Patients now carry a per-hospital **MRN** (`MRN-10001` ...), `allergies` and `problemList`. `npm test` runs the backend tests against a running backend
(they create and remove a throwaway hospital of their own).

### Dashboard

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/dashboard` | Staff | Counts for the dashboard: patients, with/without an ABHA, registered today (IST), shared profiles waiting, and the last 8 ABHA audit entries (action, outcome, error code; no personal data). |

### ABHA / ABDM M1

All routes below require staff/admin authentication. `environment` must be `SANDBOX` or `PRODUCTION`.
ABDM gateway tokens last 20 minutes; when a route answers `401 ABDM authentication required`, call `/api/abha/retrieve` again and retry.

| Method | Endpoint | Request | Purpose |
|---|---|---|---|
| `POST` | `/api/abha/retrieve` | body `{ environment }` | Get ABDM session tokens (httpOnly cookies used by the other routes). |
| `POST` | `/api/abha/create/aadhar/request` | body `{ patientId, aadhaar, environment }` | Send an Aadhaar OTP to create a new ABHA. |
| `POST` | `/api/abha/create/aadhar/verify` | body `{ transactionId, otp, mobile, environment }` | Verify the OTP, create the ABHA and link it to the patient. |
| `POST` | `/api/abha/verify/aadhar/request` | body `{ patientId, aadhaar, environment }` | Send an Aadhaar OTP to link an existing ABHA. |
| `POST` | `/api/abha/verify/aadhar/confirm` | body `{ transactionId, otp, environment }` | Verify the OTP and link the existing ABHA. |
| `POST` | `/api/abha/verify/mobile/request` | body `{ patientId, mobile, environment }` | Send a mobile OTP to find existing ABHA accounts. |
| `POST` | `/api/abha/verify/mobile/confirm` | body `{ transactionId, otp, environment }` | Verify the OTP; returns the account list. |
| `POST` | `/api/abha/verify/mobile/user` | body `{ abhaNumber, transactionId, environment }` | Choose an account and link it to the patient. |
| `POST` | `/api/abha/create/mobile/request` | body `{ transactionId, mobile, environment }` | After creating an ABHA: send an OTP to verify the mobile number to link (when it is not the Aadhaar-linked one). |
| `POST` | `/api/abha/create/mobile/verify` | body `{ transactionId, otp, environment }` | Verify that OTP. |
| `GET` | `/api/abha/create/address/suggestions` | query `transactionId, environment` | ABHA address suggestions for the new ABHA. |
| `POST` | `/api/abha/create/address` | body `{ transactionId, abhaAddress, environment }` | Create the chosen ABHA address (4–18 chars, at most one `.` and one `_`). |
| `POST` | `/api/abha/verify/number/request` | body `{ patientId, abhaNumber, channel, environment, consent }` | Link by ABHA number; `channel` is `aadhaar` or `mobile` (where the OTP goes). |
| `POST` | `/api/abha/verify/number/confirm` | body `{ transactionId, otp, channel, environment }` | Verify the OTP and link the ABHA. |
| `GET` | `/api/abha/profile/card` | query `patientId, environment` | Download the ABHA card (PNG/PDF). Same session restriction as the QR. |
| `GET` | `/api/abha/audit` | query `patientId?` | ABHA audit trail for the facility (who, action, outcome, error code, IP; no personal data). |
| `GET` | `/api/abha/profile` | query `patientId, environment` | Live ABHA profile. Only works for the patient whose ABHA was verified in this session. |
| `POST` | `/api/abha/verify/address/request` | body `{ patientId, abhaAddress, channel, environment, consent }` | Link by ABHA address (PHR login). `channel` is `aadhaar` or `mobile`. A bare name gets `@sbx` / `@abdm` added. |
| `POST` | `/api/abha/verify/address/confirm` | body `{ transactionId, otp, channel, environment }` | Verify the OTP and link the ABHA. The session token from this login is a PHR token: profile and card work, the QR and mobile/email update do not. |
| `GET` | `/api/abha/profile/qr` | query `patientId, environment` | Live ABHA QR image, same restriction as the profile. |

Every OTP-request route also needs `consent: true` (the patient accepted the consent text). `patientId` and `transactionId` must be UUIDs. ABDM/UIDAI validation messages (wrong Aadhaar, wrong OTP, 30-second
OTP cool-down) are returned as-is with status 400/422/429.

### Scan & Share (patient shares their ABHA profile at a counter)

A patient scans the counter QR code (`<phr host>/share-profile?hip-id=<facility HFR id>&counter-id=<counter>`) in their PHR app and agrees to share.
ABDM then calls our bridge; we answer 200, store the profile for up to 30 minutes, and reply on `patient-share/v3/on-share` with a queue token
(sequential per counter per day; the same person scanning again while their token is valid gets the same token). Staff register the patient from the
"Shared profiles" screen: no OTP is needed because the patient consented in their own app. Expired, unclaimed shares are deleted.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v3/hip/patient/share` | ABDM bearer JWT (RS256, verified against the gateway keys), `X-HIP-ID` = facility HFR id | The callback ABDM makes on the bridge URL. Rejected with 401/403 and logged (`ABDM_CALLBACK_REJECTED`) unless all checks pass. |
| `GET` | `/api/abha/shares` | Staff | Shared profiles still waiting (valid token), oldest first. Includes the existing patient when the ABHA is already linked. |
| `GET` | `/api/abha/shares/config?environment=` | Staff | HFR id and QR host for printing counter QR codes. |
| `POST` | `/api/abha/shares/:shareId/register` | Staff | body `{ phone? }`. Create the patient and link the ABHA (or return the existing patient). `PHONE_REQUIRED` asks for a mobile number (a number may be shared by several patients). |
| `POST` | `/api/abha/shares/:shareId/dismiss` | Staff | Delete a shared profile without registering it. |

Setup (once per environment, and again whenever the public URL changes): the backend must be reachable on public HTTPS (a deployed URL, or a tunnel for
sandbox testing), then run

```
npx tsx scripts/register_bridge.ts <facility HFR id> SANDBOX https://<public backend url>
```

`PATCH /gateway/v3/bridge/url` replaces the callback URL for the **whole client id**, so use a client id that no other system shares. Optional env vars:
`SANDBOX_GATEWAY_URL` / `PROD_GATEWAY_URL` (default `https://dev.abdm.gov.in/api/hiecm` / `https://live.abdm.gov.in/api/hiecm`),
`SHARE_QR_SANDBOX_URL` / `SHARE_QR_PRODUCTION_URL` (QR host; the production host is to be confirmed with NHA at onboarding), and, for local development only,
`ABDM_SKIP_CALLBACK_JWT=true` (accepts any bearer token; ignored when `NODE_ENV=production`).
