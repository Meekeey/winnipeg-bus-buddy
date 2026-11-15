// GET /api/stops/10064/schedule?routes=F8,330&minutes=180 -> live arrivals at a stop
import { ensureClock, jsonResponse, wtFetch } from "@/lib/server/wt";
import { normalizeStopSchedule } from "@/lib/server/normalize";
import { epochToWinnipegLocal } from "@/lib/time";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: { params: Promise<{ number: string }> }) {
  return jsonResponse(async () => {
    const { number } = await context.params;
    if (!/^\d{1,6}$/.test(number)) throw new Error("Bad stop number");

    const url = new URL(request.url);
    const params: Record<string, string> = { usage: "short" };

    const routes = url.searchParams.get("routes");
    if (routes && /^[A-Za-z0-9,]+$/.test(routes)) params.route = routes;

    // Look further ahead than the API's default 2 hours when asked (max 6 hours).
    const minutes = Number(url.searchParams.get("minutes"));
    if (minutes > 0) {
      await ensureClock();
      // Round "now" down to 30 s so the cache key stays the same between users.
      const now = Math.floor(Date.now() / 30000) * 30000;
      params.end = epochToWinnipegLocal(now + Math.min(minutes, 360) * 60000);
    }

    return normalizeStopSchedule(await wtFetch(`stops/${number}/schedule`, params));
  });
}
