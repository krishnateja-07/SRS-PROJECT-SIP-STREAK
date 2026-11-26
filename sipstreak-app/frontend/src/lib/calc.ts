import type { DB, HydrationLog, Settings, Squad, User } from './types'

export const MIN_SQUAD = 4
export const MAX_SQUAD = 8
export const MAX_LOG_ML = 2000

export const defaultSettings = (): Settings => ({
  nudgesOn: false,
  nudgeStart: '09:00',
  nudgeEnd: '21:00',
  nudgeEveryMin: 60,
  fastDemo: false,
  caffeineOn: true,
  caffeineBonusMl: 200,
  teamStreakThreshold: 80,
  liveSim: false,
})

export const systemTz = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
/** Local calendar date (YYYY-MM-DD) of an instant in a given IANA timezone. */
export function dayKey(d: Date, tz: string): string {
  let f = fmtCache.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    } catch {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
    }
    fmtCache.set(tz, f)
  }
  return f.format(d)
}

/** The last n local calendar days, oldest first, ending today. */
export function lastDays(n: number, tz: string, now = new Date()): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(now.getTime() - i * 864e5), tz))
  return [...new Set(out)]
}

export const baseTarget = (u: User) =>
  u.customTargetMl ?? Math.round((u.weightKg * u.mlPerKg) / 10) * 10

/**
 * `db` is replaced (never mutated) on every change, so results can be cached against its identity
 * and are dropped automatically with the old snapshot. Returned arrays are shared: do not mutate them.
 */
const logIndex = new WeakMap<DB, Map<string, HydrationLog[]>>()

export function logsFor(db: DB, userId: string, day: string, tz: string): HydrationLog[] {
  let m = logIndex.get(db)
  if (!m) logIndex.set(db, (m = new Map()))
  const key = `${userId}|${tz}|${day}`
  let hit = m.get(key)
  if (!hit) m.set(key, (hit = db.logs.filter((l) => l.userId === userId && dayKey(new Date(l.at), tz) === day)))
  return hit
}

export function intake(db: DB, u: User, day: string): number {
  return logsFor(db, u.id, day, u.timezone)
    .filter((l) => l.kind === 'water')
    .reduce((a, l) => a + l.ml, 0)
}

export function caffeineCount(db: DB, u: User, day: string): number {
  return logsFor(db, u.id, day, u.timezone).filter((l) => l.kind !== 'water').length
}

export function settingsFor(db: DB, userId: string): Settings {
  return { ...defaultSettings(), ...db.settings[userId] }
}

/** Daily target including the (optional, configurable) caffeine game rule. */
export function targetFor(db: DB, u: User, day: string): number {
  const s = settingsFor(db, u.id)
  const bonus = s.caffeineOn ? caffeineCount(db, u, day) * s.caffeineBonusMl : 0
  return baseTarget(u) + bonus
}

export function completion(db: DB, u: User, day: string): number {
  const t = targetFor(db, u, day)
  return t > 0 ? intake(db, u, day) / t : 0
}

export function personalStreak(db: DB, u: User, now = new Date()): number {
  let n = 0
  const today = dayKey(now, u.timezone)
  let i = completion(db, u, today) >= 1 ? 0 : 1
  for (; i < 365; i++) {
    const k = dayKey(new Date(now.getTime() - i * 864e5), u.timezone)
    if (completion(db, u, k) >= 1) n++
    else break
  }
  return n
}

export const membersOf = (db: DB, squadId: string) => db.users.filter((u) => u.squadId === squadId)

/**
 * Team Fair Participation Formula:
 * TeamScore = (sum(min(1, intake / goal)) / teamSize) * 100
 * Each member is capped at 100% so one heavy drinker cannot carry the team.
 */
export function teamScore(db: DB, squadId: string, day: string): number {
  const m = membersOf(db, squadId)
  if (!m.length) return 0
  const sum = m.reduce((a, u) => a + Math.min(1, completion(db, u, day)), 0)
  return (sum / m.length) * 100
}

export const teamTotal = (db: DB, squadId: string, day: string) =>
  membersOf(db, squadId).reduce((a, u) => a + intake(db, u, day), 0)

export const teamTarget = (db: DB, squadId: string, day: string) =>
  membersOf(db, squadId).reduce((a, u) => a + targetFor(db, u, day), 0)

export function teamStreak(db: DB, squadId: string, tz: string, threshold: number, now = new Date()): number {
  let n = 0
  const today = dayKey(now, tz)
  let i = teamScore(db, squadId, today) >= threshold ? 0 : 1
  for (; i < 365; i++) {
    const k = dayKey(new Date(now.getTime() - i * 864e5), tz)
    if (teamScore(db, squadId, k) >= threshold) n++
    else break
  }
  return n
}

export interface RankRow {
  squad: Squad
  score: number
  members: User[]
  totalMl: number
  eligible: boolean
}

const boardCache = new WeakMap<DB, Map<string, RankRow[]>>()

export function leaderboard(db: DB, day: string): RankRow[] {
  let m = boardCache.get(db)
  if (!m) boardCache.set(db, (m = new Map()))
  let hit = m.get(day)
  if (!hit) m.set(day, (hit = computeBoard(db, day)))
  return hit
}

function computeBoard(db: DB, day: string): RankRow[] {
  return db.squads
    .map((s) => {
      const members = membersOf(db, s.id)
      return { squad: s, members, score: teamScore(db, s.id, day), totalMl: teamTotal(db, s.id, day), eligible: members.length >= MIN_SQUAD }
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || b.totalMl - a.totalMl)
}

/** How far through the user's active day we are (0–1), for "on schedule" checks. */
export function dayProgress(start: string, end: string, now = new Date()): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = now.getHours() * 60 + now.getMinutes()
  const a = sh * 60 + sm
  const b = eh * 60 + em
  if (b <= a) return 1
  return Math.max(0, Math.min(1, (mins - a) / (b - a)))
}

export const fmtMl = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')} L` : `${Math.round(ml)} ml`)
export const pct = (x: number) => `${Math.round(x * 100)}%`
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
export const inviteCode = () =>
  Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
