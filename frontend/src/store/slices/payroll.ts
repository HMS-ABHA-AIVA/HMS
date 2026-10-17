import { demoAttendance } from '@/data/demoData';
import { newId } from '@/store/ids';
import type { SliceCreator } from '@/store/slices/sliceType';
import type { AttendanceEntry, AttendanceStatus, PayrollLineItem, PayrollRun, Shift } from '@/types';

/** Attendance and monthly pay runs. */
export interface PayrollSlice {
  attendance: AttendanceEntry[];
  payrollRuns: PayrollRun[];

  markAttendance: (staffId: string, date: string, shift: Shift, status: AttendanceStatus) => void;
  generatePayrollRun: (month: string) => PayrollRun;
  updatePayrollLineDeduction: (runId: string, staffId: string, deductions: number) => void;
  finalizePayrollRun: (runId: string) => void;
  markPayrollPaid: (runId: string) => void;
}

const WORKING_DAYS_PER_MONTH = 26;

/** Returns the list with one pay run swapped for an updated copy. */
function changeRun(runs: PayrollRun[], runId: string, change: (run: PayrollRun) => PayrollRun): PayrollRun[] {
  return runs.map((run) => (run.id === runId ? change(run) : run));
}

export const createPayrollSlice: SliceCreator<PayrollSlice> = (set, get) => ({
  attendance: demoAttendance,
  payrollRuns: [],

  markAttendance: (staffId, date, shift, status) => {
    set((state) => {
      const existing = state.attendance.find((entry) => entry.staffId === staffId && entry.date === date && entry.shift === shift);
      if (existing) {
        return { attendance: state.attendance.map((entry) => (entry.id === existing.id ? { ...entry, status } : entry)) };
      }
      const entry: AttendanceEntry = { id: newId('att'), staffId, date, shift, status };
      return { attendance: [...state.attendance, entry] };
    });
  },

  generatePayrollRun: (month) => {
    const { staff, attendance, encounters } = get();

    const lines: PayrollLineItem[] = staff.map((member) => {
      // Visiting doctors are paid per finished OPD consultation.
      if (member.employmentType === 'visiting_fee') {
        const consultCount = encounters.filter(
          (visit) =>
            visit.doctorId === member.id &&
            visit.type === 'OPD' &&
            visit.createdAt.startsWith(month) &&
            (visit.status === 'closed' || visit.status === 'billed')
        ).length;
        const grossPay = consultCount * (member.feePerConsult ?? 0);
        return {
          staffId: member.id,
          staffName: member.name,
          role: member.role,
          employmentType: member.employmentType,
          daysPresent: 0,
          doubleShiftDays: 0,
          workingDays: 0,
          consultCount,
          grossPay,
          deductions: 0,
          netPay: grossPay,
        };
      }

      // Attendance is per shift, so a date with more than one shift marked present/half-day is a
      // double shift: it counts for more than one day of pay.
      const monthAttendance = attendance.filter((entry) => entry.staffId === member.id && entry.date.startsWith(month));
      const creditByDate = new Map<string, number>();
      for (const entry of monthAttendance) {
        const credit = entry.status === 'present' ? 1 : entry.status === 'half_day' ? 0.5 : 0;
        creditByDate.set(entry.date, (creditByDate.get(entry.date) ?? 0) + credit);
      }
      // With no attendance recorded at all, assume a full month.
      const daysPresent = monthAttendance.length
        ? [...creditByDate.values()].reduce((total, credit) => total + credit, 0)
        : WORKING_DAYS_PER_MONTH;
      const doubleShiftDays = [...creditByDate.values()].filter((credit) => credit > 1).length;
      const grossPay = Math.round(((member.monthlySalary ?? 0) * daysPresent) / WORKING_DAYS_PER_MONTH);
      return {
        staffId: member.id,
        staffName: member.name,
        role: member.role,
        employmentType: member.employmentType,
        daysPresent,
        doubleShiftDays,
        workingDays: WORKING_DAYS_PER_MONTH,
        consultCount: 0,
        grossPay,
        deductions: 0,
        netPay: grossPay,
      };
    });

    const run: PayrollRun = {
      id: newId('pay'),
      month,
      generatedAt: new Date().toISOString(),
      generatedBy: get().currentStaff.name,
      status: 'draft',
      lines,
    };
    set((state) => ({ payrollRuns: [run, ...state.payrollRuns] }));
    get().logAudit('Payroll Run Generated', `${month} — ${lines.length} staff`);
    return run;
  },

  updatePayrollLineDeduction: (runId, staffId, deductions) => {
    set((state) => ({
      payrollRuns: changeRun(state.payrollRuns, runId, (run) => ({
        ...run,
        lines: run.lines.map((line) => (line.staffId === staffId ? { ...line, deductions, netPay: line.grossPay - deductions } : line)),
      })),
    }));
  },

  finalizePayrollRun: (runId) => {
    set((state) => ({ payrollRuns: changeRun(state.payrollRuns, runId, (run) => ({ ...run, status: 'finalized' })) }));
    get().logAudit('Payroll Run Finalized', runId);
  },

  markPayrollPaid: (runId) => {
    set((state) => ({ payrollRuns: changeRun(state.payrollRuns, runId, (run) => ({ ...run, status: 'paid' })) }));
    get().logAudit('Payroll Run Marked Paid', runId);
  },
});
