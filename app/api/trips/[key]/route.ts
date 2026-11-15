// GET /api/trips/35833501 -> every stop of one bus trip, with live estimated times
import { jsonResponse, wtFetch } from "@/lib/server/wt";
import { normalizeTrip } from "@/lib/server/normalize";

export const dynamic = "force-dynamic";

export function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  return jsonResponse(async () => {
    const { key } = await context.params;
    if (!/^\d{1,12}$/.test(key)) throw new Error("Bad trip key");
    return normalizeTrip(await wtFetch(`trips/${key}`, { usage: "short" }), key);
  });
}
