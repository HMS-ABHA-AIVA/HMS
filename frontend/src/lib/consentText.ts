// Consent wording shown to the patient before any OTP is requested.
//
// ABHA_CREATE_CONSENT follows the wording NHA publishes for ABHA creation by Aadhaar (consent code
// "abha-enrollment", version 1.4, the artifact the backend sends to ABDM). NHA's M1 reviewers expect it
// shown in full; confirm it against the current NHA M1 test sheet before submission and update here if it changed.
//
// HOSPITAL_LINK_CONSENT is the hospital's own wording for linking an ABHA that already exists
// (code "hospital-abha-link", version 1.0, stored with the transaction by the backend).

/** NDHM Health Data Management Policy (the link given in NDHM's secure-development reference, annexure). Confirm it is still current. */
export const PRIVACY_POLICY_URL = "https://ndhm.gov.in/documents/HealthDataManagementPolicy";

export interface ConsentText {
  title: string;
  /** Matches the code/version the backend stores for this flow. */
  code: string;
  version: string;
  points: string[];
}

export const ABHA_CREATE_CONSENT: ConsentText = {
  title: "Consent for creating an ABHA number using Aadhaar",
  code: "abha-enrollment",
  version: "1.4",
  points: [
    "I am voluntarily sharing my Aadhaar number / Virtual ID and demographic information issued by UIDAI with the National Health Authority (NHA) for the sole purpose of creating an Ayushman Bharat Health Account number (ABHA number) and ABHA address.",
    "I understand that my ABHA number can be used and shared for purposes as may be notified by ABDM from time to time, including provision of healthcare services.",
    "I am aware that my personal identifiable information (name, address, age, date of birth, gender and photograph) may be made available to entities working in the National Digital Health Ecosystem (NDHE), such as healthcare professionals, facilities and health programmes registered with or linked to the Ayushman Bharat Digital Mission (ABDM).",
    "I authorise NHA to use my Aadhaar number for Aadhaar-based authentication with UIDAI, as per the Aadhaar Act, 2016, for the aforesaid purpose. I understand that UIDAI will share my e-KYC details, or a response of \"Yes\", with NHA upon successful authentication.",
    "I have been informed about the option of using other IDs apart from Aadhaar; however, I choose to use my Aadhaar number to avail the benefits across the NDHE.",
    "My personal identifiable information, excluding the Aadhaar number / VID number, can be used and shared for the purposes mentioned above.",
    "I reserve the right to revoke this consent at any time, as per the provisions of the Aadhaar Act and Regulations.",
  ],
};

export const HOSPITAL_LINK_CONSENT: ConsentText = {
  title: "Consent for linking an existing ABHA to this hospital record",
  code: "hospital-abha-link",
  version: "1.0",
  points: [
    "I am voluntarily asking this hospital to verify my existing ABHA with an OTP and to link it to my hospital record.",
    "I understand the hospital will retrieve my ABHA profile (name, date of birth, gender, ABHA number and ABHA address) from ABDM to confirm that it belongs to me, and will store my ABHA number and ABHA address against my record.",
    "I understand the hospital checks that the name and date of birth on my record match my ABHA, and will not link an ABHA that does not match.",
    "I can ask the hospital at any time to stop using my ABHA, and I may withdraw this consent.",
  ],
};
