"use client";
// Shared app state: which tab is open, the selected stop, the tracked bus,
// favourites, theme, and the user's location.

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { dataSource } from "@/lib/dataSource";
import { LatLon, WINNIPEG_CENTRE } from "@/lib/geo";
import { bestPatternForTrip } from "@/lib/position";
import { loadRouteShapes, loadStaticData, Pattern, StaticData } from "@/lib/staticData";
import { readStored, writeStored } from "@/lib/storage";
import type { TrackedBus, TripSchedule } from "@/lib/types";
import { PollState, usePolling } from "@/hooks/usePolling";
import { useStoredState } from "@/hooks/useStoredState";

export type Tab = "map" | "track" | "trip";
export type FavouriteStop = { number: number; name: string };
export type MapTarget = { lat: number; lon: number; zoom: number; id: number };
export type Theme = "light" | "dark";

type AppContextValue = {
  tab: Tab;
  setTab: (tab: Tab) => void;

  data: StaticData | undefined; // stops and routes from GTFS
  dataError: string | undefined;

  selectedStop: number | undefined;
  selectStop: (stopNumber: number | undefined) => void;

  shownRoute: string | undefined; // route line drawn on the map
  setShownRoute: (routeId: string | undefined) => void;

  // The active quest: the bus (or buses, for a trip with transfers) being tracked.
  quest: TrackedBus[]; // empty when nothing is tracked
  tracked: TrackedBus | undefined; // the first bus of the quest
  startTracking: (bus: TrackedBus) => void; // one bus
  startTrip: (legs: TrackedBus[]) => void; // a whole trip
  stopTracking: () => void;
  questTrips: PollState<TripSchedule[]>; // live stop times, one per bus
  questPatterns: (Pattern | undefined)[]; // route lines, one per bus

  favouriteStops: FavouriteStop[];
  toggleFavouriteStop: (stop: FavouriteStop) => void;
  favouriteRoutes: string[];
  toggleFavouriteRoute: (routeId: string) => void;

  userLocation: LatLon | undefined;
  locationNote: string | undefined;
  locate: () => Promise<LatLon>;

  mapTarget: MapTarget | undefined;
  flyTo: (lat: number, lon: number, zoom?: number) => void;

  theme: Theme;
  toggleTheme: () => void;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside <AppStateProvider>");
  return value;
}

function systemTheme(): Theme {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>("map");
  const [data, setData] = useState<StaticData | undefined>(undefined);
  const [dataError, setDataError] = useState<string | undefined>(undefined);
  const [selectedStop, setSelectedStop] = useState<number | undefined>(undefined);
  const [shownRoute, setShownRoute] = useState<string | undefined>(undefined);
  const [quest, setQuest] = useStoredState<TrackedBus[]>("busbuddy.quest", []);
  const [favouriteStops, setFavouriteStops] = useStoredState<FavouriteStop[]>("busbuddy.favStops", []);
  const [favouriteRoutes, setFavouriteRoutes] = useStoredState<string[]>("busbuddy.favRoutes", []);
  const [userLocation, setUserLocation] = useState<LatLon | undefined>(undefined);
  const [locationNote, setLocationNote] = useState<string | undefined>(undefined);
  const [mapTarget, setMapTarget] = useState<MapTarget | undefined>(undefined);
  const [theme, setTheme] = useState<Theme>("light");
  const [questPatterns, setQuestPatterns] = useState<(Pattern | undefined)[]>([]);

  // Load stops and routes once.
  useEffect(() => {
    loadStaticData()
      .then(setData)
      .catch(() => setDataError("Couldn't load the stop list. Check your connection and reload."));
  }, []);

  // Theme: follow the system unless the user picked one before.
  useEffect(() => {
    const stored = readStored<Theme | null>("busbuddy.theme", null);
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
      setTheme(stored);
    } else {
      const fromPage = document.documentElement.getAttribute("data-theme");
      setTheme(fromPage === "dark" || fromPage === "light" ? fromPage : systemTheme());
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      writeStored("busbuddy.theme", next);
      return next;
    });
  }, []);

  const flyTo = useCallback((lat: number, lon: number, zoom = 16) => {
    setMapTarget({ lat, lon, zoom, id: Date.now() });
  }, []);

  const selectStop = useCallback((stopNumber: number | undefined) => {
    setSelectedStop(stopNumber);
  }, []);

  // --- active quest: poll every tracked bus's trip schedule every 30 s ---
  const questKey = quest.length > 0 ? quest.map((leg) => leg.tripKey).join(",") : undefined;
  const questTrips = usePolling<TripSchedule[]>(questKey, () =>
    Promise.all(quest.map((leg) => dataSource.getTrip(leg.tripKey)))
  );

  // Find the route line that matches each tracked trip.
  const questTripData = questTrips.data;
  useEffect(() => {
    if (!questTripData) {
      setQuestPatterns([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      questTripData.map((trip) =>
        loadRouteShapes(trip.routeId)
          .then((shapes) => bestPatternForTrip(shapes.patterns, trip))
          .catch(() => undefined)
      )
    ).then((patterns) => {
      if (!cancelled) setQuestPatterns(patterns);
    });
    return () => {
      cancelled = true;
    };
  }, [questTripData]);

  const startTrip = useCallback(
    (legs: TrackedBus[]) => {
      setQuest(legs);
      setShownRoute(undefined);
      setTab("track");
    },
    [setQuest]
  );
  const startTracking = useCallback((bus: TrackedBus) => startTrip([bus]), [startTrip]);
  const stopTracking = useCallback(() => setQuest([]), [setQuest]);

  const toggleFavouriteStop = useCallback(
    (stop: FavouriteStop) => {
      const exists = favouriteStops.some((item) => item.number === stop.number);
      if (exists) {
        setFavouriteStops(favouriteStops.filter((item) => item.number !== stop.number));
      } else {
        setFavouriteStops([...favouriteStops, stop]);
      }
    },
    [favouriteStops, setFavouriteStops]
  );

  const toggleFavouriteRoute = useCallback(
    (routeId: string) => {
      if (favouriteRoutes.includes(routeId)) {
        setFavouriteRoutes(favouriteRoutes.filter((id) => id !== routeId));
      } else {
        setFavouriteRoutes([...favouriteRoutes, routeId]);
      }
    },
    [favouriteRoutes, setFavouriteRoutes]
  );

  // --- location ---
  // The app follows the phone's location while it is open, so the rider
  // never has to type where they are. The browser asks for permission once.
  // The location stays in the browser; it is only sent (to Winnipeg Transit,
  // through our server) when the rider asks for a trip plan from "My location".
  const lastFixRef = useRef<{ point: LatLon; time: number } | undefined>(undefined);

  const saveFix = useCallback((point: LatLon) => {
    lastFixRef.current = { point, time: Date.now() };
    setLocationNote(undefined);
    // Skip tiny GPS wobbles so the screen doesn't redraw for nothing.
    setUserLocation((old) => {
      if (old && Math.abs(old[0] - point[0]) < 0.0001 && Math.abs(old[1] - point[1]) < 0.0001) return old;
      return point;
    });
  }, []);

  const useDemoSpot = useCallback((): LatLon => {
    // The demo can't always use real location, so it pretends.
    setLocationNote("Demo: pretending you are at Portage and Main.");
    setUserLocation(WINNIPEG_CENTRE);
    return WINNIPEG_CENTRE;
  }, []);

  // Follow the location automatically. Pauses while the tab is hidden.
  useEffect(() => {
    const canLocate = typeof navigator !== "undefined" && "geolocation" in navigator;
    if (!canLocate) {
      if (dataSource.isDemo) useDemoSpot();
      return;
    }
    let watchId: number | undefined;

    function start() {
      if (watchId !== undefined) return;
      watchId = navigator.geolocation.watchPosition(
        (position) => saveFix([position.coords.latitude, position.coords.longitude]),
        () => {
          // Permission refused or no signal. Stay quiet: the rider can still
          // search for a stop, or tap the "near me" button to try again.
          if (dataSource.isDemo) useDemoSpot();
        },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
      );
    }
    function stop() {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
        watchId = undefined;
      }
    }
    function onVisibilityChange() {
      if (document.hidden) stop();
      else start();
    }

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [saveFix, useDemoSpot]);

  // Get the location right now (used by the "near me" button and trip planner).
  const locate = useCallback((): Promise<LatLon> => {
    return new Promise((resolve, reject) => {
      // A recent fix from the automatic tracking is good enough.
      const last = lastFixRef.current;
      if (last && Date.now() - last.time < 60000) {
        resolve(last.point);
        return;
      }
      function fail(message: string) {
        if (dataSource.isDemo) {
          resolve(useDemoSpot());
        } else {
          setLocationNote(message);
          reject(new Error(message));
        }
      }
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        fail("This device can't share its location.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const point: LatLon = [position.coords.latitude, position.coords.longitude];
          saveFix(point);
          resolve(point);
        },
        () => fail("Couldn't get your location. Check that location permission is allowed."),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }, [saveFix, useDemoSpot]);

  const value = useMemo<AppContextValue>(
    () => ({
      tab, setTab, data, dataError, selectedStop, selectStop, shownRoute, setShownRoute,
      quest, tracked: quest[0], startTracking, startTrip, stopTracking, questTrips, questPatterns,
      favouriteStops, toggleFavouriteStop, favouriteRoutes, toggleFavouriteRoute,
      userLocation, locationNote, locate, mapTarget, flyTo, theme, toggleTheme,
    }),
    [
      tab, data, dataError, selectedStop, selectStop, shownRoute, quest, startTracking, startTrip, stopTracking,
      questTrips, questPatterns, favouriteStops, toggleFavouriteStop, favouriteRoutes,
      toggleFavouriteRoute, userLocation, locationNote, locate, mapTarget, flyTo, theme, toggleTheme,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
