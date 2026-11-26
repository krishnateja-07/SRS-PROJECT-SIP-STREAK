import type { DB, HydrationLog, Settings, Squad, User } from './types'

/* ------------------------------ transport ------------------------------ */
const TOKEN_KEY = 'sipstreak.token'
export const getToken = (): string | null => {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export const setToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* storage unavailable */ }
}

export interface RemoteState {
  users: User[]
  logs: HydrationLog[]
  settings: Record<string, Partial<Settings>>
  squads: Squad[]
  qrScans: Record<string, string>
  serverTime: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number; offline: boolean }

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 9000): Promise<ApiResult<T>> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const token = getToken()
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (token) headers.authorization = `Bearer ${token}`
    const init: RequestInit = { method, headers, signal: ctl.signal, cache: 'no-store' }
    if (body !== undefined) init.body = JSON.stringify(body)
    const res = await fetch(`/api/${path}`, init)
    // A static host with no API answers with HTML (or 404): treat that as "no server".
    if (!(res.headers.get('content-type') || '').includes('json')) return { ok: false, error: 'No server', status: res.status, offline: true }
    const json = await res.json()
    if (!res.ok || json.ok === false) return { ok: false, error: json.error || 'Something went wrong.', status: res.status, offline: false }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'Can’t reach the server.', status: 0, offline: true }
  } finally {
    clearTimeout(timer)
  }
}

export interface AuthReply { token: string; user: User; state: RemoteState }
export interface SyncReply { ok: true; rejected?: { squad?: string }; state: RemoteState }

export const api = {
  state: () => call<RemoteState & { me: string | null }>('GET', 'state'),
  signup: (b: { name: string; email: string; password: string; weightKg: number; timezone: string }) => call<AuthReply>('POST', 'signup', b),
  login: (b: { email: string; password: string }) => call<AuthReply>('POST', 'login', b),
  sync: (b: SyncBody) => call<SyncReply>('POST', 'sync', b),
}

/* ------------------------------ merging ------------------------------ */
export const isSampleSquad = (id: string | null | undefined) => !!id && /^sq-\d+$/.test(id)

/**
 * Fold the server's view into the local database. Sample data (seeded squads, demo account) stays local;
 * everything that came from the server is flagged `remote`. The signed-in user's own records are kept as-is
 * while edits are waiting to sync, and adopted from the server otherwise.
 */
export function mergeRemote(d: DB, rs: RemoteState, meId: string | null, adoptSelf: boolean): DB {
  const keepSelf = meId && !adoptSelf ? meId : null
  const oldRemote = new Set(d.users.filter((u) => u.remote).map((u) => u.id))
  const selfLocal = keepSelf ? d.users.find((u) => u.id === keepSelf) : undefined
  const users = [...d.users.filter((u) => !u.remote), ...rs.users.filter((u) => u.id !== keepSelf).map((u) => ({ ...u, remote: true }))]
  if (selfLocal) users.push(selfLocal)
  const selfLogs = keepSelf ? d.logs.filter((l) => l.userId === keepSelf) : []
  const logs = [...d.logs.filter((l) => !oldRemote.has(l.userId)), ...rs.logs.filter((l) => l.userId !== keepSelf), ...selfLogs]
  const remoteSquadIds = new Set(rs.squads.map((s) => s.id))
  const squads = [
    ...d.squads.filter((s) => !s.remote && !remoteSquadIds.has(s.id) && !(meId && s.createdBy === meId && adoptSelf)),
    ...rs.squads.map((s) => ({ ...s, remote: true })),
  ]
  const settings: DB['settings'] = {}
  for (const [k, v] of Object.entries(d.settings)) if (!oldRemote.has(k) || k === keepSelf) settings[k] = v
  for (const [k, v] of Object.entries(rs.settings)) if (k !== keepSelf) settings[k] = { ...(v as Settings) }
  return { ...d, users, logs, squads, settings, qrScans: adoptSelf ? { ...d.qrScans, ...rs.qrScans } : d.qrScans }
}

/** Only non-remote data is persisted locally; the server is the source of truth for the rest. */
export function localOnly(d: DB): DB {
  const remoteIds = new Set(d.users.filter((u) => u.remote).map((u) => u.id))
  const sessionRemote = !!d.sessionUserId && remoteIds.has(d.sessionUserId)
  return {
    ...d,
    users: d.users.filter((u) => !u.remote),
    logs: d.logs.filter((l) => !remoteIds.has(l.userId)),
    squads: d.squads.filter((s) => !s.remote),
    settings: Object.fromEntries(Object.entries(d.settings).filter(([k]) => !remoteIds.has(k))),
    sessionUserId: sessionRemote ? null : d.sessionUserId,
  }
}

/* ------------------------------ diffing ------------------------------ */
export interface SyncBody {
  profile?: Pick<User, 'name' | 'weightKg' | 'mlPerKg' | 'customTargetMl' | 'timezone' | 'squadId'>
  settings?: Settings | null
  logs?: { add: HydrationLog[]; remove: string[]; update: { id: string; ml: number }[] }
  qr?: Record<string, string>
  createSquad?: { id: string; name: string; code: string; hue: number }
}

export interface Snap {
  profile: string
  settings: string
  logs: Map<string, number>
  qr: Record<string, string>
  squads: Set<string>
}

const profileOf = (u: User) => ({ name: u.name, weightKg: u.weightKg, mlPerKg: u.mlPerKg, customTargetMl: u.customTargetMl, timezone: u.timezone, squadId: u.squadId })

export function snapshotOf(d: DB, meId: string): Snap {
  const me = d.users.find((u) => u.id === meId)
  return {
    profile: JSON.stringify(me ? profileOf(me) : null),
    settings: JSON.stringify(d.settings[meId] ?? null),
    logs: new Map(d.logs.filter((l) => l.userId === meId).map((l) => [l.id, l.ml])),
    qr: { ...d.qrScans },
    squads: new Set(d.squads.filter((s) => s.createdBy === meId && !s.remote).map((s) => s.id)),
  }
}

/** What changed for this user since the last successful sync (null when nothing did). */
export function diffSnap(d: DB, meId: string, last: Snap): { body: SyncBody | null; next: Snap } {
  const next = snapshotOf(d, meId)
  const me = d.users.find((u) => u.id === meId)
  const body: SyncBody = {}
  if (me && next.profile !== last.profile) body.profile = profileOf(me)
  if (next.settings !== last.settings) body.settings = (d.settings[meId] as Settings | undefined) ?? null
  const mine = d.logs.filter((l) => l.userId === meId)
  const add = mine.filter((l) => !last.logs.has(l.id))
  const remove = [...last.logs.keys()].filter((id) => !next.logs.has(id))
  const update = mine.filter((l) => last.logs.has(l.id) && last.logs.get(l.id) !== l.ml).map((l) => ({ id: l.id, ml: l.ml }))
  if (add.length || remove.length || update.length) body.logs = { add, remove, update }
  const qr = Object.fromEntries(Object.entries(next.qr).filter(([k, v]) => last.qr[k] !== v))
  if (Object.keys(qr).length) body.qr = qr
  const fresh = d.squads.find((s) => s.createdBy === meId && !s.remote && !last.squads.has(s.id))
  if (fresh) body.createSquad = { id: fresh.id, name: fresh.name, code: fresh.code, hue: fresh.hue }
  return { body: Object.keys(body).length ? body : null, next }
}
