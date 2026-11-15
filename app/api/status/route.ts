// GET /api/status -> is service normal, or is an Emergency Service Plan active?
import { jsonResponse, wtFetch } from "@/lib/server/wt";
import { normalizeStatus } from "@/lib/server/normalize";

import { getUtcOffsetMinutes } from "@/lib/time";

export const dynamic = "force-dynamic";

export function GET() {
  return jsonResponse(async () => {
    const status = normalizeStatus(await wtFetch("statuses/schedule"));
    // Tell the browser Winnipeg's real distance from UTC (per Winnipeg
    // Transit's clock), so it shows the same clock times the API uses.
    return { ...status, utcOffsetMinutes: getUtcOffsetMinutes(Date.now()) };
  });
}
