import type { DB, DrinkKind, HydrationLog, Settings, Squad, User } from '../lib/types'

/** Test fixtures: small, explicit builders so each test states only what it cares about. */
export function mkUser(id: string, over: Partial<User> = {}): User {
  return {
    id, name: id, email: `${id}@test.dev`, passHash: '', salt: '', weightKg: 60, mlPerKg: 35, customTargetMl: null,
    timezone: 'UTC', squadId: null, createdAt: '2026-01-01T00:00:00.000Z', ...over,
  }
}

export function mkSquad(id: string, over: Partial<Squad> = {}): Squad {
  return { id, name: id, code: id.toUpperCase().padEnd(6, 'X').slice(0, 6), hue: 190, createdBy: 'nobody', createdAt: '2026-01-01T00:00:00.000Z', ...over }
}

export function mkDb(users: User[], logs: HydrationLog[] = [], squads: Squad[] = [], settings: Record<string, Settings> = {}): DB {
  return { version: 2, users, logs, squads, sessionUserId: null, settings, qrScans: {}, lastNudgeAt: 0 }
}

let counter = 0
export function mkLog(userId: string, ml: number, at: string, kind: DrinkKind = 'water'): HydrationLog {
  return { id: `log-${++counter}`, userId, ml, kind, at, source: 'tap' }
}

/** ISO timestamp for `daysAgo` days before `now` at the given UTC hour. */
export function isoDaysAgo(now: Date, daysAgo: number, hourUtc = 10): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, hourUtc, 0, 0))
  return d.toISOString()
}
