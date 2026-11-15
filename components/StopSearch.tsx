"use client";
import { useMemo, useState } from "react";
import { nearestStops, searchStops, shortStopName, Stop } from "@/lib/staticData";
import { useApp } from "./AppState";
import { IconButton } from "./pixel/Buttons";
import { PixelIcon } from "./pixel/PixelIcon";

type Props = {
  onPick: (stop: Stop) => void;
  placeholder?: string;
  inputId: string;
};

type Result = { stop: Stop; metres?: number };

// Search stops by name or number, or list the stops near you.
export function StopSearch({ onPick, placeholder = "Stop name or number", inputId }: Props) {
  const { data, locate, locationNote } = useApp();
  const [query, setQuery] = useState("");
  const [nearby, setNearby] = useState<Result[] | undefined>(undefined);
  const [locating, setLocating] = useState(false);

  const results = useMemo<Result[]>(() => {
    if (!data || query.trim() === "") return [];
    return searchStops(data, query).map((stop) => ({ stop }));
  }, [data, query]);

  async function findNearMe() {
    if (!data) return;
    setLocating(true);
    try {
      const point = await locate();
      setNearby(nearestStops(data, point, 8));
      setQuery("");
    } catch {
      setNearby([]);
    } finally {
      setLocating(false);
    }
  }

  function pick(stop: Stop) {
    setQuery("");
    setNearby(undefined);
    onPick(stop);
  }

  const list = query.trim() !== "" ? results : nearby ?? [];
  const showList = query.trim() !== "" || nearby !== undefined;

  return (
    <div className="search">
      <div className="search-row">
        <label className="search-box" htmlFor={inputId}>
          <PixelIcon name="search" size={18} />
          <input
            id={inputId}
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder={placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setNearby(undefined);
            }}
          />
        </label>
        <IconButton icon="locate" label="Stops near me" onClick={findNearMe} disabled={locating} />
      </div>

      {showList && (
        <ul className="search-results">
          {locating && <li className="search-empty">Finding you…</li>}
          {!locating && locationNote && nearby !== undefined && <li className="search-empty">{locationNote}</li>}
          {!locating && list.length === 0 && !locationNote && <li className="search-empty">No stops found.</li>}
          {list.map((result) => (
            <li key={result.stop.number}>
              <button type="button" className="search-result" onClick={() => pick(result.stop)}>
                <span className="stop-number">#{result.stop.number}</span>
                <span className="search-result-name">{shortStopName(result.stop.name)}</span>
                {result.metres !== undefined && <span className="search-result-far">{Math.round(result.metres)} m</span>}
              </button>
            </li>
          ))}
          {nearby !== undefined && (
            <li>
              <button type="button" className="search-close" onClick={() => setNearby(undefined)}>
                Close list
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
