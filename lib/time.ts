// Time helpers: status labels, "16 MIN" vs "1:20 PM", and Winnipeg time zone.

export const WINNIPEG_TZ = "America/Winnipeg";
const MINUTE = 60 * 1000;

export type StatusLabel = "Early" | "On time" | "Late" | "Scheduled" | "Cancelled";

// delay = estimated - scheduled
export function getStatusLabel(scheduled: number, estimated: number, cancelled = false): StatusLabel {
  if (cancelled) return "Cancelled";
  if (estimated === scheduled) return "Scheduled"; // maybe no live GPS right now
  const delayMinutes = (estimated - scheduled) / MINUTE;
  if (delayMinutes < -1) return "Early";
  if (delayMinutes > 5) return "Late";
  return "On time";
}

export function minutesUntil(time: number, now: number): number {
  return Math.max(0, Math.round((time - now) / MINUTE));
}

const clockFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: WINNIPEG_TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

// "1:20 PM" in Winnipeg time
export function formatClock(time: number): string {
  return clockFormat.format(new Date(time + clockShift)).replace("a.m.", "AM").replace("p.m.", "PM");
}

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: WINNIPEG_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
});

// "Sun, Nov 15" in Winnipeg time
export function formatDay(time: number): string {
  return dayFormat.format(new Date(time + clockShift)).replace(/\./g, "");
}

// --- clock shift ---
// Winnipeg Transit's own clock is the one that matters. It can differ from
// the time-zone data built into Node or the browser (for example when
// daylight-saving rules change before software is updated). Every API answer
// carries "query-time" (the API's local time right now), so we compare that
// with our own idea of Winnipeg time and keep the difference here, in ms.
let clockShift = 0;

// Fired on window (in the browser) when the clock shift changes, so screens redraw.
export const CLOCK_EVENT = "busbuddy-clock";

export function getClockShift(): number {
  return clockShift;
}

export function setClockShift(shift: number): void {
  clockShift = shift;
}

// Winnipeg's distance from UTC according to the built-in time-zone data, in ms.
function databaseOffset(time: number): number {
  const p = partsAt(time);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(time / 1000) * 1000;
}

// Winnipeg's real distance from UTC in minutes (for example -300), as
// Winnipeg Transit's clock has it. The server sends this to the browser.
export function getUtcOffsetMinutes(now: number): number {
  return Math.round((databaseOffset(now) + clockShift) / MINUTE);
}

// The browser's time-zone data can be newer or older than the server's, so
// it works out its own shift from the real offset instead of copying the server's.
export function setClockFromUtcOffset(offsetMinutes: number, now: number): void {
  clockShift = offsetMinutes * MINUTE - databaseOffset(now);
}

// queryTime example: "2026-11-15T13:09:42". Returns the shift in ms.
export function clockShiftFromQueryTime(queryTime: string, now: number): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(queryTime);
  if (!match) return 0;
  const apiLocal = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]);
  const p = partsAt(now);
  const ourLocal = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  // Real shifts are whole half-hours. Anything else is network delay.
  const halfHour = 30 * MINUTE;
  const shift = Math.round((apiLocal - ourLocal) / halfHour) * halfHour;
  if (Math.abs(shift) > 3 * 60 * MINUTE) return 0; // nonsense: ignore it
  return shift;
}

// Under 30 minutes: "16 MIN". Otherwise: "1:20 PM".
export function formatArrival(time: number, now: number): string {
  const minutes = (time - now) / MINUTE;
  if (minutes < 30) {
    const whole = Math.max(0, Math.round(minutes));
    if (whole === 0) return "DUE";
    return `${whole} MIN`;
  }
  return formatClock(time);
}

// --- Winnipeg local time <-> epoch (the API uses local times with no zone) ---

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: WINNIPEG_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function getWinnipegParts(time: number): LocalParts {
  return partsAt(time + clockShift);
}

// Winnipeg date and time according to the built-in time-zone data only.
function partsAt(time: number): LocalParts {
  const result: Record<string, number> = {};
  for (const part of partsFormat.formatToParts(new Date(time))) {
    if (part.type !== "literal") result[part.type] = Number(part.value);
  }
  return result as unknown as LocalParts;
}

// How far Winnipeg is from UTC at this moment, in ms (negative number).
function winnipegOffset(time: number): number {
  const p = getWinnipegParts(time);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(time / 1000) * 1000;
}

// "2026-11-15T12:30:00" (Winnipeg local) -> epoch ms
export function winnipegLocalToEpoch(local: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(local);
  if (!match) return NaN;
  const asUtc = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] ?? 0));
  // Guess with the offset at that moment, then check once more (handles DST changes).
  let guess = asUtc - winnipegOffset(asUtc);
  guess = asUtc - winnipegOffset(guess);
  return guess;
}

// epoch ms -> "2026-11-15T12:30:00" (Winnipeg local)
export function epochToWinnipegLocal(time: number): string {
  const p = getWinnipegParts(time);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${two(p.month)}-${two(p.day)}T${two(p.hour)}:${two(p.minute)}:${two(p.second)}`;
}

// Epoch ms of midnight (start of today) in Winnipeg.
export function winnipegMidnight(time: number): number {
  const p = getWinnipegParts(time);
  const two = (n: number) => String(n).padStart(2, "0");
  return winnipegLocalToEpoch(`${p.year}-${two(p.month)}-${two(p.day)}T00:00:00`);
}
