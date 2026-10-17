import { newId } from '@/store/ids';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { Bill, Encounter } from '@/types';

export interface BillingSlice {
  bills: Bill[];

  /** Builds a draft bill for a visit: the base charge, plus its orders and dispensed medicines. */
  generateBill: (encounterId: string) => Bill;
  finalizeBill: (billId: string) => void;
}

// Demo price list. Real prices will come from the backend.
const BASE_CHARGE: Record<Encounter['type'], { label: string; rate: number }> = {
  IPD: { label: 'Bed / Ward Charges', rate: 3500 },
  OPD: { label: 'OPD Consultation Fee', rate: 600 },
  ER: { label: 'Emergency Consultation & Triage Fee', rate: 900 },
};
const TEST_RATE = 450;
const MEDICINE_RATE = 120;
const MEDICINE_GST_PERCENT = 12;

export const createBillingSlice: SliceCreator<BillingSlice> = (set, get) => ({
  bills: [],

  generateBill: (encounterId) => {
    const encounter = get().encounters.find((visit) => visit.id === encounterId);
    if (!encounter) throw new Error('encounter not found');

    const baseCharge = BASE_CHARGE[encounter.type];
    const items = [
      { label: baseCharge.label, qty: 1, rate: baseCharge.rate, gstPct: 0 },
      ...encounter.orders.map((order) => ({
        label: `${order.type === 'lab' ? 'Lab Test' : 'Radiology'}: ${order.name}`,
        qty: 1,
        rate: TEST_RATE,
        gstPct: 0,
      })),
      ...encounter.prescriptions
        .filter((prescription) => prescription.dispensed)
        .map((prescription) => ({
          label: `Pharmacy: ${prescription.drugName}`,
          qty: 1,
          rate: MEDICINE_RATE,
          gstPct: MEDICINE_GST_PERCENT,
        })),
    ];

    const bill: Bill = {
      id: newId('bill'),
      encounterId,
      patientId: encounter.patientId,
      items,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ bills: [...state.bills, bill] }));
    get().logAudit('Bill Generated', `Encounter ${encounterId}`);
    return bill;
  },

  finalizeBill: (billId) => {
    const bill = get().bills.find((item) => item.id === billId);
    set((state) => ({
      bills: state.bills.map((item) => (item.id === billId ? { ...item, status: 'finalized' } : item)),
      encounters: state.encounters.map((visit) =>
        visit.id === bill?.encounterId ? { ...visit, billed: true, status: 'billed' } : visit
      ),
    }));
    get().logAudit('Bill Finalized', billId);
  },
});
