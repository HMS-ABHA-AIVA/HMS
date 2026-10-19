# Merging the OSHealth prototype into the M1 project

Source: `C:\Users\ayush\Documents\OSHEALTH` (`aiva-oshealth-api-main` and `aiva-oshealth-main`).
Target: this repository (`backend/` Express + Prisma, `frontend/` React).
Goal: one project with every M1 requirement (kept exactly as it is) plus the prototype's hospital features.

## What the prototype is

| | Prototype API | Prototype app |
|---|---|---|
| Size | about 12,400 lines of source, 1,100 lines of SQL, 5,500 lines of tests | about 15,800 lines |
| Data layer | Raw SQL with `pg` (PGlite in tests), 14 numbered SQL migrations, **52 tables** | Zustand store plus 16 API modules |
| Tenancy | One PostgreSQL **schema per hospital**, platform console for hospitals | Platform screen |
| Sign-in | Hospital code + username + password, **7 roles** (front office, doctor, nurse, pharmacist, biller, housekeeping, admin), platform admins | Role-aware menus |
| ABDM | Its own M1 module (about 2,000 lines) with a built-in ABDM simulator | ABHA step wired to the API |
| Runtime | Node 24, `tsx` in production | Vite |

### Feature inventory (API modules, lines)
ABDM M1 2021, pharmacy 1226, encounters (OPD, ER, IPD visits, vitals, prescriptions, orders, discharge) 853, lab and radiology 807,
IPD (bed stays, charges, running bill) 704, OPD billing (invoices, panels, refunds) 681, masters (settings, services, tests, rates, Rx templates) 632,
drug catalog and lookup 570, AI assist 518, platform 445, billing 428, auth and roles 385, payroll 271, patients 197, beds 195, panels 148, staff 142,
supplies 130, waste 127, messaging 102, roster 91, facility 80, dashboard 70.

## What this project already has (kept untouched)

Prisma models: Facility, User, Patient, AbhaPatient, AbhaTransaction, AbhaAuditLog, PatientShare, ShareTokenCounter.
All M1 flows (create, four link methods, profile, QR, card, contact update, Scan & Share, audit), the security hardening, the dashboard,
and a frontend that is an older copy of the prototype's UI: IPD, pharmacy, billing, payroll, roster, supplies, housekeeping, emergency and audit
pages exist but run on demo data or are not routed.

## Conflicts that need a decision

1. **Data layer.** Prisma (here) vs raw SQL (prototype).
2. **Tenancy.** Here: one database, rows scoped by `facilityId`. Prototype: one schema per hospital.
3. **Patients and staff exist in both.** Two `patients` tables and two staff/user tables with different ids and rules.
4. **Sign-in and roles.** Here: facility owner and staff, no roles. Prototype: 7 roles enforced per route.
5. **ABDM M1 exists in both.** Ours is verified against the live sandbox. The prototype's is only tested against its simulator, and its own notes mark several formats as unconfirmed.
6. **Hosting.** The prototype notes that ABDM's sandbox blocked a Render server in Singapore and recommends hosting in India. This project's Render service is in Singapore.

## Recommended approach: port, module by module, into this codebase

Port each prototype module into `backend/` on Prisma, scoped by `facilityId`, with this project's `User` gaining a `role`. Bring the prototype's
tests across as Prisma-backed tests. In the frontend, switch each existing demo page to the real API one module at a time.

Why: it ends with one patient table, one login, one ABDM implementation and one place for each rule. Mounting the prototype next to this code would be faster
but leaves two logins, two patient records per person and two ABDM clients, which is hard to certify and to maintain.

### Safeguards
- Migrations are additive only: new tables, and new nullable columns on existing ones. No existing column is changed or removed.
- Existing routes are not edited except to add role checks that default to allowing today's users.
- Each stage ends with: type-check, M1 regression run (create, link by each method, profile, QR, card, Scan & Share, dashboard), prototype tests for that module, one commit.
- ABDM M1 code stays this project's. From the prototype, keep only what is missing: HFR / HPR ids, readiness page, ABDM API log, the simulator for tests.
- Nothing is deployed from a half-finished stage: stages are small and each leaves the app working.

### Progress
- **Stage 0 (foundation): done.** Roles on logins, staff table, hospital settings, facility profile, general audit log, per-hospital counters, patient MRNs, allergies and problem list; Staff, Hospital settings and Audit log screens; 27 backend tests.

### Stages
| # | Stage | Content |
|---|---|---|
| 0 | Foundation | `role` on User, role middleware, staff profile fields (department, HPR id, fee), hospital settings, shared audit log, error shape |
| 1 | Clinical core | Beds and wards, encounters (OPD, ER, IPD), vitals, prescriptions, orders, discharge summary |
| 2 | Masters and panels | Services, investigations, panels and rates, Rx templates |
| 3 | OPD billing | Invoices, payments, refunds, slips, tokens, multi-doctor visits |
| 4 | IPD and billing | Bed stays, charges, advances, running and final bill |
| 5 | Pharmacy and drugs | Stock, purchases, sales, GST, ward medicine round, drug catalog |
| 6 | Lab and radiology | Orders, results, reports, amendments, lab invoices |
| 7 | Operations | Supplies, waste, housekeeping, roster, attendance, payroll, messaging |
| 8 | AI assist and documents | Consult assist, discharge drafts, attachments |
| 9 | Platform (optional) | Multi-hospital console, only if wanted |

Frontend work goes with each stage: wire the matching pages in `frontend/src/pages/` to `api/endpoints.ts` and remove their demo data.

### Effort
This is a large programme, in the order of 30,000 lines to port and 5,000 lines of tests. It cannot be done in one pass; it is done stage by stage,
and each stage is usable on its own.
