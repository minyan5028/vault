/** `yearMonth` denormalization key (see docs/DATA_MODEL.md), e.g. "2026-07". */
export function yearMonthOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
