// GET /api/cron/refresh
// Called once a day by Vercel Cron (see vercel.json). It asks Vercel to
// redeploy the site, and the build step downloads fresh GTFS data.
//
// Env vars:
//   VERCEL_DEPLOY_HOOK_URL  a Deploy Hook URL from your Vercel project settings
//   CRON_SECRET             Vercel sends this as "Authorization: Bearer <secret>"

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not allowed" }, { status: 401 });
  }

  const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    return Response.json({ error: "VERCEL_DEPLOY_HOOK_URL is not set" }, { status: 500 });
  }

  const response = await fetch(hookUrl, { method: "POST" });
  return Response.json({ ok: response.ok });
}
