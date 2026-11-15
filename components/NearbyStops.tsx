"use client";
import { useMemo } from "react";
import { nearestStops, shortStopName, Stop } from "@/lib/staticData";
import { useApp } from "./AppState";
import { PixelIcon } from "./pixel/PixelIcon";

type Props = {
  onPick: (stop: Stop) => void;
  limit?: number;
};

// The closest stops to the rider, shown automatically once the phone
// shares its location. Shows nothing if the location isn't known.
export function NearbyStops({ onPick, limit = 4 }: Props) {
  const { data, userLocation, locationNote } = useApp();

  const nearby = useMemo(() => {
    if (!data || !userLocation) return [];
    return nearestStops(data, userLocation, limit, 800);
  }, [data, userLocation, limit]);

  if (!userLocation) return null;

  return (
    <div className="nearby">
      <h3 className="section-title">
        <span className="nearby-title">
          <PixelIcon name="locate" size={16} /> Stops near you
        </span>
      </h3>
      {locationNote && <p className="hint">{locationNote}</p>}
      {nearby.length === 0 && <p className="hint">No bus stops within 800 m of you.</p>}
      <ul className="fav-list">
        {nearby.map((item) => (
          <li key={item.stop.number}>
            <button type="button" className="fav-open nearby-stop" onClick={() => onPick(item.stop)}>
              <span className="stop-number">#{item.stop.number}</span>
              <span className="nearby-name">{shortStopName(item.stop.name)}</span>
              <span className="search-result-far">{Math.round(item.metres / 10) * 10} m</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
