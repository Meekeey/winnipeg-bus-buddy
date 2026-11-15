"use client";
// The Leaflet map. It stays mounted behind every tab and draws:
//  - stop markers (only when zoomed in, so the map stays fast)
//  - the route line the user chose to show
//  - the route lines and stops of the trip being tracked

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { LatLon, nearestPointIndex, WINNIPEG_CENTRE } from "@/lib/geo";
import { loadRouteShapes, Pattern, shortStopName, StaticData } from "@/lib/staticData";
import type { TrackedBus, TripSchedule } from "@/lib/types";
import { useApp } from "./AppState";

const STOP_ZOOM = 15; // stops appear at this zoom level and closer
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Reads a CSS colour variable so canvas drawings match the theme.
function cssColour(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// On phones a bottom sheet covers the lower part of the map.
function bottomCover(container: HTMLElement): number {
  if (window.innerWidth >= 900) return 0;
  const sheet = document.querySelector(".sheet");
  if (sheet) {
    const cover = container.clientHeight - sheet.getBoundingClientRect().top;
    // A full-height sheet hides the whole map, so there's nothing to dodge.
    if (cover < container.clientHeight * 0.75) return Math.max(0, Math.round(cover));
  }
  return Math.round(container.clientHeight * 0.5);
}

// True for dark colours such as navy "#052465" (false for white or yellow).
function isDarkColour(hex: string): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return false;
  const red = parseInt(match[1], 16);
  const green = parseInt(match[2], 16);
  const blue = parseInt(match[3], 16);
  // How bright the colour looks to the eye, from 0 (black) to 255 (white).
  const brightness = 0.299 * red + 0.587 * green + 0.114 * blue;
  return brightness < 90;
}

// The line to draw for one tracked bus. For a planned trip it is only the
// part between the stop where the rider gets on and the stop where they get off.
function legLine(leg: TrackedBus, trip: TripSchedule, pattern: Pattern | undefined, data: StaticData): LatLon[] {
  let line: LatLon[] = [];
  if (pattern && pattern.points.length > 1) {
    line = pattern.points;
  } else {
    // No route shape: straight lines between the trip's stops.
    for (const stop of trip.stops) {
      const known = data.stopByNumber.get(stop.stopNumber);
      if (stop.lat !== undefined && stop.lon !== undefined) line.push([stop.lat, stop.lon]);
      else if (known) line.push([known.lat, known.lon]);
    }
  }

  const board = data.stopByNumber.get(leg.stopNumber);
  const alight = leg.alightStop !== undefined ? data.stopByNumber.get(leg.alightStop) : undefined;
  if (board && alight && line.length > 1) {
    const from = nearestPointIndex(line, [board.lat, board.lon]);
    const to = nearestPointIndex(line, [alight.lat, alight.lon], from);
    if (to > from) return line.slice(from, to + 1);
  }
  return line;
}

export default function MapView() {
  const app = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layersRef = useRef<Record<"sketch" | "route" | "stops" | "track" | "user", Leaflet.LayerGroup> | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(12);
  const [moveCount, setMoveCount] = useState(0);
  const [sketchMode, setSketchMode] = useState(false); // no map tiles available

  const { data, selectedStop, shownRoute, tracked, quest, questTrips, questPatterns, userLocation, mapTarget, theme, tab } = app;
  const questActive = quest.length > 0; // a bus or trip is being tracked
  const selectStop = app.selectStop;
  const setTab = app.setTab;

  // --- create the map once ---
  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | undefined;

    import("leaflet").then((module) => {
      if (cancelled || !containerRef.current) return;
      const L = ((module as unknown as { default?: typeof Leaflet }).default ?? module) as typeof Leaflet;
      leafletRef.current = L;

      map = L.map(containerRef.current, {
        center: WINNIPEG_CENTRE,
        zoom: 12,
        minZoom: 10,
        maxZoom: 18,
        zoomControl: false,
        maxBounds: [[49.6, -97.6], [50.15, -96.7]],
        renderer: L.canvas({ tolerance: 10 }), // bigger tap area for markers
      });
      mapRef.current = map;

      // Free OpenStreetMap tiles. If they can't load (offline, blocked),
      // we switch to a simple "sketch map" made of the route lines.
      let tilesLoaded = 0;
      const tiles = L.tileLayer(TILE_URL, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });
      tiles.on("tileload", () => { tilesLoaded++; });
      tiles.on("tileerror", () => {
        if (tilesLoaded === 0) setSketchMode(true);
      });
      tiles.addTo(map);

      layersRef.current = {
        sketch: L.layerGroup().addTo(map),
        route: L.layerGroup().addTo(map),
        stops: L.layerGroup().addTo(map),
        track: L.layerGroup().addTo(map),
        user: L.layerGroup().addTo(map),
      };

      map.on("moveend", () => {
        setZoom(map!.getZoom());
        setMoveCount((count) => count + 1);
      });
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (map) map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- sketch map: thin lines for every route when tiles are missing ---
  useEffect(() => {
    const L = leafletRef.current;
    const layers = layersRef.current;
    if (!ready || !L || !layers || !data || !sketchMode) return;
    let cancelled = false;
    layers.sketch.clearLayers();
    const colour = cssColour("--map-line", "#b08a5a");
    Promise.all(data.routes.map((route) => loadRouteShapes(route.id).catch(() => undefined))).then((all) => {
      if (cancelled) return;
      for (const shapes of all) {
        if (!shapes) continue;
        for (const pattern of shapes.patterns.slice(0, 2)) {
          L.polyline(pattern.points, { color: colour, weight: 2, opacity: 0.7, interactive: false }).addTo(layers.sketch);
        }
      }
    });
    return () => { cancelled = true; };
  }, [ready, data, sketchMode, theme]);

  // --- stop markers (only the ones on screen, and only when zoomed in) ---
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!ready || !L || !map || !layers || !data) return;
    layers.stops.clearLayers();
    if (map.getZoom() < STOP_ZOOM) return;

    const bounds = map.getBounds().pad(0.1);
    const fill = cssColour("--gold", "#f6b93b");
    const outline = cssColour("--outline", "#3b2314");
    const selectedFill = cssColour("--lantern", "#ff7a1a");

    for (const stop of data.stops) {
      if (!bounds.contains([stop.lat, stop.lon])) continue;
      const isSelected = stop.number === selectedStop;
      // While a trip is being tracked, hide the other stops so the map
      // shows only the trip (and a stop the rider has opened).
      if (questActive && !isSelected) continue;
      const marker = L.circleMarker([stop.lat, stop.lon], {
        radius: isSelected ? 11 : 7,
        color: outline,
        weight: 3,
        fillColor: isSelected ? selectedFill : fill,
        fillOpacity: 1,
      });
      marker.on("click", () => {
        selectStop(stop.number);
        setTab("map");
      });
      marker.bindTooltip(`${shortStopName(stop.name)} (${stop.number})`, { direction: "top" });
      marker.addTo(layers.stops);
    }
  }, [ready, data, zoom, moveCount, selectedStop, theme, selectStop, setTab, questActive]);

  // --- the route line the user asked to see ---
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!ready || !L || !map || !layers || !data) return;
    layers.route.clearLayers();
    if (!shownRoute) return;

    let cancelled = false;
    const route = data.routeById.get(shownRoute);
    const outline = cssColour("--outline", "#3b2314");
    const colour = route && route.color.toLowerCase() !== "#ffffff" ? route.color : cssColour("--lantern", "#ff7a1a");

    loadRouteShapes(shownRoute)
      .then((shapes) => {
        if (cancelled) return;
        const allPoints: LatLon[] = [];
        const drawnStops = new Set<number>();
        // The two busiest patterns are normally the two directions.
        for (const pattern of shapes.patterns.slice(0, 2)) {
          L.polyline(pattern.points, { color: outline, weight: 9, interactive: false }).addTo(layers.route);
          L.polyline(pattern.points, { color: colour, weight: 5, interactive: false }).addTo(layers.route);
          allPoints.push(...pattern.points);
          for (const stopNumber of pattern.stops) {
            if (drawnStops.has(stopNumber)) continue;
            drawnStops.add(stopNumber);
            const stop = data.stopByNumber.get(stopNumber);
            if (!stop) continue;
            const marker = L.circleMarker([stop.lat, stop.lon], {
              radius: 4, color: outline, weight: 2, fillColor: "#ffffff", fillOpacity: 1,
            });
            marker.on("click", () => { selectStop(stop.number); setTab("map"); });
            marker.bindTooltip(`${shortStopName(stop.name)} (${stop.number})`, { direction: "top" });
            marker.addTo(layers.route);
          }
        }
        if (allPoints.length > 0) {
          map.fitBounds(L.latLngBounds(allPoints), {
            paddingTopLeft: [24, 90],
            paddingBottomRight: [24, bottomCover(containerRef.current!) + 24],
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ready, data, shownRoute, theme, selectStop, setTab]);

  // --- the active quest: every tracked bus, its route line and its stops ---
  const trips = questTrips.data;
  useEffect(() => {
    const L = leafletRef.current;
    const layers = layersRef.current;
    if (!ready || !L || !layers || !data) return;
    layers.track.clearLayers();
    if (quest.length === 0 || !trips) return;

    const outline = cssColour("--outline", "#3b2314");
    const colour = cssColour("--lantern", "#ff7a1a");

    // A white dot with a little flag label, e.g. "GET ON F5".
    // "below" puts the label under the dot, so two labels fit at one stop.
    function drawStopFlag(stopNumber: number | undefined, label: string, below = false) {
      const stop = stopNumber !== undefined ? data!.stopByNumber.get(stopNumber) : undefined;
      if (!stop) return;
      L!.marker([stop.lat, stop.lon], {
        icon: L!.divIcon({
          className: below ? "map-flag map-flag-below" : "map-flag",
          html: `<span>${label}</span>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      }).addTo(layers!.track);
      L!.circleMarker([stop.lat, stop.lon], {
        radius: 8, color: outline, weight: 3, fillColor: "#ffffff", fillOpacity: 1, interactive: false,
      }).addTo(layers!.track);
    }

    quest.forEach((leg, index) => {
      const trip = trips[index];
      if (!trip) return;
      const pattern = questPatterns[index];

      // Line colours: the route's own colour (the same as its badge). Dark
      // colours get a white edge and light colours a dark edge, so the line
      // shows up on both the day and the night map.
      const routeColour = data.routeById.get(leg.routeId)?.color ?? colour;
      const edge = isDarkColour(routeColour) ? "#ffffff" : outline;

      // The part of the route the rider travels on: a solid line.
      const line = legLine(leg, trip, pattern, data);
      if (line.length > 1) {
        L.polyline(line, { color: edge, weight: 10, interactive: false }).addTo(layers.track);
        L.polyline(line, { color: routeColour, weight: 6, interactive: false }).addTo(layers.track);
      }

      // Where to get on (label above the stop) and get off (label below it).
      const nextLeg = quest[index + 1];
      if (leg.stayOnBus) {
        drawStopFlag(leg.stopNumber, `STAY ON: ${leg.routeId}`);
      } else if (leg.alightStop === undefined) {
        drawStopFlag(leg.stopNumber, "YOUR STOP");
      } else {
        drawStopFlag(leg.stopNumber, `GET ON ${leg.routeId}`);
      }
      // No "get off" when the same bus simply carries on as the next route.
      if (leg.alightStop !== undefined && !(nextLeg && nextLeg.stayOnBus)) {
        drawStopFlag(leg.alightStop, `GET OFF ${leg.routeId}`, true);
      }
    });
  }, [ready, data, quest, trips, questPatterns, theme]);

  // Show the whole quest (buses and stops) when tracking starts.
  const questKey = quest.map((leg) => leg.tripKey).join(",");
  const hasTrips = trips !== undefined;
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || !data || quest.length === 0 || !trips || tab !== "track") return;

    const points: LatLon[] = [];
    quest.forEach((leg, index) => {
      const trip = trips[index];
      if (!trip) return;
      // Fit the whole of every route line that is drawn.
      points.push(...legLine(leg, trip, questPatterns[index], data));
      for (const stopNumber of [leg.stopNumber, leg.alightStop]) {
        const stop = stopNumber !== undefined ? data.stopByNumber.get(stopNumber) : undefined;
        if (stop) points.push([stop.lat, stop.lon]);
      }
    });
    if (points.length === 0) return;

    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [40, 100],
      paddingBottomRight: [40, bottomCover(containerRef.current!) + 40],
      maxZoom: 16,
    });
    // Only when a new quest starts or the Track tab opens, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, questKey, hasTrips, tab, questPatterns.length]);

  // --- the user's location ---
  useEffect(() => {
    const L = leafletRef.current;
    const layers = layersRef.current;
    if (!ready || !L || !layers) return;
    layers.user.clearLayers();
    if (!userLocation) return;
    L.circleMarker(userLocation, {
      radius: 9, color: "#ffffff", weight: 3, fillColor: "#2f7de1", fillOpacity: 1, interactive: false,
    }).addTo(layers.user);
  }, [ready, userLocation]);

  // Centre on the rider the first time we learn where they are, so nearby
  // stops show up straight away. Only if they haven't started doing something.
  const centredOnUserRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !userLocation || centredOnUserRef.current) return;
    centredOnUserRef.current = true;
    const busy = selectedStop !== undefined || shownRoute !== undefined || tracked !== undefined || tab !== "map";
    // Don't jump away from the city for someone opening the app elsewhere.
    const inWinnipeg =
      Math.abs(userLocation[0] - WINNIPEG_CENTRE[0]) < 0.3 && Math.abs(userLocation[1] - WINNIPEG_CENTRE[1]) < 0.5;
    if (!busy && inWinnipeg) map.setView(userLocation, 16, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userLocation]);

  // --- fly to a place when another screen asks ---
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !mapTarget) return;
    // Shift the target up a bit on phones so the sheet doesn't hide it.
    const cover = bottomCover(containerRef.current!);
    const point = map.project([mapTarget.lat, mapTarget.lon], mapTarget.zoom);
    point.y += cover / 2;
    map.setView(map.unproject(point, mapTarget.zoom), mapTarget.zoom, { animate: true });
  }, [ready, mapTarget]);

  const showZoomHint =
    ready && zoom < STOP_ZOOM && tab === "map" && !shownRoute && selectedStop === undefined && !questActive;

  return (
    <div className={`map-wrap ${sketchMode ? "map-sketch" : ""}`}>
      <div ref={containerRef} className="map" />
      <div className="map-zoom">
        <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>
          <span className="zoom-sign">+</span>
        </button>
        <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
          <span className="zoom-sign">−</span>
        </button>
      </div>
      {showZoomHint && (
        <div className="map-hint">
          {sketchMode ? "Sketch map (bus routes only). Zoom in for stops" : "Zoom in to see bus stops"}
        </div>
      )}
    </div>
  );
}
