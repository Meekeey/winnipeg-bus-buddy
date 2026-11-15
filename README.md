# Bus Buddy

Winnipeg Transit Riders
Demo Play: https://winnipeg-bus-buddy.vercel.app/ (Transit live might not work on desktop. maybe try it on mobile)

<img width="2557" height="1303" alt="image" src="https://github.com/user-attachments/assets/58942dd9-be39-45dd-8b15-8e34e80e5343" />
<img width="2560" height="1392" alt="image" src="https://github.com/user-attachments/assets/22a12c10-8ef8-4388-8b91-7c044fcceb65" />

<img width="421" height="1303" alt="image" src="https://github.com/user-attachments/assets/be4fad87-7961-4ce0-a695-92dab23e6a09" />
<img width="333" height="877" alt="image" src="https://github.com/user-attachments/assets/8c6f7cb9-ae7d-420d-b30d-9c4ba13f903b" />
<img width="341" height="760" alt="image" src="https://github.com/user-attachments/assets/a9709528-4c68-424a-ae17-0634991ff1fa" />
<img width="384" height="1142" alt="image" src="https://github.com/user-attachments/assets/3d0a6e94-9090-4391-a871-e56ea9022f14" />

- **Map**: stops and route lines on an OpenStreetMap map, stop search, "stops near me".
- **Track**: pick a stop, pick a bus, and follow that one bus (your "active quest").
- **Trip**: plan a trip home, or enter the buses you already know and find the trip
  with the shortest wait at the transfer.

Everything uses free services: Vercel Hobby, OpenStreetMap tiles, and the
Winnipeg Transit Open Data API.

## Tutorial
## 1. Get a Winnipeg Transit API key (free)

1. Go to <https://api.winnipegtransit.com/> and choose **Sign up**.
2. Confirm your email, log in, and create an API key.
3. Keep the key private. In this app it only ever lives on the server.

## 2. Set environment variables

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Needed? | What it is |
| --- | --- | --- |
| `WT_API_KEY` | Yes | Your Winnipeg Transit API key. Server only. |
| `VERCEL_DEPLOY_HOOK_URL` | Optional | Deploy Hook URL, used by the daily GTFS refresh. |
| `CRON_SECRET` | Optional | Any long random text. Protects the cron route. |
| `NEXT_PUBLIC_DEMO` | Optional | Set to `1` to run with made-up times and no API key. |

## 3. Run locally

```bash
npm install
npm run gtfs     # downloads GTFS and writes public/data (also runs before every build)
npm run dev      # http://localhost:3000
```

No key yet? Try the demo mode (real stops and routes, invented arrival times):

```bash
NEXT_PUBLIC_DEMO=1 npm run dev
```

On Windows PowerShell use `$env:NEXT_PUBLIC_DEMO=1; npm run dev`.

## 4. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel choose **Add New > Project** and import the repository. The defaults work.
3. Under **Settings > Environment Variables** add `WT_API_KEY`.
4. Deploy. The build runs `scripts/build-gtfs.mjs` first, so stop and route data is fresh.

### Daily GTFS refresh (optional, recommended)

Winnipeg Transit changes its schedule data a few times a year. To stay current:

1. In Vercel go to **Settings > Git > Deploy Hooks**, create a hook for your main
   branch, and copy its URL into the `VERCEL_DEPLOY_HOOK_URL` variable.
2. Add a `CRON_SECRET` variable with any long random text.
3. Redeploy once.

`vercel.json` already schedules `/api/cron/refresh` once a day (09:00 UTC). That
route calls the Deploy Hook, Vercel rebuilds the site, and the build downloads
the newest GTFS file.

**Why this way?** It is free on the Hobby plan (one daily cron is allowed), it
needs no database or file storage, and the app keeps serving plain static JSON,
which is fast. If the GTFS download fails during a build, the script keeps the
data files it already has.

## How the data works

| Thing | Where it comes from |
| --- | --- |
| Stop locations, route lines, which routes serve a stop | GTFS, turned into small JSON files in `public/data` at build time |
| Live arrival times | Stop Schedules API (`stops/{number}/schedule`) |
| A tracked bus | Trip Schedules API (`trips/{trip-key}`) |
| Address suggestions | Locations API (`locations:{text}`) |
| Trip plans | Trip Planner API |
| Emergency Service Plan banner | Statuses API (`statuses/schedule`) |

Important limits, by design:

- **No live GPS.** The public API has no bus coordinates, so the map shows the
  route lines and stops of a tracked trip, not a moving bus. The Track tab says
  in words roughly where the bus is ("between stop A and stop B"), worked out
  from the stop times: the last stop already passed and the next one ahead.
- **Tracking a whole trip.** "Start this trip" tracks every bus of a plan until
  you cancel it. The Trip Planner doesn't say which bus trip each ride is, so
  `lib/quest.ts` finds it in the boarding stop's schedule. That schedule reaches
  about 6 hours ahead, so only trips leaving within 6 hours can be started.
- **Winnipeg Transit's clock is the one that counts.** Time-zone data on a
  server or phone can be out of date. Every API answer includes the API's own
  local time, and `lib/time.ts` uses it to correct the clock on the server and,
  separately, in the browser.
- **Rate limit.** The API allows 100 requests per minute per key. The server
  caches every answer for 25 seconds, and responses are also cached by Vercel's
  CDN for 20 seconds, so many riders share the same request.
- **The key stays on the server.** The browser only talks to `/api/...` routes
  in this app (`lib/server/wt.ts` adds the key).
- **Your location.** The app asks the phone for its location once, then follows
  it while the app is open (paused when the tab is hidden). It centres the map
  on you, lists the stops near you, and is the default start for trip plans.
  The location stays in the browser. It is only sent on (to Winnipeg Transit,
  through this app's server) when you plan a trip from "My location". Browsers
  only share location on `https://` sites and `localhost`, which Vercel provides.
- **Auto-refresh.** Screens with live times reload every 30 seconds and pause
  while the tab is hidden (`hooks/usePolling.ts`).

Status labels (delay = estimated minus scheduled): more than 1 min early is
**Early**, up to 5 min late is **On time**, more than 5 min late is **Late**,
and exactly equal is **Scheduled** (there may be no live data for that bus).

## Project layout

```
app/
  page.tsx, layout.tsx, globals.css, manifest.ts
  api/status            service status (Emergency Service Plan check)
  api/stops/[number]/schedule   live arrivals at a stop
  api/trips/[key]       every stop of one bus trip
  api/locations         address and place suggestions
  api/trip-plan         Trip Planner
  api/cron/refresh      daily redeploy trigger
components/
  App, AppState         app shell and shared state (tab, tracked bus, favourites, theme)
  MapView               Leaflet map: stops, route lines, the tracked trip
  MapPanel, StopSheet, ArrivalRow, StopSearch, NearbyStops   Map tab
  TrackPanel            Track tab (one card per tracked bus)
  TripPanel, TripHome, TripKnown, PlaceInput, WhenPicker     Trip tab
  QuestPath             timeline used by tracking and trips
  pixel/                wooden panel, icons, route badge, status tag, buttons
hooks/                  usePolling, useNow, useStoredState
lib/
  types.ts              the simple data shapes the screens use
  time.ts               status labels, "16 MIN" vs "1:20 PM", Winnipeg time and clock sync
  transfer.ts           "I know my buses" maths (shortest transfer wait)
  quest.ts              turns a planned trip into buses that can be tracked
  position.ts           where a bus is between stops, and which route line fits a trip
  staticData.ts         loads the GTFS JSON files
  liveSource.ts         calls this app's API routes
  server/               Winnipeg Transit fetch + cache, and JSON clean-up
  demo/                 made-up timetable for demo mode
scripts/
  build-gtfs.mjs        GTFS zip -> small JSON files
  build-demo.mjs        one-file demo page (npm run demo)
```

Favourites, the tracked bus, your saved trip and the light/dark choice are
stored in the browser's localStorage. There are no accounts and no database.

## Adding things later

- **Alerts (push, Telegram):** the "is my bus close?" facts already exist in one
  place. `lib/types.ts` defines `TrackedBus` (trip key, boarding stop, get-off
  stop), and `AppState` keeps the list being tracked. A server-side alert
  checker can read the same live times from `/api/trips/[key]`.
- **New data source:** screens only use the `DataSource` interface in
  `lib/types.ts`, so another source can be swapped in without touching them.

## Notes

- Map tiles come from OpenStreetMap's free tile server. Keep the attribution
  visible, and for heavy traffic switch `TILE_URL` in `components/MapView.tsx`
  to a tile provider with a free tier.
- If tiles can't load, the map falls back to a simple sketch made from the route lines.
- The exact JSON nesting of the API was written from the v4 field documentation.
  If Winnipeg Transit changes a field, the one file to fix is `lib/server/normalize.ts`.
