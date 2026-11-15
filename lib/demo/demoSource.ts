// DEMO ONLY. A stand-in for the live API that needs no key and no network.
// Stops and route lines are real (from GTFS); the arrival times are invented.

import { loadRouteShapes, loadStaticData, searchStops, shortStopName } from "../staticData";
import type { Arrival, DataSource, Place, ScheduleOptions, StopSchedule, TripSchedule, TripTime } from "../types";
import { planDemoTrip } from "./planner";
import { parseTripKey, stopOffsets, tripDelay, tripStartTime, visitsAtStop } from "./simulate";

const MINUTE = 60 * 1000;

// A few well-known places for the demo's address search.
const DEMO_PLACES: Place[] = [
  { kind: "monument", key: "", label: "The Forks", lat: 49.8872, lon: -97.131 },
  { kind: "monument", key: "", label: "University of Manitoba", lat: 49.8075, lon: -97.1366 },
  { kind: "monument", key: "", label: "University of Winnipeg", lat: 49.891, lon: -97.1535 },
  { kind: "monument", key: "", label: "Polo Park", lat: 49.8817, lon: -97.1985 },
  { kind: "monument", key: "", label: "Winnipeg Airport", lat: 49.904, lon: -97.226 },
  { kind: "monument", key: "", label: "Kildonan Place", lat: 49.898, lon: -97.062 },
  { kind: "monument", key: "", label: "St. Vital Centre", lat: 49.829, lon: -97.113 },
  { kind: "monument", key: "", label: "Health Sciences Centre", lat: 49.903, lon: -97.158 },
  { kind: "monument", key: "", label: "Garden City Shopping Centre", lat: 49.948, lon: -97.15 },
  { kind: "intersection", key: "", label: "Portage at Main", lat: 49.8955, lon: -97.1385 },
];

// A short pause so loading states are visible, like a real network call.
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const demoSource: DataSource = {
  isDemo: true,

  async getStatus() {
    return { value: "regular", message: "Regular service (demo)", isEmergency: false };
  },

  async getStopSchedule(stopNumber: number, options: ScheduleOptions = {}): Promise<StopSchedule> {
    await pause(250);
    const data = await loadStaticData();
    const stop = data.stopByNumber.get(stopNumber);
    if (!stop) throw new Error("Stop not found.");

    const now = Date.now();
    const until = now + (options.minutesAhead ?? 120) * MINUTE;
    let routeIds = data.stopRoutes[String(stopNumber)] ?? [];
    if (options.routes && options.routes.length > 0) {
      routeIds = routeIds.filter((id) => options.routes!.includes(id));
    }

    const arrivals: Arrival[] = [];
    for (const routeId of routeIds) {
      const shapes = await loadRouteShapes(routeId);
      const seenHeadsigns = new Set<string>();
      for (let patternIndex = 0; patternIndex < shapes.patterns.length; patternIndex++) {
        const pattern = shapes.patterns[patternIndex];
        const stopIndex = pattern.stops.indexOf(stopNumber);
        if (stopIndex === -1) continue;
        // One (the busiest) pattern per destination keeps the demo tidy.
        if (seenHeadsigns.has(pattern.headsign)) continue;
        seenHeadsigns.add(pattern.headsign);
        const visits = await visitsAtStop(routeId, patternIndex, stopIndex, now - 30000, until);
        for (const visit of visits) {
          arrivals.push({
            tripKey: visit.tripKey,
            routeId,
            destination: visit.destination,
            scheduled: visit.scheduled,
            estimated: visit.estimated,
            cancelled: false,
            busKey: "demo",
          });
        }
      }
    }
    arrivals.sort((a, b) => a.estimated - b.estimated);
    return { stopNumber, stopName: shortStopName(stop.name), arrivals };
  },

  async getTrip(tripKey: string): Promise<TripSchedule> {
    await pause(250);
    const data = await loadStaticData();
    const key = parseTripKey(tripKey);
    const shapes = await loadRouteShapes(key.routeId);
    const pattern = shapes.patterns[key.patternIndex];
    if (!pattern) throw new Error("Trip not found.");

    const offsets = await stopOffsets(key.routeId, key.patternIndex);
    const start = tripStartTime(key.dayStart, key.routeId, key.patternIndex, pattern, key.tripNumber);
    const delay = tripDelay(tripKey);

    return {
      tripKey,
      routeId: key.routeId,
      destination: pattern.headsign,
      busKey: "demo",
      stops: pattern.stops.map((stopNumber, index) => {
        const stop = data.stopByNumber.get(stopNumber);
        const scheduled = start + offsets[index] * MINUTE;
        return {
          stopNumber,
          stopName: stop ? shortStopName(stop.name) : `Stop ${stopNumber}`,
          lat: stop?.lat,
          lon: stop?.lon,
          scheduled,
          estimated: scheduled + delay,
          cancelled: false,
        };
      }),
    };
  },

  async searchPlaces(query: string): Promise<Place[]> {
    await pause(150);
    const text = query.trim().toLowerCase();
    if (text.length < 2) return [];
    const data = await loadStaticData();
    const places = DEMO_PLACES.filter((place) => place.label.toLowerCase().includes(text));
    for (const stop of searchStops(data, query, 6)) {
      places.push({
        kind: "stop",
        key: String(stop.number),
        label: `${shortStopName(stop.name)} (stop ${stop.number})`,
        lat: stop.lat,
        lon: stop.lon,
      });
    }
    return places.slice(0, 8);
  },

  async planTrip(origin: Place, destination: Place, when: TripTime = { mode: "now" }) {
    await pause(400);
    if (when.mode === "depart") return planDemoTrip(origin, destination, when.time);
    if (when.mode === "arrive") {
      // Rough "arrive by": try leaving earlier and earlier until a trip fits.
      for (const minutesBefore of [45, 60, 90, 120]) {
        const plans = await planDemoTrip(origin, destination, when.time - minutesBefore * MINUTE);
        const inTime = plans.filter((plan) => plan.end <= when.time);
        if (inTime.length > 0) return inTime;
      }
      return [];
    }
    return planDemoTrip(origin, destination, Date.now());
  },
};
