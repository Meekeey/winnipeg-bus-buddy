"use client";
import type { RouteInfo } from "@/lib/staticData";
import { formatArrival } from "@/lib/time";
import type { Arrival } from "@/lib/types";
import { BigButton } from "./pixel/Buttons";
import { RouteBadge } from "./pixel/RouteBadge";
import { StatusTag } from "./pixel/StatusTag";

type Props = {
  arrival: Arrival;
  route?: RouteInfo;
  now: number;
  open: boolean; // shows the "Track this bus" button
  onToggle: () => void;
  onTrack: () => void;
};

// One line of the arrivals list:  330  McLeod & Louelda  [ON TIME]  16 MIN
export function ArrivalRow({ arrival, route, now, open, onToggle, onTrack }: Props) {
  return (
    <li className={`arrival ${open ? "arrival-open" : ""}`}>
      <button type="button" className="arrival-main" onClick={onToggle} aria-expanded={open}>
        <RouteBadge routeId={arrival.routeId} route={route} />
        <span className="arrival-dest">{arrival.destination}</span>
        <StatusTag scheduled={arrival.scheduled} estimated={arrival.estimated} cancelled={arrival.cancelled} />
        <span className="arrival-time">{arrival.cancelled ? "—" : formatArrival(arrival.estimated, now)}</span>
      </button>
      {open && !arrival.cancelled && (
        <div className="arrival-actions">
          <BigButton onClick={onTrack}>Track this bus</BigButton>
        </div>
      )}
    </li>
  );
}
