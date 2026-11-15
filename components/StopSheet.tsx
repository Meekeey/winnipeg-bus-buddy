"use client";
import { useState } from "react";
import { dataSource } from "@/lib/dataSource";
import { shortStopName } from "@/lib/staticData";
import { useNow } from "@/hooks/useNow";
import { usePolling } from "@/hooks/usePolling";
import { useApp } from "./AppState";
import { ArrivalRow } from "./ArrivalRow";
import { Sheet } from "./Sheet";
import { ErrorNote, IconButton, LoadingNote } from "./pixel/Buttons";
import { RouteBadge } from "./pixel/RouteBadge";

const MAX_ARRIVALS = 12;

// Bottom sheet for one stop: live arrivals and the routes that serve it.
export function StopSheet({ stopNumber }: { stopNumber: number }) {
  const app = useApp();
  const now = useNow();
  const [openTrip, setOpenTrip] = useState<string | undefined>(undefined);
  const schedule = usePolling(`stop-${stopNumber}`, () => dataSource.getStopSchedule(stopNumber));

  const stop = app.data?.stopByNumber.get(stopNumber);
  const stopName = stop ? shortStopName(stop.name) : schedule.data?.stopName ?? "Stop";
  const routeIds = app.data?.stopRoutes[String(stopNumber)] ?? [];
  const isFavourite = app.favouriteStops.some((item) => item.number === stopNumber);

  const arrivals = (schedule.data?.arrivals ?? [])
    .filter((arrival) => arrival.estimated >= now - 60000)
    .slice(0, MAX_ARRIVALS);

  return (
    <Sheet
      title={
        <>
          <span className="stop-number">#{stopNumber}</span> {stopName}
        </>
      }
      actions={
        <>
          <IconButton
            icon={isFavourite ? "star" : "starEmpty"}
            label={isFavourite ? "Remove from favourite stops" : "Save as favourite stop"}
            active={isFavourite}
            onClick={() => app.toggleFavouriteStop({ number: stopNumber, name: stopName })}
          />
          <IconButton icon="close" label="Close stop" onClick={() => app.selectStop(undefined)} />
        </>
      }
    >
      <h3 className="section-title">Routes here</h3>
      <div className="route-row">
        {routeIds.length === 0 && <p className="hint">No routes listed for this stop.</p>}
        {routeIds.map((routeId) => {
          const shown = app.shownRoute === routeId;
          return (
            <button
              key={routeId}
              type="button"
              className={`route-pick ${shown ? "route-pick-on" : ""}`}
              onClick={() => app.setShownRoute(shown ? undefined : routeId)}
              aria-pressed={shown}
              title={shown ? `Hide route ${routeId}` : `Show route ${routeId} on the map`}
            >
              <RouteBadge routeId={routeId} route={app.data?.routeById.get(routeId)} />
            </button>
          );
        })}
      </div>
      {app.shownRoute && (
        <div className="shown-route">
          <span>
            Showing route <b>{app.shownRoute}</b> on the map
          </span>
          <button
            type="button"
            className="link-btn"
            onClick={() => app.toggleFavouriteRoute(app.shownRoute!)}
          >
            {app.favouriteRoutes.includes(app.shownRoute) ? "★ Saved" : "☆ Save route"}
          </button>
          <button type="button" className="link-btn" onClick={() => app.setShownRoute(undefined)}>
            Clear
          </button>
        </div>
      )}

      <h3 className="section-title">
        Next buses
        <span className="section-note">updates every 30 s</span>
      </h3>
      {schedule.loading && <LoadingNote text="Checking for buses…" />}
      {schedule.error && <ErrorNote text={schedule.error} />}
      {!schedule.loading && !schedule.error && arrivals.length === 0 && (
        <p className="hint">No buses in the next two hours.</p>
      )}
      <ul className="arrivals">
        {arrivals.map((arrival) => (
          <ArrivalRow
            key={arrival.tripKey + arrival.scheduled}
            arrival={arrival}
            route={app.data?.routeById.get(arrival.routeId)}
            now={now}
            open={openTrip === arrival.tripKey}
            onToggle={() => setOpenTrip(openTrip === arrival.tripKey ? undefined : arrival.tripKey)}
            onTrack={() =>
              app.startTracking({
                tripKey: arrival.tripKey,
                routeId: arrival.routeId,
                destination: arrival.destination,
                stopNumber,
                stopName,
              })
            }
          />
        ))}
      </ul>
      {arrivals.length > 0 && <p className="hint">Tap a bus to track it.</p>}
    </Sheet>
  );
}
