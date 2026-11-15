"use client";
import { useEffect, useState } from "react";
import { dataSource } from "@/lib/dataSource";
import { shortStopName, StaticData } from "@/lib/staticData";
import { formatClock } from "@/lib/time";
import {
  findMeetings, Leg, LONG_WAIT_MINUTES, Meeting, planTransfers, TransferOption, TransferResult,
  TRANSFER_BUFFER_MINUTES,
} from "@/lib/transfer";
import { usePolling } from "@/hooks/usePolling";
import { useStoredState } from "@/hooks/useStoredState";
import { FavouriteStop, useApp } from "./AppState";
import { QuestPath, QuestStep } from "./QuestPath";
import { NearbyStops } from "./NearbyStops";
import { StopSearch } from "./StopSearch";
import { BigButton, ErrorNote, LoadingNote } from "./pixel/Buttons";
import { PixelIcon } from "./pixel/PixelIcon";
import { RouteBadge } from "./pixel/RouteBadge";

const MAX_ROUTES = 3;

// What we work out from the user's stop and route list.
type Setup = {
  legs: Leg[];
  meetings: Meeting[][]; // the choices at each transfer
  finalStops: number[]; // stops you could get off at on the last bus
  problem?: string;
};

// Mode B: the user already knows their buses (for example F8 then 330).
// We find the transfer stop and the trip with the shortest wait there.
export function TripKnown() {
  const app = useApp();
  const data = app.data;
  const [boardStop, setBoardStop] = useStoredState<FavouriteStop | null>("busbuddy.known.stop", null);
  const [routes, setRoutes] = useStoredState<string[]>("busbuddy.known.routes", []);
  const [directionChoices, setDirectionChoices] = useStoredState<number[]>("busbuddy.known.directions", []);
  const [finalStop, setFinalStop] = useStoredState<number | null>("busbuddy.known.final", null);
  const [pickingSlot, setPickingSlot] = useState<number | undefined>(undefined);
  const [setup, setSetup] = useState<Setup | undefined>(undefined);
  const [selected, setSelected] = useState<number | undefined>(undefined);

  // Work out the legs whenever the stop, routes or choices change.
  useEffect(() => {
    if (!data || !boardStop || routes.length < 2) {
      setSetup(undefined);
      return;
    }
    let cancelled = false;
    buildSetup(data, boardStop.number, routes, directionChoices, finalStop)
      .then((result) => {
        if (!cancelled) setSetup(result);
      })
      .catch(() => {
        if (!cancelled) setSetup({ legs: [], meetings: [], finalStops: [], problem: "Couldn't load the route details." });
      });
    return () => {
      cancelled = true;
    };
  }, [data, boardStop, routes, directionChoices, finalStop]);

  const legs = setup && !setup.problem ? setup.legs : undefined;
  const legsKey = legs ? JSON.stringify(legs) : undefined;
  const result = usePolling<TransferResult>(legsKey, () => planTransfers(dataSource, legs!, Date.now()));

  // A fresh search starts on the recommended option.
  useEffect(() => setSelected(undefined), [legsKey]);

  function setRouteAt(slot: number, routeId: string) {
    const next = [...routes];
    next[slot] = routeId;
    setRoutes(next.slice(0, MAX_ROUTES));
    setDirectionChoices([]);
    setFinalStop(null);
    setPickingSlot(undefined);
  }

  function removeLastRoute() {
    setRoutes(routes.slice(0, -1));
    setDirectionChoices([]);
    setFinalStop(null);
    setPickingSlot(undefined);
  }

  const routesAtStop = boardStop && data ? data.stopRoutes[String(boardStop.number)] ?? [] : [];
  const stopName = (number: number) => {
    const stop = data?.stopByNumber.get(number);
    return stop ? shortStopName(stop.name) : `Stop ${number}`;
  };

  const options = result.data?.options ?? [];
  const bestIndex = result.data?.bestIndex ?? -1;
  const shownIndex = selected !== undefined && selected < options.length ? selected : bestIndex;
  const shown = shownIndex >= 0 ? options[shownIndex] : undefined;

  return (
    <div className="trip-mode">
      {/* 1. where the user gets on */}
      <div className="field">
        <span className="field-label">1. Where do you get on?</span>
        {boardStop ? (
          <div className="picked">
            <span className="stop-number">#{boardStop.number}</span>
            <span className="picked-name">{boardStop.name}</span>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setBoardStop(null);
                setRoutes([]);
                setDirectionChoices([]);
                setFinalStop(null);
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <StopSearch
              inputId="known-stop-search"
              onPick={(stop) => setBoardStop({ number: stop.number, name: shortStopName(stop.name) })}
            />
            <NearbyStops onPick={(stop) => setBoardStop({ number: stop.number, name: shortStopName(stop.name) })} />
            {app.favouriteStops.length > 0 && (
              <div className="choice-row">
                {app.favouriteStops.map((stop) => (
                  <button key={stop.number} type="button" className="chip" onClick={() => setBoardStop(stop)}>
                    ★ {stop.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 2. the buses, in order */}
      {boardStop && (
        <div className="field">
          <span className="field-label">2. Your buses, in order</span>
          <div className="route-slots">
            {routes.map((routeId, slot) => (
              <span key={slot} className="route-slot-wrap">
                {slot > 0 && <PixelIcon name="arrow" size={14} className="slot-arrow" />}
                <button type="button" className="route-pick" onClick={() => setPickingSlot(slot)} title="Change this bus">
                  <RouteBadge routeId={routeId} route={data?.routeById.get(routeId)} count={slot + 1} />
                </button>
              </span>
            ))}
            {routes.length < MAX_ROUTES && (
              <span className="route-slot-wrap">
                {routes.length > 0 && <PixelIcon name="arrow" size={14} className="slot-arrow" />}
                <button
                  type="button"
                  className="route-pick route-pick-empty"
                  onClick={() => setPickingSlot(routes.length)}
                  aria-label={routes.length === 0 ? "Choose your first bus" : "Add the next bus"}
                >
                  <span className="slot slot-medium">
                    <span className="slot-item slot-item-empty">
                      <PixelIcon name="plus" size={14} />
                    </span>
                  </span>
                </button>
              </span>
            )}
            {routes.length > 0 && (
              <button type="button" className="link-btn" onClick={removeLastRoute}>
                Remove last
              </button>
            )}
          </div>
          {routes.length < 2 && pickingSlot === undefined && (
            <p className="hint">
              {routes.length === 0 ? "Tap the + slot to choose your first bus." : "Now add the bus you change to."}
            </p>
          )}
          {pickingSlot !== undefined && data && (
            <RoutePicker
              data={data}
              // The first bus must stop at the boarding stop.
              routeIds={pickingSlot === 0 ? routesAtStop : data.routes.map((route) => route.id)}
              showFilter={pickingSlot > 0}
              onPick={(routeId) => setRouteAt(pickingSlot, routeId)}
              onCancel={() => setPickingSlot(undefined)}
            />
          )}
        </div>
      )}

      {/* 3. transfer details */}
      {setup?.problem && <ErrorNote text={setup.problem} />}
      {setup && !setup.problem && (
        <div className="field">
          <span className="field-label">3. Check the details</span>
          {setup.meetings.map((choices, transferIndex) => {
            const chosenIndex = Math.min(directionChoices[transferIndex] ?? 0, choices.length - 1);
            const chosen = choices[chosenIndex];
            return (
              <div key={transferIndex} className="transfer-setup">
                <p className="transfer-where">
                  Change to the <b>{routes[transferIndex + 1]}</b> at <b>{stopName(chosen.boardStop)}</b>{" "}
                  <span className="stop-number">#{chosen.boardStop}</span>
                  {chosen.walkMetres > 0 && <> ({Math.round(chosen.walkMetres)} m walk)</>}
                </p>
                {choices.length > 1 && (
                  <div className="choice-row">
                    {choices.map((meeting, index) => (
                      <button
                        key={meeting.headsign}
                        type="button"
                        className={`chip ${index === chosenIndex ? "chip-on" : ""}`}
                        aria-pressed={index === chosenIndex}
                        onClick={() => {
                          const next = [...directionChoices];
                          next[transferIndex] = index;
                          // Later choices depend on this one, so reset them.
                          setDirectionChoices(next.slice(0, transferIndex + 1));
                          setFinalStop(null);
                        }}
                      >
                        to {meeting.headsign}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <label className="field-label field-label-small" htmlFor="known-final-stop">
            Get off the {routes[routes.length - 1]} at
          </label>
          <select
            id="known-final-stop"
            className="text-input"
            value={setup.legs[setup.legs.length - 1].alightStop}
            onChange={(event) => setFinalStop(Number(event.target.value))}
          >
            {setup.finalStops.map((number) => (
              <option key={number} value={number}>
                {stopName(number)} (#{number})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* results */}
      {result.loading && <LoadingNote text="Lining up your buses…" />}
      {result.error && <ErrorNote text={result.error} />}
      {result.data && options.length === 0 && !result.loading && (
        <p className="hint">No matching buses in the next few hours.</p>
      )}

      {shown && (
        <div className={`recommend ${shown.longestWaitMinutes > LONG_WAIT_MINUTES ? "recommend-warn" : ""}`}>
          <div className="recommend-tag">{shownIndex === bestIndex ? "BEST PICK: SHORTEST WAIT" : "YOUR PICK"}</div>
          <p className="recommend-text">{describeOption(shown)}</p>
          <QuestPath steps={optionSteps(shown, stopName)} />
          <BigButton
            kind="wood"
            onClick={() =>
              app.startTrip(
                shown.legs.map((leg) => ({
                  tripKey: leg.tripKey,
                  routeId: leg.routeId,
                  destination: leg.destination,
                  stopNumber: leg.boardStop,
                  stopName: stopName(leg.boardStop),
                  alightStop: leg.alightStop,
                  alightStopName: stopName(leg.alightStop),
                }))
              )
            }
          >
            Start this trip
          </BigButton>
        </div>
      )}

      {options.length > 1 && (
        <>
          <h3 className="section-title">
            All upcoming choices
            <span className="section-note">{TRANSFER_BUFFER_MINUTES} min allowed to change buses</span>
          </h3>
          <ul className="option-list">
            {options.map((option, index) => (
              <li key={option.legs[0].tripKey}>
                <button
                  type="button"
                  className={`option-row ${index === shownIndex ? "option-row-on" : ""}`}
                  onClick={() => setSelected(index)}
                  aria-pressed={index === shownIndex}
                >
                  <span className="option-leave">{formatClock(option.leaveTime)}</span>
                  <span className={`option-wait ${option.longestWaitMinutes > LONG_WAIT_MINUTES ? "fact-warn" : ""}`}>
                    wait {option.totalWaitMinutes} min
                  </span>
                  <span className="option-arrive">there {formatClock(option.arriveTime)}</span>
                  {index === bestIndex && <span className="tag tag-on-time">BEST</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// "Take the 12:40 PM F8 → wait only 3 min for the 330, there by 1:25 PM."
function describeOption(option: TransferOption): string {
  const first = option.legs[0];
  let text = `Take the ${formatClock(first.boardTime)} ${first.routeId}`;
  for (const leg of option.legs.slice(1)) {
    const only = leg.waitMinutes <= LONG_WAIT_MINUTES ? "only " : "";
    text += ` → wait ${only}${leg.waitMinutes} min for the ${leg.routeId}`;
  }
  return `${text}, there by ${formatClock(option.arriveTime)}.`;
}

function optionSteps(option: TransferOption, stopName: (number: number) => string): QuestStep[] {
  const steps: QuestStep[] = [];
  const first = option.legs[0];
  steps.push({
    icon: "walk",
    time: formatClock(first.boardTime),
    title: "Leave by",
    detail: `Be at ${stopName(first.boardStop)} (#${first.boardStop})`,
  });
  option.legs.forEach((leg, index) => {
    if (index > 0) {
      steps.push({
        icon: "clock",
        title: `Wait ${leg.waitMinutes} min`,
        detail: leg.waitMinutes > LONG_WAIT_MINUTES ? "Long wait. Dress warm!" : `at ${stopName(leg.boardStop)}`,
        warn: leg.waitMinutes > LONG_WAIT_MINUTES,
      });
    }
    steps.push({
      icon: "bus",
      time: formatClock(leg.boardTime),
      title: `Board the ${leg.routeId}`,
      detail: `to ${leg.destination}`,
    });
    const isLast = index === option.legs.length - 1;
    steps.push({
      icon: isLast ? "flag" : "pin",
      time: formatClock(leg.alightTime),
      title: isLast ? "Arrive" : "Arrive at transfer",
      detail: `${stopName(leg.alightStop)} (#${leg.alightStop})`,
    });
  });
  return steps;
}

// Works out each bus ride (leg) from the boarding stop and route order.
async function buildSetup(
  data: StaticData,
  boardStopNumber: number,
  routes: string[],
  directionChoices: number[],
  finalStop: number | null
): Promise<Setup> {
  const legs: Leg[] = [];
  const meetings: Meeting[][] = [];
  let boardStop = boardStopNumber;
  let walkBefore = 0;
  let lastMeeting: Meeting | undefined;

  for (let i = 1; i < routes.length; i++) {
    const choices = await findMeetings(data, routes[i - 1], boardStop, routes[i]);
    if (choices.length === 0) {
      return {
        legs: [], meetings: [], finalStops: [],
        problem: `Route ${routes[i - 1]} and route ${routes[i]} don't meet after your stop. Check the order or the stop.`,
      };
    }
    const chosen = choices[Math.min(directionChoices[i - 1] ?? 0, choices.length - 1)];
    meetings.push(choices);
    legs.push({ routeId: routes[i - 1], boardStop, alightStop: chosen.alightStop, walkMetresBefore: walkBefore });
    boardStop = chosen.boardStop;
    walkBefore = chosen.walkMetres;
    lastMeeting = chosen;
  }

  const finalStops = lastMeeting ? lastMeeting.remainingStops : [];
  let alightStop = finalStops[finalStops.length - 1];
  if (finalStop !== null && finalStops.includes(finalStop)) alightStop = finalStop;
  legs.push({ routeId: routes[routes.length - 1], boardStop, alightStop, walkMetresBefore: walkBefore });

  return { legs, meetings, finalStops };
}

type RoutePickerProps = {
  data: StaticData;
  routeIds: string[];
  showFilter: boolean;
  onPick: (routeId: string) => void;
  onCancel: () => void;
};

// A grid of route badges to choose from, like picking an item.
function RoutePicker({ data, routeIds, showFilter, onPick, onCancel }: RoutePickerProps) {
  const [filter, setFilter] = useState("");
  const text = filter.trim().toLowerCase();
  const visible = routeIds.filter((id) => {
    if (text === "") return true;
    const name = data.routeById.get(id)?.name.toLowerCase() ?? "";
    return id.toLowerCase().startsWith(text) || name.includes(text);
  });

  return (
    <div className="route-picker">
      {showFilter && (
        <input
          id="known-route-filter"
          className="text-input"
          type="text"
          autoComplete="off"
          placeholder="Type a route, e.g. 330"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      )}
      <div className="route-row route-row-scroll">
        {visible.length === 0 && <p className="hint">No routes match.</p>}
        {visible.map((routeId) => (
          <button key={routeId} type="button" className="route-pick" onClick={() => onPick(routeId)} title={data.routeById.get(routeId)?.name}>
            <RouteBadge routeId={routeId} route={data.routeById.get(routeId)} />
          </button>
        ))}
      </div>
      <button type="button" className="link-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
