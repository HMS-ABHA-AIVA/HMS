import { PRIVACY_POLICY_URL, type ConsentText } from "@/lib/consentText";

/** Shows the full consent wording and a tick box. The Send OTP button stays blocked until it is ticked. */
export function ConsentBox({
  consent,
  checked,
  onChange,
  disabled,
}: {
  consent: ConsentText;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{consent.title}</div>
      <div
        style={{
          maxHeight: 150,
          overflowY: "auto",
          border: "1px solid var(--line-2)",
          background: "var(--paper)",
          padding: "8px 12px",
          fontSize: 12,
          color: "var(--text-dim)",
        }}
        tabIndex={0}
        aria-label={consent.title}
      >
        <p style={{ margin: "0 0 6px" }}>I hereby declare that:</p>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          {consent.points.map((point) => (
            <li key={point} style={{ marginBottom: 4 }}>
              {point}
            </li>
          ))}
        </ol>
      </div>
      <label style={{ display: "flex", gap: 8, fontSize: 12.5, marginTop: 8, alignItems: "flex-start" }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        <span>
          The patient has read (or had read to them) and agrees to the consent above, and has been told about the{" "}
          <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
            Terms and Data Privacy Policy (ABDM Health Data Management Policy)
          </a>
          .
        </span>
      </label>
    </div>
  );
}
