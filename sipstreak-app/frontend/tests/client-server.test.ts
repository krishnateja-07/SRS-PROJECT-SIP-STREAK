import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DB } from '../src/lib/types'
import { mkDb, mkLog, mkUser } from '../src/test/fixtures'

/*
 * Client ⇄ server integration: the real client code (src/lib/remote.ts) talking to the real API handler,
 * with `fetch` wired straight to the handler instead of the network.
 */
type Handler = (req: unknown, res: unknown) => Promise<void>
let handler: Handler
let dir: string
let remote: typeof import('../src/lib/remote')

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

/** fetch() replacement that runs requests through the API handler. */
function fetchToHandler() {
  return async (url: string, init: RequestInit = {}) => {
    let text = ''
    const res = { statusCode: 200, headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v }, end(t: string) { text = t } }
    await handler({ method: init.method ?? 'GET', url, headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])), body: init.body }, res)
    return { ok: res.statusCode < 400, status: res.statusCode, headers: { get: (k: string) => res.headers[k.toLowerCase()] ?? null }, json: async () => JSON.parse(text) }
  }
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sipstreak-cs-'))
  Object.assign(process.env, { SIPSTREAK_DATA_DIR: dir, SIPSTREAK_SECRET: 'cs-test-secret', LOG_LEVEL: 'silent', NODE_ENV: 'test' })
  delete process.env.BLOB_READ_WRITE_TOKEN
  delete process.env.VERCEL
  vi.resetModules()
  handler = (await import('../api/[...path].js')).default as Handler
  remote = await import('../src/lib/remote')
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('fetch', fetchToHandler())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  fs.rmSync(dir, { recursive: true, force: true })
})

const newAccount = (email = 'cs@test.dev') => remote.api.signup({ name: 'Client', email, password: 'secret12', weightKg: 60, timezone: 'UTC' })

describe('transport', () => {
  it('signs up, stores the token and then reads state as that user', async () => {
    const r = await newAccount()
    if (!r.ok) throw new Error(r.error)
    remote.setToken(r.data.token)
    expect(remote.getToken()).toBe(r.data.token)
    const state = await remote.api.state()
    expect(state.ok && state.data.me).toBe(r.data.user.id)
    remote.setToken(null)
    expect(remote.getToken()).toBeNull()
  })

  it('surfaces server errors with their status and message', async () => {
    await newAccount('dup@test.dev')
    const again = await newAccount('dup@test.dev')
    expect(again).toMatchObject({ ok: false, status: 409, offline: false })
    const login = await remote.api.login({ email: 'dup@test.dev', password: 'wrong' })
    expect(login).toMatchObject({ ok: false, status: 401, error: 'Email or password is incorrect.', offline: false })
  })

  it('treats an HTML answer (a static host with no API) as "no server"', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, headers: { get: () => 'text/html' }, json: async () => ({}) }))
    expect(await remote.api.state()).toMatchObject({ ok: false, offline: true })
  })

  it('treats a network failure as offline', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('fetch failed') })
    expect(await remote.api.state()).toMatchObject({ ok: false, offline: true })
  })

  it('gives up on a server that never answers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_ok, fail) => init.signal?.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError')))))
    const pending = remote.api.state()
    await vi.advanceTimersByTimeAsync(9_100)
    expect(await pending).toMatchObject({ ok: false, offline: true })
  })

  it('does not send a body or content-type header on GET', async () => {
    const seen: RequestInit[] = []
    const real = fetchToHandler()
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { seen.push(init); return real(url, init) })
    await remote.api.state()
    expect(seen[0].body).toBeUndefined()
    expect(seen[0].headers).not.toHaveProperty('content-type')
  })
})

describe('a full sync round trip', () => {
  it('pushes local edits, then another device sees them', async () => {
    // Device A: sign up and log a drink locally, exactly as the app does.
    const signedUp = await newAccount('round@test.dev')
    if (!signedUp.ok) throw new Error(signedUp.error)
    remote.setToken(signedUp.data.token)
    const me = { ...signedUp.data.user, remote: true }
    let db: DB = remote.mergeRemote(mkDb([mkUser('sample')], [mkLog('sample', 250, '2026-11-20T08:00:00.000Z')]), signedUp.data.state, me.id, true)
    db = { ...db, sessionUserId: me.id }
    const last = remote.snapshotOf(db, me.id)
    const drink = { ...mkLog(me.id, 750, new Date().toISOString()), id: 'drinkroundtrip1' }
    db = { ...db, logs: [...db.logs, drink] }

    const { body } = remote.diffSnap(db, me.id, last)
    expect(body?.logs?.add).toEqual([drink])
    const pushed = await remote.api.sync(body!)
    expect(pushed.ok && pushed.data.state.logs.map((l) => l.id)).toContain('drinkroundtrip1')

    // Device B: a different browser (no token) logs in and sees the same drink.
    remote.setToken(null)
    const login = await remote.api.login({ email: 'round@test.dev', password: 'secret12' })
    if (!login.ok) throw new Error(login.error)
    const onB = remote.mergeRemote(mkDb([mkUser('sample')]), login.data.state, login.data.user.id, true)
    expect(onB.logs.filter((l) => l.userId === me.id).map((l) => l.ml)).toEqual([750])
    expect(onB.users.find((u) => u.id === me.id)?.remote).toBe(true)
  })

  it('reports a rejected squad change so the client can undo it', async () => {
    const r = await newAccount('rej@test.dev')
    if (!r.ok) throw new Error(r.error)
    remote.setToken(r.data.token)
    const out = await remote.api.sync({ profile: { name: 'Client', weightKg: 60, mlPerKg: 35, customTargetMl: null, timezone: 'UTC', squadId: 'sq-2' } })
    expect(out.ok && out.data.rejected?.squad).toMatch(/Sample squads/)
  })
})
