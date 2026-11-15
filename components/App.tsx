"use client";
import { AppStateProvider, useApp } from "./AppState";
import { BottomNav } from "./BottomNav";
import MapView from "./MapView";
import { MapPanel } from "./MapPanel";
import { TopBar } from "./TopBar";
import { TrackPanel } from "./TrackPanel";
import { TripPanel } from "./TripPanel";
import { ErrorNote } from "./pixel/Buttons";

function Screens() {
  const { tab, dataError } = useApp();
  return (
    <div className={`app app-tab-${tab}`}>
      <MapView />
      <TopBar />
      <main className="stage">
        {dataError && (
          <div className="stage-error">
            <ErrorNote text={dataError} />
          </div>
        )}
        {tab === "map" && <MapPanel />}
        {tab === "track" && <TrackPanel />}
        {tab === "trip" && <TripPanel />}
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <Screens />
    </AppStateProvider>
  );
}
