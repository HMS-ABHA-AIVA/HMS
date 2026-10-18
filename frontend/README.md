# AIVA OSHealth: Staff Web App (Frontend)

React 19 + TypeScript + Vite staff application for the HMS ABHA-integration backend. It covers
facility setup, patient registration, the full ABDM M1 ABHA flows, the patient record and the
Scan & Share queue. See the [root README](../README.md) for the project overview and the
[backend README](../backend/README.md) for the API.

## Run

Requirements: Node.js 20 or newer, and the backend running (see the root README).

```bash
npm install
npm run dev       # http://localhost:5173
```

`npm run dev` proxies `/api` to `http://localhost:5000` (see `vite.config.ts`), so the httpOnly login
cookies stay same-origin. Other scripts: `npm run build` (type-check and production build),
`npm run preview`, `npm run lint`.

## Configuration

Copy `.env.example` to `.env`.

| Variable | Where | Purpose |
|---|---|---|
| `BACKEND_URL` | dev/preview server | Proxy target for `/api` (default `http://localhost:5000`) |
| `VITE_ABDM_ENVIRONMENT` | browser | `SANDBOX` (default) or `PRODUCTION` for ABHA calls |
| `VITE_API_URL` | browser | Backend URL when the API is on another origin, as in a deployed setup. The backend's `FRONTEND_URL` must then be this app's exact origin |

## Using the app

There are two kinds of login, and they share one cookie, so only one is active at a time.

1. **Register a facility** at `/login`, then sign in as the **facility owner**. This lands on **Facility setup**: save the
   ABDM client ID and secret (sandbox or production) and create **staff accounts**.
2. Sign out and sign in as **staff**. A facility login sees only Facility setup; a staff login sees only the hospital screens.

| Screen | Route | Notes |
|---|---|---|
| Sign in | `/login` | Staff, facility owner, register a facility |
| Facility setup | `/facility-setup` | Facility login only |
| Patients | `/`, `/registration` | Patient list with ABHA status, search, "Add ABHA" |
| Register patient | `/register` | Creates the patient, then creates or links an ABHA |
| Patient record | `/record/:patientId` | Live ABHA profile, QR, card download, contact update |
| Shared profiles | `/shared-profiles` | Scan & Share queue and counter QR codes |
| OPD, beds, pharmacy, billing, payroll, roster | `/opd`, `/beds`, ... | **Demo data**, reset on reload |

### ABHA flows (Register patient)

- **Create an ABHA** with Aadhaar OTP. The consent text is shown in English or Hindi and must be accepted before any OTP is sent.
  Afterwards: verify the communication mobile if it is not the Aadhaar one, choose an ABHA address from the suggestions, and see the ABHA number.
- **Link an existing ABHA** by Aadhaar number, mobile number, ABHA number or ABHA address, with the OTP going to the Aadhaar-linked
  or ABHA-registered mobile. OTP resend is limited to 2 times after 60 seconds.
- The link is blocked, naming only the fields, if the patient's name or date of birth does not match the ABHA.
- Every error carries a specific title and message (wrong OTP, no ABHA found, cool-down and so on), mapped in `src/lib/errorHelper.ts`.

### Scan & Share (Shared profiles)

Shows patients who scanned a counter QR code and shared their ABHA profile, each with a token and a 30-minute countdown, refreshed every
10 seconds. **Register patient** creates the patient and links the ABHA (it asks for a mobile number if the shared one is missing or already
used); **Dismiss** removes the entry. The **Counter QR code** panel prints one QR per counter ID (1 to 20 letters or digits).
Setup of the public URL and bridge is in the root README.

## Things to know

- **No roles in the backend.** A staff login acts as an administrator.
- **Aadhaar numbers are never stored** by the frontend; they live in component state until the OTP is sent.
- **Sessions expire.** The next request answered "unauthorized" sends you back to `/login`. ABDM tokens are short-lived and refreshed in the background
  (`src/api/abdmSession.ts`); a lapsed ABHA verification asks you to verify the ABHA again.
- A patient whose ABHA was linked through **ABHA address login** has a PHR session: profile and card work, the QR code and mobile/email update do not,
  and the screen says why.
- Patient fields the backend does not model (allergies, problems) exist only in the demo modules.

## Code layout

```
src/
  main.tsx, App.tsx         start-up and all routes
  pages/
    SignIn, FacilitySetup, PatientList, RegisterPatient, PatientRecord, SharedProfiles   connected to the backend
    OpdQueue                                                                            demo data
    ErrorStates.tsx         shared stop/error panel
  components/
    AppShell.tsx            sidebar frame and navigation
    ConsentBox, CreateFollowUps, ContactUpdate, AbhaProfileDetails   ABHA building blocks
    auth/RequireSession     keeps logged-out users off the app
  api/
    client.ts               fetch wrapper (cookies, JSON-only, ApiError with a stable code)
    endpoints.ts            every backend route, typed: the one file to update when the API changes
    abdmSession.ts          ABDM session refresh
  lib/                      consent text (EN/HI), ABHA rules, error mapping, OTP message wording, session
  store/                    useAuthStore (login state), useHospitalStore (demo data)
  styles/                   global.css, oshealth.css
```

Imports use `@/` for `src/`. The folders `pages/audit`, `pages/billing`, `pages/ipd` and similar, and `store/slices`, are earlier demo
modules that are not routed; they are kept for later integration.
