"use client";
import { useEffect, useState } from "react";
import { dataSource } from "@/lib/dataSource";
import { findTripBuses } from "@/lib/quest";
import { formatClock } from "@/lib/time";
import { LONG_WAIT_MINUTES } from "@/lib/transfer";
import type { Place, PlanSegment, TripPlan, TripTime } from "@/lib/types";
import { usePolling } from "@/hooks/usePolling";
import { useStoredState } from "@/hooks/useStoredState";
import { useApp } from "./AppState";
import { PlaceInput } from "./PlaceInput";
import { QuestPath, QuestStep } from "./QuestPath";
import { BigButton, ErrorNote, LoadingNote } from "./pixel/Buttons";
import { PixelIcon } from "./pixel/PixelIcon";
import { RouteBadge } from "./pixel/RouteBadge";
import { nextFiveMinutes, WhenPicker } from "./WhenPicker";

type SortBy = "fastest" | "fewest";
type WhenMode = "now" | "depart" | "arrive";
type Search = { origin: Place; destination: Place; when: TripTime; id: number };

const MINUTE = 60 * 1000;
const LATER_TRIPS = 3; // how many later trips to list under a plan
const LATER_SEARCHES = 4; // most Trip Planner requests used to find them

// Mode A: type where you're going and get the best options.
export function TripHome() {
  const app = useApp();
  const [origin, setOrigin] = useState<Place | undefined>(undefined);
  const [useMyLocation, setUseMyLocation] = useState(true);
  const [destination, setDestination] = useState<Place | undefined>(undefined);
  const [home, setHome] = useStoredState<Place | null>("busbuddy.home", null);
  const [sortBy, setSortBy] = useState<SortBy>("fastest");
  const [search, setSearch] = useState<Search | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [openPlan, setOpenPlan] = useState<number | undefined>(0);
  const [whenMode, setWhenMode] = useState<WhenMode>("now");
  const [whenTime, setWhenTime] = useState<number | undefined>(undefined); // epoch ms

  const plans = usePolling<TripPlan[]>(
    search ? `plan-${search.id}` : undefined,
    () => dataSource.planTrip(search!.origin, search!.destination, search!.when)
  );

  function chooseWhen(mode: WhenMode) {
    setWhenMode(mode);
    // Start the picker at the current time.
    if (mode !== "now" && whenTime === undefined) {
      setWhenTime(nextFiveMinutes(Date.now()));
    }
  }

  async function findTrips() {
    setProblem(undefined);
    if (!destination) {
      setProblem("Choose where you're going from the suggestions.");
      return;
    }
    let from = origin;
    if (useMyLocation) {
      try {
        const point = await app.locate();
        from = { kind: "geo", key: "", label: "My location", lat: point[0], lon: point[1] };
      } catch {
        setProblem("Couldn't get your location. Type a starting address instead.");
        setUseMyLocation(false);
        return;
      }
    }
    if (!from) {
      setProblem("Choose a starting place from the suggestions.");
      return;
    }
    let when: TripTime = { mode: "now" };
    if (whenMode !== "now") {
      when = { mode: whenMode, time: whenTime ?? nextFiveMinutes(Date.now()) };
    }
    setOpenPlan(0);
    setSearch({ origin: from, destination, when, id: Date.now() });
  }

  const sorted = [...(plans.data ?? [])];
  if (sortBy === "fastest") {
    sorted.sort((a, b) => a.totalMinutes - b.totalMinutes || a.end - b.end);
  } else {
    sorted.sort((a, b) => a.busCount - b.busCount || a.totalMinutes - b.totalMinutes);
  }

  return (
    <div className="trip-mode">
      <div className="field">
        <span className="field-label">From</span>
        <div className="choice-row">
          <button
            type="button"
            className={`chip ${useMyLocation ? "chip-on" : ""}`}
            aria-pressed={useMyLocation}
            onClick={() => setUseMyLocation(true)}
          >
            <PixelIcon name="locate" size={14} /> My location
          </button>
          <button
            type="button"
            className={`chip ${!useMyLocation ? "chip-on" : ""}`}
            aria-pressed={!useMyLocation}
            onClick={() => setUseMyLocation(false)}
          >
            Another address
          </button>
        </div>
      </div>
      {!useMyLocation && (
        <PlaceInput inputId="trip-origin" label="Starting address" placeholder="e.g. 510 Main" value={origin} onChange={setOrigin} />
      )}

      <PlaceInput inputId="trip-destination" label="Going to" placeholder="e.g. 414 Osborne" value={destination} onChange={setDestination} />
      <div className="choice-row">
        {home && (
          <button type="button" className="chip" onClick={() => setDestination(home)}>
            <PixelIcon name="home" size={14} /> Home: {home.label}
          </button>
        )}
        {destination && (!home || home.label !== destination.label) && (
          <button type="button" className="chip" onClick={() => setHome(destination)}>
            Save as Home
          </button>
        )}
      </div>

      <div className="field">
        <span className="field-label">When</span>
        <div className="choice-row">
          <button type="button" className={`chip ${whenMode === "now" ? "chip-on" : ""}`} aria-pressed={whenMode === "now"} onClick={() => chooseWhen("now")}>
            Leave now
          </button>
          <button type="button" className={`chip ${whenMode === "depart" ? "chip-on" : ""}`} aria-pressed={whenMode === "depart"} onClick={() => chooseWhen("depart")}>
            Depart at
          </button>
          <button type="button" className={`chip ${whenMode === "arrive" ? "chip-on" : ""}`} aria-pressed={whenMode === "arrive"} onClick={() => chooseWhen("arrive")}>
            Arrive by
          </button>
        </div>
        {whenMode !== "now" && whenTime !== undefined && <WhenPicker value={whenTime} onChange={setWhenTime} />}
      </div>

      <BigButton onClick={findTrips}>Find trips</BigButton>
      {problem && <ErrorNote text={problem} />}
      {app.locationNote && useMyLocation && search && <p className="hint">{app.locationNote}</p>}

      {plans.loading && <LoadingNote text="Planning your trip…" />}
      {plans.error && <ErrorNote text={plans.error} />}
      {plans.data && plans.data.length === 0 && !plans.loading && (
        <p className="hint">No trips found right now. Try a different address or time.</p>
      )}

      {sorted.length > 0 && (
        <>
          <div className="choice-row sort-row">
            <span className="field-label">Sort by</span>
            <button type="button" className={`chip ${sortBy === "fastest" ? "chip-on" : ""}`} aria-pressed={sortBy === "fastest"} onClick={() => setSortBy("fastest")}>
              Fastest
            </button>
            <button type="button" className={`chip ${sortBy === "fewest" ? "chip-on" : ""}`} aria-pressed={sortBy === "fewest"} onClick={() => setSortBy("fewest")}>
              Fewest buses
            </button>
          </div>
          <ul className="plan-list">
            {sorted.map((plan, index) => (
              <PlanCard
                key={`${routeSignature(plan)}-${index}`}
                plan={plan}
                origin={search!.origin}
                destination={search!.destination}
                open={openPlan === index}
                onToggle={() => setOpenPlan(openPlan === index ? undefined : index)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

type PlanCardProps = {
  plan: TripPlan;
  origin: Place;
  destination: Place;
  open: boolean;
  onToggle: () => void;
};

function PlanCard({ plan, origin, destination, open, onToggle }: PlanCardProps) {
  const { data } = useApp();
  const rides = plan.segments.filter((segment) => segment.type === "ride");
  const transfers = plan.segments.filter((segment) => segment.type === "transfer");

  return (
    <li className="plan-card">
      <button type="button" className="plan-summary" onClick={onToggle} aria-expanded={open}>
        <span className="plan-total">
          <span className="big-time">{plan.totalMinutes} MIN</span>
          <span className="plan-clock">
            {formatClock(plan.start)} → {formatClock(plan.end)}
          </span>
        </span>
        <span className="plan-badges">
          {rides.map((ride, index) => (
            <RouteBadge key={index} routeId={ride.routeId ?? "?"} route={data?.routeById.get(ride.routeId ?? "")} size="small" />
          ))}
        </span>
        <span className="plan-facts">
          <span>{plan.busCount} {plan.busCount === 1 ? "bus" : "buses"}</span>
          <span>{plan.walkMinutes} min walk</span>
          {transfers.length === 0 && <span>no transfer</span>}
          {transfers.map((transfer, index) => {
            const wait = transfer.waitMinutes ?? transfer.minutes;
            return (
              <span key={index} className={wait > LONG_WAIT_MINUTES ? "fact-warn" : ""}>
                wait {wait} min
              </span>
            );
          })}
        </span>
      </button>
      {open && <QuestPath steps={planSteps(plan.segments)} />}
      {open && <StartTripButton plan={plan} />}
      {open && <LaterTrips plan={plan} origin={origin} destination={destination} />}
    </li>
  );
}

// Starts live tracking of every bus in a plan (the "active quest").
// It stays on until the rider cancels it on the Track tab.
function StartTripButton({ plan }: { plan: TripPlan }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  async function start() {
    setBusy(true);
    setProblem(undefined);
    try {
      const legs = await findTripBuses(dataSource, plan);
      app.startTrip(legs); // opens the Track tab
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't start this trip.");
      setBusy(false);
    }
  }

  return (
    <div className="start-trip">
      <BigButton onClick={start} disabled={busy}>
        {busy ? "Finding your buses…" : "Start this trip"}
      </BigButton>
      {problem && <ErrorNote text={problem} />}
    </div>
  );
}

// "F8>330": the buses of a plan, in order.
function routeSignature(plan: TripPlan): string {
  return plan.segments
    .filter((segment) => segment.type === "ride")
    .map((segment) => segment.routeId)
    .join(">");
}

// When the first bus of a plan leaves.
function firstBusTime(plan: TripPlan): number {
  const firstRide = plan.segments.find((segment) => segment.type === "ride");
  return firstRide ? firstRide.start : plan.start;
}

// Asks the Trip Planner for later departures and keeps the ones that
// use the same buses in the same order.
async function findLaterTrips(plan: TripPlan, origin: Place, destination: Place): Promise<TripPlan[]> {
  const wanted = routeSignature(plan);
  const found: TripPlan[] = [];
  let lastBus = firstBusTime(plan);
  let after = plan.start + MINUTE;

  for (let search = 0; search < LATER_SEARCHES && found.length < LATER_TRIPS; search++) {
    const plans = await dataSource.planTrip(origin, destination, { mode: "depart", time: after });
    let next: TripPlan | undefined;
    for (const candidate of plans) {
      if (routeSignature(candidate) !== wanted) continue;
      if (firstBusTime(candidate) <= lastBus) continue; // the same bus again
      if (!next || candidate.start < next.start) next = candidate;
    }
    if (next) {
      found.push(next);
      lastBus = firstBusTime(next);
      after = next.start + MINUTE;
    } else {
      after += 10 * MINUTE; // nothing yet: look a little later
    }
  }
  return found;
}

// The next few trips that use the same buses, e.g. the 2:30 and 3:00 F8 → 330.
function LaterTrips({ plan, origin, destination }: { plan: TripPlan; origin: Place; destination: Place }) {
  const [later, setLater] = useState<TripPlan[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | undefined>(undefined);
  const routes = routeSignature(plan);

  // Runs once per plan and search (not on every 30 s refresh), to save API requests.
  useEffect(() => {
    let cancelled = false;
    setLater(undefined);
    setFailed(false);
    setOpenIndex(undefined);
    findLaterTrips(plan, origin, destination)
      .then((found) => {
        if (!cancelled) setLater(found);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, origin, destination]);

  const label = routes.split(">").join(" → ");

  return (
    <div className="later">
      <h3 className="section-title">
        <span>
          Later <span className="number-text">{label}</span> trips
        </span>
      </h3>
      {later === undefined && !failed && <p className="hint">Looking for later trips…</p>}
      {failed && <p className="hint">Couldn't load later trips.</p>}
      {later && later.length === 0 && <p className="hint">No later trips with these buses found.</p>}
      <ul className="option-list">
        {(later ?? []).map((trip, index) => {
          const waits = trip.segments.filter((segment) => segment.type === "transfer");
          return (
            <li key={trip.start}>
              <button
                type="button"
                className={`option-row ${openIndex === index ? "option-row-on" : ""}`}
                onClick={() => setOpenIndex(openIndex === index ? undefined : index)}
                aria-expanded={openIndex === index}
              >
                <span className="option-leave">
                  {formatClock(trip.start)} → {formatClock(trip.end)}
                </span>
                <span>{trip.totalMinutes} min</span>
                {waits.map((transfer, waitIndex) => {
                  const wait = transfer.waitMinutes ?? transfer.minutes;
                  return (
                    <span key={waitIndex} className={wait > LONG_WAIT_MINUTES ? "fact-warn" : "option-arrive"}>
                      wait {wait} min
                    </span>
                  );
                })}
              </button>
              {openIndex === index && <QuestPath steps={planSteps(trip.segments)} />}
              {openIndex === index && <StartTripButton plan={trip} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Turns plan segments into quest steps.
function planSteps(segments: PlanSegment[]): QuestStep[] {
  const steps: QuestStep[] = [];
  for (const segment of segments) {
    if (segment.type === "walk") {
      steps.push({
        icon: "walk",
        time: formatClock(segment.start),
        title: `Walk ${segment.minutes} min`,
        detail: segment.toName ? `to ${segment.toName}` : undefined,
      });
    } else if (segment.type === "ride") {
      steps.push({
        icon: "bus",
        time: formatClock(segment.start),
        title: `Ride ${segment.routeId}${segment.destination ? " to " + segment.destination : ""}`,
        detail: `${segment.minutes} min on the bus, off at ${formatClock(segment.end)}`,
      });
    } else {
      const wait = segment.waitMinutes ?? segment.minutes;
      steps.push({
        icon: "clock",
        time: formatClock(segment.start),
        title: `Wait ${wait} min`,
        detail: segment.toName ? `at ${segment.toName}` : undefined,
        warn: wait > LONG_WAIT_MINUTES,
      });
    }
  }
  if (segments.length > 0) {
    const last = segments[segments.length - 1];
    steps.push({ icon: "flag", time: formatClock(last.end), title: "Arrive" });
  }
  return steps;
}
