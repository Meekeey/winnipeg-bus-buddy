// Server-only: talks to the Winnipeg Transit API.
// The API key lives in the WT_API_KEY env var and never reaches the browser.

import { clockShiftFromQueryTime, setClockShift } from "../time";

const API_BASE ="https://api.winnipegtransit.com/v4";
const CACHE_MS = 25 * 1000; // rate limit is 100 requests/minute, so cache answers
const MAX_CACHE_ENTRIES = 500;

type CacheEntry = { expires: number; promise: Promise<unknown> };
const cache = new Map<string, CacheEntry>();

// True once we have seen the API's clock at least once.
let clockKnown = false;

// Call before turning a time into Winnipeg local time for a request.
// On a fresh server it asks the API one small question to learn its clock.
export async function ensureClock(): Promise<void> {
  if (!clockKnown) await wtFetch("statuses/schedule");
}

export class TransitApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// path example: "stops/10064/schedule". Returns the parsed JSON.
export function wtFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const apiKey = process.env.WT_API_KEY;
  if (!apiKey) {
    return Promise.reject(new TransitApiError("WT_API_KEY is not set on the server.", 500));
  }

  const query = new URLSearchParams(params);
  const cacheKey = `${path}?${query.toString()}`;
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.promise;
  }

  query.set("api-key", apiKey);
  const promise = fetch(`${API_BASE}/${path}.json?${query.toString()}`, { cache: "no-store" }).then(
    async (response) => {
      if (!response.ok) {
        throw new TransitApiError(`Winnipeg Transit answered ${response.status}`, response.status);
      }
      const json = await response.json();
      // Keep our clock in step with Winnipeg Transit's (see lib/time.ts).
      if (typeof json?.["query-time"] === "string") {
        setClockShift(clockShiftFromQueryTime(json["query-time"], Date.now()));
        clockKnown = true;
      }
      return json;
    }
  );

  // Don't keep failed answers in the cache.
  promise.catch(() => cache.delete(cacheKey));

  if (cache.size >= MAX_CACHE_ENTRIES) {
    for (const [key, entry] of cache) {
      if (entry.expires <= now) cache.delete(key);
    }
    if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  }
  cache.set(cacheKey, { expires: now + CACHE_MS, promise });
  return promise;
}

// Shared helper for our API routes: run the work, answer with JSON,
// and let Vercel's CDN cache the answer for 20 seconds too. The CDN cache
// matters because each serverless instance has its own memory cache.
export async function jsonResponse(work: () => Promise<unknown>): Promise<Response> {
  try {
    const data = await work();
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=10" },
    });
  } catch (error) {
    let status = 502;
    let message = "Can't reach Winnipeg Transit right now.";
    if (error instanceof TransitApiError) {
      if (error.status === 404) {
        status = 404;
        message = "Winnipeg Transit could not find that.";
      } else if (error.status === 429) {
        status = 429;
        message = "Too many requests. Trying again shortly.";
      } else if (error.status === 500 && error.message.includes("WT_API_KEY")) {
        status = 500;
        message = "The server is missing its Winnipeg Transit API key (WT_API_KEY).";
      }
    }
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
