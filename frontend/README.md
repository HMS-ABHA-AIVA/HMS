# AIVA OSHealth — Staff Web App (Frontend)

React + TypeScript + Vite frontend for the AIVA OSHealth hospital management system (HMIS),
connected to the HMS ABHA-integration backend. This copy follows the latest backend README, including
`GET /api/patient` and `GET /api/patient/:patientId/transactions`.

Login, facility setup, the patient list, patient registration and the ABDM/ABHA M1 flows talk to the real backend.
OPD, IPD/beds, pharmacy, billing, payroll and roster are visible but run on demo data (in memory, reset on
reload) until the backend supports them. Emergency, supplies, housekeeping, waste and audit are **hidden**:
their menu entries and routes are commented out, and their code is kept in `src/pages/` for easy integration
later (see "Bringing a hidden module back").

## Requirements

- Node.js LTS (v20 or newer; developed on v24)
- The backend running (PostgreSQL + the env vars below)

## Run

Backend (in `../backend`), needs a `.env` with:

```
DATABASE_URL=postgresql://…
FACILITY_ACCESS_TOKEN_SECRET=…   FACILITY_REFRESH_TOKEN_SECRET=…
USER_ACCESS_TOKEN_SECRET=…       USER_REFRESH_TOKEN_SECRET=…
ABDM_ENCRYPTION_KEY=…
SANDBOX_SESSION_URL=…            PROD_SESSION_URL=…
PORT=5000                        # optional, 5000 is the default
```

```bash
npx prisma migrate deploy && npm run dev      # http://localhost:5000
```

Frontend (this folder):

```bash
npm install
npm run dev       # http://localhost:5173
```

`npm run dev` proxies `/api` to `http://localhost:5000` (see `vite.config.ts`). Point it elsewhere with
`BACKEND_URL` (copy `.env.example` to `.env`).

Other scripts: `npm run build` (type-check + production build), `npm run preview`, `npm run lint`.

## First-time setup (in the app)

The backend has two kinds of login, and they share one cookie, so only one is active at a time:

1. **Register a facility**: `/login` → "Register a facility".
2. **Facility login**: lands on **Facility Setup**, where you
   - save the facility's **ABDM client ID/secret** (checked against ABDM; sandbox or production), and
   - **create staff accounts**.
3. **Log out**, then use **Staff login** with a staff account. The HMIS screens open.
4. **Registration & Front Office → New Registration** creates the patient in the backend, then
   either **creates a new ABHA** or **links an existing ABHA** with an Aadhaar OTP.

A facility login only sees Facility Setup; a staff login only sees the HMIS screens.

## What is real and what is mock

| Area | Status | Backend routes |
|---|---|---|
| Facility register / login / logout | Real | `POST /api/facility/register\|login\|logout` |
| ABDM credentials, staff accounts | Real | `POST /api/facility/add-abdm-details\|create-admin` |
| Staff login / logout | Real | `POST /api/user/admin/login\|logout` |
| Patient registration (Registration page, Emergency "New Patient") | Real | `POST /api/patient/create` |
| Patient list with ABHA status (Registration page, search, chart) | Real | `GET /api/patient` |
| ABHA activity on a patient's chart; resolving the ABHA "create" transaction id | Real | `GET /api/patient/:patientId/transactions` |
| ABHA create / link via Aadhaar OTP | Real | `POST /api/abha/retrieve\|create/request\|create/verify\|verify/request\|verify/confirm` |
| ABHA via mobile number, Scan & Share | Not in backend yet (shown disabled) | — |
| OPD, IPD/beds, pharmacy, billing, payroll, roster | Demo data (in memory) | — |
| Emergency, supplies, housekeeping, waste, audit | Hidden (commented out; code kept) | — |

All backend calls live in **`src/api/endpoints.ts`**, so backend changes are a one-file update.

## Things to know

- **No roles in the backend.** A staff login acts as an administrator. The sidebar's "Preview
  navigation as" only changes the menu; it enforces nothing.
- **Patients come from the backend** (`GET /api/patient`, loaded when a staff user enters the app, with a Retry
  on failure). The backend doesn't store **age, gender, allergies or problems** yet, so those are kept in this
  browser per staff user (`aiva.patientExtras.<userId>`) and merged on; patients registered elsewhere show "—".
  Logging out does not clear them. There is no "who am I" endpoint, so the login is remembered in `aiva.session`.
- **Patients without an ABHA** get a **Link ABHA** button on the Registration page.
- **Sessions expire** (access cookie: 2 h). The next request that gets "unauthorized" sends you back to `/login`.
- **Aadhaar numbers are never stored**; they live in component state only until the OTP is sent.
- Patient details the backend doesn't model (age, gender, allergies, problems) stay client-side only.

## Known backend issues (frontend works around or surfaces them)

- **Which id does `create/verify` want?** The backend README doesn't say. An earlier backend looked the
  transaction up by its internal id while `create/request` returned only ABDM's `txnId`, so verify failed with
  "ABHA transaction not found". The frontend now tries, in order: a `transactionId` returned by `create/request`,
  the internal id found through `GET /patient/:id/transactions`, then ABDM's `txnId`. Only an unknown-transaction
  404 moves on to the next id, and that check happens before ABDM is called, so no OTP is used up.
- **The two new GET responses aren't documented.** They are read as `{ data: [...] }` (patients with an `abha`
  object, and transactions with `id`, `txnId`, `purpose`, `status`, `createdAt`, `expiresAt`), following the
  Prisma schema. If the real shapes differ, adjust `src/api/endpoints.ts`.
- **CORS is a bare `cors()`** (wildcard origin), which blocks cookie logins from a different origin. The dev
  proxy avoids it. For a separately hosted frontend, serve both behind one origin, or set
  `cors({ origin: <frontend url>, credentials: true })` on the backend and `VITE_API_URL` here.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `BACKEND_URL` | dev/preview server | Proxy target for `/api` (default `http://localhost:5000`) |
| `VITE_ABDM_ENVIRONMENT` | browser | `SANDBOX` (default) or `PRODUCTION` for ABHA calls |
| `VITE_API_URL` | browser | Only if the API is on another origin (default: same origin `/api`) |

## Modules

| Area | Route |
|---|---|
| Login (staff / facility / register facility) | `/login` |
| Facility Setup (facility login only) | `/facility-setup` |
| Dashboard | `/` |
| Registration & Front Office (ABHA flow) | `/registration` |
| OPD queue & consultation | `/opd`, `/opd/consult/:id` |
| Emergency / Urgent Care (hidden) | `/emergency`, `/emergency/case/:id` |
| IPD bed board & patient view | `/ipd`, `/ipd/patient/:id` |
| EMR patient chart | `/emr/:patientId` |
| Pharmacy & Inventory | `/pharmacy` |
| Supplies & Inventory (hidden) | `/supplies` |
| Housekeeping (hidden) | `/housekeeping` |
| Biomedical Waste Management (hidden) | `/housekeeping/waste` |
| Billing & Insurance | `/billing` |
| Payroll & HR | `/payroll` |
| Staff Roster | `/roster` |
| Audit Log (hidden) | `/audit` |

## Bringing a hidden module back

Once the backend supports a page:

1. `src/App.tsx`: uncomment its import and its route.
2. `src/components/layout/navigation.ts`: uncomment its entry in `ALL` and its references in `navByRole`.
3. Any button that links to it, in the page that shows it (for example the Housekeeping button on the Bed Board).

Then replace its demo data with real calls: add them to `src/api/endpoints.ts` and change the matching file in
`src/store/slices/`. Pages read their data through `useHospitalStore()`, so they need no changes.
Unknown URLs (including hidden routes) redirect to the dashboard.

## Where to find things

```
src/
  main.tsx, App.tsx          start-up, and every route (grouped: backend / demo data / hidden)
  pages/                     one folder per screen, named like its menu entry
    login/  facility-setup/  registration/  patient-chart/  dashboard/     connected to the backend
    opd/  ipd/  pharmacy/  billing/  roster/  payroll/                     demo data
    emergency/  supplies/  housekeeping/  audit/                           hidden (not routed)
  components/
    layout/                  the page frame (AppShell) and the menu (navigation.ts)
    ui/                      small reusable pieces: Badge, Modal, SyncStatus, AiSuggestion
    auth/RequireSession.tsx  keeps logged-out users off the app
    VitalsForm.tsx           the vitals form used by several pages
  api/                       everything that talks to the backend
    client.ts                the fetch wrapper (cookies, errors, expired login)
    endpoints.ts             every backend route, typed
    abdmSession.ts, abhaTransactions.ts   helpers for the ABHA steps
  store/
    useAuthStore.ts          login, logout, who is signed in
    useHospitalStore.ts      the app's data, assembled from the small files in slices/
    slices/                  one file per area: patients, encounters, emergency, inpatient, beds, waste,
                             pharmacy, supplies, billing, staff, roster, payroll, audit, session
  data/demoData.ts           the fake data the demo pages start with
  lib/                       small helpers: session.ts (saved login), patientHelpers.ts
  types/index.ts             the shared data types
  styles/global.css          colours, spacing and shared styles
```

Imports use `@/` to mean `src/`, for example `import { Badge } from '@/components/ui/Badge'`.
Each page file starts with a one-line note saying what it is and whether it is connected, demo, or hidden.
