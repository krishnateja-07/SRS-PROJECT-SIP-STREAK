// SipStreak API: one Vercel Function backed by a PostgreSQL (DATABASE_URL), else a private Vercel Blob store.
// Storage layout (all JSON):
//   auth/<sha256(email)>.json   { userId, email, salt, hash }        scrypt-hashed password
//   users/<userId>.json         { user, logs, settings, qr }         one writer per user
//   squads.json                 { squads: [...] }
// Without BLOB_READ_WRITE_TOKEN (local development, tests) the same interface is backed by ./.data/.
// Routes are documented in docs/openapi.yaml.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { AsyncLocalStorage } from 'node:async_hooks'
import { connectPg } from './_pgStore.js'

const scrypt = promisify(crypto.scrypt)
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL
const BACKEND = DB_URL ? 'postgres' : TOKEN ? 'blob' : 'fs'
const IS_PROD = !!process.env.VERCEL || process.env.NODE_ENV === 'production'

/**
 * Session-signing key. There is no constant in the source:
 *   1. SIPSTREAK_SECRET (recommended: set it, and rotating it signs everyone out), else
 *   2. derived from the private Blob token, a secret only this function can see, else
 *   3. local development only: a random key per process (sessions end when it restarts).
 * In production with neither 1 nor 2 the API refuses to start serving instead of using a guessable key.
 */
function loadSecret() {
  const src = process.env.SIPSTREAK_SECRET || TOKEN || DB_URL
  if (src) return crypto.createHash('sha256').update('sipstreak:v1:' + src).digest()
  return IS_PROD ? null : crypto.randomBytes(32)
}
const SECRET = loadSecret()

const MAX_SQUAD = 8
const SESSION_DAYS = 30
const SAMPLE_SQUADS = [
  { id: 'sq-1', name: 'Hostel Block A', code: 'HBA7Q2' },
  { id: 'sq-2', name: 'Hostel Block B', code: 'HBB4K9' },
  { id: 'sq-3', name: 'Aqua Knights', code: 'AQK3M8' },
  { id: 'sq-4', name: 'Hydration Homies', code: 'HYD6P5' },
]

/* ------------------------------ logging ------------------------------ */
// One JSON object per line on stdout/stderr, so Vercel log drains and `vercel logs` can filter by field.
// LOG_LEVEL: debug | info (default) | warn | error | silent.  SLOW_STORAGE_MS: slow-operation threshold (default 700).
// Logs carry ids, routes and timings, never emails, passwords, tokens or drink data.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 }
const requestContext = new AsyncLocalStorage()

function log(level, event, fields = {}) {
  if (LEVELS[level] < (LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info)) return
  const ctx = requestContext.getStore()
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(ctx ? { requestId: ctx.id } : {}), ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/** Time every storage call, count it on the current request, and flag slow ones. */
function instrument(store) {
  const redact = (k) => (typeof k === 'string' ? k.replace(/^auth\/.*/, 'auth/*') : undefined)
  const timed = (op) => async (...args) => {
    const t0 = performance.now()
    try {
      return await store[op](...args)
    } finally {
      const ms = Math.round(performance.now() - t0)
      const ctx = requestContext.getStore()
      if (ctx) { ctx.storageCalls++; ctx.storageMs += ms }
      const slow = ms > (Number(process.env.SLOW_STORAGE_MS) || 700)
      log(slow ? 'warn' : 'debug', slow ? 'storage_slow' : 'storage_op', { op, key: redact(args[0]), ms })
    }
  }
  return { read: timed('read'), write: timed('write'), create: timed('create'), keys: timed('keys') }
}

/* ------------------------------ storage ------------------------------ */
const isConflict = (e) => !!e && (e.code === 'CONFLICT' || e.name === 'BlobPreconditionFailedError' || /already exists|precondition/i.test(String(e.message)))

async function makeStore() {
  if (DB_URL) return connectPg(DB_URL)
  if (TOKEN) {
    const { put, get, list } = await import('@vercel/blob')
    const opts = { access: 'private', contentType: 'application/json', addRandomSuffix: false }
    return {
      async read(key) {
        const r = await get(key, { access: 'private', useCache: false })
        if (!r || r.statusCode !== 200) return null
        return { data: JSON.parse(await new Response(r.stream).text()), etag: r.blob.etag }
      },
      async write(key, data, etag) { await put(key, JSON.stringify(data), { ...opts, allowOverwrite: true, ...(etag ? { ifMatch: etag } : {}) }) },
      async create(key, data) { await put(key, JSON.stringify(data), { ...opts, allowOverwrite: false }) },
      async keys(prefix) {
        const out = []
        let cursor
        do {
          const r = await list({ prefix, cursor, limit: 1000 })
          out.push(...r.blobs.map((b) => b.pathname))
          cursor = r.hasMore ? r.cursor : undefined
        } while (cursor)
        return out
      },
    }
  }
  const root = path.resolve(process.env.SIPSTREAK_DATA_DIR || '.data')
  const file = (k) => path.join(root, k)
  const tag = (s) => crypto.createHash('sha1').update(s).digest('hex')
  const conflict = (m) => Object.assign(new Error(m), { code: 'CONFLICT' })
  return {
    async read(key) {
      try { const s = fs.readFileSync(file(key), 'utf8'); return { data: JSON.parse(s), etag: tag(s) } } catch { return null }
    },
    async write(key, data, etag) {
      const cur = fs.existsSync(file(key)) ? tag(fs.readFileSync(file(key), 'utf8')) : null
      if (etag && cur !== etag) throw conflict('precondition failed')
      fs.mkdirSync(path.dirname(file(key)), { recursive: true }); fs.writeFileSync(file(key), JSON.stringify(data))
    },
    async create(key, data) {
      if (fs.existsSync(file(key))) throw conflict('This blob already exists')
      fs.mkdirSync(path.dirname(file(key)), { recursive: true }); fs.writeFileSync(file(key), JSON.stringify(data))
    },
    async keys(prefix) {
      const dir = path.dirname(file(prefix + 'x'))
      if (!fs.existsSync(dir)) return []
      return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => prefix + f)
    },
  }
}
let storePromise
const getStore = () => (storePromise ||= makeStore().then(instrument))

/** Optimistic read-modify-write with retries (ETag preconditions). */
async function update(store, key, fn) {
  for (let i = 0; i < 5; i++) {
    const cur = await store.read(key)
    const next = fn(cur ? cur.data : null)
    try {
      if (cur) await store.write(key, next, cur.etag)
      else await store.create(key, next)
      return next
    } catch (e) {
      if (!isConflict(e)) throw e
      const ctx = requestContext.getStore()
      if (ctx) ctx.retries++
      if (i === 4) { log('error', 'storage_conflict_exhausted', { key }); throw e }
      log('warn', 'storage_conflict_retry', { key, attempt: i + 1 })
    }
  }
}

/* ------------------------------ helpers ------------------------------ */
class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }
const bad = (m, s = 400) => new HttpError(s, m)
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const rand = (n = 9) => crypto.randomBytes(n).toString('base64url').replace(/[-_]/g, 'x').slice(0, n)
const b64 = (b) => Buffer.from(b).toString('base64url')

function makeToken(userId) {
  const body = `${userId}.${Date.now() + SESSION_DAYS * 864e5}`
  return `${b64(body)}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`
}
function readToken(header) {
  const t = /^Bearer (.+)$/.exec(header || '')?.[1]
  if (!t) return null
  const [p, sig] = t.split('.')
  if (!p || !sig) return null
  let body
  try { body = Buffer.from(p, 'base64url').toString() } catch { return null }
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null
  const [userId, exp] = body.split('.')
  return Number(exp) > Date.now() && /^u-[A-Za-z0-9]+$/.test(userId) ? userId : null
}

const baseTarget = (u) => u.customTargetMl ?? Math.round((u.weightKg * u.mlPerKg) / 10) * 10
const selfUser = (u) => ({ ...u, passHash: '', salt: '' })
// Other people's weight and email never leave the server; only their daily goal does.
const publicUser = (u) => ({ id: u.id, name: u.name, email: '', passHash: '', salt: '', weightKg: 0, mlPerKg: 35, customTargetMl: baseTarget(u), timezone: u.timezone, squadId: u.squadId, createdAt: u.createdAt })

const validTz = (z) => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true } catch { return false } }
const isoOk = (s) => typeof s === 'string' && s.length < 40 && !Number.isNaN(Date.parse(s))
const idOk = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(s)

function cleanSettings(s) {
  if (!s || typeof s !== 'object') return null
  const num = (v, a, b, d) => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d)
  const time = (v, d) => (typeof v === 'string' && /^\d\d:\d\d$/.test(v) ? v : d)
  return {
    nudgesOn: !!s.nudgesOn, nudgeStart: time(s.nudgeStart, '09:00'), nudgeEnd: time(s.nudgeEnd, '21:00'), nudgeEveryMin: num(s.nudgeEveryMin, 5, 480, 60),
    fastDemo: !!s.fastDemo, caffeineOn: !!s.caffeineOn, caffeineBonusMl: num(s.caffeineBonusMl, 0, 500, 200),
    teamStreakThreshold: num(s.teamStreakThreshold, 50, 100, 80), liveSim: !!s.liveSim,
  }
}

async function allUsers(store) {
  const keys = await store.keys('users/')
  return (await Promise.all(keys.map((k) => store.read(k)))).filter(Boolean).map((f) => f.data)
}

async function buildState(store, uid) {
  const files = await allUsers(store)
  const cutoff = Date.now() - 31 * 864e5
  const users = [], logs = [], settings = {}
  let qrScans = {}
  for (const f of files) {
    const self = f.user.id === uid
    users.push(self ? selfUser(f.user) : publicUser(f.user))
    logs.push(...(self ? f.logs : f.logs.filter((l) => Date.parse(l.at) >= cutoff)))
    if (f.settings) settings[f.user.id] = self ? f.settings : { caffeineOn: f.settings.caffeineOn, caffeineBonusMl: f.settings.caffeineBonusMl }
    if (self) qrScans = f.qr || {}
  }
  const squads = (await store.read('squads.json'))?.data.squads ?? []
  return { users, logs, settings, squads, qrScans, serverTime: new Date().toISOString() }
}

/* ------------------------------- routes ------------------------------- */
async function signup(store, b) {
  const email = String(b.email || '').trim().toLowerCase()
  const name = String(b.name || '').trim()
  const password = String(b.password || '')
  const weightKg = Number(b.weightKg)
  if (name.length < 2 || name.length > 40) throw bad('Please enter your name.')
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) throw bad('Please enter a valid email.')
  if (password.length < 6 || password.length > 200) throw bad('Password needs at least 6 characters.')
  if (!(weightKg >= 25 && weightKg <= 250)) throw bad('Weight must be between 25 and 250 kg.')
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = (await scrypt(password, salt, 32)).toString('hex')
  const userId = 'u-' + rand(10)
  try { await store.create(`auth/${sha(email)}.json`, { userId, email, salt, hash }) } catch (e) {
    if (isConflict(e)) throw bad('An account with this email already exists.', 409)
    throw e
  }
  const user = { id: userId, name, email, weightKg, mlPerKg: 35, customTargetMl: null, timezone: validTz(b.timezone) ? b.timezone : 'UTC', squadId: null, createdAt: new Date().toISOString() }
  await store.create(`users/${userId}.json`, { user, logs: [], settings: null, qr: {} })
  return { token: makeToken(userId), user: selfUser(user), state: await buildState(store, userId) }
}

async function login(store, b) {
  const email = String(b.email || '').trim().toLowerCase()
  const rec = (await store.read(`auth/${sha(email)}.json`))?.data
  const salt = rec?.salt || '00'.repeat(16)
  const hash = (await scrypt(String(b.password || ''), salt, 32)).toString('hex')
  if (!rec || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(rec.hash))) {
    log('warn', 'login_failed', { reason: rec ? 'bad_password' : 'unknown_account' })
    throw bad('Email or password is incorrect.', 401)
  }
  const f = (await store.read(`users/${rec.userId}.json`))?.data
  if (!f) throw bad('Account not found.', 404)
  return { token: makeToken(rec.userId), user: selfUser(f.user), state: await buildState(store, rec.userId) }
}

async function memberCount(store, squadId, exceptUid) {
  return (await allUsers(store)).filter((f) => f.user.squadId === squadId && f.user.id !== exceptUid).length
}

async function sync(store, uid, b) {
  const rejected = {}

  // 1) a squad this user just created
  const cs = b.createSquad
  if (cs) {
    const name = String(cs.name || '').trim()
    try {
      if (!idOk(cs.id) || name.length < 3 || name.length > 32 || !/^[A-Z0-9]{6}$/.test(String(cs.code))) throw bad('That squad could not be created.')
      await update(store, 'squads.json', (cur) => {
        const squads = cur?.squads ?? []
        if (squads.some((s) => s.id === cs.id)) return { squads }
        const taken = (n) => n.toLowerCase() === name.toLowerCase()
        if (squads.some((s) => taken(s.name)) || SAMPLE_SQUADS.some((s) => taken(s.name))) throw bad('That squad name is taken.', 409)
        if (squads.some((s) => s.code === cs.code) || SAMPLE_SQUADS.some((s) => s.code === cs.code)) throw bad('Invite code clash, please try again.', 409)
        return { squads: [...squads, { id: cs.id, name, code: cs.code, hue: Math.max(0, Math.min(359, Math.round(Number(cs.hue) || 190))), createdBy: uid, createdAt: new Date().toISOString() }] }
      })
    } catch (e) {
      if (!(e instanceof HttpError)) throw e
      rejected.squad = e.message
    }
  }

  // 2) a squad membership change must point at a real, non-full, non-sample squad
  let squadOk = true
  const wantSquad = b.profile && Object.prototype.hasOwnProperty.call(b.profile, 'squadId') ? b.profile.squadId : undefined
  if (wantSquad) {
    const squads = (await store.read('squads.json'))?.data.squads ?? []
    if (!squads.some((s) => s.id === wantSquad)) {
      squadOk = false
      rejected.squad = rejected.squad || (/^sq-\d+$/.test(String(wantSquad)) ? 'Sample squads are for the demo account. Create a squad or join a friend’s code.' : 'That squad no longer exists.')
    } else {
      const cur = (await store.read(`users/${uid}.json`))?.data
      if (cur?.user.squadId !== wantSquad && (await memberCount(store, wantSquad, uid)) >= MAX_SQUAD) {
        squadOk = false
        rejected.squad = `That squad is full (${MAX_SQUAD}/${MAX_SQUAD}).`
      }
    }
  }

  // 3) apply everything to this user's own file
  await update(store, `users/${uid}.json`, (cur) => {
    if (!cur) throw bad('Account not found.', 404)
    const next = { ...cur, user: { ...cur.user }, logs: [...cur.logs], qr: { ...cur.qr } }
    const p = b.profile
    if (p && typeof p === 'object') {
      if (typeof p.name === 'string' && p.name.trim().length >= 2) next.user.name = p.name.trim().slice(0, 40)
      if (Number(p.weightKg) >= 25 && Number(p.weightKg) <= 250) next.user.weightKg = Number(p.weightKg)
      if (Number(p.mlPerKg) >= 20 && Number(p.mlPerKg) <= 50) next.user.mlPerKg = Number(p.mlPerKg)
      if (p.customTargetMl === null || (Number(p.customTargetMl) >= 500 && Number(p.customTargetMl) <= 6000)) next.user.customTargetMl = p.customTargetMl === null ? null : Number(p.customTargetMl)
      if (typeof p.timezone === 'string' && validTz(p.timezone)) next.user.timezone = p.timezone
      if (squadOk && p.squadId !== undefined && (p.squadId === null || idOk(p.squadId))) next.user.squadId = p.squadId
    }
    if (b.settings !== undefined) next.settings = cleanSettings(b.settings)
    const L = b.logs || {}
    const remove = new Set(Array.isArray(L.remove) ? L.remove.slice(0, 500).map(String) : [])
    if (remove.size) next.logs = next.logs.filter((l) => !remove.has(l.id))
    for (const u of Array.isArray(L.update) ? L.update.slice(0, 500) : []) {
      const hit = next.logs.find((l) => l.id === u.id)
      if (hit && Number.isInteger(u.ml) && u.ml >= 1 && u.ml <= 2000) hit.ml = u.ml
    }
    const have = new Set(next.logs.map((l) => l.id))
    for (const l of Array.isArray(L.add) ? L.add.slice(0, 200) : []) {
      if (!l || !idOk(l.id) || have.has(l.id)) continue
      if (!['water', 'coffee', 'energy'].includes(l.kind) || !['tap', 'custom', 'qr', 'sim'].includes(l.source)) continue
      if (!Number.isInteger(l.ml) || l.ml < 1 || l.ml > 2000 || !isoOk(l.at)) continue
      if (next.logs.length >= 20000) break
      next.logs.push({ id: l.id, userId: uid, ml: l.ml, kind: l.kind, at: l.at, source: l.source })
      have.add(l.id)
    }
    if (b.qr && typeof b.qr === 'object') for (const [k, v] of Object.entries(b.qr).slice(0, 50)) if (/^[A-Za-z0-9-]{3,60}$/.test(k) && isoOk(v)) next.qr[k] = v
    return next
  })

  if (rejected.squad) log('warn', 'sync_rejected', { userId: uid, reason: rejected.squad })
  return { ok: true, rejected: Object.keys(rejected).length ? rejected : undefined, state: await buildState(store, uid) }
}

/* ------------------------------- handler ------------------------------- */
async function readBody(req) {
  let raw = req.body
  if (raw === undefined || raw === null) {
    const chunks = []
    for await (const c of req) chunks.push(c)
    raw = Buffer.concat(chunks).toString()
  }
  if (typeof raw !== 'string') return raw && typeof raw === 'object' ? raw : {}
  try {
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw bad('Request body must be valid JSON.')
  }
}

export default async function handler(req, res) {
  const ctx = { id: String(req.headers?.['x-vercel-id'] || crypto.randomUUID()), storageCalls: 0, storageMs: 0, retries: 0 }
  return requestContext.run(ctx, async () => {
    const t0 = performance.now()
    let status = 500
    let route = ''
    let userId = null
    let failure = null
    res.setHeader('Cache-Control', 'no-store')
    const send = (code, obj) => { status = code; res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)) }
    try {
      route = (req.url || '').split('?')[0].replace(/^\/api\/?/, '').replace(/\/$/, '')
      if (!SECRET) {
        failure = new Error('No signing secret configured')
        log('error', 'config_error', { problem: 'Set SIPSTREAK_SECRET or connect a Blob store' })
        return send(500, { ok: false, error: 'Server is not configured.' })
      }
      const store = await getStore()
      userId = readToken(req.headers.authorization)
      if (req.method === 'GET' && route === 'health') {
        const h0 = performance.now()
        try {
          await store.keys('users/')
          return send(200, { ok: true, storage: BACKEND, storageLatencyMs: Math.round(performance.now() - h0) })
        } catch (e) {
          failure = e
          return send(503, { ok: false, storage: BACKEND, error: 'Storage unavailable.' })
        }
      }
      if (req.method === 'GET' && route === 'state') return send(200, { ok: true, me: userId, ...(await buildState(store, userId)) })
      if (req.method !== 'POST') return send(405, { ok: false, error: 'Method not allowed' })
      const body = await readBody(req)
      if (route === 'signup') return send(200, { ok: true, ...(await signup(store, body)) })
      if (route === 'login') return send(200, { ok: true, ...(await login(store, body)) })
      if (route === 'sync') {
        if (!userId) return send(401, { ok: false, error: 'Please log in again.' })
        return send(200, await sync(store, userId, body))
      }
      return send(404, { ok: false, error: 'Not found' })
    } catch (e) {
      failure = e
      if (e instanceof HttpError) return send(e.status, { ok: false, error: e.message })
      return send(500, { ok: false, error: 'Server error. Please try again.' })
    } finally {
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
      log(level, 'request', {
        method: req.method, route, status, ms: Math.round(performance.now() - t0), userId: userId || undefined,
        storageCalls: ctx.storageCalls, storageMs: ctx.storageMs, retries: ctx.retries || undefined,
        ...(status >= 500 && failure ? { errorName: failure.name, errorMessage: failure.message, stack: String(failure.stack || '').split('\n').slice(0, 4).join(' | ') } : {}),
      })
    }
  })
}
