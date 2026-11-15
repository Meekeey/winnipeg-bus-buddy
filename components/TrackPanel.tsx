"use client";
import { estimateBusPosition } from "@/lib/position";
import { formatArrival, formatClock, minutesUntil } from "@/lib/time";
import { LONG_WAIT_MINUTES } from "@/lib/transfer";
import type { TrackedBus, TripSchedule, TripStop } from "@/lib/types";
import { useNow } from "@/hooks/useNow";
import { useApp } from "./AppState";
import { QuestPath, QuestStep } from "./QuestPath";
import { Sheet } from "./Sheet";
import { NearbyStops } from "./NearbyStops";
import { StopSearch } from "./StopSearch";
import { BigButton, ErrorNote, IconButton, LoadingNote } from "./pixel/Buttons";
import { PixelIcon } from "./pixel/PixelIcon";
import { RouteBadge } from "./pixel/RouteBadge";
import { StatusTag } from "./pixel/StatusTag";

const MINUTE = 60 * 1000;

// The Track tab: the bus or trip you are following ("active quest") or,
// when there is none, your favourites and a way to pick a stop.
export function TrackPanel() {
  const { quest } = useApp();
  if (quest.length > 0) return <ActiveQuest />;
  return <PickABus />;
}

// One tracked bus with the live times at the rider's stops.
type LegView = {
  leg: TrackedBus;
  trip: TripSchedule | undefined;
  boardIndex: number; // position of the boarding stop in the trip (-1 if missing)
  alightIndex: number; // position of the get-off stop (-1 if unknown)
  board: TripStop | undefined;
  alight: TripStop | undefined;
};

function viewLeg(leg: TrackedBus, trip: TripSchedule | undefined): LegView {
  let boardIndex = -1;
  let alightIndex = -1;
  if (trip) {
    boardIndex = trip.stops.findIndex((stop) => stop.stopNumber === leg.stopNumber);
    if (leg.alightStop !== undefined) {
      // The get-off stop comes after the boarding stop.
      alightIndex = trip.stops.findIndex((stop, index) => index > boardIndex && stop.stopNumber === leg.alightStop);
    }
  }
  return {
    leg,
    trip,
    boardIndex,
    alightIndex,
    board: trip && boardIndex !== -1 ? trip.stops[boardIndex] : undefined,
    alight: trip && alightIndex !== -1 ? trip.stops[alightIndex] : undefined,
  };
}

// "before": the bus hasn't reached the rider's stop. "riding": the rider is on it.
// "done": this bus's part of the trip is over.
function legState(view: LegView, now: number): "before" | "riding" | "done" {
  if (!view.board) return "before";
  if (view.board.estimated >= now - MINUTE) return "before";
  if (view.alight && view.alight.estimated >= now - MINUTE) return "riding";
  return "done";
}

function ActiveQuest() {
  const app = useApp();
  const now = useNow(5000);
  const trips = app.questTrips.data;
  const views = app.quest.map((leg, index) => viewLeg(leg, trips ? trips[index] : undefined));
  const isTrip = views.length > 1 || views[0].leg.alightStop !== undefined;

  // The bus that matters right now: the first one that isn't finished.
  let currentIndex = views.findIndex((view) => legState(view, now) !== "done");
  if (currentIndex === -1) currentIndex = views.length - 1;
  const current = views[currentIndex];
  const currentState = legState(current, now);

  const position =
    current.trip && app.data
      ? estimateBusPosition(current.trip, now, app.data, app.questPatterns[currentIndex]?.points)
      : undefined;

  // Stops ahead for the current bus, ending where the rider gets on (or off).
  const steps: QuestStep[] = [];
  if (current.trip) {
    const stops = current.trip.stops;
    const targetIndex = currentState === "riding" ? current.alightIndex : current.boardIndex;
    const firstUpcoming = stops.findIndex((stop) => stop.estimated >= now - 30000);
    const start = firstUpcoming === -1 ? stops.length : firstUpcoming;
    let end = Math.min(stops.length, start + 12);
    if (targetIndex !== -1 && targetIndex >= start) end = targetIndex + 1;
    for (let i = start; i < end; i++) {
      const stop = stops[i];
      let title = stop.stopName;
      if (i === targetIndex) {
        title += currentState === "riding" ? " (get off here)" : isTrip ? " (get on here)" : " (your stop)";
      }
      steps.push({
        icon: i === targetIndex ? "flag" : "pin",
        time: formatClock(stop.estimated),
        title,
        detail: `#${stop.stopNumber} · in ${minutesUntil(stop.estimated, now)} min`,
      });
    }
  }

  return (
    <Sheet
      size="tall"
      title="Active quest"
      actions={<IconButton icon="refresh" label="Refresh now" onClick={app.questTrips.refresh} />}
    >
      {views.map((view, index) => (
        <div key={view.leg.tripKey} className="quest-leg">
          {index > 0 && <TransferNote previous={views[index - 1]} next={view} />}
          <LegCard view={view} now={now} isCurrent={index === currentIndex} isTrip={isTrip} />
        </div>
      ))}

      {app.questTrips.loading && <LoadingNote text={views.length > 1 ? "Finding your buses…" : "Finding your bus…"} />}
      {app.questTrips.error && <ErrorNote text={app.questTrips.error} />}

      {position && (
        <p className="position-note">
          <b>Estimated position of the {current.leg.routeId}:</b>{" "}
          {position.state === "not-started" && "waiting to start its trip."}
          {position.state === "finished" && "this bus has finished its trip."}
          {position.state === "moving" && position.previousStop && position.nextStop && (
            <>
              between {position.previousStop.stopName} and {position.nextStop.stopName}.
            </>
          )}{" "}
          <span className="hint-inline">Worked out from stop times, not GPS.</span>
        </p>
      )}
      {current.trip && current.boardIndex === -1 && <p className="hint">This trip no longer lists your stop.</p>}

      {steps.length > 0 && (
        <>
          <h3 className="section-title">
            <span>
              Stops ahead on the <span className="number-text">{current.leg.routeId}</span>
            </span>
          </h3>
          <QuestPath steps={steps} />
        </>
      )}

      <div className="button-row">
        <BigButton kind="wood" onClick={() => app.setTab("map")}>See on map</BigButton>
        <BigButton kind="danger" onClick={app.stopTracking}>{isTrip ? "Cancel trip" : "Stop tracking"}</BigButton>
      </div>
    </Sheet>
  );
}

// The card for one bus of the quest.
function LegCard({ view, now, isCurrent, isTrip }: { view: LegView; now: number; isCurrent: boolean; isTrip: boolean }) {
  const { data } = useApp();
  const { leg, board, alight } = view;
  const state = legState(view, now);

  // The big text on the right.
  let headline = "…";
  let clock = "";
  if (board) {
    if (state === "before") {
      headline = formatArrival(board.estimated, now);
      clock = formatClock(board.estimated);
    } else if (state === "riding" && alight) {
      headline = "ON BUS";
      clock = `off ${formatClock(alight.estimated)}`;
    } else {
      headline = isTrip ? "DONE" : "PASSED";
    }
  }

  return (
    <div className={`quest-card ${isCurrent ? "" : "quest-card-quiet"}`}>
      <RouteBadge routeId={leg.routeId} route={data?.routeById.get(leg.routeId)} size="large" />
      <div className="quest-card-text">
        <div className="quest-card-dest">to {leg.destination}</div>
        <div className="quest-card-stop">
          {leg.stayOnBus ? "Stay on from" : isTrip ? "Get on at" : "Reaching"} <b>{leg.stopName}</b> <span className="stop-number">#{leg.stopNumber}</span>
        </div>
        {leg.alightStop !== undefined && (
          <div className="quest-card-stop">
            Get off at <b>{leg.alightStopName ?? `stop ${leg.alightStop}`}</b>
            {alight && <> · {formatClock(alight.estimated)}</>}
          </div>
        )}
        {board && <StatusTag scheduled={board.scheduled} estimated={board.estimated} cancelled={board.cancelled} />}
      </div>
      <div className="quest-card-time">
        <span className="big-time">{headline}</span>
        {clock && clock !== headline && <span className="quest-card-clock">{clock}</span>}
      </div>
    </div>
  );
}

// The wait between two buses, worked out from the live times.
function TransferNote({ previous, next }: { previous: LegView; next: LegView }) {
  if (next.leg.stayOnBus) {
    return (
      <p className="transfer-note">
        <PixelIcon name="bus" size={16} />
        <span>Stay on the bus. It becomes the {next.leg.routeId}.</span>
      </p>
    );
  }
  if (!previous.alight || !next.board) return null;
  const wait = Math.round((next.board.estimated - previous.alight.estimated) / MINUTE);

  let text = `Change to the ${next.leg.routeId}: wait ${wait} min`;
  let warn = false;
  if (wait < 1) {
    text = `Tight connection: the ${next.leg.routeId} is due as you arrive. You may miss it.`;
    warn = true;
  } else if (wait > LONG_WAIT_MINUTES) {
    text += ". Long wait, dress warm!";
    warn = true;
  }
  return (
    <p className={`transfer-note ${warn ? "transfer-note-warn" : ""}`}>
      <PixelIcon name={warn ? "warning" : "clock"} size={16} />
      <span>{text}</span>
    </p>
  );
}

function PickABus() {
  const app = useApp();

  function openStop(stopNumber: number) {
    const stop = app.data?.stopByNumber.get(stopNumber);
    app.selectStop(stopNumber);
    if (stop) app.flyTo(stop.lat, stop.lon, 17);
    app.setTab("map");
  }

  return (
    <Sheet size="tall" title="Track a bus">
      <p className="hint">
        No active quest yet. Pick a stop, tap a bus, then choose <b>Track this bus</b>. Or plan a trip and choose{" "}
        <b>Start this trip</b>.
      </p>
      <StopSearch inputId="track-stop-search" onPick={(stop) => openStop(stop.number)} />
      <NearbyStops onPick={(stop) => openStop(stop.number)} />

      <h3 className="section-title">Favourite stops</h3>
      {app.favouriteStops.length === 0 && (
        <p className="hint">Tap the star on any stop to keep it here.</p>
      )}
      <ul className="fav-list">
        {app.favouriteStops.map((stop) => (
          <li key={stop.number} className="fav-item">
            <button type="button" className="fav-open" onClick={() => openStop(stop.number)}>
              <span className="stop-number">#{stop.number}</span>
              <span>{stop.name}</span>
            </button>
            <IconButton icon="close" label={`Remove ${stop.name} from favourites`} onClick={() => app.toggleFavouriteStop(stop)} />
          </li>
        ))}
      </ul>

      <h3 className="section-title">Favourite routes</h3>
      {app.favouriteRoutes.length === 0 && (
        <p className="hint">Show a route on the map, then tap Save route.</p>
      )}
      <div className="route-row">
        {app.favouriteRoutes.map((routeId) => (
          <button
            key={routeId}
            type="button"
            className="route-pick"
            title={`Show route ${routeId} on the map`}
            onClick={() => {
              app.selectStop(undefined);
              app.setShownRoute(routeId);
              app.setTab("map");
            }}
          >
            <RouteBadge routeId={routeId} route={app.data?.routeById.get(routeId)} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}
