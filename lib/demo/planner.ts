// DEMO ONLY. A tiny trip planner so the "Best trip home" screen is playable
// without the real Trip Planner API. It only finds direct trips and trips
// with one transfer at a shared stop.

import { loadRouteShapes, loadStaticData, nearestStops, Pattern, shortStopName, Stop } from "../staticData";
import type { Place, PlanSegment, TripPlan } from "../types";
import { visitsAtStop, stopOffsets, parseTripKey, tripStartTime, tripDelay } from "./simulate";

const MINUTE = 60 * 1000;
const WALK_METRES_PER_MIN = 80;
const TRANSFER_BUFFER = 2 * MINUTE;

type PatternRef = { routeId: string; patternIndex: number; pattern: Pattern };
type NearStop = { stop: Stop; walkMinutes: number };

// stop number -> every pattern that visits it
let patternIndexPromise: Promise<Map<number, PatternRef[]>> | undefined;
function loadPatternIndex() {
  if (!patternIndexPromise) {
    patternIndexPromise = (async () => {
      const data = await loadStaticData();
      const index = new Map<number, PatternRef[]>();
      for (const route of data.routes) {
        const shapes = await loadRouteShapes(route.id);
        // Only the two busiest patterns per direction keep the demo simple.
        shapes.patterns.slice(0, 4).forEach((pattern, patternIndex) => {
          const ref = { routeId: route.id, patternIndex, pattern };
          for (const stopNumber of new Set(pattern.stops)) {
            let list = index.get(stopNumber);
            if (!list) { list = []; index.set(stopNumber, list); }
            list.push(ref);
          }
        });
      }
      return index;
    })();
  }
  return patternIndexPromise;
}

// When the given demo trip reaches a stop index (estimated).
async function tripTimeAt(tripKey: string, stopIndex: number): Promise<number> {
  const key = parseTripKey(tripKey);
  const shapes = await loadRouteShapes(key.routeId);
  const pattern = shapes.patterns[key.patternIndex];
  const offsets = await stopOffsets(key.routeId, key.patternIndex);
  const start = tripStartTime(key.dayStart, key.routeId, key.patternIndex, pattern, key.tripNumber);
  return start + offsets[stopIndex] * MINUTE + tripDelay(tripKey);
}

// First bus of a pattern that leaves a stop at or after a time.
async function firstBusAfter(ref: PatternRef, stopIndex: number, after: number) {
  const visits = await visitsAtStop(ref.routeId, ref.patternIndex, stopIndex, after, after + 90 * MINUTE);
  visits.sort((a, b) => a.estimated - b.estimated);
  return visits[0];
}

type Candidate = {
  first: PatternRef; boardIndex: number; alightIndex: number; origin: NearStop;
  second?: PatternRef; board2Index?: number; alight2Index?: number;
  destination: NearStop;
};

export async function planDemoTrip(origin: Place, destination: Place, now: number): Promise<TripPlan[]> {
  const data = await loadStaticData();
  const index = await loadPatternIndex();

  const near = (place: Place): NearStop[] =>
    nearestStops(data, [place.lat, place.lon], 8, 800).map((item) => ({
      stop: item.stop,
      walkMinutes: Math.max(1, Math.round(item.metres / WALK_METRES_PER_MIN)),
    }));
  const originStops = near(origin);
  const destinationStops = near(destination);

  const candidates = new Map<string, Candidate>(); // one per route combination

  function keep(name: string, candidate: Candidate) {
    const existing = candidates.get(name);
    const walk = candidate.origin.walkMinutes + candidate.destination.walkMinutes;
    if (!existing || walk < existing.origin.walkMinutes + existing.destination.walkMinutes) {
      candidates.set(name, candidate);
    }
  }

  for (const from of originStops) {
    for (const first of index.get(from.stop.number) ?? []) {
      const boardIndex = first.pattern.stops.indexOf(from.stop.number);

      for (const to of destinationStops) {
        // Direct: the same pattern reaches a stop near the destination.
        const directIndex = first.pattern.stops.indexOf(to.stop.number, boardIndex + 1);
        if (directIndex !== -1) {
          keep(first.routeId, { first, boardIndex, alightIndex: directIndex, origin: from, destination: to });
          continue;
        }

        // One transfer: find a stop both patterns share.
        for (const second of index.get(to.stop.number) ?? []) {
          if (second.routeId === first.routeId) continue;
          const alight2Index = second.pattern.stops.indexOf(to.stop.number);
          for (let i = boardIndex + 1; i < first.pattern.stops.length; i++) {
            const board2Index = second.pattern.stops.indexOf(first.pattern.stops[i]);
            if (board2Index !== -1 && board2Index < alight2Index) {
              keep(`${first.routeId}>${second.routeId}`, {
                first, boardIndex, alightIndex: i, origin: from,
                second, board2Index, alight2Index, destination: to,
              });
              break;
            }
          }
        }
      }
    }
  }

  const plans: TripPlan[] = [];
  for (const candidate of candidates.values()) {
    const plan = await timeCandidate(candidate, origin, destination, now, data.stopByNumber);
    if (plan) plans.push(plan);
  }
  plans.sort((a, b) => a.end - b.end);
  return plans.slice(0, 5);
}

async function timeCandidate(
  c: Candidate, origin: Place, destination: Place, now: number, stopByNumber: Map<number, Stop>
): Promise<TripPlan | undefined> {
  const stopName = (pattern: Pattern, i: number) => {
    const stop = stopByNumber.get(pattern.stops[i]);
    return stop ? shortStopName(stop.name) : `Stop ${pattern.stops[i]}`;
  };
  const segments: PlanSegment[] = [];

  const bus1 = await firstBusAfter(c.first, c.boardIndex, now + c.origin.walkMinutes * MINUTE);
  if (!bus1) return undefined;
  const walkStart = bus1.estimated - c.origin.walkMinutes * MINUTE;
  segments.push({
    type: "walk", start: walkStart, end: bus1.estimated, minutes: c.origin.walkMinutes,
    walkMinutes: c.origin.walkMinutes, fromName: origin.label, toName: stopName(c.first.pattern, c.boardIndex),
  });

  let arrive = await tripTimeAt(bus1.tripKey, c.alightIndex);
  segments.push({
    type: "ride", start: bus1.estimated, end: arrive, minutes: Math.round((arrive - bus1.estimated) / MINUTE),
    routeId: c.first.routeId, destination: c.first.pattern.headsign,
    boardStop: c.first.pattern.stops[c.boardIndex], boardStopName: stopName(c.first.pattern, c.boardIndex),
    alightStop: c.first.pattern.stops[c.alightIndex], alightStopName: stopName(c.first.pattern, c.alightIndex),
  });

  let waitMinutes = 0;
  let lastPattern = c.first.pattern;
  let lastIndex = c.alightIndex;
  if (c.second && c.board2Index !== undefined && c.alight2Index !== undefined) {
    const bus2 = await firstBusAfter(c.second, c.board2Index, arrive + TRANSFER_BUFFER);
    if (!bus2) return undefined;
    waitMinutes = Math.round((bus2.estimated - arrive) / MINUTE);
    const name = stopName(c.first.pattern, c.alightIndex);
    segments.push({
      type: "transfer", start: arrive, end: bus2.estimated, minutes: waitMinutes,
      waitMinutes, walkMinutes: 0, fromName: name, toName: name,
    });
    const arrive2 = await tripTimeAt(bus2.tripKey, c.alight2Index);
    segments.push({
      type: "ride", start: bus2.estimated, end: arrive2, minutes: Math.round((arrive2 - bus2.estimated) / MINUTE),
      routeId: c.second.routeId, destination: c.second.pattern.headsign,
      boardStop: c.second.pattern.stops[c.board2Index], boardStopName: stopName(c.second.pattern, c.board2Index),
      alightStop: c.second.pattern.stops[c.alight2Index], alightStopName: stopName(c.second.pattern, c.alight2Index),
    });
    arrive = arrive2;
    lastPattern = c.second.pattern;
    lastIndex = c.alight2Index;
  }

  const end = arrive + c.destination.walkMinutes * MINUTE;
  segments.push({
    type: "walk", start: arrive, end, minutes: c.destination.walkMinutes,
    walkMinutes: c.destination.walkMinutes, fromName: stopName(lastPattern, lastIndex), toName: destination.label,
  });

  const rideMinutes = segments.filter((s) => s.type === "ride").reduce((sum, s) => sum + s.minutes, 0);
  return {
    start: walkStart,
    end,
    totalMinutes: Math.round((end - walkStart) / MINUTE),
    walkMinutes: c.origin.walkMinutes + c.destination.walkMinutes,
    waitMinutes,
    rideMinutes,
    busCount: c.second ? 2 : 1,
    segments,
  };
}
