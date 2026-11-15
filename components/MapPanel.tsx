"use client";
import { useApp } from "./AppState";
import { StopSearch } from "./StopSearch";
import { StopSheet } from "./StopSheet";

// The Map tab: a search bar over the map, and a sheet for the chosen stop.
export function MapPanel() {
  const app = useApp();
  return (
    <>
      <div className="map-search">
        <StopSearch
          inputId="map-stop-search"
          onPick={(stop) => {
            app.selectStop(stop.number);
            app.flyTo(stop.lat, stop.lon, 17);
          }}
        />
        {app.shownRoute && app.selectedStop === undefined && (
          <div className="shown-route shown-route-float">
            <span>
              Showing route <b>{app.shownRoute}</b>
            </span>
            <button type="button" className="link-btn" onClick={() => app.setShownRoute(undefined)}>
              Clear
            </button>
          </div>
        )}
      </div>
      {app.selectedStop !== undefined && <StopSheet key={app.selectedStop} stopNumber={app.selectedStop} />}
    </>
  );
}
