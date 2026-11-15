// Shared data shapes. The server turns Winnipeg Transit's JSON into these
// simple shapes, so the browser code never deals with the raw API format.
// All times are "epoch milliseconds" (a plain number).

export type Arrival = {
  tripKey: string;
  routeId: string; // e.g. "330", "F8", "BLUE"
  destination: string; // e.g. "McLeod & Louelda"
  scheduled: number;
  estimated: number;
  cancelled: boolean;
  busKey?: string;
};

export type StopSchedule = {
  stopNumber: number;
  stopName: string;
  arrivals: Arrival[]; // sorted by estimated time
};

export type TripStop = {
  stopNumber: number;
  stopName: string;
  lat?: number;
  lon?: number;
  scheduled: number;
  estimated: number;
  cancelled: boolean;
};

export type TripSchedule = {
  tripKey: string;
  routeId: string;
  destination: string;
  busKey?: string;
  nextTripKey?: string; // the trip the same bus does next
  stops: TripStop[];
};

export type ServiceStatus = {
  value: string; // e.g. "regular", "esp-1"
  message: string;
  isEmergency: boolean; // true when an Emergency Service Plan is active
  utcOffsetMinutes?: number; // Winnipeg's real UTC offset; see "clock shift" in lib/time.ts
};

// A place the user can travel from or to.
export type Place = {
  kind: "address" | "monument" | "intersection" | "stop" | "geo";
  key: string; // the API key for this place ("" for geo points)
  label: string;
  lat: number;
  lon: number;
};

export type PlanSegment = {
  type: "walk" | "ride" | "transfer";
  start: number;
  end: number;
  minutes: number;
  // ride segments
  routeId?: string;
  destination?: string;
  boardStop?: number; // stop number where you get on
  boardStopName?: string;
  alightStop?: number; // stop number where you get off
  alightStopName?: string;
  // walk and transfer segments
  fromStop?: number; // stop numbers, when the segment starts or ends at a stop
  toStop?: number;
  fromName?: string;
  toName?: string;
  walkMinutes?: number;
  waitMinutes?: number;
};

export type TripPlan = {
  start: number;
  end: number;
  totalMinutes: number;
  walkMinutes: number;
  waitMinutes: number;
  rideMinutes: number;
  busCount: number;
  segments: PlanSegment[];
};

// When the rider wants to travel: leave now, depart at a time, or arrive by a time.
// `time` is epoch milliseconds.
export type TripTime = { mode: "now" } | { mode: "depart" | "arrive"; time: number };

// The bus the user chose to follow ("active quest").
export type TrackedBus = {
  tripKey: string;
  routeId: string;
  destination: string;
  stopNumber: number; // the stop where the user gets on
  stopName: string;
  alightStop?: number; // where the user gets off (known for planned trips)
  alightStopName?: string;
  stayOnBus?: boolean; // true when the previous bus simply becomes this route
};

// Options for reading a stop schedule.
export type ScheduleOptions = {
  routes?: string[]; // only these routes
  minutesAhead?: number; // how far ahead to look (default 120)
};

// Everything the screens need. There are two versions of this:
// the live one (talks to our API routes) and the demo one (made-up times).
export type DataSource = {
  isDemo: boolean;
  getStatus(): Promise<ServiceStatus>;
  getStopSchedule(stopNumber: number, options?: ScheduleOptions): Promise<StopSchedule>;
  getTrip(tripKey: string): Promise<TripSchedule>;
  searchPlaces(query: string): Promise<Place[]>;
  planTrip(origin: Place, destination: Place, when?: TripTime): Promise<TripPlan[]>;
};
