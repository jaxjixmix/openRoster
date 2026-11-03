import {
  addDays,
  differenceInMinutes,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const DEFAULT_TZ = "America/Los_Angeles";

// PocketBase returns "YYYY-MM-DD HH:mm:ss.sssZ"; Safari wants the T separator.
export function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return new Date(value.includes("T") ? value : value.replace(" ", "T"));
}

export function todayIn(tz: string): string {
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
}

export function addDaysStr(date: string, days: number): string {
  return format(addDays(parseISO(date + "T00:00:00"), days), "yyyy-MM-dd");
}

export function weekStart(date: string, weekStartsOn = 1): string {
  return format(
    startOfWeek(parseISO(date + "T00:00:00"), { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 }),
    "yyyy-MM-dd",
  );
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysStr(start, i));
}

export function weekdayShort(date: string): string {
  return format(parseISO(date + "T00:00:00"), "EEE");
}

export function weekdayLong(date: string): string {
  return format(parseISO(date + "T00:00:00"), "EEEE");
}

export function monthDay(date: string): string {
  return format(parseISO(date + "T00:00:00"), "MMM d");
}

export function longDate(date: string): string {
  return format(parseISO(date + "T00:00:00"), "EEEE, MMMM d");
}

export function todayLabel(date: string): string {
  return format(parseISO(date + "T00:00:00"), "MMM d, yyyy");
}

export function formatTime(iso: string, tz: string): string {
  return formatInTimeZone(toDate(iso), tz, "h:mm a");
}

export function formatTimeShort(iso: string, tz: string): string {
  return formatInTimeZone(toDate(iso), tz, "h:mm");
}

export function formatDateTime(iso: string, tz: string): string {
  return formatInTimeZone(toDate(iso), tz, "MMM d, h:mm a");
}

export function formatDate(iso: string, tz: string): string {
  return formatInTimeZone(toDate(iso), tz, "MMM d, yyyy");
}

export function minutesFromMidnight(iso: string, tz: string): number {
  const [h, m] = formatInTimeZone(toDate(iso), tz, "HH:mm")
    .split(":")
    .map(Number);
  return h * 60 + m;
}

export function durationHours(start: string, end: string): number {
  return Math.max(0, differenceInMinutes(toDate(end), toDate(start)) / 60);
}

export function durationLabel(start: string, end: string): string {
  const mins = differenceInMinutes(toDate(end), toDate(start));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function toUtcIso(date: string, time: string, tz: string): string {
  return fromZonedTime(`${date} ${time}:00`, tz).toISOString();
}

export function dateInTz(iso: string, tz: string): string {
  return formatInTimeZone(toDate(iso), tz, "yyyy-MM-dd");
}

export function timeInTz(iso: string, tz: string): string {
  return formatInTimeZone(toDate(iso), tz, "HH:mm");
}

export function tzOffsetForDate(date: string, tz: string): number {
  const utcMidnight = Date.parse(date + "T00:00:00Z");
  const zonedMidnight = fromZonedTime(date + "T00:00:00", tz).getTime();
  return Math.round((utcMidnight - zonedMidnight) / 60000);
}

export function tzOffsets(weekStartDate: string, tz: string): number[] {
  return weekDates(weekStartDate).map((date) => tzOffsetForDate(date, tz));
}

export function nextShift<T extends { starts_at: string; ends_at: string }>(
  shifts: T[],
): T | undefined {
  const now = Date.now();
  return [...shifts]
    .filter((s) => toDate(s.ends_at).getTime() > now)
    .sort(
      (a, b) =>
        toDate(a.starts_at).getTime() - toDate(b.starts_at).getTime(),
    )[0];
}

export function isWithinDays(
  iso: string,
  tz: string,
  days: number,
): boolean {
  const d = toDate(iso).getTime();
  const now = Date.now();
  return d >= now - 86400000 && d <= now + days * 86400000;
}

export { formatInTimeZone };
