# Pin End

Pin End is an offline-first race preparation and on-water sailing PWA. The home screen shows the selected boat’s in-progress, upcoming, and previous races. Create a boat as its owner, or join with an invitation link, code, or QR scan. The header switches boats; each boat has its own owner/admin/crew memberships and an assigned navigator.

Open a race to prepare its course or enter race mode. The navigator chooses the shared next waypoint; all crew screens follow. Selecting Start before the gun enters pre-start, while selecting it after the gun supports a late start. Entering a later leg keeps the original start time and leaves missing history unrecorded. Finished races open their recorded map, timings, and replay. Leaving a view or selecting another target never clears recorded timing.

The app also includes sail wardrobes, fixed/variable/constructed marks, camera-assisted sightings, tactical line-crossing estimates, GPS speed and VMG-based ETAs, wake-lock handling, and a development sensor simulator.

## Run locally

```sh
npm install
npm run dev
```

Open the displayed local URL and choose **Open local demo** for the seeded CYCA race, or **Create local workspace** for first-use onboarding. Local workspaces store data in IndexedDB. Cross-account invitations and shared navigation require the Supabase migration below; local mode does not simulate remote crew.

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
- Race data, the simulator, and post-race replay remain available offline. Interactive course and mark-positioning basemaps use Google Maps and require a live connection.

## Deploy to Vercel with Supabase

Copy `.env.example` to `.env.local` and provide:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_GOOGLE_MAPS_API_KEY=
VITE_GOOGLE_MAPS_MAP_ID=
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

Import this repository into Vercel, keep the detected Vite settings, and add all four values from `.env.example` to the Production and Preview environments. Local development can omit `VITE_GOOGLE_MAPS_MAP_ID` and use Google's demo map ID, but production requires a project map ID. Restrict the browser key to the Maps JavaScript API and to localhost plus your Vercel domains. `vercel.json` supplies the SPA fallback and safe service-worker caching headers.

Apply `supabase/migrations/20261007000000_shared_boat_workspaces.sql` before deploying this UI. It adds membership-protected boat catalogs, expiring invitations, and navigator-controlled race progress. Only the owner can grant admin access; owners/admins can assign a boat member as navigator. Creating a replacement invitation invalidates the previous code.

While online, clients synchronize approximately every three seconds. GPS history is queued at least every ten seconds while recording and on navigation changes/finish. Previously synchronized fixes are retained across navigator handoffs. All historical fixes stay in IndexedDB; the live instrument window uses the most recent 3,600. Keep the navigator’s app open to record and synchronize GPS.

Offline, the navigator can continue with durable queued changes, and crew see their last synchronized target with an offline indicator. Reconnecting fetches current shared state. Revision checks prevent stale offline changes from overwriting another device’s updates or a navigator handoff. Conflicting edits are preserved in a user-scoped local recovery entry and the UI explains that the authoritative state was loaded. Unsynced fixes on an offline former navigator’s device remain on that device; reconnect and sync before handing navigation over whenever possible.

Existing personal snapshots are imported once into shared boats with namespaced IDs. The original snapshot is retained. Legacy races without boat associations are assigned to the first legacy boat, matching the previous app’s default boat. New signed-in users start without seeded demo boats.

Database authorization tests are in `supabase/tests/shared_boats.sql`, intended for a disposable PostgreSQL test instance with `auth.uid()`/`auth.jwt()` test doubles and `auth.users(id)`.

## Data and safety notes

The CYCA address is seeded as 1 New Beach Road, Darling Point NSW 2027, with an approximate OpenStreetMap-derived coordinate. Demo mark coordinates must be checked against current sailing instructions before real use. Weather and tidal information is advisory and Pin End is not a substitute for official race documents, a proper lookout, or safe navigation.
