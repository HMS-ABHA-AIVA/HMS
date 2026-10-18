import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireSession } from "@/components/auth/RequireSession";
import { SignIn } from "@/pages/SignIn";
import { FacilitySetup } from "@/pages/FacilitySetup";
import { Dashboard } from "@/pages/Dashboard";
import { PatientList } from "@/pages/PatientList";
import { RegisterPatient } from "@/pages/RegisterPatient";
import { PatientRecord } from "@/pages/PatientRecord";
import { OpdQueue } from "@/pages/OpdQueue";
import { SharedProfiles } from "@/pages/SharedProfiles";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<SignIn />} />

        {/* The facility owner's login gets the facility setup page */}
        <Route element={<RequireSession kind="facility" />}>
          <Route path="/facility-setup" element={<FacilitySetup />} />
        </Route>

        {/* Staff logins get the hospital screens */}
        <Route element={<RequireSession kind="staff" />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/registration" element={<PatientList />} />
          <Route path="/register" element={<RegisterPatient />} />
          <Route path="/shared-profiles" element={<SharedProfiles />} />
          <Route path="/record/:patientId" element={<PatientRecord />} />
          <Route path="/emr/:patientId" element={<PatientRecord />} />

          {/* Demo modules */}
          <Route path="/opd" element={<OpdQueue />} />
          <Route path="/beds" element={<OpdQueue />} />
          <Route path="/pharmacy" element={<OpdQueue />} />
          <Route path="/billing" element={<OpdQueue />} />
          <Route path="/payroll" element={<OpdQueue />} />
          <Route path="/roster" element={<OpdQueue />} />

        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
