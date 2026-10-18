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
| `GET` | `/api/abha/profile` | query `patientId, environment` | Live ABHA profile. Only works for the patient whose ABHA was verified in this session. |
| `GET` | `/api/abha/profile/qr` | query `patientId, environment` | Live ABHA QR image, same restriction as the profile. |

`patientId` and `transactionId` must be UUIDs. ABDM/UIDAI validation messages (wrong Aadhaar, wrong OTP, 30-second
OTP cool-down) are returned as-is with status 400/422/429.
