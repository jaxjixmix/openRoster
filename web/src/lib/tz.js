import { fromZonedTime } from "date-fns-tz";

export function tzOffsetForDate(date, tz) {
  const utcMidnight = Date.parse(date + "T00:00:00Z");
  const zonedMidnight = fromZonedTime(date + "T00:00:00", tz).getTime();
  return Math.round((utcMidnight - zonedMidnight) / 60000);
}

export function tzOffsets(weekStartDate, tz) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(new Date(weekStartDate + "T00:00:00Z").getTime() + index * 86400000)
      .toISOString()
      .slice(0, 10);
    return tzOffsetForDate(date, tz);
  });
}
