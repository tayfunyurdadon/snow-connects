export interface SlotDef {
  id: string; // also stored as slot_time in DB
  start: string;
  end: string;
  label: string;
}

export const TIME_SLOTS: SlotDef[] = [
  { id: "09:00", start: "09:00", end: "09:50", label: "09:00 – 09:50" },
  { id: "10:00", start: "10:00", end: "10:50", label: "10:00 – 10:50" },
  { id: "11:00", start: "11:00", end: "11:50", label: "11:00 – 11:50" },
  { id: "12:00", start: "12:00", end: "12:50", label: "12:00 – 12:50" },
  { id: "13:00", start: "13:00", end: "13:50", label: "13:00 – 13:50" },
  { id: "14:00", start: "14:00", end: "14:50", label: "14:00 – 14:50" },
  { id: "15:00", start: "15:00", end: "15:50", label: "15:00 – 15:50" },
  { id: "16:00", start: "16:00", end: "16:50", label: "16:00 – 16:50" },
];

export function slotLabel(id: string): string {
  return TIME_SLOTS.find((s) => s.id === id)?.label ?? id;
}
