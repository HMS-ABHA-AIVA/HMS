export function StopState({ tone, title, body, action }: {
  tone: "error" | "pending" | "none"; title: string; body: string; action?: { label: string; onClick?: () => void; ghost?: boolean };
}) {
  return (
    <div className="err-card">
      <div className="t">{tone !== "none" && <span className={`dot ${tone}`} />}{title}</div>
      <p>{body}</p>
      {action && <button className={`btn ${action.ghost ? "btn-ghost" : "btn-primary"}`} onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

// Design reference board — the real app renders these states inline in the flows, mapped from HTTP codes.
export function ErrorGallery() {
  return (
    <main className="osh-main">
      <h1 className="osh-h1">When something goes wrong</h1>
      <p className="osh-sub">Each message says what happened and what to do next. Wording for errors that come from the server will use the server's own message.</p>
      <div className="err-gallery">
        <div className="err-grid">
          <StopState tone="error" title="The OTP was not accepted" body="Check the 6 digits with the patient. The code stays valid for 10 minutes. After that, start again from the Aadhaar number." action={{ label: "Try the OTP again" }} />
          <StopState tone="error" title="Cannot reach the server" body="Nothing was saved. Check your internet connection and that the hospital server is running, then try again." action={{ label: "Try again" }} />
          <StopState tone="pending" title="You have been signed out" body="Your sign-in has run out. Sign in again to carry on. Anything you had not saved will need to be entered again." action={{ label: "Sign in" }} />
          <StopState tone="error" title="Meera Iyer already has an ABHA" body="A patient can have only one ABHA on their record. Open the record to see it, or go back and pick another patient." action={{ label: "Open patient record", ghost: true }} />
          <StopState tone="error" title="No ABDM details for Sandbox" body="This hospital has no ABDM client ID saved for the Sandbox environment. Ask the facility owner to add it in Facility setup." action={{ label: "Back to patients", ghost: true }} />
          <StopState tone="none" title="No patients yet" body="Patients you register will appear here, with their ABHA status. Start with the first one." action={{ label: "Register patient" }} />
        </div>
      </div>
    </main>
  );
}
