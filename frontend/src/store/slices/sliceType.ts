import type { StateCreator } from 'zustand';
import type { HospitalState } from '@/store/useHospitalStore';

/** How each slice is typed: it can read and update the whole hospital state. */
export type SliceCreator<Slice> = StateCreator<HospitalState, [], [], Slice>;
