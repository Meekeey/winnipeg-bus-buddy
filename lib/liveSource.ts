// The live data source: calls our own Next.js API routes (never the
// Winnipeg Transit API directly, so the API key stays on the server).

import { CLOCK_EVENT, getClockShift, setClockFromUtcOffset } from "./time";
import type { DataSource, Place, ScheduleOptions, ServiceStatus, TripTime } from "./types";

export const FRIENDLY_ERROR = "Can't reach Winnipeg Transit right now. Trying again…";

async function getJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(FRIENDLY_ERROR);
  }
  if (!response.ok) {
    let message = FRIENDLY_ERROR;
    try {
      const body = await response.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      // keep the friendly message
    }
    throw new Error(message);
  }
  return response.json();
}

// Turns a Place into the text the Trip Planner wants, e.g. "addresses/136590".
function placeToParam(place: Place): string {
  if (place.kind === "address" && place.key) return `addresses/${place.key}`;
  if (place.kind === "monument" && place.key) return `monuments/${place.key}`;
  if (place.kind === "intersection" && place.key) return `intersections/${place.key}`;
  if (place.kind === "stop" && place.key) return `stops/${place.key}`;
  return `geo/${place.lat.toFixed(5)},${place.lon.toFixed(5)}`;
}

export const liveSource: DataSource = {
  isDemo: false,

  async getStatus() {
    const status = await getJson<ServiceStatus>("/api/status");
    // Match the browser's clock to Winnipeg Transit's (see lib/time.ts).
    if (status.utcOffsetMinutes !== undefined) {
      const before = getClockShift();
      setClockFromUtcOffset(status.utcOffsetMinutes, Date.now());
      if (getClockShift() !== before) {
        window.dispatchEvent(new Event(CLOCK_EVENT)); // screens redraw their times
      }
    }
    return status;
  },

  getStopSchedule(stopNumber: number, options: ScheduleOptions = {}) {
    const query = new URLSearchParams();
    if (options.routes && options.routes.length > 0) query.set("routes", options.routes.join(","));
    if (options.minutesAhead) query.set("minutes", String(options.minutesAhead));
    const text = query.toString();
    return getJson(`/api/stops/${stopNumber}/schedule${text ? "?" + text : ""}`);
  },

  getTrip(tripKey: string) {
    return getJson(`/api/trips/${encodeURIComponent(tripKey)}`);
  },

  searchPlaces(query: string) {
    return getJson(`/api/locations?q=${encodeURIComponent(query)}`);
  },

  planTrip(origin: Place, destination: Place, when: TripTime = { mode: "now" }) {
    const query = new URLSearchParams({
      origin: placeToParam(origin),
      destination: placeToParam(destination),
    });
    if (when.mode === "depart") {
      query.set("mode", "depart-after");
      query.set("at", String(when.time));
    } else if (when.mode === "arrive") {
      query.set("mode", "arrive-before");
      query.set("at", String(when.time));
    }
    return getJson(`/api/trip-plan?${query.toString()}`);
  },
};
