"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const REFRESH_MS = 30 * 1000;

export type PollState<T> = {
  data: T | undefined;
  error: string | undefined;
  loading: boolean; // true only before the first answer
  refresh: () => void;
};

// Loads data now, then again every 30 seconds.
// Pauses while the tab is hidden and refreshes when it comes back.
// Pass `key` = undefined to switch polling off.
export function usePolling<T>(key: string | undefined, load: () => Promise<T>): PollState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(key !== undefined);
  const loadRef = useRef(load);
  loadRef.current = load;
  const runRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (key === undefined) {
      setData(undefined);
      setError(undefined);
      setLoading(false);
      return;
    }

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    setData(undefined);
    setError(undefined);
    setLoading(true);

    async function run() {
      try {
        const result = await loadRef.current();
        if (stopped) return;
        setData(result);
        setError(undefined);
      } catch (problem) {
        if (stopped) return;
        // Keep showing the old data; just add the error message.
        setError(problem instanceof Error ? problem.message : "Something went wrong.");
      } finally {
        if (!stopped) setLoading(false);
      }
    }
    runRef.current = run;

    function start() {
      if (timer === undefined) timer = setInterval(run, REFRESH_MS);
    }
    function stop() {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    }
    function onVisibilityChange() {
      if (document.hidden) {
        stop();
      } else {
        run();
        start();
      }
    }

    run();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [key]);

  const refresh = useCallback(() => runRef.current(), []);
  return { data, error, loading, refresh };
}
