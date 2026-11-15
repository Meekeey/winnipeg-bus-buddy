// Downloads the Winnipeg Transit GTFS zip and turns it into small JSON files
// that the app loads from /data. Runs before every build ("prebuild").
//
// Output (public/data):
//   stops.json        [[stopNumber, name, lat, lon], ...]
//   routes.json       [{ id, name, color, textColor }, ...]
//   stop-routes.json  { stopNumber: [routeId, ...] }
//   shapes/{id}.json  { id, patterns: [{ headsign, direction, trips, stops, points }] }
//   meta.json         { builtAt, feedStart, feedEnd }

import { unzipSync, strFromU8 } from "fflate";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";

const GTFS_URLS = [
  "https://gtfs.winnipegtransit.com/google_transit.zip",
  "http://gtfs.winnipegtransit.com/google_transit.zip",
];
const OUT_DIR = path.join(process.cwd(), "public", "data");
const MAX_PATTERNS_PER_ROUTE = 8;

async function downloadZip() {
  // A local file can be used instead (handy offline): GTFS_ZIP=path npm run gtfs
  if (process.env.GTFS_ZIP) {
    return new Uint8Array(await readFile(process.env.GTFS_ZIP));
  }
  let lastError;
  for (const url of GTFS_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      console.warn(`GTFS download failed from ${url}: ${error.message}`);
    }
  }
  throw lastError;
}

// Small CSV reader. Calls onRow(object) for every data row.
function readCsv(text, onRow) {
  const lines = text.split(/\r?\n/);
  const header = splitCsvLine(lines[0].replace(/^﻿/, ""));
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "") continue;
    const cells = splitCsvLine(lines[i]);
    const row = {};
    for (let c = 0; c < header.length; c++) row[header[c]] = cells[c] ?? "";
    onRow(row);
  }
}

function splitCsvLine(line) {
  if (!line.includes('"')) return line.split(",");
  const cells = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { cells.push(cell); cell = ""; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

function round5(n) {
  return Math.round(Number(n) * 1e5) / 1e5;
}

// "Northbound Osborne at Mulvey" -> keep as is; just trim.
function cleanName(name) {
  return name.trim().replace(/\s+/g, " ");
}

async function main() {
  let zipBytes;
  try {
    zipBytes = await downloadZip();
  } catch (error) {
    // If we already have data from an earlier run, keep using it.
    try {
      await access(path.join(OUT_DIR, "stops.json"));
      console.warn("Could not download GTFS. Keeping the existing public/data files.");
      return;
    } catch {
      throw new Error(`Could not download GTFS and no earlier data exists: ${error.message}`);
    }
  }

  const files = unzipSync(zipBytes, {
    filter: (file) =>
      ["stops.txt", "routes.txt", "trips.txt", "shapes.txt", "stop_times.txt", "feed_info.txt"].includes(file.name),
  });
  const text = (name) => strFromU8(files[name]);

  // --- stops ---
  const stops = [];
  const stopCodeById = new Map();
  readCsv(text("stops.txt"), (row) => {
    const number = Number(row.stop_code || row.stop_id);
    stopCodeById.set(row.stop_id, number);
    stops.push([number, cleanName(row.stop_name), round5(row.stop_lat), round5(row.stop_lon)]);
  });

  // --- routes ---
  const routes = [];
  readCsv(text("routes.txt"), (row) => {
    routes.push({
      id: row.route_short_name || row.route_id,
      gtfsId: row.route_id,
      name: row.route_long_name,
      color: "#" + (row.route_color || "052465"),
      textColor: "#" + (row.route_text_color || "FFFFFF"),
      sort: Number(row.route_sort_order || 0),
    });
  });
  routes.sort((a, b) => a.sort - b.sort);
  const routeIdByGtfsId = new Map(routes.map((r) => [r.gtfsId, r.id]));

  // --- trips ---
  const trips = new Map(); // trip_id -> { route, headsign, direction, shapeId }
  readCsv(text("trips.txt"), (row) => {
    trips.set(row.trip_id, {
      route: routeIdByGtfsId.get(row.route_id),
      headsign: row.trip_headsign,
      direction: Number(row.direction_id || 0),
      shapeId: row.shape_id,
    });
  });

  // --- stop_times: the ordered stop list of every trip ---
  const tripStops = new Map(); // trip_id -> [[sequence, stopNumber], ...]
  readCsv(text("stop_times.txt"), (row) => {
    let list = tripStops.get(row.trip_id);
    if (!list) { list = []; tripStops.set(row.trip_id, list); }
    list.push([Number(row.stop_sequence), stopCodeById.get(row.stop_id)]);
  });

  // --- shapes ---
  const shapes = new Map(); // shape_id -> [[sequence, lat, lon], ...]
  readCsv(text("shapes.txt"), (row) => {
    let list = shapes.get(row.shape_id);
    if (!list) { list = []; shapes.set(row.shape_id, list); }
    list.push([Number(row.shape_pt_sequence), round5(row.shape_pt_lat), round5(row.shape_pt_lon)]);
  });

  // --- group trips into "patterns" (same route + same ordered stops) ---
  const patternsByRoute = new Map();
  const stopRoutes = new Map(); // stopNumber -> Set(routeId)
  for (const [tripId, trip] of trips) {
    const list = tripStops.get(tripId);
    if (!list || !trip.route) continue;
    list.sort((a, b) => a[0] - b[0]);
    const stopNumbers = list.map((item) => item[1]);
    const key = `${trip.direction}|${trip.headsign}|${stopNumbers.join(",")}`;

    let routePatterns = patternsByRoute.get(trip.route);
    if (!routePatterns) { routePatterns = new Map(); patternsByRoute.set(trip.route, routePatterns); }
    let pattern = routePatterns.get(key);
    if (!pattern) {
      pattern = { headsign: trip.headsign, direction: trip.direction, trips: 0, stops: stopNumbers, shapeId: trip.shapeId };
      routePatterns.set(key, pattern);
    }
    pattern.trips += 1;

    for (const number of stopNumbers) {
      let set = stopRoutes.get(number);
      if (!set) { set = new Set(); stopRoutes.set(number, set); }
      set.add(trip.route);
    }
  }

  await mkdir(path.join(OUT_DIR, "shapes"), { recursive: true });

  for (const route of routes) {
    const all = [...(patternsByRoute.get(route.id)?.values() ?? [])];
    // Most-used patterns first; drop the rare ones to keep files small.
    all.sort((a, b) => b.trips - a.trips);
    const patterns = all.slice(0, MAX_PATTERNS_PER_ROUTE).map((pattern) => {
      const shapePoints = (shapes.get(pattern.shapeId) ?? []).sort((a, b) => a[0] - b[0]);
      return {
        headsign: pattern.headsign,
        direction: pattern.direction,
        trips: pattern.trips,
        stops: pattern.stops,
        points: shapePoints.map((p) => [p[1], p[2]]),
      };
    });
    await writeFile(
      path.join(OUT_DIR, "shapes", `${route.id}.json`),
      JSON.stringify({ id: route.id, patterns })
    );
  }

  const stopRoutesObject = {};
  const routeOrder = new Map(routes.map((r, index) => [r.id, index]));
  for (const [number, set] of stopRoutes) {
    stopRoutesObject[number] = [...set].sort((a, b) => routeOrder.get(a) - routeOrder.get(b));
  }

  // Only keep stops that a bus actually visits.
  const usedStops = stops.filter((stop) => stopRoutesObject[stop[0]]);

  let feedStart = "";
  let feedEnd = "";
  if (files["feed_info.txt"]) {
    readCsv(text("feed_info.txt"), (row) => { feedStart = row.feed_start_date; feedEnd = row.feed_end_date; });
  }

  const publicRoutes = routes.map(({ id, name, color, textColor }) => ({ id, name, color, textColor }));
  await writeFile(path.join(OUT_DIR, "stops.json"), JSON.stringify(usedStops));
  await writeFile(path.join(OUT_DIR, "routes.json"), JSON.stringify(publicRoutes));
  await writeFile(path.join(OUT_DIR, "stop-routes.json"), JSON.stringify(stopRoutesObject));
  await writeFile(
    path.join(OUT_DIR, "meta.json"),
    JSON.stringify({ builtAt: new Date().toISOString(), feedStart, feedEnd })
  );

  console.log(`GTFS ready: ${usedStops.length} stops, ${routes.length} routes.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
