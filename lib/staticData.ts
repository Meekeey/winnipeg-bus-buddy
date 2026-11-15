// Loads the small JSON files made from GTFS (see scripts/build-gtfs.mjs).
// Everything is cached in memory after the first load.

import { distanceMetres, LatLon } from "./geo";

export type Stop = { number: number; name: string; lat: number; lon: number };
export type RouteInfo = { id: string; name: string; color: string; textColor: string };
export type Pattern = {
  headsign: string;
  direction: number;
  trips: number;
  stops: number[]; // stop numbers in order
  points: LatLon[]; // the line to draw
};
export type RouteShapes = { id: string; patterns: Pattern[] };

export type StaticData = {
  stops: Stop[];
  stopByNumber: Map<number, Stop>;
  routes: RouteInfo[];
  routeById: Map<string, RouteInfo>;
  stopRoutes: Record<string, string[]>;
};

// The demo build puts all the data on window so no network is needed.
type InlineData = {
  stops: [number, string, number, number][];
  routes: RouteInfo[];
  stopRoutes: Record<string, string[]>;
  shapes: Record<string, RouteShapes>;
};
function getInlineData(): InlineData | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __BUS_BUDDY_DATA__?: InlineData }).__BUS_BUDDY_DATA__;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

let staticDataPromise: Promise<StaticData> | undefined;

export function loadStaticData(): Promise<StaticData> {
  if (!staticDataPromise) {
    staticDataPromise = loadStaticDataNow().catch((error) => {
      staticDataPromise = undefined; // allow a retry later
      throw error;
    });
  }
  return staticDataPromise;
}

async function loadStaticDataNow(): Promise<StaticData> {
  const inline = getInlineData();
  let rawStops: [number, string, number, number][];
  let routes: RouteInfo[];
  let stopRoutes: Record<string, string[]>;
  if (inline) {
    rawStops = inline.stops;
    routes = inline.routes;
    stopRoutes = inline.stopRoutes;
  } else {
    [rawStops, routes, stopRoutes] = await Promise.all([
      fetchJson<[number, string, number, number][]>("/data/stops.json"),
      fetchJson<RouteInfo[]>("/data/routes.json"),
      fetchJson<Record<string, string[]>>("/data/stop-routes.json"),
    ]);
  }
  const stops = rawStops.map((row) => ({ number: row[0], name: row[1], lat: row[2], lon: row[3] }));
  return {
    stops,
    stopByNumber: new Map(stops.map((stop) => [stop.number, stop])),
    routes,
    routeById: new Map(routes.map((route) => [route.id, route])),
    stopRoutes,
  };
}

const shapeCache = new Map<string, Promise<RouteShapes>>();

export function loadRouteShapes(routeId: string): Promise<RouteShapes> {
  let promise = shapeCache.get(routeId);
  if (!promise) {
    const inline = getInlineData();
    if (inline) {
      promise = Promise.resolve(inline.shapes[routeId] ?? { id: routeId, patterns: [] });
    } else {
      promise = fetchJson<RouteShapes>(`/data/shapes/${encodeURIComponent(routeId)}.json`);
      promise.catch(() => shapeCache.delete(routeId));
    }
    shapeCache.set(routeId, promise);
  }
  return promise;
}

// "Northbound Osborne at Mulvey" -> "Osborne at Mulvey" (shorter for lists)
export function shortStopName(name: string): string {
  return name.replace(/^(Northbound|Southbound|Eastbound|Westbound)\s+/i, "");
}

// Search by stop number or by words in the name.
export function searchStops(data: StaticData, query: string, limit = 12): Stop[] {
  const text = query.trim().toLowerCase();
  if (text === "") return [];
  if (/^\d+$/.test(text)) {
    return data.stops.filter((stop) => String(stop.number).startsWith(text)).slice(0, limit);
  }
  const words = text.split(/\s+/);
  const matches: Stop[] = [];
  for (const stop of data.stops) {
    const name = stop.name.toLowerCase();
    if (words.every((word) => name.includes(word))) {
      matches.push(stop);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

// Closest stops to a point, nearest first.
export function nearestStops(data: StaticData, point: LatLon, limit = 8, maxMetres = 1500) {
  const found: { stop: Stop; metres: number }[] = [];
  for (const stop of data.stops) {
    // Quick box check before the slower distance maths.
    if (Math.abs(stop.lat - point[0]) > 0.02 || Math.abs(stop.lon - point[1]) > 0.03) continue;
    const metres = distanceMetres(point, [stop.lat, stop.lon]);
    if (metres <= maxMetres) found.push({ stop, metres });
  }
  found.sort((a, b) => a.metres - b.metres);
  return found.slice(0, limit);
}
