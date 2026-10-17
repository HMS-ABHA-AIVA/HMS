import { demoRoster } from '@/data/demoData';
import { newId } from '@/store/ids';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { RosterEntry, Shift } from '@/types';

/** Who is planned to work which shift. (What actually happened is attendance, in payroll.ts.) */
export interface RosterSlice {
  roster: RosterEntry[];

  /** Adds the assignment if it is not there yet, otherwise removes it. */
  toggleRosterAssignment: (staffId: string, date: string, shift: Shift, department: string) => void;
  /** Repeats one week's assignments in another week. Returns how many shifts were added. */
  copyWeek: (fromStartDate: string, toStartDate: string) => number;
}

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

export const createRosterSlice: SliceCreator<RosterSlice> = (set, get) => ({
  roster: demoRoster,

  toggleRosterAssignment: (staffId, date, shift, department) => {
    const existing = get().roster.find((entry) => entry.staffId === staffId && entry.date === date && entry.shift === shift);
    const staffMember = get().staff.find((person) => person.id === staffId);
    const who = staffMember?.name ?? staffId;

    if (existing) {
      set((state) => ({ roster: state.roster.filter((entry) => entry.id !== existing.id) }));
      get().logAudit('Roster Assignment Removed', `${who} — ${date} ${shift}`);
    } else {
      const entry: RosterEntry = { id: newId('ros'), staffId, date, shift, department };
      set((state) => ({ roster: [...state.roster, entry] }));
      get().logAudit('Roster Assignment Added', `${who} — ${date} ${shift} (${department})`);
    }
  },

  copyWeek: (fromStartDate, toStartDate) => {
    const from = new Date(fromStartDate);
    const to = new Date(toStartDate);
    const offsetMs = to.getTime() - from.getTime();

    const sourceDates = new Set(
      Array.from({ length: 7 }, (_, dayIndex) => {
        const day = new Date(from);
        day.setDate(day.getDate() + dayIndex);
        return toDateString(day);
      })
    );
    const sourceEntries = get().roster.filter((entry) => sourceDates.has(entry.date));

    const copies: RosterEntry[] = [];
    for (const entry of sourceEntries) {
      const newDate = toDateString(new Date(new Date(entry.date).getTime() + offsetMs));
      const alreadyPlanned = get().roster.some(
        (other) => other.staffId === entry.staffId && other.date === newDate && other.shift === entry.shift
      );
      if (alreadyPlanned) continue;
      copies.push({ id: newId('ros'), staffId: entry.staffId, date: newDate, shift: entry.shift, department: entry.department });
    }

    set((state) => ({ roster: [...state.roster, ...copies] }));
    get().logAudit('Roster Week Copied', `${fromStartDate} -> ${toStartDate} (${copies.length} shift(s))`);
    return copies.length;
  },
});
