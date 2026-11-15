// GET /api/locations?q=414+osb -> address / place suggestions while typing
import { jsonResponse, wtFetch } from "@/lib/server/wt";
import { normalizePlaces } from "@/lib/server/normalize";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return jsonResponse(async () => {
    const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
    if (query.length < 3) return [];
    // The API's "wildcard" search looks like: locations:414 osb
    const path = `locations:${encodeURIComponent(query)}`;
    return normalizePlaces(await wtFetch(path, { usage: "short" })).slice(0, 8);
  });
}
