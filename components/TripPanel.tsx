"use client";
import { useStoredState } from "@/hooks/useStoredState";
import { Sheet } from "./Sheet";
import { TripHome } from "./TripHome";
import { TripKnown } from "./TripKnown";

type Mode = "home" | "known";

// The Trip tab with its two modes.
export function TripPanel() {
  const [mode, setMode] = useStoredState<Mode>("busbuddy.tripMode", "home");
  return (
    <Sheet size="full" title="Trip planner">
      <div className="mode-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "home"}
          className={`mode-tab ${mode === "home" ? "mode-tab-on" : ""}`}
          onClick={() => setMode("home")}
        >
          Best trip home
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "known"}
          className={`mode-tab ${mode === "known" ? "mode-tab-on" : ""}`}
          onClick={() => setMode("known")}
        >
          I know my buses
        </button>
      </div>
      {mode === "home" ? <TripHome /> : <TripKnown />}
    </Sheet>
  );
}
