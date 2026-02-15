import type { DailyTrafficPoint, MonthPeriod, WeeklyTrafficRow } from "./types";

const MONTH_KEY_REGEX = /^(\d{4})-(\d{2})$/;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftMonth(date: Date, offset: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function parseMonthOverride(monthOverride: string): Date {
  const match = monthOverride.match(MONTH_KEY_REGEX);
  if (!match) {
    throw new Error("month must use YYYY-MM format");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error("month must be between 01 and 12");
  }
  return new Date(Date.UTC(year, month - 1, 1));
}

export function buildMonthPeriod(now: Date, monthOverride?: string): MonthPeriod {
  const targetMonthStart = monthOverride
    ? parseMonthOverride(monthOverride)
    : shiftMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), -1);

  const targetMonthEnd = shiftMonth(targetMonthStart, 1);
  const previousMonthStart = shiftMonth(targetMonthStart, -1);
  const previousMonthEnd = targetMonthStart;

  return {
    monthKey: toIsoDate(targetMonthStart).slice(0, 7),
    startDate: toIsoDate(targetMonthStart),
    endDateExclusive: toIsoDate(targetMonthEnd),
    prevMonthKey: toIsoDate(previousMonthStart).slice(0, 7),
    prevStartDate: toIsoDate(previousMonthStart),
    prevEndDateExclusive: toIsoDate(previousMonthEnd),
    startDateTime: `${toIsoDate(targetMonthStart)}T00:00:00Z`,
    endDateTimeExclusive: `${toIsoDate(targetMonthEnd)}T00:00:00Z`,
    prevStartDateTime: `${toIsoDate(previousMonthStart)}T00:00:00Z`,
    prevEndDateTimeExclusive: `${toIsoDate(previousMonthEnd)}T00:00:00Z`
  };
}

export function formatMonthLabel(monthKey: string, timezone: string): string {
  const date = new Date(`${monthKey}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: timezone
  }).format(date);
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function buildWeeklyBreakdown(
  daily: DailyTrafficPoint[],
  startDate: string,
  endDateExclusive: string
): WeeklyTrafficRow[] {
  const byDate = new Map<string, DailyTrafficPoint>();
  for (const item of daily) {
    byDate.set(item.date, item);
  }

  const rows: WeeklyTrafficRow[] = [];
  let weekIndex = 1;
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const monthEnd = new Date(`${endDateExclusive}T00:00:00Z`);

  while (cursor < monthEnd) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    if (weekEnd > monthEnd) {
      weekEnd.setTime(monthEnd.getTime());
    }

    let requests = 0;
    let uniques = 0;
    let bytes = 0;

    const dayCursor = new Date(weekStart);
    while (dayCursor < weekEnd) {
      const key = toIsoDate(dayCursor);
      const point = byDate.get(key);
      if (point) {
        requests += point.requests;
        uniques += point.uniques;
        bytes += point.bytes;
      }
      dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
    }

    const weekEndLabelDate = new Date(weekEnd);
    weekEndLabelDate.setUTCDate(weekEndLabelDate.getUTCDate() - 1);

    rows.push({
      label: `Week ${weekIndex} (${formatDay(weekStart)} - ${formatDay(weekEndLabelDate)})`,
      requests,
      uniques,
      bytes
    });

    cursor = weekEnd;
    weekIndex += 1;
  }

  return rows;
}
