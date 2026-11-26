import { describe, expect, it } from 'vitest'
import {
  MAX_SQUAD, MIN_SQUAD, baseTarget, caffeineCount, completion, dayKey, dayProgress, defaultSettings, fmtMl, intake, inviteCode,
  lastDays, leaderboard, logsFor, personalStreak, targetFor, teamScore, teamStreak, teamTarget, teamTotal,
} from './calc'
import { isoDaysAgo, mkDb, mkLog, mkSquad, mkUser } from '../test/fixtures'

const NOW = new Date('2026-11-20T12:00:00.000Z')
const DAY = '2026-11-20'

describe('daily target', () => {
  it('is weight × 35 ml rounded to the nearest 10 ml', () => {
    expect(baseTarget(mkUser('a', { weightKg: 60 }))).toBe(2100)
    expect(baseTarget(mkUser('a', { weightKg: 71 }))).toBe(2490) // 2485 rounds up
    expect(baseTarget(mkUser('a', { weightKg: 52 }))).toBe(1820)
  })

  it('honours the ml-per-kg setting and a custom override', () => {
    expect(baseTarget(mkUser('a', { weightKg: 60, mlPerKg: 40 }))).toBe(2400)
    expect(baseTarget(mkUser('a', { weightKg: 60, customTargetMl: 1800 }))).toBe(1800)
  })
})

describe('timezone handling: days follow the user, nothing is deleted at midnight', () => {
  const instant = new Date('2026-11-19T20:00:00.000Z')

  it('maps one instant to different local dates', () => {
    expect(dayKey(instant, 'UTC')).toBe('2026-11-19')
    expect(dayKey(instant, 'Asia/Kolkata')).toBe('2026-11-20') // 01:30 next day
    expect(dayKey(instant, 'America/Los_Angeles')).toBe('2026-11-19')
  })

  it('falls back to UTC for an invalid timezone instead of throwing', () => {
    expect(() => dayKey(instant, 'Not/AZone')).not.toThrow()
    expect(dayKey(instant, 'Not/AZone')).toBe('2026-11-19')
  })

  it('lastDays returns n consecutive local days ending today', () => {
    const days = lastDays(7, 'UTC', NOW)
    expect(days).toHaveLength(7)
    expect(days[6]).toBe(DAY)
    expect(days[0]).toBe('2026-11-14')
    expect([...days].sort()).toEqual(days)
  })

  it('attributes a drink to the local calendar day while keeping every log', () => {
    const u = mkUser('a', { timezone: 'Asia/Kolkata' })
    // 19:00 UTC on the 19th is 00:30 on the 20th in India.
    const db = mkDb([u], [mkLog('a', 500, '2026-11-19T19:00:00.000Z'), mkLog('a', 250, '2026-11-19T10:00:00.000Z')])
    expect(intake(db, u, '2026-11-20')).toBe(500)
    expect(intake(db, u, '2026-11-19')).toBe(250)
    expect(db.logs).toHaveLength(2)
  })
})

describe('intake and the caffeine offset', () => {
  const u = mkUser('a')

  it('counts only water towards intake', () => {
    const db = mkDb([u], [mkLog('a', 500, '2026-11-20T08:00:00.000Z'), mkLog('a', 200, '2026-11-20T09:00:00.000Z', 'coffee'), mkLog('a', 250, '2026-11-20T10:00:00.000Z', 'energy')])
    expect(intake(db, u, DAY)).toBe(500)
    expect(caffeineCount(db, u, DAY)).toBe(2)
  })

  it('adds the configurable bonus once per caffeinated drink', () => {
    const logs = [mkLog('a', 200, '2026-11-20T08:00:00.000Z', 'coffee'), mkLog('a', 250, '2026-11-20T09:00:00.000Z', 'energy')]
    expect(targetFor(mkDb([u], logs), u, DAY)).toBe(2100 + 2 * 200)
    expect(targetFor(mkDb([u], logs, [], { a: { ...defaultSettings(), caffeineBonusMl: 150 } }), u, DAY)).toBe(2100 + 2 * 150)
  })

  it('leaves the target alone when the offset is switched off', () => {
    const db = mkDb([u], [mkLog('a', 200, '2026-11-20T08:00:00.000Z', 'coffee')], [], { a: { ...defaultSettings(), caffeineOn: false } })
    expect(targetFor(db, u, DAY)).toBe(2100)
  })

  it('completion is intake ÷ target and is not capped for the individual', () => {
    const db = mkDb([u], [mkLog('a', 1050, '2026-11-20T08:00:00.000Z'), mkLog('a', 2100, '2026-11-20T09:00:00.000Z')])
    expect(completion(db, u, DAY)).toBeCloseTo(1.5)
  })
})

describe('Team Fair Participation formula', () => {
  /** Four 60 kg members (goal 2,100 ml each) drinking the given amounts today. */
  function squadWith(amounts: number[]) {
    const users = amounts.map((_, i) => mkUser(`m${i}`, { squadId: 's1' }))
    const logs = amounts.flatMap((ml, i) => (ml > 0 ? [mkLog(`m${i}`, ml, '2026-11-20T08:00:00.000Z')] : []))
    return mkDb(users, logs, [mkSquad('s1')])
  }

  it('matches the worked example: (100 + 90 + 40 + 75) ÷ 4 = 76.25', () => {
    // 160%, 90%, 40%, 75% of 2,100 ml
    const db = squadWith([3360, 1890, 840, 1575])
    expect(teamScore(db, 's1', DAY)).toBeCloseTo(76.25, 2)
  })

  it('caps every member at 100%, so a heavy drinker cannot carry the team', () => {
    const db = squadWith([2100 * 5, 0, 0, 0])
    expect(teamScore(db, 's1', DAY)).toBeCloseTo(25, 5)
  })

  it('reaches 100 only when every member has met their goal', () => {
    expect(teamScore(squadWith([2100, 2100, 2100, 2100]), 's1', DAY)).toBeCloseTo(100, 5)
    expect(teamScore(squadWith([2100, 2100, 2100, 2089]), 's1', DAY)).toBeLessThan(100)
    expect(teamScore(squadWith([5000, 5000, 5000, 2000]), 's1', DAY)).toBeLessThan(100)
  })

  it('is 0 for an empty squad and ignores other squads', () => {
    const db = mkDb([mkUser('x', { squadId: 'other' })], [], [mkSquad('s1'), mkSquad('other')])
    expect(teamScore(db, 's1', DAY)).toBe(0)
  })

  it('sums team totals and targets', () => {
    const db = squadWith([1000, 500, 0, 250])
    expect(teamTotal(db, 's1', DAY)).toBe(1750)
    expect(teamTarget(db, 's1', DAY)).toBe(4 * 2100)
  })
})

describe('streaks', () => {
  const u = mkUser('a')
  const done = (daysAgo: number) => mkLog('a', 2100, isoDaysAgo(NOW, daysAgo))

  it('counts consecutive completed days, and an unfinished today does not break it', () => {
    const db = mkDb([u], [done(1), done(2), done(3), mkLog('a', 500, isoDaysAgo(NOW, 0))])
    expect(personalStreak(db, u, NOW)).toBe(3)
  })

  it('includes today once the goal is met', () => {
    const db = mkDb([u], [done(0), done(1), done(2)])
    expect(personalStreak(db, u, NOW)).toBe(3)
  })

  it('stops at the first missed day', () => {
    const db = mkDb([u], [done(1), done(3), done(4)])
    expect(personalStreak(db, u, NOW)).toBe(1)
  })

  it('is 0 with no completed day', () => {
    expect(personalStreak(mkDb([u], [mkLog('a', 100, isoDaysAgo(NOW, 1))]), u, NOW)).toBe(0)
  })

  it('team streak needs the squad score to reach the threshold', () => {
    const users = ['a', 'b', 'c', 'd'].map((id) => mkUser(id, { squadId: 's1' }))
    const day = (daysAgo: number, ml: number) => users.map((x) => mkLog(x.id, ml, isoDaysAgo(NOW, daysAgo)))
    const db = mkDb(users, [...day(1, 2100), ...day(2, 2100), ...day(3, 1000), ...day(0, 500)], [mkSquad('s1')])
    expect(teamStreak(db, 's1', 'UTC', 80, NOW)).toBe(2)
    expect(teamStreak(db, 's1', 'UTC', 40, NOW)).toBe(3) // 1000/2100 ≈ 48%
  })
})

describe('leaderboard', () => {
  /** A squad of `size` members who each drank `ml` today. */
  function squad(id: string, size: number, ml: number) {
    const users = Array.from({ length: size }, (_, i) => mkUser(`${id}-${i}`, { squadId: id }))
    return { users, logs: users.map((x) => mkLog(x.id, ml, '2026-11-20T08:00:00.000Z')), squad: mkSquad(id) }
  }

  it('ranks by score, then by total litres on a tie', () => {
    const a = squad('a', 4, 1050), b = squad('b', 4, 2100), c = squad('c', 5, 1050)
    const db = mkDb([...a.users, ...b.users, ...c.users], [...a.logs, ...b.logs, ...c.logs], [a.squad, b.squad, c.squad])
    expect(leaderboard(db, DAY).map((r) => r.squad.id)).toEqual(['b', 'c', 'a']) // c ties a on score but drank more
  })

  it('lists squads below the minimum size last and marks them ineligible', () => {
    const big = squad('big', MIN_SQUAD, 500), tiny = squad('tiny', MIN_SQUAD - 1, 2100)
    const rows = leaderboard(mkDb([...big.users, ...tiny.users], [...big.logs, ...tiny.logs], [big.squad, tiny.squad]), DAY)
    expect(rows.map((r) => [r.squad.id, r.eligible])).toEqual([['big', true], ['tiny', false]])
  })

  it('caches per snapshot but never serves stale data to a new snapshot', () => {
    const a = squad('a', 4, 500)
    const db1 = mkDb(a.users, a.logs, [a.squad])
    expect(leaderboard(db1, DAY)).toBe(leaderboard(db1, DAY)) // same reference: cache hit
    const before = leaderboard(db1, DAY)[0].score
    const db2 = { ...db1, logs: [...db1.logs, mkLog('a-0', 2000, '2026-11-20T09:00:00.000Z')] }
    expect(leaderboard(db2, DAY)[0].score).toBeGreaterThan(before)
    expect(leaderboard(db1, DAY)[0].score).toBe(before) // the old snapshot is untouched
  })

  it('exposes the squad size limits used by the UI', () => {
    expect([MIN_SQUAD, MAX_SQUAD]).toEqual([4, 8])
  })
})

describe('small helpers', () => {
  it('logsFor returns only that user and day', () => {
    const u = mkUser('a')
    const db = mkDb([u, mkUser('b')], [mkLog('a', 1, '2026-11-20T08:00:00.000Z'), mkLog('b', 2, '2026-11-20T08:00:00.000Z'), mkLog('a', 3, '2026-11-19T08:00:00.000Z')])
    expect(logsFor(db, 'a', DAY, 'UTC').map((l) => l.ml)).toEqual([1])
  })

  it('dayProgress runs from 0 at the start to 1 at the end of the active window', () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m)
    expect(dayProgress('09:00', '21:00', at(8))).toBe(0)
    expect(dayProgress('09:00', '21:00', at(15))).toBeCloseTo(0.5)
    expect(dayProgress('09:00', '21:00', at(22))).toBe(1)
    expect(dayProgress('21:00', '09:00', at(12))).toBe(1) // an invalid window counts as fully elapsed
  })

  it('formats amounts for display', () => {
    expect(fmtMl(250)).toBe('250 ml')
    expect(fmtMl(1000)).toBe('1 L')
    expect(fmtMl(1500)).toBe('1.5 L')
    expect(fmtMl(2250)).toBe('2.25 L')
  })

  it('invite codes are 6 characters without look-alike letters', () => {
    for (let i = 0; i < 200; i++) expect(inviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })
})
