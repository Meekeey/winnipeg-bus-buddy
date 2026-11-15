// Safe localStorage helpers (storage can be blocked, e.g. in private windows).

export function readStored<T>(key: string, fallback: T): T {
  try {
    const text = window.localStorage.getItem(key);
    if (text === null) return fallback;
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saved. The app still works for this visit.
  }
}
