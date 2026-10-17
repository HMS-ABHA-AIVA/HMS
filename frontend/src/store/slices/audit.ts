import { newId } from '@/store/ids';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { AuditEntry } from '@/types';

const MAX_ENTRIES = 200;

export interface AuditSlice {
  auditLog: AuditEntry[];
  /** Records who did what. Every other slice calls this after it changes something. */
  logAudit: (action: string, detail: string) => void;
}

export const createAuditSlice: SliceCreator<AuditSlice> = (set, get) => ({
  auditLog: [],

  logAudit: (action, detail) => {
    const entry: AuditEntry = {
      id: newId('audit'),
      at: new Date().toISOString(),
      user: get().currentStaff.name,
      action,
      detail,
    };
    set((state) => ({ auditLog: [entry, ...state.auditLog].slice(0, MAX_ENTRIES) }));
  },
});
