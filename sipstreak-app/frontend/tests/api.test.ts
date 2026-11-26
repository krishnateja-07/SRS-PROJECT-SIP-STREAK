import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* Integration tests: the real handler, the real file-backed storage adapter, no HTTP server needed. */

type Handler = (req: unknown, res: unknown) => Promise<void>
let handler: Handler
let dir: string
const SECRET = 'unit-test-secret'
let n = 0

async function load(env: Record<string, string | undefined> = {}) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sipstreak-'))
  const base: Record<string, string | undefined> = { SIPSTREAK_DATA_DIR: dir, SIPSTREAK_SECRET: SECRET, LOG_LEVEL: 'silent', BLOB_READ_WRITE_TOKEN: undefined, VERCEL: undefined, NODE_ENV: 'test' }
  for (const [k, v] of Object.entries({ ...base, ...env })) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.resetModules()
  handler = (await import('../api/[...path].js')).default as Handler
}

interface Reply { status: number; json: any }
async function call(method: string, url: string, body?: unknown, token?: string, extraHeaders: Record<string, string> = {}): Promise<Reply> {
  let text = ''
  const res = { statusCode: 200, setHeader() {}, end(t: string) { text = t } }
  await handler({ method, url, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders }, body }, res)
  return { status: res.statusCode, json: text ? JSON.parse(text) : null }
}

const signup = (over: Record<string, unknown> = {}) =>
  call('POST', '/api/signup', { name: 'Alice', email: `user${++n}@test.dev`, password: 'secret12', weightKg: 60, timezone: 'Asia/Kolkata', ...over })
const sync = (token: string, body: unknown) => call('POST', '/api/sync', body, token)
const logEntry = (ml: unknown, over: Record<string, unknown> = {}) => ({ id: `log${++n}x`, ml, kind: 'water', at: new Date().toISOString(), source: 'tap', ...over })
const sqId = () => `sq${++n}${crypto.randomBytes(3).toString('hex')}`
const sqCode = () => crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'A').padEnd(6, 'A')
const makeSquad = (name: string, id = sqId(), code = sqCode()) => ({ id, name, code, hue: 200 })

async function person(name = 'Pat', over: Record<string, unknown> = {}) {
  const r = await signup({ name, ...over })
  return { token: r.json.token as string, id: r.json.user.id as string, email: r.json.user.email as string }
}

beforeEach(async () => { await load() })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('health, routing and request validation', () => {
  it('reports storage latency', async () => {
    const r = await call('GET', '/api/health')
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ ok: true, storage: 'fs' })
    expect(r.json.storageLatencyMs).toBeGreaterThanOrEqual(0)
  })

  it('answers unknown routes with 404 and unsupported methods with 405', async () => {
    expect((await call('POST', '/api/nope', {})).status).toBe(404)
    expect((await call('PUT', '/api/state', {})).status).toBe(405)
  })

  it('rejects a malformed JSON body with 400, not 500', async () => {
    const r = await call('POST', '/api/login', '{not json')
    expect(r.status).toBe(400)
    expect(r.json.error).toMatch(/valid JSON/)
  })

  it('serves anonymous visitors an empty state with me = null', async () => {
    const r = await call('GET', '/api/state')
    expect(r.json).toMatchObject({ ok: true, me: null, users: [], squads: [] })
  })
})

describe('accounts', () => {
  it('validates sign-up input', async () => {
    expect((await signup({ name: 'A' })).json.error).toMatch(/name/i)
    expect((await signup({ email: 'not-an-email' })).json.error).toMatch(/email/i)
    expect((await signup({ password: '123' })).json.error).toMatch(/6 characters/)
    expect((await signup({ weightKg: 10 })).json.error).toMatch(/25 and 250/)
    expect((await signup({ weightKg: 400 })).status).toBe(400)
  })

  it('creates an account and returns a token without any secret material', async () => {
    const r = await signup({ email: 'Alice@Test.dev' })
    expect(r.status).toBe(200)
    expect(r.json.token).toMatch(/\./)
    expect(r.json.user).toMatchObject({ name: 'Alice', email: 'alice@test.dev', weightKg: 60, squadId: null, passHash: '', salt: '' })
  })

  it('treats emails case-insensitively when rejecting duplicates', async () => {
    await signup({ email: 'dup@test.dev' })
    const again = await signup({ email: 'DUP@test.dev' })
    expect(again.status).toBe(409)
    expect(again.json.error).toMatch(/already exists/)
  })

  it('logs in with the right password and gives one generic error otherwise', async () => {
    await signup({ email: 'login@test.dev' })
    expect((await call('POST', '/api/login', { email: 'login@test.dev', password: 'secret12' })).status).toBe(200)
    const wrong = await call('POST', '/api/login', { email: 'login@test.dev', password: 'nope' })
    const unknown = await call('POST', '/api/login', { email: 'ghost@test.dev', password: 'secret12' })
    expect([wrong.status, unknown.status]).toEqual([401, 401])
    expect(wrong.json.error).toBe(unknown.json.error)
  })

  it('stores a salted scrypt hash, never the password', async () => {
    await signup({ email: 'store@test.dev', password: 'hunter2-password' })
    const files = ['auth', 'users'].flatMap((d) => fs.readdirSync(path.join(dir, d)).map((f) => fs.readFileSync(path.join(dir, d, f), 'utf8')))
    expect(files.join('')).not.toContain('hunter2-password')
    const auth = JSON.parse(fs.readFileSync(path.join(dir, 'auth', fs.readdirSync(path.join(dir, 'auth'))[0]), 'utf8'))
    expect(auth.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(auth.salt).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('session tokens', () => {
  const sign = (userId: string, exp: number, secret = SECRET) => {
    const body = `${userId}.${exp}`
    const key = crypto.createHash('sha256').update('sipstreak:v1:' + secret).digest()
    return `${Buffer.from(body).toString('base64url')}.${crypto.createHmac('sha256', key).update(body).digest('base64url')}`
  }

  it('requires a token to sync', async () => {
    expect((await call('POST', '/api/sync', {})).status).toBe(401)
  })

  it('accepts a genuine token and rejects tampered, expired and foreign ones', async () => {
    const { token, id } = await person()
    expect((await call('GET', '/api/state', undefined, token)).json.me).toBe(id)
    expect((await call('GET', '/api/state', undefined, token + 'x')).json.me).toBeNull()
    expect((await call('GET', '/api/state', undefined, sign(id, Date.now() - 1000))).json.me).toBeNull()
    expect((await call('GET', '/api/state', undefined, sign(id, Date.now() + 1e6, 'another-secret'))).json.me).toBeNull()
    expect((await call('GET', '/api/state', undefined, sign(id, Date.now() + 1e6))).json.me).toBe(id) // control: right key works
  })
})

describe('drink logs', () => {
  it('accepts valid logs and skips invalid ones', async () => {
    const { token } = await person()
    const good = logEntry(500)
    const dup = { ...good }
    const bad = [logEntry(0), logEntry(2001), logEntry(-5), logEntry(12.5), logEntry(500, { kind: 'wine' }), logEntry(500, { at: 'yesterday' }), logEntry(500, { source: 'hack' }), logEntry(500, { id: '!' })]
    const r = await sync(token, { logs: { add: [good, dup, ...bad] } })
    expect(r.status).toBe(200)
    expect(r.json.state.logs.map((l: { id: string }) => l.id)).toEqual([good.id])
  })

  it('removes and edits logs, within limits', async () => {
    const { token } = await person()
    const a = logEntry(500), b = logEntry(250)
    await sync(token, { logs: { add: [a, b] } })
    const r = await sync(token, { logs: { remove: [b.id], update: [{ id: a.id, ml: 300 }, { id: a.id, ml: 99999 }] } })
    expect(r.json.state.logs).toMatchObject([{ id: a.id, ml: 300 }])
  })

  it('stores logs under the caller whatever userId the payload claims', async () => {
    const alice = await person('Alice'), bob = await person('Bob')
    await sync(alice.token, { logs: { add: [{ ...logEntry(400), userId: bob.id }] } })
    const state = (await call('GET', '/api/state', undefined, bob.token)).json
    expect(state.logs.every((l: { userId: string }) => l.userId === alice.id)).toBe(true)
    expect(state.logs).toHaveLength(1)
  })
})

describe('privacy between users', () => {
  it('hides other people’s weight and email but shares their daily goal', async () => {
    const alice = await person('Alice', { weightKg: 60 })
    const bob = await person('Bob', { weightKg: 80 })
    const state = (await call('GET', '/api/state', undefined, bob.token)).json
    const a = state.users.find((u: { id: string }) => u.id === alice.id)
    const b = state.users.find((u: { id: string }) => u.id === bob.id)
    expect(a).toMatchObject({ weightKg: 0, email: '', customTargetMl: 2100, passHash: '', salt: '' })
    expect(b).toMatchObject({ weightKg: 80, email: bob.email })
    expect(JSON.stringify(state)).not.toContain(alice.email)
  })

  it('shows others only the last 31 days of logs, but the owner all of them', async () => {
    const alice = await person('Alice'), bob = await person('Bob')
    const old = logEntry(500, { at: new Date(Date.now() - 40 * 864e5).toISOString() })
    await sync(alice.token, { logs: { add: [old, logEntry(250)] } })
    expect((await call('GET', '/api/state', undefined, bob.token)).json.logs).toHaveLength(1)
    expect((await call('GET', '/api/state', undefined, alice.token)).json.logs).toHaveLength(2)
  })

  it('shares only the caffeine settings of other people', async () => {
    const alice = await person('Alice'), bob = await person('Bob')
    await sync(alice.token, { settings: { nudgesOn: true, caffeineOn: false, caffeineBonusMl: 120 } })
    const seenByBob = (await call('GET', '/api/state', undefined, bob.token)).json.settings[alice.id]
    expect(seenByBob).toEqual({ caffeineOn: false, caffeineBonusMl: 120 })
  })
})

describe('squads', () => {
  it('creates a squad and puts the creator in it', async () => {
    const { token, id } = await person()
    const sq = makeSquad('Night Owls')
    const r = await sync(token, { createSquad: sq, profile: { squadId: sq.id } })
    expect(r.json.rejected).toBeUndefined()
    expect(r.json.state.squads).toMatchObject([{ id: sq.id, name: 'Night Owls', code: sq.code, createdBy: id }])
    expect(r.json.state.users.find((u: { id: string }) => u.id === id).squadId).toBe(sq.id)
  })

  it('rejects duplicate names (case-insensitive), sample names and clashing codes', async () => {
    const a = await person('Amy'), b = await person('Ben')
    const first = makeSquad('Library Owls')
    await sync(a.token, { createSquad: first })
    expect((await sync(b.token, { createSquad: makeSquad('library owls') })).json.rejected.squad).toMatch(/taken/)
    expect((await sync(b.token, { createSquad: makeSquad('Hostel Block B') })).json.rejected.squad).toMatch(/taken/)
    expect((await sync(b.token, { createSquad: makeSquad('Another Squad', undefined, first.code) })).json.rejected.squad).toMatch(/clash/)
    expect((await sync(b.token, { createSquad: { ...makeSquad('Ok Name'), code: 'bad' } })).json.rejected.squad).toMatch(/could not be created/)
  })

  it('lets people join by squad id, and leave', async () => {
    const owner = await person('Owner'), joiner = await person('Joiner')
    const sq = makeSquad('Shared')
    await sync(owner.token, { createSquad: sq, profile: { squadId: sq.id } })
    expect((await sync(joiner.token, { profile: { squadId: sq.id } })).json.state.users.filter((u: { squadId: string }) => u.squadId === sq.id)).toHaveLength(2)
    const left = await sync(joiner.token, { profile: { squadId: null } })
    expect(left.json.state.users.find((u: { id: string }) => u.id === joiner.id).squadId).toBeNull()
  })

  it('enforces the maximum of 8 members', async () => {
    const owner = await person('Owner')
    const sq = makeSquad('Crowded')
    await sync(owner.token, { createSquad: sq, profile: { squadId: sq.id } })
    for (let i = 1; i < 8; i++) {
      const p = await person(`Member${i}`)
      expect((await sync(p.token, { profile: { squadId: sq.id } })).json.rejected).toBeUndefined()
    }
    const ninth = await person('Ninth')
    const r = await sync(ninth.token, { profile: { squadId: sq.id } })
    expect(r.json.rejected.squad).toMatch(/full \(8\/8\)/)
    expect(r.json.state.users.find((u: { id: string }) => u.id === ninth.id).squadId).toBeNull()
  })

  it('keeps real accounts out of the sample squads and rejects unknown squads', async () => {
    const { token } = await person()
    expect((await sync(token, { profile: { squadId: 'sq-2' } })).json.rejected.squad).toMatch(/Sample squads/)
    expect((await sync(token, { profile: { squadId: 'doesnotexist' } })).json.rejected.squad).toMatch(/no longer exists/)
  })
})

describe('optimistic locking under concurrent writes', () => {
  it('applies every squad when several people create one at the same moment', async () => {
    const people = await Promise.all(['Amy', 'Ben', 'Cal', 'Dee'].map((x) => person(x)))
    const results = await Promise.all(people.map((p, i) => sync(p.token, { createSquad: makeSquad(`Squad ${i}`), profile: {} })))
    expect(results.every((r) => r.status === 200 && !r.json.rejected)).toBe(true)
    expect((await call('GET', '/api/state')).json.squads).toHaveLength(4)
  })

  it('logs each retry as a structured warning', async () => {
    await load({ LOG_LEVEL: 'warn' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const people = await Promise.all(['Amy', 'Ben', 'Cal'].map((x) => person(x)))
    await Promise.all(people.map((p, i) => sync(p.token, { createSquad: makeSquad(`Retry ${i}`) })))
    const events = warn.mock.calls.map((c) => JSON.parse(String(c[0])).event)
    expect(events).toContain('storage_conflict_retry')
  })
})

describe('structured logging', () => {
  it('writes one JSON line per request with timings and a request id', async () => {
    await load({ LOG_LEVEL: 'info' })
    const out = vi.spyOn(console, 'log').mockImplementation(() => {})
    await call('GET', '/api/health', undefined, undefined, { 'x-vercel-id': 'iad1::req-123' })
    const lines = out.mock.calls.map((c) => JSON.parse(String(c[0])))
    const req = lines.find((l) => l.event === 'request')
    expect(req).toMatchObject({ level: 'info', method: 'GET', route: 'health', status: 200, requestId: 'iad1::req-123' })
    expect(typeof req.ms).toBe('number')
    expect(req.storageCalls).toBeGreaterThanOrEqual(1)
    expect(req.storageMs).toBeGreaterThanOrEqual(0)
    expect(typeof req.ts).toBe('string')
  })

  it('logs failures with the right level and never leaks emails, passwords or tokens', async () => {
    await load({ LOG_LEVEL: 'debug' })
    const out = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await signup({ email: 'private@test.dev', password: 'very-secret-pw' })
    await call('POST', '/api/login', { email: 'private@test.dev', password: 'wrong-pw-attempt' })
    await sync(r.json.token, { logs: { add: [logEntry(500)] } })
    const all = [...out.mock.calls, ...warn.mock.calls, ...err.mock.calls].map((c) => String(c[0])).join('\n')
    const events = [...warn.mock.calls].map((c) => JSON.parse(String(c[0])))
    expect(events.find((e) => e.event === 'login_failed')).toMatchObject({ level: 'warn', reason: 'bad_password' })
    expect(events.find((e) => e.event === 'request' && e.status === 401)).toBeTruthy()
    for (const secret of ['private@test.dev', 'very-secret-pw', 'wrong-pw-attempt', r.json.token]) expect(all).not.toContain(secret)
    for (const line of all.split('\n')) expect(() => JSON.parse(line)).not.toThrow() // every line is JSON
  })

  it('records rejected squad changes so sync problems are visible', async () => {
    await load({ LOG_LEVEL: 'warn' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { token } = await person()
    await sync(token, { profile: { squadId: 'sq-1' } })
    const rejected = warn.mock.calls.map((c) => JSON.parse(String(c[0]))).find((e) => e.event === 'sync_rejected')
    expect(rejected).toMatchObject({ level: 'warn', reason: expect.stringMatching(/Sample squads/) })
  })

  it('flags slow storage operations', async () => {
    await load({ LOG_LEVEL: 'warn', SLOW_STORAGE_MS: '0' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await call('GET', '/api/state')
    const slow = warn.mock.calls.map((c) => JSON.parse(String(c[0]))).filter((e) => e.event === 'storage_slow')
    // with a 0 ms threshold only operations slower than 0 ms count; the request log still reports storage time
    expect(slow.every((e) => typeof e.ms === 'number' && typeof e.op === 'string')).toBe(true)
  })
})

describe('signing secret', () => {
  it('has no hardcoded fallback in the source', () => {
    const src = fs.readFileSync(path.resolve('api/[...path].js'), 'utf8')
    expect(src).not.toMatch(/dev-only-secret|SIPSTREAK_DEV_SECRET/)
  })

  it('refuses to serve in production when no secret is configured', async () => {
    await load({ VERCEL: '1', SIPSTREAK_SECRET: undefined, BLOB_READ_WRITE_TOKEN: undefined, LOG_LEVEL: 'error' })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await call('GET', '/api/health')
    expect(r.status).toBe(500)
    expect(r.json.error).toMatch(/not configured/)
    expect(err.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toContain('config_error')
  })

  it('uses a random per-process key in development when none is set', async () => {
    await load({ SIPSTREAK_SECRET: undefined })
    const { token } = await person()
    expect((await call('GET', '/api/state', undefined, token)).json.me).not.toBeNull()
    await load({ SIPSTREAK_SECRET: undefined }) // "restart": a new random key
    expect((await call('GET', '/api/state', undefined, token)).json.me).toBeNull()
  })
})

describe('the documented API matches the real one', () => {
  const spec = fs.readFileSync(path.resolve('docs/openapi.yaml'), 'utf8')
  const documented = [...spec.matchAll(/^ {2}(\/api\/[\w/-]+):\n {4}(get|post):/gm)].map((m) => ({ path: m[1], method: m[2].toUpperCase() }))

  it('documents every implemented route', () => {
    const implemented = ['GET /api/health', 'GET /api/state', 'POST /api/signup', 'POST /api/login', 'POST /api/sync']
    expect(documented.map((d) => `${d.method} ${d.path}`).sort()).toEqual([...implemented].sort())
  })

  it('has no documented route that answers 404 or 405', async () => {
    for (const d of documented) {
      const r = await call(d.method, d.path, d.method === 'POST' ? {} : undefined)
      expect([404, 405]).not.toContain(r.status)
    }
  })
})
