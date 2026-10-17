import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequireSession } from '@/components/auth/RequireSession';
import { LoginPage } from '@/pages/login/LoginPage';
import { FacilitySetupPage } from '@/pages/facility-setup/FacilitySetupPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { RegistrationPage } from '@/pages/registration/RegistrationPage';
import { PatientChartPage } from '@/pages/patient-chart/PatientChartPage';
import { OpdQueuePage } from '@/pages/opd/OpdQueuePage';
import { ConsultationPage } from '@/pages/opd/ConsultationPage';
import { BedBoardPage } from '@/pages/ipd/BedBoardPage';
import { IpdPatientPage } from '@/pages/ipd/IpdPatientPage';
import { PharmacyPage } from '@/pages/pharmacy/PharmacyPage';
import { BillingPage } from '@/pages/billing/BillingPage';
import { PayrollPage } from '@/pages/payroll/PayrollPage';
import { RosterPage } from '@/pages/roster/RosterPage';

// Hidden for now: these pages need backend support first. Their code is still in src/pages/.
// To bring one back, uncomment its import here, its route below, and its entry in
// src/components/layout/navigation.ts.
// import { EmergencyPage } from '@/pages/emergency/EmergencyPage';
// import { ErCasePage } from '@/pages/emergency/ErCasePage';
// import { SuppliesPage } from '@/pages/supplies/SuppliesPage';
// import { HousekeepingPage } from '@/pages/housekeeping/HousekeepingPage';
// import { WasteManagementPage } from '@/pages/housekeeping/WasteManagementPage';
// import { AuditPage } from '@/pages/audit/AuditPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* The facility owner's login only gets the setup page. */}
        <Route element={<RequireSession kind="facility" />}>
          <Route element={<AppShell />}>
            <Route path="/facility-setup" element={<FacilitySetupPage />} />
          </Route>
        </Route>

        {/* Staff logins get the hospital screens. */}
        <Route element={<RequireSession kind="staff" />}>
          <Route element={<AppShell />}>
            {/* Connected to the backend (the dashboard also shows some demo figures). */}
            <Route path="/" element={<DashboardPage />} />
            <Route path="/registration" element={<RegistrationPage />} />
            <Route path="/emr/:patientId" element={<PatientChartPage />} />

            {/* Running on demo data until the backend supports them. */}
            <Route path="/opd" element={<OpdQueuePage />} />
            <Route path="/opd/consult/:encounterId" element={<ConsultationPage />} />
            <Route path="/ipd" element={<BedBoardPage />} />
            <Route path="/ipd/patient/:encounterId" element={<IpdPatientPage />} />
            <Route path="/pharmacy" element={<PharmacyPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/roster" element={<RosterPage />} />

            {/* Hidden for now (see the imports above).
            <Route path="/emergency" element={<EmergencyPage />} />
            <Route path="/emergency/case/:encounterId" element={<ErCasePage />} />
            <Route path="/supplies" element={<SuppliesPage />} />
            <Route path="/housekeeping" element={<HousekeepingPage />} />
            <Route path="/housekeeping/waste" element={<WasteManagementPage />} />
            <Route path="/audit" element={<AuditPage />} />
            */}
          </Route>
        </Route>

        {/* Anything else, including hidden pages, goes to the dashboard. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
