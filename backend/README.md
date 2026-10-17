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

| Method | Endpoint | Request body | Purpose |
|---|---|---|---|
| `POST` | `/api/abha/retrieve` | `{ "environment" }` | Retrieve ABDM session tokens; sets ABDM session cookies used by the other M1 routes. |
| `POST` | `/api/abha/create/request` | `{ "patientId", "aadhaar", "environment" }` | Request an Aadhaar OTP to create a new ABHA. Aadhaar must be 12 digits. |
| `POST` | `/api/abha/create/verify` | `{ "transactionId", "otp", "mobile", "environment" }` | Verify the OTP and complete new ABHA creation. OTP must be 6 digits; mobile must be 10 digits. |
| `POST` | `/api/abha/verify/request` | `{ "patientId", "aadhaar", "environment" }` | Request an Aadhaar OTP to link an existing ABHA. |
| `POST` | `/api/abha/verify/confirm` | `{ "transactionId", "otp", "environment" }` | Verify the OTP and link the existing ABHA. |

`patientId` and `transactionId` must be UUIDs. The Aadhaar OTP routes call ABDM, so
valid ABDM facility credentials and the matching environment must be configured first.
