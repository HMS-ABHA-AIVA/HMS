import { prisma } from "../../config/db.js";
import { recordAudit } from "../../common/utils/audit.js";

// The hospital's own billing and print settings. Only values the hospital has changed are stored; anything not set
// falls back to the default here.
export const DEFAULT_CONSENT_TEXT =
  "I, the patient / the patient's representative named above, consent to the admission, examination, investigations and treatment advised by " +
  "the treating doctors of this hospital. The nature of the illness, the proposed treatment and its usual risks and alternatives have been " +
  "explained to me in a language I understand, and I have had the chance to ask questions. I understand that I may withdraw this consent for " +
  "any treatment that has not yet been given. I will pay the hospital's charges as per the tariff, and I have been told that the estimate may " +
  "change as my condition requires. I have given correct information about the patient's identity and medical history.";

export interface Settings {
  /** Fee for a doctor who has no fee of their own. */
  opdDefaultFee: number;
  /** Emergency consultation and triage fee. */
  erFee: number;
  /** What a test ordered as free text (not in the test master) is charged. */
  unlistedTestPrice: number;
  /** What a dispensed medicine that is not in the stock list is charged per unit (an MRP: it includes the GST below). */
  unlistedMedicinePrice: number;
  /** GST on a medicine that is not in the stock list. */
  medicineGstPct: number;
  /** A bed day ends at this hour (0-23): staying past it on a later date charges another day. */
  bedDayCheckoutHour: number;
  gstin: string;
  registrationNo: string;
  drugLicenseNo: string;
  /** When on, a lab or radiology report must be signed by someone other than the person who entered the results. */
  requireReportVerification: boolean;
  consentText: string;
  billFooter: string;
}

export const SETTING_DEFAULTS: Settings = {
  opdDefaultFee: 600,
  erFee: 900,
  unlistedTestPrice: 450,
  unlistedMedicinePrice: 120,
  medicineGstPct: 12,
  bedDayCheckoutHour: 12,
  gstin: "",
  registrationNo: "",
  drugLicenseNo: "",
  requireReportVerification: false,
  consentText: DEFAULT_CONSENT_TEXT,
  billFooter: "This is a computer generated document.",
};

const KEYS: Record<keyof Settings, string> = {
  opdDefaultFee: "opd_default_fee",
  erFee: "er_fee",
  unlistedTestPrice: "unlisted_test_price",
  unlistedMedicinePrice: "unlisted_medicine_price",
  medicineGstPct: "medicine_gst_pct",
  bedDayCheckoutHour: "bed_day_checkout_hour",
  gstin: "gstin",
  registrationNo: "registration_no",
  drugLicenseNo: "drug_license_no",
  requireReportVerification: "require_report_verification",
  consentText: "consent_text",
  billFooter: "bill_footer",
};

export const getSettings = async (facilityId: string): Promise<Settings> => {
  const rows = await prisma.hospitalSetting.findMany({ where: { facilityId } });
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const settings: Record<string, unknown> = { ...SETTING_DEFAULTS };

  for (const [name, key] of Object.entries(KEYS)) {
    const raw = stored.get(key);
    if (raw === undefined) continue;
    const kind = typeof SETTING_DEFAULTS[name as keyof Settings];
    settings[name] = kind === "number" ? Number(raw) : kind === "boolean" ? raw === "true" : raw;
  }
  return settings as unknown as Settings;
};

export const updateSettings = async (facilityId: string, actor: string, change: { [K in keyof Settings]?: Settings[K] | undefined }): Promise<Settings> => {
  const names = (Object.keys(change) as (keyof Settings)[]).filter((name) => change[name] !== undefined);

  await prisma.$transaction(async (tx) => {
    for (const name of names) {
      const value = String(change[name]);
      await tx.hospitalSetting.upsert({
        where: { facilityId_key: { facilityId, key: KEYS[name] } },
        create: { facilityId, key: KEYS[name], value },
        update: { value },
      });
    }
    if (names.length) await recordAudit(tx, facilityId, actor, "Hospital Settings Updated", names.join(", "));
  });

  return getSettings(facilityId);
};
