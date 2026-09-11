export interface TableDef {
  id: string;
  label: string;
  capacity: number;
  row: number;
}

export interface TimeSlot {
  id: string;
  label: string;
  start: string;
}

export const MAX_SEATS = 6;
export const MAX_BOOKING_DAYS = 14;

export const TABLES: TableDef[] = [
  { id: 'T1', label: 'T1', capacity: 2, row: 0 },
  { id: 'T2', label: 'T2', capacity: 2, row: 0 },
  { id: 'T3', label: 'T3', capacity: 4, row: 1 },
  { id: 'T4', label: 'T4', capacity: 4, row: 1 },
  { id: 'T5', label: 'T5', capacity: 6, row: 2 },
  { id: 'T6', label: 'T6', capacity: 4, row: 3 },
  { id: 'T7', label: 'T7', capacity: 6, row: 3 },
  { id: 'B1', label: 'Bar ', capacity: 1, row: 4 },
  { id: 'B2', label: 'Bar ', capacity: 1, row: 4 },
];

export const SLOT_STARTS: Record<string, string> = {
  lunch1: '12:00',
  lunch2: '13:30',
  dinner1: '18:00',
  dinner2: '19:30',
};

export const TIME_SLOTS: TimeSlot[] = [
  { id: 'lunch1', label: '12:00 – 1:30 PM', start: '12:00' },
  { id: 'lunch2', label: '1:30 – 3:00 PM', start: '13:30' },
  { id: 'dinner1', label: '6:00 – 7:30 PM', start: '18:00' },
  { id: 'dinner2', label: '7:30 – 9:00 PM', start: '19:30' },
];