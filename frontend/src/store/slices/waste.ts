import { demoWasteBatches } from '@/data/demoData';
import { newId } from '@/store/ids';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { WasteBatch, WasteCategory } from '@/types';

/** Bio-medical waste, tracked from the ward bag to disposal (segregated, stored, pre-treated, disposed). */
export interface WasteSlice {
  wasteBatches: WasteBatch[];

  logSegregation: (category: WasteCategory, department: string, weightKg: number) => WasteBatch;
  moveToStorage: (batchId: string, location: string) => void;
  pretreatBatch: (batchId: string, method: string) => void;
  disposeBatch: (batchId: string, vendor: string, manifestNo: string) => void;
}

/** Returns the list with one batch swapped for an updated copy. */
function changeBatch(batches: WasteBatch[], batchId: string, change: (batch: WasteBatch) => WasteBatch): WasteBatch[] {
  return batches.map((batch) => (batch.id === batchId ? change(batch) : batch));
}

export const createWasteSlice: SliceCreator<WasteSlice> = (set, get) => ({
  wasteBatches: demoWasteBatches,

  logSegregation: (category, department, weightKg) => {
    const batch: WasteBatch = {
      id: newId('waste'),
      category,
      department,
      weightKg,
      stage: 'segregated',
      segregatedAt: new Date().toISOString(),
      segregatedBy: get().currentStaff.name,
    };
    set((state) => ({ wasteBatches: [...state.wasteBatches, batch] }));
    get().logAudit('Waste Segregated', `${category.toUpperCase()} bag, ${weightKg}kg — ${department}`);
    return batch;
  },

  moveToStorage: (batchId, location) => {
    const batch = get().wasteBatches.find((candidate) => candidate.id === batchId);
    if (!batch || batch.stage !== 'segregated') return;

    set((state) => ({
      wasteBatches: changeBatch(state.wasteBatches, batchId, (current) => ({
        ...current,
        stage: 'stored',
        storageLocation: location,
        storedAt: new Date().toISOString(),
      })),
    }));
    get().logAudit('Waste Moved to Storage', `${batch.category.toUpperCase()} batch -> ${location}`);
  },

  pretreatBatch: (batchId, method) => {
    const batch = get().wasteBatches.find((candidate) => candidate.id === batchId);
    if (!batch || batch.stage !== 'stored') return;

    set((state) => ({
      wasteBatches: changeBatch(state.wasteBatches, batchId, (current) => ({
        ...current,
        stage: 'pretreated',
        pretreatmentMethod: method,
        pretreatedAt: new Date().toISOString(),
        pretreatedBy: get().currentStaff.name,
      })),
    }));
    get().logAudit('Waste Pre-treated Onsite', `${batch.category.toUpperCase()} batch — ${method}`);
  },

  disposeBatch: (batchId, vendor, manifestNo) => {
    const batch = get().wasteBatches.find((candidate) => candidate.id === batchId);
    if (!batch || (batch.stage !== 'stored' && batch.stage !== 'pretreated')) return;

    set((state) => ({
      wasteBatches: changeBatch(state.wasteBatches, batchId, (current) => ({
        ...current,
        stage: 'disposed',
        disposalVendor: vendor,
        manifestNo,
        disposedAt: new Date().toISOString(),
        disposedBy: get().currentStaff.name,
      })),
    }));
    get().logAudit('Waste Handed Over for Disposal', `${batch.category.toUpperCase()} batch -> ${vendor} (manifest ${manifestNo})`);
  },
});
