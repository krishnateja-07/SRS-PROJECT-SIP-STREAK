import type { DB, Fountain, HydrationLog, Squad, User } from './types'
import { systemTz } from './calc'

/**
 * Sample dataset: 4 student squads, 16 members, 7 days of logs.
 * Today's numbers are tuned for the pitch demo: "Hostel Block B" sits 2nd at 72%;
 * one +500 ml bottle from Priya lifts her to 88% and the squad to 78%, overtaking "Hostel Block A" (75%).
 */
export const DEMO_EMAIL = 'priya@sipstreak.demo'
export const DEMO_PASSWORD = 'hydrate123'

// Deterministic PRNG so every reset produces the same story.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface SeedMember {
  name: string
  kg: number
  today: number
  past: number[] // completion for 6 previous days, oldest first
}

const TEAMS: { name: string; code: string; hue: number; members: SeedMember[] }[] = [
  {
    name: 'Hostel Block A', code: 'HBA7Q2', hue: 265,
    members: [
      { name: 'Rohan Mehta', kg: 78, today: 1.1, past: [0.9, 1.05, 0.8, 1.1, 0.95, 1.0] },
      { name: 'Ishita Rao', kg: 55, today: 0.62, past: [0.7, 0.85, 1.0, 0.75, 0.9, 0.8] },
      { name: 'Kabir Singh', kg: 70, today: 0.68, past: [0.6, 0.7, 0.9, 1.0, 0.85, 0.7] },
      { name: 'Ananya Iyer', kg: 58, today: 0.7, past: [1.0, 0.95, 0.85, 0.9, 1.05, 0.9] },
    ],
  },
  {
    name: 'Hostel Block B', code: 'HBB4K9', hue: 190,
    members: [
      { name: 'Priya Sharma', kg: 60, today: 1350 / 2100, past: [0.7, 0.8, 1.02, 1.05, 1.1, 1.0] },
      { name: 'Arjun Nair', kg: 72, today: 0.82, past: [0.9, 0.85, 0.95, 0.9, 0.8, 0.95] },
      { name: 'Sneha Kulkarni', kg: 52, today: 0.71, past: [0.6, 0.75, 0.9, 0.85, 0.95, 0.8] },
      { name: 'Vikram Das', kg: 81, today: 0.707, past: [0.5, 0.7, 0.8, 0.95, 0.75, 0.85] },
    ],
  },
  {
    name: 'Aqua Knights', code: 'AQK3M8', hue: 160,
    members: [
      { name: 'Meera Joshi', kg: 57, today: 0.9, past: [0.8, 0.9, 0.7, 0.85, 0.9, 0.95] },
      { name: 'Dev Patel', kg: 75, today: 0.6, past: [0.5, 0.6, 0.75, 0.6, 0.7, 0.65] },
      { name: 'Sara Thomas', kg: 54, today: 0.55, past: [0.9, 0.7, 0.6, 0.8, 0.7, 0.75] },
      { name: 'Nikhil Gupta', kg: 68, today: 0.67, past: [0.7, 0.8, 0.65, 0.7, 0.8, 0.85] },
    ],
  },
  {
    name: 'Hydration Homies', code: 'HYD6P5', hue: 320,
    members: [
      { name: 'Aditya Verma', kg: 82, today: 0.8, past: [0.6, 0.55, 0.7, 0.65, 0.8, 0.7] },
      { name: 'Zoya Khan', kg: 50, today: 0.5, past: [0.5, 0.6, 0.45, 0.7, 0.6, 0.55] },
      { name: 'Rahul Menon', kg: 66, today: 0.45, past: [0.8, 0.7, 0.6, 0.5, 0.65, 0.6] },
      { name: 'Tara Bose', kg: 59, today: 0.69, past: [0.7, 0.75, 0.8, 0.6, 0.7, 0.8] },
    ],
  },
]

export const FOUNTAINS: Fountain[] = [
  { id: 'f1', name: 'Central Library fountain', building: 'Central Library', floor: 'Ground floor, near issue desk', x: 320, y: 400, verifiedOn: '2026-11-12', verifiedBy: 'Campus Facilities' },
  { id: 'f2', name: 'Main Canteen RO station', building: 'Main Canteen', floor: 'Beside the billing counter', x: 590, y: 270, verifiedOn: '2026-11-15', verifiedBy: 'Campus Facilities' },
  { id: 'f3', name: 'Engineering Block dispenser', building: 'Engineering Block', floor: '2nd floor corridor', x: 890, y: 410, verifiedOn: '2026-11-08', verifiedBy: 'Campus Facilities' },
  { id: 'f4', name: 'Sports Complex cooler', building: 'Sports Complex', floor: 'Near the indoor courts', x: 910, y: 90, verifiedOn: null, verifiedBy: null },
  { id: 'f5', name: 'Hostel Block A lobby', building: 'Hostel Block A', floor: 'Ground floor lobby', x: 215, y: 100, verifiedOn: '2026-11-10', verifiedBy: 'Hostel Warden' },
  { id: 'f6', name: 'Hostel Block B lobby', building: 'Hostel Block B', floor: 'Ground floor lobby', x: 395, y: 90, verifiedOn: null, verifiedBy: null },
  { id: 'f7', name: 'Admin Building cooler', building: 'Admin Building', floor: 'Reception', x: 615, y: 480, verifiedOn: '2026-10-29', verifiedBy: 'Campus Facilities' },
]

const CHUNKS = [250, 500, 750, 250, 500]

function splitIntake(total: number, r: () => number): number[] {
  const out: number[] = []
  let left = Math.round(total)
  while (left > 0) {
    const c = CHUNKS[Math.floor(r() * CHUNKS.length)]
    const take = left - c < 100 ? left : c
    out.push(take)
    left -= take
  }
  return out
}

// The demo user's exact morning, so the pitch numbers are precise.
const PRIYA_TODAY = [250, 500, 350, 250]

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  try {
    const buf = await crypto.subtle.digest('SHA-256', data)
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    let h = 5381
    for (const b of data) h = ((h << 5) + h + b) | 0
    return `fallback-${(h >>> 0).toString(16)}`
  }
}

export async function buildSeed(): Promise<DB> {
  const r = rng(42)
  const tz = systemTz()
  const now = new Date()
  const users: User[] = []
  const logs: HydrationLog[] = []
  const squads: Squad[] = []
  const salt = 'demo-salt'
  const demoHash = await hashPassword(DEMO_PASSWORD, salt)
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  TEAMS.forEach((t, ti) => {
    const sid = `sq-${ti + 1}`
    squads.push({ id: sid, name: t.name, code: t.code, hue: t.hue, createdBy: `u-${ti}-0`, createdAt: new Date(now.getTime() - 20 * 864e5).toISOString() })
    t.members.forEach((m, mi) => {
      const id = `u-${ti}-${mi}`
      const first = m.name.split(' ')[0].toLowerCase()
      const isDemo = ti === 1 && mi === 0
      users.push({
        id, name: m.name, email: isDemo ? DEMO_EMAIL : `${first}@sipstreak.demo`, passHash: demoHash, salt,
        weightKg: m.kg, mlPerKg: 35, customTargetMl: null, timezone: tz, squadId: sid,
        createdAt: new Date(now.getTime() - 20 * 864e5).toISOString(), isSeed: !isDemo,
      })
      const target = Math.round((m.kg * 35) / 10) * 10
      // Past 6 days
      m.past.forEach((p, di) => {
        const day = new Date(midnight.getTime() - (6 - di) * 864e5)
        const parts = splitIntake(p * target, r)
        parts.forEach((ml, k) => {
          const h = 8 + Math.floor(((k + r()) / parts.length) * 13)
          const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, Math.floor(r() * 60))
          logs.push({ id: `${id}-d${di}-${k}`, userId: id, ml, kind: 'water', at: at.toISOString(), source: 'tap' })
        })
        if (r() < 0.25) {
          const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 15)
          logs.push({ id: `${id}-c${di}`, userId: id, ml: 200, kind: 'coffee', at: at.toISOString(), source: 'tap' })
          // they also drank the compensating water so past completion stays realistic
          logs.push({ id: `${id}-cw${di}`, userId: id, ml: 200, kind: 'water', at: at.toISOString(), source: 'tap' })
        }
      })
      // Today: spread between local midnight and now
      const parts = isDemo ? PRIYA_TODAY : splitIntake(m.today * target, r)
      const span = Math.max(60_000, now.getTime() - midnight.getTime() - 60_000)
      const startOffset = Math.min(8 * 36e5, span * 0.4)
      parts.forEach((ml, k) => {
        const off = startOffset + ((span - startOffset) * (k + 0.5)) / parts.length
        const at = new Date(Math.min(now.getTime() - 30_000, midnight.getTime() + off))
        logs.push({ id: `${id}-t-${k}`, userId: id, ml, kind: 'water', at: at.toISOString(), source: 'tap' })
      })
    })
  })

  return { version: 2, users, logs, squads, sessionUserId: null, settings: {}, qrScans: {}, lastNudgeAt: 0 }
}
