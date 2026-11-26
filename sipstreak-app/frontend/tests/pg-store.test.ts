import { newDb } from 'pg-mem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS module
import { makePgStore } from '../api/_pgStore.js'

/* The PostgreSQL adapter against an in-memory Postgres (pg-mem): same contract as the Blob and file adapters. */
async function fresh() {
  const { Pool } = newDb().adapters.createPg()
  return makePgStore(new Pool())
}

describe('postgres storage adapter', () => {
  it('creates, reads and lists by prefix', async () => {
    const s = await fresh()
    await s.create('users/u-a1.json', { n: 1 })
    await s.create('users/u-b2.json', { n: 2 })
    await s.create('auth/x.json', { n: 3 })
    expect((await s.read('users/u-a1.json')).data).toEqual({ n: 1 })
    expect(await s.read('nope')).toBeNull()
    expect(await s.keys('users/')).toEqual(['users/u-a1.json', 'users/u-b2.json'])
    expect(await s.keys('zzz/')).toEqual([])
  })

  it('refuses to create a row that exists', async () => {
    const s = await fresh()
    await s.create('k', { a: 1 })
    await expect(s.create('k', { a: 2 })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect((await s.read('k')).data).toEqual({ a: 1 })
  })

  it('optimistic concurrency: a stale version cannot overwrite', async () => {
    const s = await fresh()
    await s.create('k', { v: 0 })
    const first = await s.read('k')
    await s.write('k', { v: 1 }, first.etag) // writer A wins
    await expect(s.write('k', { v: 99 }, first.etag)).rejects.toMatchObject({ code: 'CONFLICT' }) // writer B is stale
    const now = await s.read('k')
    expect(now.data).toEqual({ v: 1 })
    expect(Number(now.etag)).toBeGreaterThan(Number(first.etag))
  })

  it('treats LIKE wildcards in a prefix literally', async () => {
    const s = await fresh()
    await s.create('a_b/1', {})
    await s.create('axb/1', {})
    expect(await s.keys('a_b/')).toEqual(['a_b/1'])
  })
})

describe('API on the postgres backend', () => {
  beforeEach(() => vi.resetModules())
  it('serves signup, sync and health end to end', async () => {
    const { Pool } = newDb().adapters.createPg()
    vi.doMock('pg', () => ({ default: { Pool } }))
    for (const [k, v] of Object.entries({ DATABASE_URL: 'postgres://u:p@db.example:5432/x', SIPSTREAK_SECRET: 'pg-test', LOG_LEVEL: 'silent', NODE_ENV: 'test' })) process.env[k] = v
    delete process.env.BLOB_READ_WRITE_TOKEN
    const handler = (await import('../api/[...path].js')).default as (a: unknown, b: unknown) => Promise<void>
    const call = async (method: string, url: string, body?: unknown, token?: string) => {
      let text = ''
      await handler({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, { statusCode: 200, setHeader() {}, end(t: string) { text = t } })
      return JSON.parse(text)
    }
    const health = await call('GET', '/api/health')
    expect(health).toMatchObject({ ok: true, storage: 'postgres' })
    const su = await call('POST', '/api/signup', { name: 'Pgtest', email: 'pg@test.dev', password: 'secret12', weightKg: 60, timezone: 'Asia/Kolkata' })
    expect(su.token).toBeTruthy()
    const st = await call('GET', '/api/state', undefined, su.token)
    expect(st.ok).toBe(true)
    expect(su.user.name).toBe('Pgtest')
    const again = await call('POST', '/api/login', { email: 'pg@test.dev', password: 'secret12' })
    expect(again.token).toBeTruthy()
    delete process.env.DATABASE_URL
  })
})
