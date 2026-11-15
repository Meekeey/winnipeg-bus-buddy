"use client";
import { useEffect, useState } from "react";
import { CLOCK_EVENT } from "@/lib/time";

// The current time, updated every few seconds so countdowns stay fresh.
export function useNow(everyMs = 10000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, everyMs);
    // Also redraw as soon as the clock is synced with Winnipeg Transit's.
    window.addEventListener(CLOCK_EVENT, tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener(CLOCK_EVENT, tick);
    };
  }, [everyMs]);
  return now;
}
