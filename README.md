# Pin End

Pin End is an offline-first race preparation and on-water sailing PWA. The current local build includes a seeded Cruising Yacht Club of Australia demo, setup/pre-start/race modes, boats and sail wardrobes, fixed/variable/constructed marks, camera-assisted sightings for line ends and movable marks, tactical line-crossing estimates, GPS speed and VMG-based mark ETAs, wake-lock handling, a post-finish GPS summary with a 30-second race replay, and a development sensor simulator.

## Run locally

```sh
npm install
npm run dev
```

Open the displayed local URL, choose **Open local demo**, and use the bottom navigation. The app stores its data in IndexedDB and does not require Supabase for local development.

Useful verification commands:

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

## Development sensor simulator

Development builds add a **Debug** page to the bottom navigation. Open it to enable simulated sensors, then adjust true bearing, speed, accuracy, and position. You can move the simulated boat by 30 seconds or place it near the active mark. Simulator changes are shared live across same-origin tabs and windows, so the Debug page can remain open beside a separate race display. The page is guarded by `import.meta.env.DEV`, so it is excluded from production behavior.

For triangulation, enable the simulator, open an endpoint or movable-mark viewfinder, align its crosshair, and capture. Move at least 25 metres, adjust the bearing back toward the target, and repeat. Pin end and committee boat are presented first, with other variable marks below them. On a phone, the viewfinder uses the rear camera while the phone is held vertically; camera frames are never saved or uploaded. The **I am beside this endpoint** control provides a direct GPS alternative for the start line.

## PWA and offline behavior

- Vite PWA precaches the application shell and local assets.
- IndexedDB stores marks, boats, sails, race definitions, sessions, observations, and telemetry.
- Race time is reconstructed from timestamps and survives reloads.
- Race mode requests a screen wake lock and reacquires it after the app becomes visible. Operating systems can still revoke it, so the UI reports the state.
- Browser geolocation is only reliable while the PWA is visible. Pin End intentionally assumes the race display remains open.
- The built-in SVG course plot is always available offline. `VITE_BASEMAP_STYLE_URL` is reserved for a future offline-licensed MapLibre/PMTiles basemap.

## Deploy to Vercel with Supabase

Copy `.env.example` to `.env.local` and provide:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_BASEMAP_STYLE_URL=
```

Apply the migrations with the Supabase CLI. They enable PostGIS, create the community model, and add a row-level-secured per-user app snapshot used for cloud synchronization.

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Create a Google OAuth Web client and configure its client ID and secret directly in the Supabase dashboard. Add this redirect URI in Google:

```text
https://YOUR_PROJECT.supabase.co/auth/v1/callback
```

Set the Supabase Auth Site URL to the production Vercel URL. Add `http://localhost:5173/**`, the exact production URL, and (if used) `https://*-YOUR_TEAM_SLUG.vercel.app/**` to the redirect allow list. Never place the Google client secret or a Supabase secret/service-role key in this repository or the browser environment.

Import this repository into Vercel, keep the detected Vite settings, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the Production and Preview environments. `vercel.json` supplies the SPA fallback and safe service-worker caching headers.

The browser database remains authoritative while sailing. When signed in and online, changes are batched into the user's Supabase snapshot; on a new device, that snapshot hydrates the local database at startup. If Supabase is unreachable, startup and race recording continue offline and synchronization retries when connectivity returns or another edit is made.

## Data and safety notes

The CYCA address is seeded as 1 New Beach Road, Darling Point NSW 2027, with an approximate OpenStreetMap-derived coordinate. Demo mark coordinates must be checked against current sailing instructions before real use. Weather and tidal information is advisory and Pin End is not a substitute for official race documents, a proper lookout, or safe navigation.
