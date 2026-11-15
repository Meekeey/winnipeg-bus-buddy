"use client";
import { useCallback, useEffect, useState } from "react";
import { readStored, writeStored } from "@/lib/storage";

// Like useState, but remembered in localStorage.
export function useStoredState<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  // Read after the first render so server and browser HTML match.
  useEffect(() => {
    setValue(readStored(key, fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      writeStored(key, next);
    },
    [key]
  );
  return [value, update];
}
