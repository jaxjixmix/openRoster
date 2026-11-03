import {
  addDays,
  addMonths,
  differenceInMinutes,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { enUS, enGB, enAU, fr, de, es, ptBR, type Locale } from "date-fns/locale";

export const DEFAULT_TZ = "America/Los_Angeles";

const LOCALES: Record<string, Locale> = { "en-US": enUS, "en-GB": enGB, "en-AU": enAU, "fr-FR": fr, "de-DE": de, "es-ES": es, "pt-BR": ptBR };
let currentLocale = enUS;

export function setLocale(code: string) {
  currentLocale = LOCALES[code] || enUS;
}

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
  return format(parseISO(date + "T00:00:00"), "EEE", { locale: currentLocale });
}

export function weekdayLong(date: string): string {
  return format(parseISO(date + "T00:00:00"), "EEEE", { locale: currentLocale });
}

export type ScheduleView = "day" | "week" | "2weeks" | "4weeks" | "month";

export interface ScheduleRange {
  start: string;
  end: string;
  days: string[];
}

export function addMonthsStr(date: string, months: number): string {
  return format(addMonths(parseISO(date + "T00:00:00"), months), "yyyy-MM-dd");
}

export function monthYear(date: string): string {
  return format(parseISO(date + "T00:00:00"), "MMMM yyyy", { locale: currentLocale });
}

export function scheduleRange(anchor: string, view: ScheduleView, weekStartsOn = 1): ScheduleRange {
  if (view === "day") {
    return { start: anchor, end: addDaysStr(anchor, 1), days: [anchor] };
  }
  if (view === "month") {
    const first = `${anchor.slice(0, 7)}-01`;
    const [year, month] = first.split("-").map(Number);
    const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const start = weekStart(first, weekStartsOn);
    const end = addDaysStr(weekStart(addDaysStr(nextMonth, -1), weekStartsOn), 7);
    const days: string[] = [];
    for (let day = start; day < end; day = addDaysStr(day, 1)) days.push(day);
    return { start, end, days };
  }
  const length = view === "week" ? 7 : view === "2weeks" ? 14 : 28;
  const start = weekStart(anchor, weekStartsOn);
  const end = addDaysStr(start, length);
  const days: string[] = [];
  for (let day = start; day < end; day = addDaysStr(day, 1)) days.push(day);
  return { start, end, days };
}

export function monthDay(date: string): string {
  return format(parseISO(date + "T00:00:00"), "MMM d", { locale: currentLocale });
}

export function longDate(date: string): string {
  return format(parseISO(date + "T00:00:00"), "EEEE, MMMM d", { locale: currentLocale });
}

export function todayLabel(date: string): string {
  return format(parseISO(date + "T00:00:00"), "MMM d, yyyy", { locale: currentLocale });
}

export function formatTime(iso: string, tz: string): string {
  return formatInTimeZone(toDate(iso), tz, "h:mm a", { locale: currentLocale });
}

export function formatTimeShort(iso: string, tz: string): string {
  return formatInTimeZone(toDate(iso), tz, "h:mm", { locale: currentLocale });
}

export function formatDateTime(iso: string, tz: string): string {
  return formatInTimeZone(toDate(iso), tz, "MMM d, h:mm a", { locale: currentLocale });
}

export function formatDate(iso: string, tz: string): string {
  return formatInTimeZone(toDate(iso), tz, "MMM d, yyyy", { locale: currentLocale });
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

export { tzOffsetForDate, tzOffsets } from "./tz.js";

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
