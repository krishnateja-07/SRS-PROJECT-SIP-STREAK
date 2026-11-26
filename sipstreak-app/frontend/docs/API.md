# SipStreak API

The formal contract is [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.1). A test (`tests/api.test.ts`) fails if a route is
implemented but not documented, or documented but missing. This page is the short, readable version.

Base URL: `https://sipstreak-hydrohero-hunt.vercel.app` (production) or `http://localhost:4000` (`node server/dev.mjs`).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | none | Liveness plus storage latency |
| GET | `/api/state` | optional | Everyone's public state; your own full record when signed in |
| POST | `/api/signup` | none | Create an account |
| POST | `/api/login` | none | Sign in |
| POST | `/api/sync` | Bearer | Push your changes (profile, settings, logs, a new squad, sticker scans) |

All bodies are JSON and every response is `Cache-Control: no-store`. Errors look like `{ "ok": false, "error": "…" }`.

## Authentication

`signup` and `login` return `{ token, user, state }`. Send the token as `Authorization: Bearer <token>`.
Tokens are HMAC-SHA256 signed and last 30 days. A tampered, expired or foreign token is treated as anonymous
(`/api/state` returns `me: null`, `/api/sync` returns 401).

The signing key comes from `SIPSTREAK_SECRET`, or is derived from the private Blob token. There is no constant fallback:
in production with neither, every route answers `500 Server is not configured.` and logs `config_error`. In local
development with neither, a random per-process key is used, so sessions end when the dev server restarts.

## Examples

```bash
# sign up
curl -s -X POST $BASE/api/signup -H 'content-type: application/json' \
  -d '{"name":"Anna","email":"anna@example.com","password":"secret12","weightKg":60,"timezone":"Asia/Kolkata"}'

# log 500 ml and create a squad in one sync
curl -s -X POST $BASE/api/sync -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "logs": { "add": [{ "id": "log-001", "ml": 500, "kind": "water", "at": "2026-11-20T08:00:00.000Z", "source": "tap" }] },
  "createSquad": { "id": "sqabc123", "name": "Library Owls", "code": "OWLS42", "hue": 200 },
  "profile": { "squadId": "sqabc123" }
}'

# everyone's state (add the header to also get your own full record)
curl -s $BASE/api/state -H "authorization: Bearer $TOKEN"
```

## Validation (server-side, whatever the client sends)

| Field | Rule |
| --- | --- |
| name | 2–40 characters |
| email | valid format, ≤ 120 characters, unique (case-insensitive) |
| password | 6–200 characters; stored only as a salted scrypt hash |
| weightKg | 25–250 |
| log `ml` | integer 1–2,000; `kind` water / coffee / energy; `at` a valid timestamp; `id` 3–40 of `A-Za-z0-9_-`; duplicates skipped; owner is always the token's user |
| squad | name 3–32 (unique, case-insensitive, not a sample name); code 6 of `A-Z0-9`, unique |
| squad membership | squad must exist, not be a sample squad, and have fewer than 8 members; otherwise `rejected.squad` explains why |
| limits per sync | 200 added logs, 500 removed, 500 edited |

## Privacy

Other people's `weightKg` and `email` are never returned (`0` and `""`); their daily goal is shared in `customTargetMl`.
Other people's logs cover the last 31 days; yours are complete. Password hashes never leave the server.

## Concurrency

Writes are optimistic: read with an ETag, write with `ifMatch`, retry up to 5 times on a conflict. Four people creating
squads at the same instant all succeed (covered by a test).

## Observability

One JSON object per line. Set `LOG_LEVEL` to `debug`, `info` (default), `warn`, `error` or `silent`;
`SLOW_STORAGE_MS` (default 700) sets the "slow storage" threshold.

| `event` | Level | Fields | Meaning |
| --- | --- | --- | --- |
| `request` | info / warn (4xx) / error (5xx) | `requestId method route status ms userId storageCalls storageMs retries` (+ `errorName errorMessage stack` on 5xx) | One per request; the place to watch sync failures and storage latency |
| `storage_op` | debug | `op key ms` | Every storage call (account keys are redacted) |
| `storage_slow` | warn | `op key ms` | A storage call slower than `SLOW_STORAGE_MS` |
| `storage_conflict_retry` | warn | `key attempt` | An optimistic-lock conflict that was retried |
| `storage_conflict_exhausted` | error | `key` | A write gave up after 5 conflicts |
| `sync_rejected` | warn | `userId reason` | A squad change the server refused |
| `login_failed` | warn | `reason` | `bad_password` or `unknown_account` (never the email) |
| `config_error` | error | `problem` | No signing secret in production |

`requestId` is Vercel's `x-vercel-id` when present, so a log line can be matched to a request in the dashboard.
Logs never contain emails, passwords, tokens or drink data.

`GET /api/health` returns `storageLatencyMs`, a good probe for an uptime monitor.
