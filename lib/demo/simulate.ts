// DEMO ONLY. Invents a believable timetable from the real route patterns:
// every pattern gets a bus every few minutes, and every bus gets a small,
// fixed delay. Nothing here comes from Winnipeg Transit's live system.

import { distanceMetres } from "../geo";
import { loadRouteShapes, loadStaticData, Pattern } from "../staticData";
import { winnipegMidnight } from "../time";

const MINUTE = 60 * 1000;
const SERVICE_START_MIN = 5 * 60; // first buses leave around 5:00 AM
const SERVICE_END_MIN = 25 * 60; // last buses leave around 1:00 AM
const BUS_METRES_PER_MIN = 370; // about 22 km/h including stops

// Simple text -> number hash so the demo is the same on every refresh.
export function hashText(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Minutes between buses on this pattern (busy patterns run more often).
export function headwayMinutes(pattern: Pattern): number {
  const serviceMinutes = SERVICE_END_MIN - SERVICE_START_MIN;
  const headway = Math.round(serviceMinutes / Math.max(1, pattern.trips));
  return Math.min(45, Math.max(8, headway));
}

// Minutes from the first stop to each stop of the pattern.
const offsetCache = new Map<string, number[]>();
export async function stopOffsets(routeId: string, patternIndex: number): Promise<number[]> {
  const cacheKey = `${routeId}.${patternIndex}`;
  const cached = offsetCache.get(cacheKey);
  if (cached) return cached;

  const data = await loadStaticData();
  const shapes = await loadRouteShapes(routeId);
  const pattern = shapes.patterns[patternIndex];
  const offsets: number[] = [];
  let minutes = 0;
  for (let i = 0; i < pattern.stops.length; i++) {
    if (i > 0) {
      const previous = data.stopByNumber.get(pattern.stops[i - 1]);
      const current = data.stopByNumber.get(pattern.stops[i]);
      if (previous && current) {
        const metres = distanceMetres([previous.lat, previous.lon], [current.lat, current.lon]);
        minutes += metres / BUS_METRES_PER_MIN + 0.3;
      } else {
        minutes += 1;
      }
    }
    offsets.push(minutes);
  }
  offsetCache.set(cacheKey, offsets);
  return offsets;
}

// Trip keys look like "demo.<day>.<route>.<pattern>.<tripNumber>".
export function makeTripKey(dayStart: number, routeId: string, patternIndex: number, tripNumber: number): string {
  return `demo.${dayStart / MINUTE}.${routeId}.${patternIndex}.${tripNumber}`;
}

export function parseTripKey(tripKey: string) {
  const parts = tripKey.split(".");
  return {
    dayStart: Number(parts[1]) * MINUTE,
    routeId: parts[2],
    patternIndex: Number(parts[3]),
    tripNumber: Number(parts[4]),
  };
}

// When trip number N of a pattern leaves its first stop (scheduled).
export function tripStartTime(dayStart: number, routeId: string, patternIndex: number, pattern: Pattern, tripNumber: number): number {
  const headway = headwayMinutes(pattern);
  const firstOffset = hashText(`${routeId}.${patternIndex}`) % headway;
  return dayStart + (SERVICE_START_MIN + firstOffset + tripNumber * headway) * MINUTE;
}

// Each demo bus keeps one delay for its whole trip.
// A few are exactly on schedule (shown as "Scheduled"), some early, some late.
export function tripDelay(tripKey: string): number {
  const roll = hashText(tripKey) % 10;
  if (roll <= 1) return 0;
  if (roll === 2) return -2 * MINUTE;
  if (roll === 3) return 1 * MINUTE;
  if (roll === 4) return 2 * MINUTE;
  if (roll === 5) return 1 * MINUTE;
  if (roll === 6) return 3 * MINUTE;
  if (roll === 7) return 4 * MINUTE;
  if (roll === 8) return 7 * MINUTE;
  return 9 * MINUTE;
}

export type SimulatedVisit = {
  tripKey: string;
  routeId: string;
  patternIndex: number;
  destination: string;
  scheduled: number;
  estimated: number;
};

// Every visit of one pattern to one of its stops between two times.
export async function visitsAtStop(
  routeId: string,
  patternIndex: number,
  stopIndex: number,
  from: number,
  to: number
): Promise<SimulatedVisit[]> {
  const shapes = await loadRouteShapes(routeId);
  const pattern = shapes.patterns[patternIndex];
  const offsets = await stopOffsets(routeId, patternIndex);
  const offset = offsets[stopIndex] * MINUTE;
  const headway = headwayMinutes(pattern);
  const visits: SimulatedVisit[] = [];

  // Look at yesterday's late trips too, so midnight works.
  const today = winnipegMidnight(from);
  for (const dayStart of [today - 24 * 60 * MINUTE, today]) {
    const lastTrip = Math.floor((SERVICE_END_MIN - SERVICE_START_MIN) / headway);
    for (let tripNumber = 0; tripNumber <= lastTrip; tripNumber++) {
      const scheduled = tripStartTime(dayStart, routeId, patternIndex, pattern, tripNumber) + offset;
      if (scheduled < from - 15 * MINUTE || scheduled > to) continue;
      const tripKey = makeTripKey(dayStart, routeId, patternIndex, tripNumber);
      const estimated = scheduled + tripDelay(tripKey);
      if (estimated < from || estimated > to) continue;
      visits.push({ tripKey, routeId, patternIndex, destination: pattern.headsign, scheduled, estimated });
    }
  }
  return visits;
}
