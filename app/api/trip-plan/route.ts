// GET /api/trip-plan?origin=geo/49.89,-97.13&destination=addresses/136590
import { ensureClock, jsonResponse, wtFetch } from "@/lib/server/wt";
import { normalizePlans } from "@/lib/server/normalize";
import { epochToWinnipegLocal } from "@/lib/time";

export const dynamic = "force-dynamic";

// Allowed formats: addresses/123, monuments/123, intersections/123:45@67,
// stops/10064, geo/49.895,-97.138
const PLACE_PATTERN = /^(addresses|monuments|stops)\/\d+$|^intersections\/[\d:@]+$|^geo\/-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

export function GET(request: Request) {
  return jsonResponse(async () => {
    const url = new URL(request.url);
    const origin = url.searchParams.get("origin") ?? "";
    const destination = url.searchParams.get("destination") ?? "";
    if (!PLACE_PATTERN.test(origin) || !PLACE_PATTERN.test(destination)) {
      throw new Error("Bad origin or destination");
    }
    const params: Record<string, string> = { origin, destination, mode: "depart-after", usage: "short" };

    // Optional: &mode=depart-after|arrive-before&at=<epoch ms>. Without them: leave now.
    const mode = url.searchParams.get("mode");
    const at = Number(url.searchParams.get("at"));
    if (mode === "arrive-before") params.mode = mode;
    if (at > 0) {
      await ensureClock();
      // The API wants Winnipeg local date and time, e.g. 2026-11-15 and 14:30.
      const local = epochToWinnipegLocal(at);
      params.date = local.slice(0, 10);
      params.time = local.slice(11, 16);
    }

    return normalizePlans(await wtFetch("trip-planner", params));
  });
}
