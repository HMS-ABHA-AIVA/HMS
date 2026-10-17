import { demoDrugs } from '@/data/demoData';
import { changeEncounter } from '@/store/slices/encounters';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { Drug } from '@/types';

export interface PharmacySlice {
  drugs: Drug[];

  /** Hands over one prescribed drug: marks it dispensed and takes one unit out of stock. */
  dispensePrescription: (encounterId: string, prescriptionId: string) => void;
}

export const createPharmacySlice: SliceCreator<PharmacySlice> = (set, get) => ({
  drugs: demoDrugs,

  dispensePrescription: (encounterId, prescriptionId) => {
    const prescription = get()
      .encounters.find((visit) => visit.id === encounterId)
      ?.prescriptions.find((item) => item.id === prescriptionId);

    set((state) => ({
      encounters: changeEncounter(state.encounters, encounterId, (visit) => ({
        ...visit,
        prescriptions: visit.prescriptions.map((item) => (item.id === prescriptionId ? { ...item, dispensed: true } : item)),
      })),
      drugs: state.drugs.map((drug) =>
        prescription && drug.name === prescription.drugName ? { ...drug, stock: Math.max(0, drug.stock - 1) } : drug
      ),
    }));
    get().logAudit('Prescription Dispensed', prescription?.drugName ?? prescriptionId);
  },
});
