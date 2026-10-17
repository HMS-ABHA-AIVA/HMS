import type { BackendPatientWithAbha, AbhaTransaction } from "@/api/endpoints";

export interface SamplePatientRow extends BackendPatientWithAbha {
  mrn: string;
  age: number;
  sex: string;
  today: string;
}

export const SAMPLE_PATIENTS: SamplePatientRow[] = [
  {
    id: "1",
    name: "Ramesh Sharma",
    mrn: "MRN-8821",
    age: 48,
    sex: "M",
    phone: "+91 98765 43210",
    email: "ramesh.sharma@example.com",
    facilityId: "fac_1",
    createdAt: new Date().toISOString(),
    abha: { abhaNumber: "14-1234-5678-9012", abhaAddress: "ramesh.sharma@abdm" },
    today: "OPD General",
  },
  {
    id: "2",
    name: "Sunita Devi",
    mrn: "MRN-8822",
    age: 36,
    sex: "F",
    phone: "+91 98111 22334",
    email: "sunita.devi@example.com",
    facilityId: "fac_1",
    createdAt: new Date().toISOString(),
    abha: null,
    today: "Cardiology",
  },
  {
    id: "3",
    name: "Mohd. Arif",
    mrn: "MRN-8823",
    age: 29,
    sex: "M",
    phone: "+91 97234 56789",
    email: "mohd.arif@example.com",
    facilityId: "fac_1",
    createdAt: new Date().toISOString(),
    abha: null,
    today: "None",
  },
  {
    id: "4",
    name: "Pooja Kulkarni",
    mrn: "MRN-8824",
    age: 52,
    sex: "F",
    phone: "+91 99887 76655",
    email: "pooja.k@example.com",
    facilityId: "fac_1",
    createdAt: new Date().toISOString(),
    abha: { abhaNumber: "14-9876-5432-1098", abhaAddress: "poojakulkarni@abdm" },
    today: "Orthopaedics",
  },
  {
    id: "5",
    name: "Ananya Sen",
    mrn: "MRN-8825",
    age: 19,
    sex: "F",
    phone: "+91 94321 09876",
    email: "ananya.sen@example.com",
    facilityId: "fac_1",
    createdAt: new Date().toISOString(),
    abha: null,
    today: "Dermatology",
  },
];

export const SAMPLE_TRANSACTIONS: AbhaTransaction[] = [
  {
    id: "txn_1",
    txnId: "TXN-ABHA-20261018-9901",
    purpose: "ENROLLMENT",
    status: "COMPLETED",
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: "txn_2",
    txnId: "TXN-ABHA-20261018-9902",
    purpose: "VERIFICATION",
    status: "COMPLETED",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];
