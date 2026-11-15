// Server-only: turns raw Winnipeg Transit JSON (hyphenated keys) into the
// simple shapes in lib/types.ts. Written carefully so a missing field
// doesn't crash the app.

import { epochToWinnipegLocal, winnipegLocalToEpoch } from "../time";
import type {
  Arrival, Place, PlanSegment, ServiceStatus, StopSchedule, TripPlan, TripSchedule, TripStop,
} from "../types";

// The API sometimes sends booleans as the text "true" / "false".
function toBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Most services give full times ("2026-11-15T13:42:54"), but Trip Schedules
// give only the time of day ("13:42:54"). baseDate ("2026-11-15") fills in the day.
function toEpoch(text: string, baseDate: string): number {
  if (text.includes("T")) return winnipegLocalToEpoch(text);
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match || !baseDate) return NaN;
  const hours = Number(match[1]);
  const extraDays = Math.floor(hours / 24); // "25:10" would mean 1:10 the next day
  const hourText = String(hours % 24).padStart(2, "0");
  return winnipegLocalToEpoch(`${baseDate}T${hourText}:${match[2]}:${match[3] ?? "00"}`) + extraDays * DAY;
}

// Reads times.arrival / times.departure. Uses arrival when present.
function readTimes(times: any, baseDate = ""): { scheduled: number; estimated: number } | undefined {
  const source = times?.arrival ?? times?.departure;
  if (!source?.scheduled) return undefined;
  const scheduled = toEpoch(String(source.scheduled), baseDate);
  const estimated = source.estimated ? toEpoch(String(source.estimated), baseDate) : scheduled;
  if (Number.isNaN(scheduled)) return undefined;
  return { scheduled, estimated: Number.isNaN(estimated) ? scheduled : estimated };
}

// Variant keys look like "330-0-M": the part before the first dash is the route.
function routeFromVariantKey(key: unknown): string {
  return String(key ?? "").split("-")[0];
}

export function normalizeStopSchedule(raw: any): StopSchedule {
  const schedule = raw["stop-schedule"] ?? {};
  const arrivals: Arrival[] = [];

  for (const routeSchedule of schedule["route-schedules"] ?? []) {
    const route = routeSchedule.route ?? {};
    for (const item of routeSchedule["scheduled-stops"] ?? []) {
      const times = readTimes(item.times);
      if (!times) continue;
      arrivals.push({
        tripKey: String(item["trip-key"] ?? item.key ?? ""),
        routeId: String(route.number ?? route.key ?? routeFromVariantKey(item.variant?.key)),
        destination: String(item.variant?.name ?? route.name ?? ""),
        scheduled: times.scheduled,
        estimated: times.estimated,
        cancelled: toBoolean(item.cancelled),
        busKey: item.bus?.key !== undefined ? String(item.bus.key) : undefined,
      });
    }
  }

  arrivals.sort((a, b) => a.estimated - b.estimated);
  return {
    stopNumber: Number(schedule.stop?.number ?? schedule.stop?.key ?? 0),
    stopName: String(schedule.stop?.name ?? ""),
    arrivals,
  };
}

export function normalizeTrip(raw: any, tripKey: string): TripSchedule {
  const trip = raw.trip ?? {};
  const stops: TripStop[] = [];

  // Trip times have no date, so start from today's date on the API's clock.
  const queryTime = String(raw["query-time"] ?? "");
  const baseDate = queryTime.length >= 10 ? queryTime.slice(0, 10) : epochToWinnipegLocal(Date.now()).slice(0, 10);

  for (const item of trip["scheduled-stops"] ?? []) {
    const times = readTimes(item.times, baseDate);
    if (!times) continue;
    const geographic = item.stop?.centre?.geographic;
    stops.push({
      stopNumber: Number(item.stop?.number ?? item.stop?.key ?? 0),
      stopName: String(item.stop?.name ?? ""),
      lat: geographic ? Number(geographic.latitude) : undefined,
      lon: geographic ? Number(geographic.longitude) : undefined,
      scheduled: times.scheduled,
      estimated: times.estimated,
      cancelled: toBoolean(item.cancelled),
    });
  }

  // A trip that runs past midnight: later stops belong to the next day.
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].scheduled < stops[i - 1].scheduled - 12 * HOUR) {
      stops[i].scheduled += DAY;
      stops[i].estimated += DAY;
    }
  }
  // Just after midnight a late trip still belongs to "yesterday" (and just
  // before midnight an early trip belongs to "tomorrow"). Pick the day that
  // puts the trip closest to now.
  if (stops.length > 0) {
    const now = Date.now();
    let shift = 0;
    if (stops[0].scheduled - now > 12 * HOUR) shift = -DAY;
    else if (now - stops[stops.length - 1].scheduled > 12 * HOUR) shift = DAY;
    for (const stop of stops) {
      stop.scheduled += shift;
      stop.estimated += shift;
    }
  }

  return {
    tripKey,
    routeId: routeFromVariantKey(trip.variant?.key),
    destination: String(trip.variant?.name ?? ""),
    busKey: trip.bus?.key !== undefined ? String(trip.bus.key) : undefined,
    // The trip this same bus does next (used when a bus changes its route number).
    nextTripKey: trip["next-trip-key"] !== undefined && trip["next-trip-key"] !== null ? String(trip["next-trip-key"]) : undefined,
    stops,
  };
}

export function normalizeStatus(raw: any): ServiceStatus {
  const status = raw.status ?? {};
  const value = String(status.value ?? "regular");
  return {
    value,
    message: String(status.message ?? ""),
    // "esp-1", "esp-2", "esp-3" = Emergency Service Plan levels
    isEmergency: value.toLowerCase().startsWith("esp"),
  };
}

export function normalizePlaces(raw: any): Place[] {
  const places: Place[] = [];
  for (const item of raw.locations ?? []) {
    const centre = item.centre?.geographic ?? item.address?.centre?.geographic;
    if (!centre) continue;
    const lat = Number(centre.latitude);
    const lon = Number(centre.longitude);

    if (item.type === "address") {
      places.push({
        kind: "address",
        key: String(item.key),
        label: `${item["street-number"] ?? ""} ${item.street?.name ?? ""}`.trim(),
        lat, lon,
      });
    } else if (item.type === "monument") {
      places.push({ kind: "monument", key: String(item.key), label: String(item.name ?? "Place"), lat, lon });
    } else if (item.type === "intersection") {
      places.push({
        kind: "intersection",
        key: String(item.key),
        label: `${item.street?.name ?? ""} at ${item["cross-street"]?.name ?? ""}`,
        lat, lon,
      });
    }
  }
  return places;
}

// Name of the place at one end of a walk/transfer segment.
function endName(end: any): string | undefined {
  if (!end) return undefined;
  if (end.stop) return String(end.stop.name ?? `Stop ${end.stop.key}`);
  const place = end.origin ?? end.destination;
  if (!place) return undefined;
  if (place.monument) return String(place.monument.name);
  if (place.address) return `${place.address["street-number"] ?? ""} ${place.address.street?.name ?? ""}`.trim();
  if (place.intersection) {
    return `${place.intersection.street?.name ?? ""} at ${place.intersection["cross-street"]?.name ?? ""}`;
  }
  return undefined;
}

export function normalizePlans(raw: any): TripPlan[] {
  const plans: TripPlan[] = [];
  for (const plan of raw.plans ?? []) {
    const segments: PlanSegment[] = [];
    for (const segment of plan.segments ?? []) {
      const durations = segment.times?.durations ?? {};
      const type = segment.type === "ride" || segment.type === "transfer" ? segment.type : "walk";
      segments.push({
        type,
        start: winnipegLocalToEpoch(String(segment.times?.start ?? "")),
        end: winnipegLocalToEpoch(String(segment.times?.end ?? "")),
        minutes: Number(durations.total ?? 0),
        routeId: segment.route ? String(segment.route.number ?? segment.route.key) : undefined,
        destination: segment.variant?.name ? String(segment.variant.name) : undefined,
        fromName: endName(segment.from),
        toName: endName(segment.to),
        fromStop: segment.from?.stop?.key !== undefined ? Number(segment.from.stop.key) : undefined,
        toStop: segment.to?.stop?.key !== undefined ? Number(segment.to.stop.key) : undefined,
        walkMinutes: durations.walking !== undefined ? Number(durations.walking) : undefined,
        waitMinutes: durations.waiting !== undefined ? Number(durations.waiting) : undefined,
      });
    }
    // A ride doesn't say where you get on and off, but its neighbours do:
    // the segment before it ends at the boarding stop, the one after starts
    // at the stop where you get off.
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].type !== "ride") continue;
      const before = segments[i - 1];
      const after = segments[i + 1];
      if (before && before.toStop !== undefined) {
        segments[i].boardStop = before.toStop;
        segments[i].boardStopName = before.toName;
      }
      if (after && after.fromStop !== undefined) {
        segments[i].alightStop = after.fromStop;
        segments[i].alightStopName = after.fromName;
      }
    }

    const durations = plan.times?.durations ?? {};
    plans.push({
      start: winnipegLocalToEpoch(String(plan.times?.start ?? "")),
      end: winnipegLocalToEpoch(String(plan.times?.end ?? "")),
      totalMinutes: Number(durations.total ?? 0),
      walkMinutes: Number(durations.walking ?? 0),
      waitMinutes: Number(durations.waiting ?? 0),
      rideMinutes: Number(durations.riding ?? 0),
      busCount: segments.filter((segment) => segment.type === "ride").length,
      segments,
    });
  }
  return plans;
}
