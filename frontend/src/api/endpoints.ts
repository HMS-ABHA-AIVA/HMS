// Every backend route the frontend calls, in one place. Paths follow the backend
// README's API table; request/response shapes follow its routes and zod validators.
// If the backend changes, this is the file to update.
import { get, post } from '@/api/client';

export type AbdmEnvironment = 'SANDBOX' | 'PRODUCTION';

/** Facility routes answer `success: true`, the ABHA routes answer `status: 'success'`. */
interface Envelope<T> {
  message: string;
  data: T;
}

// ---- Facility (facility JWT) -------------------------------------------------

export interface FacilityInfo {
  name: string;
  email: string;
  hfrId: string;
}

export const registerFacility = (body: { name: string; email: string; hfrId: string; password: string }) =>
  post<Envelope<FacilityInfo>>('/facility/register', body);

export const loginFacility = (body: { email: string; password: string }) =>
  post<Envelope<FacilityInfo>>('/facility/login', body);

export const logoutFacility = () => post<Envelope<never>>('/facility/logout');

export const addAbdmDetails = (body: { clientId: string; clientSecret: string; environment: AbdmEnvironment }) =>
  post<Envelope<{ facilityId: string; clientId: string }>>('/facility/add-abdm-details', body);

export const createStaffAccount = (body: { name: string; email: string; password: string }) =>
  post<Envelope<{ id: string; name: string; email: string; facilityId: string }>>('/facility/create-admin', body);

// ---- Staff (user JWT) --------------------------------------------------------

export interface StaffInfo {
  id: string;
  name: string;
  email: string;
}

export const loginStaff = (body: { email: string; password: string }) =>
  post<Envelope<StaffInfo>>('/user/admin/login', body);

export const logoutStaff = () => post<Envelope<never>>('/user/admin/logout');

// ---- Patients (user JWT) -----------------------------------------------------

export interface BackendPatient {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  facilityId: string;
  createdAt: string;
}

export const createPatient = (body: { name: string; phone: string; email?: string }) =>
  post<Envelope<BackendPatient>>('/patient/create', body);

/** A patient as returned by GET /patient, with their ABHA record when linked. */
export interface BackendPatientWithAbha extends BackendPatient {
  abha?: { abhaNumber: string; abhaAddress?: string | null } | null;
}

export const listPatients = () => get<Envelope<BackendPatientWithAbha[]>>('/patient');

/** ABHA transaction fields we rely on; `id` is the internal id the verify routes expect. */
export interface AbhaTransaction {
  id: string;
  txnId?: string;
  purpose?: 'ENROLLMENT' | 'VERIFICATION';
  status?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  expiresAt?: string;
  createdAt?: string;
}

/** Newest first. */
export const listPatientTransactions = (patientId: string) =>
  get<Envelope<AbhaTransaction[]>>(`/patient/${patientId}/transactions`);

// ---- ABHA / ABDM M1 (user JWT + abdm cookies from /abha/retrieve) -------------

export const retrieveAbdmToken = (environment: AbdmEnvironment) => post<{ message: string }>('/abha/retrieve', { environment });

export const requestAbhaCreateOtp = (body: { patientId: string; aadhaar: string; environment: AbdmEnvironment }) =>
  post<Envelope<{ txnId: string; transactionId: string }>>('/abha/create/aadhar/request', body);

export interface AbhaProfile {
  abhaNumber: string;
  abhaAddress: string | null;
}

export const verifyAbhaCreateOtp = (body: {
  transactionId: string;
  otp: string;
  mobile: string;
  environment: AbdmEnvironment;
}) => post<Envelope<AbhaProfile & { patientId: string; isNew: boolean }>>('/abha/create/aadhar/verify', body);

export const requestAbhaLinkOtp = (body: { patientId: string; aadhaar: string; environment: AbdmEnvironment }) =>
  post<Envelope<{ transactionId: string }>>('/abha/verify/aadhar/request', body);

export const confirmAbhaLink = (body: { transactionId: string; otp: string; environment: AbdmEnvironment }) =>
  post<Envelope<AbhaProfile & { patientId: string; transactionId: string }>>('/abha/verify/aadhar/confirm', body);

// Mobile verification flow (Step 1, Step 2, Step 3)
export const requestAbhaMobileOtp = (body: { patientId: string; mobile: string; environment: AbdmEnvironment }) =>
  post<Envelope<{ transactionId: string; txnId: string }>>('/abha/verify/mobile/request', body);

export interface AbhaAccountItem {
  ABHANumber: string;
  preferredAbhaAddress?: string;
  name?: string;
  gender?: string;
  dob?: string;
  status?: string;
  [key: string]: unknown;
}

export const confirmAbhaMobileOtp = (body: { transactionId: string; otp: string; environment: AbdmEnvironment }) =>
  post<Envelope<{ transactionId: string; txnId: string; token: string; accounts: AbhaAccountItem[] }>>('/abha/verify/mobile/confirm', body);

export const verifyAbhaMobileUser = (body: { abhaNumber: string; transactionId: string; environment: AbdmEnvironment }) =>
  post<Envelope<{
    transactionId: string;
    abhaNumber: string;
    abhaAddress: string | null;
    name?: string;
    gender?: string;
    dob?: string;
    kycVerified?: boolean;
  }>>('/abha/verify/mobile/user', body);

// ABHA profile and live QR code
export interface FullAbhaProfile {
  ABHANumber?: string;
  preferredAbhaAddress?: string;
  name?: string;
  gender?: string;
  dob?: string;
  address?: string;
  kycVerified?: boolean;
  [key: string]: unknown;
}

export const getAbhaProfile = (environment: AbdmEnvironment = 'SANDBOX') =>
  get<Envelope<FullAbhaProfile>>(`/abha/profile?environment=${environment}`);

import { getBlob } from '@/api/client';
export const getAbhaQrCodeBlob = (environment: AbdmEnvironment = 'SANDBOX') =>
  getBlob(`/abha/profile/qr?environment=${environment}`);

