import { demoStaff } from '@/data/demoData';
import { newId } from '@/store/ids';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { Staff } from '@/types';

/** The hospital's staff directory (doctors, nurses and so on). Logins are separate: see the auth store. */
export interface StaffSlice {
  staff: Staff[];

  addStaff: (data: Omit<Staff, 'id'>) => Staff;
  updatePayInfo: (
    staffId: string,
    data: Partial<Pick<Staff, 'employmentType' | 'monthlySalary' | 'feePerConsult' | 'bankAccountLast4'>>
  ) => void;
}

export const createStaffSlice: SliceCreator<StaffSlice> = (set, get) => ({
  staff: demoStaff,

  addStaff: (data) => {
    const member: Staff = { ...data, id: newId('st') };
    set((state) => ({ staff: [...state.staff, member] }));
    get().logAudit('Staff Added', `${member.name} — ${member.role}`);
    return member;
  },

  updatePayInfo: (staffId, data) => {
    const member = get().staff.find((person) => person.id === staffId);
    if (!member) return;

    set((state) => ({
      staff: state.staff.map((person) => (person.id === staffId ? { ...person, ...data } : person)),
    }));
    get().logAudit('Pay Setup Updated', member.name);
  },
});
