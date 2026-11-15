// Turns a planned trip into buses we can track live.
// The Trip Planner tells us the route, the stops and the times of each ride,
// but not which bus trip it is. We find that by looking at the boarding
// stop's schedule for the bus that leaves at the planned time.

import type { DataSource, TrackedBus, TripPlan } from "./types";

const MINUTE = 60 * 1000;
const MATCH_WITHIN = 5 * MINUTE; // how close the times must be to count as the same bus
const LOOK_AHEAD_MINUTES = 360; // stop schedules reach 6 hours ahead

export async function findTripBuses(source: DataSource, plan: TripPlan): Promise<TrackedBus[]> {
  const rides = plan.segments.filter((segment) => segment.type === "ride");
  const legs: TrackedBus[] = [];

  for (const ride of rides) {
    if (!ride.routeId) {
      throw new Error("This trip can't be tracked: a route is missing.");
    }

    // No boarding stop means there is no transfer: the rider stays on the
    // bus and it changes its route number (for example a 336 becomes a 330).
    if (ride.boardStop === undefined) {
      const previous = legs[legs.length - 1];
      if (!previous) throw new Error("This trip can't be tracked: a boarding stop is missing.");
      const previousTrip = await source.getTrip(previous.tripKey);
      if (!previousTrip.nextTripKey) {
        throw new Error(`Couldn't find the ${ride.routeId} bus for this trip.`);
      }
      const nextTrip = await source.getTrip(previousTrip.nextTripKey);
      const firstStop = nextTrip.stops[0];
      const lastStop = previousTrip.stops[previousTrip.stops.length - 1];
      if (nextTrip.routeId !== ride.routeId || !firstStop || !lastStop) {
        throw new Error(`Couldn't find the ${ride.routeId} bus for this trip.`);
      }
      // The earlier bus is ridden to its last stop.
      previous.alightStop = lastStop.stopNumber;
      previous.alightStopName = lastStop.stopName;
      legs.push({
        tripKey: nextTrip.tripKey,
        routeId: ride.routeId,
        destination: ride.destination ?? nextTrip.destination,
        stopNumber: firstStop.stopNumber,
        stopName: firstStop.stopName,
        alightStop: ride.alightStop,
        alightStopName: ride.alightStopName,
        stayOnBus: true,
      });
      continue;
    }
    const schedule = await source.getStopSchedule(ride.boardStop, {
      routes: [ride.routeId],
      minutesAhead: LOOK_AHEAD_MINUTES,
    });

    // The bus whose time at the stop is closest to the planned boarding time.
    let best: { tripKey: string; destination: string; gap: number } | undefined;
    for (const arrival of schedule.arrivals) {
      if (arrival.cancelled) continue;
      const gap = Math.min(Math.abs(arrival.estimated - ride.start), Math.abs(arrival.scheduled - ride.start));
      if (!best || gap < best.gap) {
        best = { tripKey: arrival.tripKey, destination: arrival.destination, gap };
      }
    }
    if (!best || best.gap > MATCH_WITHIN) {
      throw new Error(
        `Couldn't find the ${ride.routeId} bus for this trip. Live tracking works for trips that leave within the next 6 hours.`
      );
    }

    legs.push({
      tripKey: best.tripKey,
      routeId: ride.routeId,
      destination: ride.destination ?? best.destination,
      stopNumber: ride.boardStop,
      stopName: ride.boardStopName ?? schedule.stopName,
      alightStop: ride.alightStop,
      alightStopName: ride.alightStopName,
    });
  }

  if (legs.length === 0) throw new Error("This trip has no bus to track.");
  return legs;
}
