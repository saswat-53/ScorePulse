/** Local calendar date as YYYY-MM-DD. Times are stored in UTC and shown in the user's timezone. */
export const dateKey = (iso: string | Date): string => {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export const addDays = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DayChip {
  key: string;
  dow: string;
  label: string;
}

/** Chips for a range of days relative to today. Today reads "Today". */
export const dayChips = (from: number, to: number): DayChip[] => {
  const out: DayChip[] = [];
  for (let n = from; n <= to; n++) {
    const d = addDays(n);
    out.push({
      key: dateKey(d),
      dow: n === 0 ? 'Today' : DOW[d.getDay()],
      label: `${d.getDate()} ${MONTH[d.getMonth()]}`,
    });
  }
  return out;
};

/** "Today", "Tomorrow", or a short weekday for a kickoff, used on fixture rows. */
export const dayLabel = (iso: string): string => {
  const key = dateKey(iso);
  if (key === dateKey(new Date())) return 'Today';
  if (key === dateKey(addDays(1))) return 'Tomorrow';
  return DOW[new Date(iso).getDay()];
};

export const minutesAgo = (iso: string): number =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
