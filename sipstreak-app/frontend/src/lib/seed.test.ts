import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_EMAIL, DEMO_PASSWORD, FOUNTAINS, buildSeed, hashPassword } from './seed'
import { completion, dayKey, leaderboard, membersOf, systemTz, uid } from './calc'
import type { DB } from './types'

// Freeze the clock at a normal afternoon so "today's" sample logs can't straddle midnight.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 20, 15, 0, 0)) })
afterEach(() => { vi.useRealTimers() })

describe('sample campus dataset', () => {
  it('has 4 squads of 4 (16 members) with the expected names', async () => {
    const db = await buildSeed()
    expect(db.squads.map((s) => s.name).sort()).toEqual(['Aqua Knights', 'Hostel Block A', 'Hostel Block B', 'Hydration Homies'])
    expect(db.users).toHaveLength(16)
    for (const s of db.squads) expect(membersOf(db, s.id)).toHaveLength(4)
  })

  it('has seven days of water logs for every member', async () => {
    const db = await buildSeed()
    const tz = systemTz()
    for (const u of db.users) {
      const days = new Set(db.logs.filter((l) => l.userId === u.id && l.kind === 'water').map((l) => dayKey(new Date(l.at), tz)))
      expect(days.size).toBe(7)
    }
  })

  it('is deterministic: two builds give identical intake', async () => {
    const [a, b] = [await buildSeed(), await buildSeed()]
    const total = (d: DB) => d.logs.filter((l) => l.kind === 'water').reduce((s, l) => s + l.ml, 0)
    expect(total(a)).toBe(total(b))
  })

  it('stores a salted hash for the demo account, never the password', async () => {
    const db = await buildSeed()
    const priya = db.users.find((u) => u.email === DEMO_EMAIL)!
    expect(priya.name).toBe('Priya Sharma')
    expect(priya.passHash).not.toContain(DEMO_PASSWORD)
    expect(priya.passHash).toBe(await hashPassword(DEMO_PASSWORD, priya.salt))
    expect(await hashPassword('wrong-password', priya.salt)).not.toBe(priya.passHash)
  })

  it('lists fountains with a verifier whenever they carry a verified badge', () => {
    for (const f of FOUNTAINS) expect(Boolean(f.verifiedOn)).toBe(Boolean(f.verifiedBy))
    expect(FOUNTAINS.some((f) => f.verifiedOn === null)).toBe(true)
  })
})

describe('the pitch demo story', () => {
  it('+500 ml takes Hostel Block B from 72% (2nd) to 78% (1st), past Hostel Block A at 75%', async () => {
    const db = await buildSeed()
    const tz = systemTz()
    const day = dayKey(new Date(), tz)
    const priya = db.users.find((u) => u.email === DEMO_EMAIL)!
    const blockB = db.squads.find((s) => s.name === 'Hostel Block B')!
    const blockA = db.squads.find((s) => s.name === 'Hostel Block A')!
    const row = (d: DB, id: string) => leaderboard(d, day).findIndex((r) => r.squad.id === id)
    const score = (d: DB, id: string) => Math.round(leaderboard(d, day).find((r) => r.squad.id === id)!.score)

    expect(Math.round(completion(db, priya, day) * 100)).toBe(64)
    expect(score(db, blockB.id)).toBe(72)
    expect(score(db, blockA.id)).toBe(75)
    expect(row(db, blockB.id)).toBe(1) // ranked 2nd

    const after: DB = { ...db, logs: [...db.logs, { id: uid(), userId: priya.id, ml: 500, kind: 'water', at: new Date().toISOString(), source: 'tap' }] }
    expect(Math.round(completion(after, priya, day) * 100)).toBe(88)
    expect(score(after, blockB.id)).toBe(78)
    expect(row(after, blockB.id)).toBe(0) // now ranked 1st
  })
})
