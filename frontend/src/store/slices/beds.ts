import { demoBeds } from '@/data/demoData';
import { newId } from '@/store/ids';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { Bed, HousekeepingLogEntry } from '@/types';

/** Ward beds and the cleaning that gets a bed ready again. Admissions are in inpatient.ts. */
export interface BedsSlice {
  beds: Bed[];
  housekeepingLog: HousekeepingLogEntry[];

  startCleaning: (bedId: string) => void;
  completeCleaning: (bedId: string) => void;
}

export const createBedsSlice: SliceCreator<BedsSlice> = (set, get) => ({
  beds: demoBeds,
  housekeepingLog: [],

  startCleaning: (bedId) => {
    const bed = get().beds.find((candidate) => candidate.id === bedId);
    if (!bed || bed.status !== 'dirty') return;

    set((state) => ({
      beds: state.beds.map((other) =>
        other.id === bedId ? { ...other, status: 'cleaning', statusSince: new Date().toISOString() } : other
      ),
      housekeepingLog: [
        { id: newId('hk'), bedId, action: 'cleaning_started', at: new Date().toISOString(), by: get().currentStaff.name },
        ...state.housekeepingLog,
      ],
    }));
    get().logAudit('Bed Cleaning Started', `${bed.ward} ${bed.bedNo}`);
  },

  completeCleaning: (bedId) => {
    const bed = get().beds.find((candidate) => candidate.id === bedId);
    if (!bed || bed.status !== 'cleaning') return;

    set((state) => ({
      beds: state.beds.map((other) =>
        other.id === bedId ? { ...other, status: 'vacant', statusSince: new Date().toISOString() } : other
      ),
      housekeepingLog: [
        { id: newId('hk'), bedId, action: 'cleaning_completed', at: new Date().toISOString(), by: get().currentStaff.name },
        ...state.housekeepingLog,
      ],
    }));
    get().logAudit('Bed Cleaning Completed', `${bed.ward} ${bed.bedNo} — ready for next patient`);
  },
});
