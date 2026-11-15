"use client";
import { formatDay, getWinnipegParts, winnipegMidnight } from "@/lib/time";
import { IconButton } from "./pixel/Buttons";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_DAYS_AHEAD = 6;

type Props = {
  value: number; // epoch ms
  onChange: (value: number) => void;
};

// The next 5-minute mark from now (a tidy starting value).
export function nextFiveMinutes(now: number): number {
  const step = 5 * MINUTE;
  return Math.ceil(now / step) * step;
}

// Pick a day and a time with chunky arrow buttons (Winnipeg time).
export function WhenPicker({ value, onChange }: Props) {
  const parts = getWinnipegParts(value);
  const isAm = parts.hour < 12;
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;

  // How many days after today the chosen day is.
  const daysAhead = Math.round((winnipegMidnight(value) - winnipegMidnight(Date.now())) / DAY);
  let dayName = formatDay(value);
  if (daysAhead === 0) dayName = "Today";
  if (daysAhead === 1) dayName = "Tomorrow";

  // Changes the time but stays on the same day (11 PM + 1 hour wraps to 12 AM).
  function changeTimeOfDay(byMs: number) {
    const dayStart = winnipegMidnight(value);
    const timeOfDay = (((value - dayStart + byMs) % DAY) + DAY) % DAY;
    onChange(dayStart + timeOfDay);
  }

  return (
    <div className="when-picker">
      <div className="when-row">
        <IconButton icon="arrow" rotate={180} label="Earlier day" disabled={daysAhead <= 0} onClick={() => onChange(value - DAY)} />
        <span className="when-day">
          <span className="when-day-name">{dayName}</span>
          {daysAhead <= 1 && <span className="when-day-date">{formatDay(value)}</span>}
        </span>
        <IconButton icon="arrow" label="Later day" disabled={daysAhead >= MAX_DAYS_AHEAD} onClick={() => onChange(value + DAY)} />
      </div>

      <div className="when-row">
        <div className="when-column">
          <IconButton icon="arrow" rotate={-90} label="Hour up" onClick={() => changeTimeOfDay(HOUR)} />
          <span className="when-number" aria-label={`Hour ${hour12}`}>{hour12}</span>
          <IconButton icon="arrow" rotate={90} label="Hour down" onClick={() => changeTimeOfDay(-HOUR)} />
        </div>
        <span className="when-number when-colon" aria-hidden="true">:</span>
        <div className="when-column">
          <IconButton icon="arrow" rotate={-90} label="5 minutes later" onClick={() => changeTimeOfDay(5 * MINUTE)} />
          <span className="when-number" aria-label={`Minute ${parts.minute}`}>{String(parts.minute).padStart(2, "0")}</span>
          <IconButton icon="arrow" rotate={90} label="5 minutes earlier" onClick={() => changeTimeOfDay(-5 * MINUTE)} />
        </div>
        <div className="when-column when-ampm">
          <button type="button" className={`chip ${isAm ? "chip-on" : ""}`} aria-pressed={isAm} onClick={() => !isAm && changeTimeOfDay(-12 * HOUR)}>
            AM
          </button>
          <button type="button" className={`chip ${!isAm ? "chip-on" : ""}`} aria-pressed={!isAm} onClick={() => isAm && changeTimeOfDay(12 * HOUR)}>
            PM
          </button>
        </div>
      </div>
    </div>
  );
}
