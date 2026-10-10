const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCalendarDate(value: string) {
  const match = datePattern.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function advanceDate(isoDate: string, frequency: "monthly" | "quarterly" | "yearly") {
  const parsed = parseCalendarDate(isoDate);
  if (!parsed) throw new Error("Invalid calendar date");
  const [yearText, monthText, dayText] = parsed.split("-");
  let year = Number(yearText);
  let month = Number(monthText);
  const day = Number(dayText);
  const step = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  month += step;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  const limit = daysInMonth(year, month);
  const nextDay = day > limit ? limit : day;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
}

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number) {
  const parsed = parseCalendarDate(isoDate);
  if (!parsed || !Number.isInteger(days)) throw new Error("Invalid calendar date");
  const [yearText, monthText, dayText] = parsed.split("-");
  const utc = Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText) + days);
  return new Date(utc).toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeap(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function isLeap(year: number) {
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}
