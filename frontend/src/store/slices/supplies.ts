import { demoSupplies } from '@/data/demoData';
import { newId } from '@/store/ids';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { Supply, SupplyLogEntry } from '@/types';

/** Non-drug stock such as gloves, linen and stationery. */
export interface SuppliesSlice {
  supplies: Supply[];
  supplyLog: SupplyLogEntry[];

  issueSupply: (supplyId: string, qty: number, department: string) => void;
  restockSupply: (supplyId: string, qty: number) => void;
  addSupply: (data: Omit<Supply, 'id' | 'lastRestockedAt'>) => Supply;
}

export const createSuppliesSlice: SliceCreator<SuppliesSlice> = (set, get) => ({
  supplies: demoSupplies,
  supplyLog: [],

  issueSupply: (supplyId, qty, department) => {
    const supply = get().supplies.find((item) => item.id === supplyId);
    if (!supply || qty <= 0) return;

    const logEntry: SupplyLogEntry = {
      id: newId('splog'),
      supplyId,
      type: 'issue',
      qty,
      department,
      at: new Date().toISOString(),
      by: get().currentStaff.name,
    };
    set((state) => ({
      supplies: state.supplies.map((item) => (item.id === supplyId ? { ...item, stock: Math.max(0, item.stock - qty) } : item)),
      supplyLog: [logEntry, ...state.supplyLog],
    }));
    get().logAudit('Supply Issued', `${supply.name} x${qty} -> ${department}`);
  },

  restockSupply: (supplyId, qty) => {
    const supply = get().supplies.find((item) => item.id === supplyId);
    if (!supply || qty <= 0) return;

    const logEntry: SupplyLogEntry = {
      id: newId('splog'),
      supplyId,
      type: 'restock',
      qty,
      department: supply.location,
      at: new Date().toISOString(),
      by: get().currentStaff.name,
    };
    set((state) => ({
      supplies: state.supplies.map((item) =>
        item.id === supplyId ? { ...item, stock: item.stock + qty, lastRestockedAt: new Date().toISOString() } : item
      ),
      supplyLog: [logEntry, ...state.supplyLog],
    }));
    get().logAudit('Supply Restocked', `${supply.name} +${qty}`);
  },

  addSupply: (data) => {
    const supply: Supply = { ...data, id: newId('sup'), lastRestockedAt: new Date().toISOString() };
    set((state) => ({ supplies: [...state.supplies, supply] }));
    get().logAudit('Supply Item Added', supply.name);
    return supply;
  },
});
