export type DrinkKind = 'water' | 'coffee' | 'energy'

export interface User {
  id: string
  name: string
  email: string
  passHash: string
  salt: string
  weightKg: number
  mlPerKg: number
  customTargetMl: number | null
  timezone: string
  squadId: string | null
  createdAt: string
  isSeed?: boolean
  /** Came from the server (a real account), as opposed to local sample data. */
  remote?: boolean
}

export interface HydrationLog {
  id: string
  userId: string
  ml: number
  kind: DrinkKind
  /** UTC ISO timestamp */
  at: string
  source: 'tap' | 'custom' | 'qr' | 'sim'
}

export interface Squad {
  id: string
  name: string
  code: string
  hue: number
  createdBy: string
  createdAt: string
  remote?: boolean
}

export interface Fountain {
  id: string
  name: string
  x: number
  y: number
  building: string
  verifiedOn: string | null
  verifiedBy: string | null
  floor: string
}

export interface Settings {
  nudgesOn: boolean
  nudgeStart: string
  nudgeEnd: string
  nudgeEveryMin: number
  fastDemo: boolean
  caffeineOn: boolean
  caffeineBonusMl: number
  teamStreakThreshold: number
  liveSim: boolean
}

export interface DB {
  version: number
  users: User[]
  logs: HydrationLog[]
  squads: Squad[]
  sessionUserId: string | null
  settings: Record<string, Settings>
  qrScans: Record<string, string>
  lastNudgeAt: number
}
