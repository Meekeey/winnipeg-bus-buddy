// Estimates where a tracked bus is. The public API has no GPS, so we use
// the trip's stop times: find the last stop already passed and the next
// stop ahead, then place the bus between them based on the clock.

import { LatLon, nearestPointIndex, pointAlongLine } from "./geo";
import type { Pattern, StaticData } from "./staticData";
import type { TripSchedule, TripStop } from "./types";

export type BusPosition = {
  state: "not-started" | "moving" | "finished";
  position: LatLon;
  previousStop?: TripStop;
  nextStop?: TripStop;
};

function stopPoint(stop: TripStop, data: StaticData): LatLon | undefined {
  if (stop.lat !== undefined && stop.lon !== undefined) return [stop.lat, stop.lon];
  const known = data.stopByNumber.get(stop.stopNumber);
  if (known) return [known.lat, known.lon];
  return undefined;
}

export function estimateBusPosition(
  trip: TripSchedule,
  now: number,
  data: StaticData,
  routeLine?: LatLon[] // the route shape, if we found one
): BusPosition | undefined {
  const stops = trip.stops.filter((stop) => stopPoint(stop, data) !== undefined);
  if (stops.length === 0) return undefined;

  const first = stops[0];
  const last = stops[stops.length - 1];
  if (now <= first.estimated) {
    return { state: "not-started", position: stopPoint(first, data)!, nextStop: first };
  }
  if (now >= last.estimated) {
    return { state: "finished", position: stopPoint(last, data)!, previousStop: last };
  }

  // Last stop whose estimated time is in the past.
  let previousIndex = 0;
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].estimated <= now) previousIndex = i;
    else break;
  }
  const previous = stops[previousIndex];
  const next = stops[previousIndex + 1];
  const from = stopPoint(previous, data)!;
  const to = stopPoint(next, data)!;

  const span = next.estimated - previous.estimated;
  const fraction = span <= 0 ? 0 : (now - previous.estimated) / span;

  // Follow the route line between the two stops when we can,
  // otherwise use a straight line.
  let path: LatLon[] = [from, to];
  if (routeLine && routeLine.length > 1) {
    const startIndex = nearestPointIndex(routeLine, from);
    const endIndex = nearestPointIndex(routeLine, to, startIndex);
    if (endIndex > startIndex) {
      path = routeLine.slice(startIndex, endIndex + 1);
    }
  }
  return { state: "moving", position: pointAlongLine(path, fraction), previousStop: previous, nextStop: next };
}

// Picks the route pattern that best matches a trip's stops (for drawing).
export function bestPatternForTrip(patterns: Pattern[], trip: TripSchedule): Pattern | undefined {
  const tripStops = new Set(trip.stops.map((stop) => stop.stopNumber));
  let best: Pattern | undefined;
  let bestScore = 0;
  for (const pattern of patterns) {
    let shared = 0;
    for (const number of pattern.stops) {
      if (tripStops.has(number)) shared++;
    }
    // Shared stops count for a lot; extra stops count against a little.
    const score = shared - (pattern.stops.length - shared) * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = pattern;
    }
  }
  return best;
}
