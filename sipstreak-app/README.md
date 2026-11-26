# SipStreak: HydroHero Hunt

**Live site:** https://sipstreak-hydrohero-hunt.vercel.app

A 3D, gamified team hydration challenge for college students and desk-bound teams. Squads of 4–8 log water, chase personal targets, and climb a fair campus leaderboard.

## What's in this build

| Area | Status |
| --- | --- |
| Landing page: 3D bottle, floating droplets, live campus stats, "Start Your Journey" / "Explore Squads" | ✅ |
| Sign up / log in / profile setup (weight → target = weight × 35 ml, adjustable) | ✅ |
| Dashboard with sidebar: 3D Three.js bottle whose water level, colour and ripple come from real intake | ✅ |
| Quick-tap logging (+250 cup, +500 bottle, +750 tumbler, custom) with undo and server-style validation | ✅ |
| Squads: create, join by 6-char invite code, 4–8 members, member %, total water, team target, team streak | ✅ |
| HydroHero leaderboard: animated 3D podium, live re-ranking, celebration when your squad climbs | ✅ |
| Weekly history: Chart.js personal intake vs target + team vs campus, personal and team streaks | ✅ |
| Hourly nudge simulator: opt-in browser notifications, active hours, fast demo mode, in-app fallback | ✅ |
| Stretch: plant companion, caffeine offset (+200 ml, configurable), Leaflet fountain map (verified flags), bottle QR sticker with duplicate-scan protection | ✅ |

### Key logic (`frontend/src/lib/calc.ts`)
- **Team Fair Participation Formula:** `TeamScore = (Σ min(1, intake / goal) / teamSize) × 100` — each member is capped at 100%.
- Logs are stored with **UTC ISO timestamps** and grouped by each user's **IANA timezone** calendar day. Nothing is deleted at midnight; "today" is just a new slice.
- Caffeine offset is labelled as a **game rule**, not medical advice. The 35 ml/kg target is a **prototype heuristic**.
- Fountains are only shown as verified when they carry a verification date and verifier.

### Demo script (pitch)
1. Log in → **Log in as Priya** (`priya@sipstreak.demo` / `hydrate123`).
2. Hostel Block B is **2nd at 72%**, Priya is at 64%.
3. Tap **+500 ml Bottle** → bottle ripples to **88%**, squad climbs to **78%**, overtakes Hostel Block A (75%) and the podium celebrates.
4. Settings → **Reset demo data** to replay.

Sample data: 4 squads (Hostel Block A, Hostel Block B, Aqua Knights, Hydration Homies), 16 members, 7 days of logs (`frontend/src/lib/seed.ts`).

## 3D & UX upgrade pass

Guided by the React Three Fiber, Motion, web3d-integration and modern-web-design skills from
[freshtechbro/claudedesignskills](https://github.com/freshtechbro/claudedesignskills) (used as reference material).

**3D (`frontend/src/three/`)**
- Bottle scene split into `BottleScene` (R3F), `Bottle3D` (production wrapper) and `quality` (device tiers, WebGL check).
- New 3D feedback: goal line + 25/50/75% marks on the bottle, squash-and-stretch on every log, a victory twirl with a neon confetti burst when the daily goal is reached, a floating 3D crown on the podium leader.
- Hero bottle is scroll-driven (rotates and drifts as you scroll) via a motion value read inside the frame loop, so scrolling causes zero React re-renders.
- Performance: no per-frame allocations, surface normals refreshed every 3rd frame, render loop stops when the canvas is off-screen, starts on a quality tier matched to the device and drops to the low tier automatically if the frame rate stays low (`PerformanceMonitor`).
- Resilience: lazy-loaded chunk with a skeleton, 2D liquid-ring fallback if WebGL is unavailable or the scene throws, reduced-motion mode renders on demand and snaps instead of easing, 3D chunk is preloaded while you're on the login form.

**UX**
- Landing: scroll progress bar, staggered 3D card reveals, counters driven by motion values, and an interactive "fair formula" playground (drag the heavy drinker to 200% and watch the cap hold the score).
- Accessibility: `MotionConfig reducedMotion="user"`, labelled 3D canvas, live-region progress announcement, skip-to-content link, reduced-motion-aware tilt and confetti.
- Haptic tick on supported phones when you log a drink.
- Deep links such as `#scoring` now scroll correctly on first load.

**Code quality**
- Leaderboard and per-day log lookups are cached per data snapshot (`WeakMap`), removing repeated full scans on every render.
- `Tilt` now takes a `wrap` prop for grid placement, fixing cards that ignored `col-span` and the two-column layout in the fairness section.

## Shared backend (accounts and synced squads)

`frontend/api/[...path].js` is one Vercel Function with a pluggable storage tier, chosen by environment variable:

| Backend | Selected by | Use |
| --- | --- | --- |
| **PostgreSQL** (`api/_pgStore.js`, schema in `db/schema.sql`) | `DATABASE_URL` or `POSTGRES_URL` | multi-instance production: row-version optimistic locking works across any number of function instances and DB connections; Supabase, Neon, RDS, Vercel Postgres |
| **Private Vercel Blob** | `BLOB_READ_WRITE_TOKEN` | zero-setup hosting (the current default deployment) |
| Local files `./.data/` | neither | development and tests |

`/api/health` reports which one is live (`storage`: `postgres`, `blob` or `fs`). The table is created automatically on first use.

- Real accounts: passwords are scrypt-hashed on the server; sessions are signed 30-day tokens.
- Each user has one JSON file (profile, drink logs, settings); squads live in `squads.json`.
- The app pushes only the changes you make (diff sync) and polls every 8 seconds, so squadmates see each other's drinks.
- Other people's weight and email never leave the server (only their daily goal is shared).
- The four sample squads and the demo account stay in the browser, so real sign-ups never disturb the pitch demo.
- If `/api` is unreachable (static hosting, offline) the app falls back to local mode.

Deploy: create a private Blob store and connect it to the Vercel project (this adds `BLOB_READ_WRITE_TOKEN`), then deploy.
Optionally set `SIPSTREAK_SECRET` (a long random string) to sign sessions with your own key; otherwise the key is derived from
the Blob token. There is **no hardcoded fallback**: in production without either, the API refuses to serve (`500`, `config_error` log).

API reference: [`frontend/docs/API.md`](frontend/docs/API.md) and the OpenAPI spec [`frontend/docs/openapi.yaml`](frontend/docs/openapi.yaml).
Logs are structured JSON (one line per request, with timings and storage latency); see the Observability table in the API guide.

Local development (no cloud needed; data goes to a folder):
```bash
cd frontend
SIPSTREAK_DATA_DIR=/tmp/sipdata node server/dev.mjs   # API on :4000
npm run dev                                            # Vite proxies /api to it
```

## Testing and CI

```bash
cd frontend
npm test            # 97 tests: unit + integration (Vitest)
npm run coverage    # same, with coverage thresholds (85% lines/functions, 75% branches on the logic modules)
npm run lint        # oxlint, warnings are errors
npm run typecheck   # tsc -b
npm run e2e         # Playwright end-to-end tests of the 3D bottle (build first; see below)
npm run ci          # lint + typecheck + tests + build, the same steps as GitHub Actions
```

- `src/lib/calc.test.ts`: the Team Fair Participation formula (including the worked 76.25 example and the 100% cap), daily target,
  timezone day-slicing, caffeine offset, personal and team streaks, leaderboard ranking and caching.
- `src/lib/seed.test.ts`: the sample campus, and the pitch demo (+500 ml takes Hostel Block B from 72% to 78% and past Block A).
- `src/lib/remote.test.ts`: sync diffing and merging.
- `tests/api.test.ts`: the real API handler on a temporary storage folder: accounts, token tampering, validation, privacy,
  squad rules, concurrent writes (optimistic locking), structured logging, secret handling, and that `openapi.yaml` matches the routes.
- `tests/pg-store.test.ts`: the PostgreSQL adapter (run against an in-memory Postgres): contract, stale-write rejection, and the full API on the `postgres` backend.
- `src/lib/waterShader.test.ts`: the GPU water shader's uniforms and reduced-motion behaviour.
- `e2e/bottle.spec.ts` (Playwright, real Chromium with software WebGL): the 3D canvas renders with no shader errors, logging water changes the canvas and the stored amount, remove / set / clear, and the leaderboard.
- `tests/client-server.test.ts`: the real client code talking to the real handler, including offline and timeout behaviour.

GitHub Actions (`.github/workflows/ci.yml`) runs lint, type check, tests with coverage and the production build, then the Playwright end-to-end tests in a second job, on every push and pull request.

## Stack
React 19 + TypeScript + Vite · Tailwind CSS · Three.js via React Three Fiber + drei · Framer Motion · Chart.js · Leaflet (offline campus plan) · qrcode · Browser Notifications API.

Real accounts and squads sync through the Vercel Function above; sample data stays in `localStorage`.

## Run locally (Node 20+)
```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in frontend/dist (relative paths, deploy anywhere)
```

## Layout
```text
frontend/
  src/
    lib/        types, calc (scoring, streaks, timezones), seed data, store, hash routing
    three/      BottleScene.tsx (glass bottle, wavy water, bubbles, splash particles)
    components/ AppShell (sidebar, nudges), QuickLog, LiveBoard (podium + ranks), UI kit
    pages/      Landing, Auth (login/signup/setup), Dashboard, Hydration, Squad,
                Leaderboard, History, Plant, FountainMap, Profile/Settings
```
