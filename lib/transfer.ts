// "I know my buses" maths: the user gives a boarding stop and a list of
// routes (for example F8 then 330). We find where the routes meet, then
// look for the trip with the shortest wait at the transfer.

import { distanceMetres } from "./geo";
import { loadRouteShapes, StaticData } from "./staticData";
import type { Arrival, DataSource } from "./types";

const MINUTE = 60 * 1000;
export const TRANSFER_BUFFER_MINUTES = 2; // time to get off and walk over
export const LONG_WAIT_MINUTES = 10; // waits longer than this get a warning colour
const MAX_TRANSFER_WALK_METRES = 150;
const WALK_METRES_PER_MIN = 80;
const FIRST_BUS_CHOICES = 6; // how many upcoming first buses to compare

// One way to change from route A to route B.
export type Meeting = {
  patternIndex: number; // which pattern of route B
  headsign: string; // where that route B bus is going
  alightStop: number; // get off route A here
  boardStop: number; // get on route B here (same stop, or a short walk)
  walkMetres: number;
  boardIndex: number; // position of boardStop in route B's stop list
  remainingStops: number[]; // route B's stops after boarding
};

// Finds where route A (after the boarding stop) meets route B.
// Returns one option per route B direction, busiest first.
export async function findMeetings(
  data: StaticData,
  routeA: string,
  boardStopA: number,
  routeB: string
): Promise<Meeting[]> {
  const shapesA = await loadRouteShapes(routeA);
  const shapesB = await loadRouteShapes(routeB);
  const bestByHeadsign = new Map<string, Meeting>();

  for (const patternA of shapesA.patterns) {
    const startIndex = patternA.stops.indexOf(boardStopA);
    if (startIndex === -1) continue;

    for (let patternIndex = 0; patternIndex < shapesB.patterns.length; patternIndex++) {
      const patternB = shapesB.patterns[patternIndex];
      let best: Meeting | undefined;

      for (let a = startIndex + 1; a < patternA.stops.length; a++) {
        const stopA = data.stopByNumber.get(patternA.stops[a]);
        if (!stopA) continue;
        // The last stop of B is no use: nothing left to ride.
        for (let b = 0; b < patternB.stops.length - 1; b++) {
          const stopB = data.stopByNumber.get(patternB.stops[b]);
          if (!stopB) continue;
          let walkMetres = 0;
          if (stopA.number !== stopB.number) {
            walkMetres = distanceMetres([stopA.lat, stopA.lon], [stopB.lat, stopB.lon]);
            if (walkMetres > MAX_TRANSFER_WALK_METRES) continue;
          }
          // Keep the shortest walk. On a tie the earlier stop along A wins.
          if (!best || walkMetres < best.walkMetres) {
            best = {
              patternIndex,
              headsign: patternB.headsign,
              alightStop: stopA.number,
              boardStop: stopB.number,
              walkMetres,
              boardIndex: b,
              remainingStops: patternB.stops.slice(b + 1),
            };
          }
        }
      }

      if (best) {
        const existing = bestByHeadsign.get(best.headsign);
        // Patterns are sorted busiest first, so keep the first one found
        // unless a later one has a clearly shorter walk.
        if (!existing || best.walkMetres < existing.walkMetres - 50) {
          bestByHeadsign.set(best.headsign, best);
        }
      }
    }
  }
  return [...bestByHeadsign.values()];
}

// One bus ride in the chain.
export type Leg = {
  routeId: string;
  boardStop: number;
  alightStop: number;
  walkMetresBefore: number; // walk from the previous bus's stop (0 for the first leg)
};

export type TimedLeg = {
  tripKey: string;
  routeId: string;
  destination: string;
  boardStop: number;
  alightStop: number;
  boardTime: number;
  alightTime: number;
  boardScheduled: number;
  waitMinutes: number; // wait before this bus (0 for the first leg)
};

export type TransferOption = {
  legs: TimedLeg[];
  totalWaitMinutes: number;
  longestWaitMinutes: number;
  leaveTime: number; // when the first bus leaves
  arriveTime: number;
};

export type TransferResult = {
  options: TransferOption[]; // in order of first-bus departure
  bestIndex: number; // the one we recommend (-1 when there are none)
};

// Looks up live times for every leg and builds the options.
export async function planTransfers(source: DataSource, legs: Leg[], now: number): Promise<TransferResult> {
  // Two schedule requests per leg: where you get on and where you get off.
  // We match the same bus at both stops by its trip key.
  const schedules = await Promise.all(
    legs.map(async (leg) => {
      const options = { routes: [leg.routeId], minutesAhead: 240 };
      const [board, alight] = await Promise.all([
        source.getStopSchedule(leg.boardStop, options),
        source.getStopSchedule(leg.alightStop, options),
      ]);
      const alightByTrip = new Map<string, Arrival>();
      for (const arrival of alight.arrivals) alightByTrip.set(arrival.tripKey, arrival);
      return { boardArrivals: board.arrivals.filter((a) => !a.cancelled), alightByTrip };
    })
  );

  // Finds the first bus on a leg that leaves at or after `earliest`
  // and that we can also see arriving at the get-off stop.
  function firstBus(legIndex: number, earliest: number) {
    for (const arrival of schedules[legIndex].boardArrivals) {
      if (arrival.estimated < earliest) continue;
      const alight = schedules[legIndex].alightByTrip.get(arrival.tripKey);
      if (!alight || alight.estimated <= arrival.estimated) continue;
      return { arrival, alight };
    }
    return undefined;
  }

  const options: TransferOption[] = [];
  let searchFrom = now;

  while (options.length < FIRST_BUS_CHOICES) {
    const first = firstBus(0, searchFrom);
    if (!first) break;
    searchFrom = first.arrival.estimated + 1; // next loop: the bus after this one

    const timedLegs: TimedLeg[] = [toTimedLeg(legs[0], first.arrival, first.alight, 0)];
    let arrivedAt = first.alight.estimated;
    let complete = true;

    for (let i = 1; i < legs.length; i++) {
      const walkMinutes = legs[i].walkMetresBefore / WALK_METRES_PER_MIN;
      const ready = arrivedAt + (TRANSFER_BUFFER_MINUTES + walkMinutes) * MINUTE;
      const next = firstBus(i, ready);
      if (!next) {
        complete = false;
        break;
      }
      const waitMinutes = Math.round((next.arrival.estimated - arrivedAt) / MINUTE);
      timedLegs.push(toTimedLeg(legs[i], next.arrival, next.alight, waitMinutes));
      arrivedAt = next.alight.estimated;
    }
    if (!complete) continue;

    const waits = timedLegs.slice(1).map((leg) => leg.waitMinutes);
    options.push({
      legs: timedLegs,
      totalWaitMinutes: waits.reduce((sum, wait) => sum + wait, 0),
      longestWaitMinutes: Math.max(0, ...waits),
      leaveTime: timedLegs[0].boardTime,
      arriveTime: arrivedAt,
    });
  }

  // Recommend the smallest total wait. On a tie, the one that gets home first.
  let bestIndex = -1;
  for (let i = 0; i < options.length; i++) {
    if (bestIndex === -1) {
      bestIndex = i;
      continue;
    }
    const best = options[bestIndex];
    const option = options[i];
    if (option.totalWaitMinutes < best.totalWaitMinutes) {
      bestIndex = i;
    } else if (option.totalWaitMinutes === best.totalWaitMinutes && option.arriveTime < best.arriveTime) {
      bestIndex = i;
    }
  }
  return { options, bestIndex };
}

function toTimedLeg(leg: Leg, board: Arrival, alight: Arrival, waitMinutes: number): TimedLeg {
  return {
    tripKey: board.tripKey,
    routeId: leg.routeId,
    destination: board.destination,
    boardStop: leg.boardStop,
    alightStop: leg.alightStop,
    boardTime: board.estimated,
    alightTime: alight.estimated,
    boardScheduled: board.scheduled,
    waitMinutes,
  };
}
