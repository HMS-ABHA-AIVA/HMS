import { useState } from "react";
import { updatePatient, type AbdmEnvironment, type BackendPatientWithAbha, type FullAbhaProfile } from "@/api/endpoints";
import { mapApiError, type MappedErrorState } from "@/lib/errorHelper";
import { StopState } from "@/pages/ErrorStates";
import { ContactUpdate } from "@/components/ContactUpdate";

const GENDER_LABEL: Record<string, string> = { M: "Male", F: "Female", O: "Other", MALE: "Male", FEMALE: "Female", OTHER: "Other" };
const genderLabel = (value: unknown) =>
  typeof value === "string" && value ? (GENDER_LABEL[value.trim().toUpperCase()] ?? value) : undefined;

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : undefined);

const photoSrc = (value: unknown) => {
  const raw = text(value);
  if (!raw) return undefined;
  return raw.startsWith("data:") ? raw : `data:image/jpeg;base64,${raw}`;
};

/**
 * Full ABHA profile after verification, plus the hospital's own contact/address fields.
 * Name, date of birth and gender are fixed once verified; the other hospital fields can be edited and are saved
 * against the patient. The mobile / email on the ABHA itself are changed through an OTP (ContactUpdate).
 */
export function AbhaProfileDetails({
  patient,
  liveProfile,
  environment,
  onPatientUpdated,
  onAbhaContactUpdated,
}: {
  patient: BackendPatientWithAbha;
  liveProfile: FullAbhaProfile | null;
  environment: AbdmEnvironment;
  onPatientUpdated: (patient: BackendPatientWithAbha) => void;
  onAbhaContactUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<MappedErrorState | null>(null);
  const [contactEdit, setContactEdit] = useState<"mobile" | "email" | null>(null);
  const [form, setForm] = useState({ phone: "", email: "", address: "", stateName: "", districtName: "" });

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function startEditing() {
    setForm({
      phone: patient.phone ?? "",
      email: patient.email ?? "",
      address: patient.address ?? "",
      stateName: patient.stateName ?? "",
      districtName: patient.districtName ?? "",
    });
    setError(null);
    setEditing(true);
  }

  async function save() {
    setError(null);
    if (!/^\d{10}$/.test(form.phone)) {
      setError({ tone: "error", title: "Invalid mobile number", body: "Mobile number must be exactly 10 digits." });
      return;
    }
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) {
      setError({ tone: "error", title: "Invalid email address", body: "Enter a valid email address, or leave it empty." });
      return;
    }

    // Only what changed is sent.
    const changes: Parameters<typeof updatePatient>[1] = {};
    if (form.phone !== (patient.phone ?? "")) changes.phone = form.phone;
    if (form.email !== (patient.email ?? "")) changes.email = form.email;
    if (form.address !== (patient.address ?? "")) changes.address = form.address;
    if (form.stateName !== (patient.stateName ?? "")) changes.stateName = form.stateName;
    if (form.districtName !== (patient.districtName ?? "")) changes.districtName = form.districtName;
    if (Object.keys(changes).length === 0) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const res = await updatePatient(patient.id, changes);
      onPatientUpdated({ ...patient, ...res.data, abha: patient.abha ?? null });
      setEditing(false);
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setSaving(false);
    }
  }

  const photo = photoSrc(liveProfile?.profilePhoto);
  const abhaGender = genderLabel(liveProfile?.gender);
  const recordGender = genderLabel(patient.gender);
  const locked = <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-faint)" }}>(fixed)</span>;

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: "18px 0 6px" }}>ABHA profile</h3>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {photo && (
          <img
            src={photo}
            alt="Photo on the ABHA"
            width={72}
            height={72}
            style={{ objectFit: "cover", border: "1px solid var(--line-2)", flex: "none" }}
          />
        )}
        <div className="kv" style={{ flex: 1 }}>
          <div className="k">Name</div>
          <div>
            {text(liveProfile?.name) ?? patient.name}
            {locked}
          </div>
          <div className="k">Date of birth</div>
          <div>
            {text(liveProfile?.dob) ?? patient.dateOfBirth ?? "—"}
            {locked}
          </div>
          <div className="k">Gender</div>
          <div>
            {abhaGender ?? recordGender ?? "—"}
            {locked}
          </div>
          <div className="k">Mobile on ABHA</div>
          <div>{text(liveProfile?.mobile) ?? "—"}</div>
          <div className="k">Email on ABHA</div>
          <div>{text(liveProfile?.email) ?? "—"}</div>
          <div className="k">Address</div>
          <div>{text(liveProfile?.address) ?? "—"}</div>
          <div className="k">District</div>
          <div>{text(liveProfile?.districtName) ?? "—"}</div>
          <div className="k">State</div>
          <div>{text(liveProfile?.stateName) ?? "—"}</div>
          <div className="k">KYC</div>
          <div>{liveProfile?.kycVerified === true ? "Verified with Aadhaar" : liveProfile?.kycVerified === false ? "Not verified" : "—"}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, margin: "8px 0 4px" }}>
        <button className="btn btn-ghost" type="button" onClick={() => setContactEdit(contactEdit === "mobile" ? null : "mobile")}>
          Update ABHA mobile
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => setContactEdit(contactEdit === "email" ? null : "email")}>
          Update ABHA email
        </button>
      </div>
      {contactEdit && (
        <ContactUpdate
          key={contactEdit}
          patientId={patient.id}
          type={contactEdit}
          environment={environment}
          initialValue={contactEdit === "mobile" ? (patient.phone ?? "") : (patient.email ?? "")}
          intro="Needs the ABHA to have been verified in this session."
          onDone={onAbhaContactUpdated}
          onCancel={() => setContactEdit(null)}
        />
      )}

      <h3 style={{ fontSize: 14, margin: "22px 0 6px" }}>Hospital record</h3>
      <p className="osh-sub" style={{ margin: "0 0 8px" }}>
        Name, date of birth and gender cannot be changed once verified against the ABHA. The rest can be edited and is saved with this patient.
      </p>
      {error && (
        <div style={{ marginBottom: 10 }}>
          <StopState {...error} />
        </div>
      )}
      {!editing ? (
        <>
          <div className="kv">
            <div className="k">Name</div>
            <div>
              {patient.name}
              {locked}
            </div>
            <div className="k">Date of birth</div>
            <div>
              {patient.dateOfBirth ?? "—"}
              {locked}
            </div>
            <div className="k">Gender</div>
            <div>
              {recordGender ?? "—"}
              {locked}
            </div>
            <div className="k">Mobile</div>
            <div>{patient.phone ? `+91 ${patient.phone}` : "—"}</div>
            <div className="k">Email</div>
            <div>{patient.email ?? "—"}</div>
            <div className="k">Address</div>
            <div>{patient.address ?? "—"}</div>
            <div className="k">District</div>
            <div>{patient.districtName ?? "—"}</div>
            <div className="k">State</div>
            <div>{patient.stateName ?? "—"}</div>
          </div>
          <button className="btn btn-ghost" type="button" onClick={startEditing}>
            Edit contact and address
          </button>
        </>
      ) : (
        <div style={{ maxWidth: 420 }}>
          <div className="field">
            <label>Mobile</label>
            <div className="mobile-wrap">
              <span className="mobile-prefix">+91</span>
              <input
                className="input mono"
                inputMode="numeric"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                disabled={saving}
              />
            </div>
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} disabled={saving} />
          </div>
          <div className="field">
            <label>Address</label>
            <input className="input" maxLength={300} value={form.address} onChange={(e) => set("address", e.target.value)} disabled={saving} />
          </div>
          <div className="field">
            <label>District</label>
            <input className="input" maxLength={80} value={form.districtName} onChange={(e) => set("districtName", e.target.value)} disabled={saving} />
          </div>
          <div className="field">
            <label>State</label>
            <input className="input" maxLength={80} value={form.stateName} onChange={(e) => set("stateName", e.target.value)} disabled={saving} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="btn-link" type="button" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
