import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DB, DrinkKind, HydrationLog, Settings, User } from './types'
import { buildSeed, hashPassword } from './seed'
import { api as server, diffSnap, getToken, isSampleSquad, localOnly, mergeRemote, setToken, snapshotOf, type RemoteState, type Snap } from './remote'
import { MAX_LOG_ML, MAX_SQUAD, completion, dayKey, defaultSettings, intake, inviteCode, leaderboard, logsFor, settingsFor, systemTz, uid } from './calc'

const KEY = 'sipstreak.db.v2'

function load(): DB | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const db = JSON.parse(raw) as DB
    return db.version === 2 ? db : null
  } catch {
    return null
  }
}
function persist(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* storage unavailable: keep in memory */
  }
}

export interface Toast {
  id: string
  title: string
  body?: string
  tone?: 'ok' | 'warn' | 'info'
  action?: { label: string; run: () => void }
}

type Result = { ok: true } | { ok: false; error: string }

interface Ctx {
  db: DB
  me: User | null
  now: Date
  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
  splash: number
  rankUp: number
  goalHit: number
  signup: (p: { name: string; email: string; password: string; weightKg: number }) => Promise<Result>
  login: (email: string, password: string) => Promise<Result>
  logout: () => void
  updateProfile: (p: Partial<Pick<User, 'name' | 'weightKg' | 'mlPerKg' | 'customTargetMl' | 'timezone'>>) => void
  logDrink: (ml: number, kind?: DrinkKind, source?: HydrationLog['source']) => Result
  removeLog: (id: string) => void
  /** Take ml out of today's bottle (newest logs first). Undoable. */
  removeWater: (ml: number) => Result
  /** Set today's water total to an exact amount (adds or removes the difference). Undoable. */
  setTodayWater: (totalMl: number) => Result
  createSquad: (name: string) => Result
  joinSquad: (code: string) => Result
  leaveSquad: () => void
  updateSettings: (s: Partial<Settings>) => void
  settings: Settings
  /** True when the shared server is reachable (real accounts, synced squads). */
  online: boolean
  sync: 'local' | 'synced' | 'syncing' | 'offline'
  scanSticker: (stickerId: string) => Result
  resetDemo: () => Promise<void>
}

const C = createContext<Ctx | null>(null)
export const useStore = () => {
  const c = useContext(C)
  if (!c) throw new Error('StoreProvider missing')
  return c
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB | null>(() => load())
  const [now, setNow] = useState(() => new Date())
  const [toasts, setToasts] = useState<Toast[]>([])
  const [splash, setSplash] = useState(0)
  const [rankUp, setRankUp] = useState(0)
  const [goalHit, setGoalHit] = useState(0)
  const dbRef = useRef(db)
  dbRef.current = db
  const [online, setOnline] = useState(false)
  const [syncState, setSyncState] = useState<'local' | 'synced' | 'syncing' | 'offline'>('local')
  const [ready, setReady] = useState(() => !getToken())
  const onlineRef = useRef(false)
  const lastSnap = useRef<Snap | null>(null)
  const flushing = useRef(false)
  const lastRemote = useRef('')
  const booted = useRef(false)

  useEffect(() => {
    if (!db) buildSeed().then((s) => setDb(s))
  }, [db])
  useEffect(() => {
    if (db) persist(localOnly(db))
  }, [db])

  // tick each 30s so "today" rolls over at local midnight without deleting anything
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid()
    setToasts((x) => [...x.slice(-3), { ...t, id }])
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.action ? 6000 : 3800)
  }, [])
  const dismiss = useCallback((id: string) => setToasts((x) => x.filter((y) => y.id !== id)), [])

  const mutate = useCallback((fn: (d: DB) => DB) => setDb((d) => (d ? fn(d) : d)), [])

  const me = useMemo(() => (db ? db.users.find((u) => u.id === db.sessionUserId) ?? null : null), [db])

  const rankOf = (d: DB, user: User | null) => {
    if (!user?.squadId) return -1
    const day = dayKey(new Date(), user.timezone)
    return leaderboard(d, day).findIndex((r) => r.squad.id === user.squadId)
  }

  /** Adopt the server's view. Own data is kept while edits are waiting to sync. */
  const applyRemote = useCallback((rs: RemoteState, meId: string | null, adoptSelf: boolean) => {
    const json = JSON.stringify(rs.users.length + ':' + rs.logs.length) + JSON.stringify(rs.squads) + JSON.stringify(rs.settings)
    if (!adoptSelf && json === lastRemote.current) return
    lastRemote.current = json
    setDb((d) => (d ? mergeRemote(d, rs, meId, adoptSelf) : d))
  }, [])

  // Boot: find out whether a server exists, and restore a saved session.
  useEffect(() => {
    if (!db || booted.current) return
    booted.current = true
    ;(async () => {
      const r = await server.state()
      if (r.ok) {
        onlineRef.current = true
        setOnline(true)
        const meId = r.data.me
        if (getToken() && !meId) setToken(null)
        const cur = dbRef.current!
        const merged = mergeRemote(cur, r.data, meId, true)
        lastRemote.current = ''
        if (meId) lastSnap.current = snapshotOf(merged, meId)
        setDb(meId ? { ...merged, sessionUserId: meId } : merged)
        setSyncState(meId ? 'synced' : 'local')
      }
      setReady(true)
    })()
  }, [db])

  const flush = useCallback(async () => {
    const d = dbRef.current
    const meId = d?.sessionUserId
    if (!d || !meId || !onlineRef.current || !lastSnap.current || flushing.current) return
    const me = d.users.find((u) => u.id === meId)
    if (!me?.remote) return
    const { body, next } = diffSnap(d, meId, lastSnap.current)
    if (!body) { setSyncState('synced'); return }
    flushing.current = true
    setSyncState('syncing')
    const r = await server.sync(body)
    flushing.current = false
    if (r.ok) {
      lastSnap.current = next
      if (r.data.rejected?.squad) {
        toast({ title: 'Squad change not saved', body: r.data.rejected.squad, tone: 'warn' })
        lastSnap.current = snapshotOf(mergeRemote(dbRef.current!, r.data.state, meId, true), meId)
        applyRemote(r.data.state, meId, true)
      } else {
        applyRemote(r.data.state, meId, false)
      }
      setSyncState('synced')
      // more edits may have landed while the request was in flight
      setTimeout(() => flushRef.current(), 50)
    } else if (r.status === 401) {
      setToken(null)
      lastSnap.current = null
      toast({ title: 'Please log in again', body: 'Your session expired.', tone: 'warn' })
      setDb((x) => (x ? { ...x, sessionUserId: null } : x))
      setSyncState('local')
    } else {
      setSyncState('offline')
      setTimeout(() => flushRef.current(), 6000)
    }
  }, [applyRemote, toast])
  const flushRef = useRef(flush)
  flushRef.current = flush

  // Push local edits shortly after they happen.
  useEffect(() => {
    if (!db || !onlineRef.current) return
    const meId = db.sessionUserId
    const me = meId ? db.users.find((u) => u.id === meId) : null
    if (!me?.remote || !lastSnap.current) return
    if (!diffSnap(db, meId!, lastSnap.current).body) return
    const t = setTimeout(() => flushRef.current(), 350)
    return () => clearTimeout(t)
  }, [db])

  // Pull everyone else's changes while signed in.
  useEffect(() => {
    const iv = setInterval(async () => {
      const d = dbRef.current
      const meId = d?.sessionUserId
      if (!d || !meId || !onlineRef.current || flushing.current || document.visibilityState !== 'visible') return
      if (!d.users.find((u) => u.id === meId)?.remote || !lastSnap.current) return
      const pending = !!diffSnap(d, meId, lastSnap.current).body
      const r = await server.state()
      if (!r.ok) { setSyncState(r.offline ? 'offline' : 'synced'); return }
      applyRemote(r.data, meId, !pending)
      if (!pending) lastSnap.current = snapshotOf(mergeRemote(dbRef.current!, r.data, meId, true), meId)
      setSyncState('synced')
    }, 8000)
    return () => clearInterval(iv)
  }, [applyRemote])

  const value = useMemo<Ctx | null>(() => {
    if (!db) return null
    const settings = me ? settingsFor(db, me.id) : defaultSettings()
    const api: Ctx = {
      db, me, now, toasts, toast, dismiss, splash, rankUp, goalHit, settings, online, sync: syncState,
      async signup({ name, email, password, weightKg }) {
        const e = email.trim().toLowerCase()
        if (name.trim().length < 2) return { ok: false, error: 'Please enter your name.' }
        if (!/^\S+@\S+\.\S+$/.test(e)) return { ok: false, error: 'Please enter a valid email.' }
        if (password.length < 6) return { ok: false, error: 'Password needs at least 6 characters.' }
        if (!(weightKg >= 25 && weightKg <= 250)) return { ok: false, error: 'Weight must be between 25 and 250 kg.' }
        if (onlineRef.current) {
          if (dbRef.current!.users.some((u) => u.email === e && !u.remote)) return { ok: false, error: 'An account with this email already exists.' }
          const r = await server.signup({ name: name.trim(), email: e, password, weightKg, timezone: systemTz() })
          if (!r.ok) return { ok: false, error: r.offline ? 'Can’t reach the server. Check your connection and try again.' : r.error }
          setToken(r.data.token)
          const merged = mergeRemote(dbRef.current!, r.data.state, r.data.user.id, true)
          lastRemote.current = ''
          lastSnap.current = snapshotOf(merged, r.data.user.id)
          setDb({ ...merged, sessionUserId: r.data.user.id })
          setSyncState('synced')
          return { ok: true }
        }
        if (dbRef.current!.users.some((u) => u.email === e)) return { ok: false, error: 'An account with this email already exists.' }
        const salt = uid()
        const passHash = await hashPassword(password, salt)
        const u: User = { id: uid(), name: name.trim(), email: e, passHash, salt, weightKg, mlPerKg: 35, customTargetMl: null, timezone: systemTz(), squadId: null, createdAt: new Date().toISOString() }
        mutate((d) => ({ ...d, users: [...d.users, u], sessionUserId: u.id }))
        return { ok: true }
      },
      async login(email, password) {
        const e = email.trim().toLowerCase()
        const u = dbRef.current!.users.find((x) => x.email === e && !x.remote)
        if (u) {
          if ((await hashPassword(password, u.salt)) !== u.passHash) return { ok: false, error: 'Email or password is incorrect.' }
          setToken(null)
          lastSnap.current = null
          mutate((d) => ({ ...d, sessionUserId: u.id }))
          setSyncState('local')
          return { ok: true }
        }
        if (!onlineRef.current) return { ok: false, error: 'Email or password is incorrect.' }
        const r = await server.login({ email: e, password })
        if (!r.ok) return { ok: false, error: r.offline ? 'Can’t reach the server. Check your connection and try again.' : r.error }
        setToken(r.data.token)
        const merged = mergeRemote(dbRef.current!, r.data.state, r.data.user.id, true)
        lastRemote.current = ''
        lastSnap.current = snapshotOf(merged, r.data.user.id)
        setDb({ ...merged, sessionUserId: r.data.user.id })
        setSyncState('synced')
        return { ok: true }
      },
      logout() {
        setToken(null)
        lastSnap.current = null
        setSyncState('local')
        mutate((d) => ({ ...d, sessionUserId: null }))
      },
      updateProfile(p) {
        if (!me) return
        mutate((d) => ({ ...d, users: d.users.map((u) => (u.id === me.id ? { ...u, ...p } : u)) }))
      },
      logDrink(ml, kind = 'water', source = 'tap') {
        if (!me) return { ok: false, error: 'Please log in first.' }
        const v = Math.round(Number(ml))
        if (!Number.isFinite(v) || v <= 0) return { ok: false, error: 'Enter a positive amount.' }
        if (v > MAX_LOG_ML) return { ok: false, error: `One log can be at most ${MAX_LOG_ML} ml.` }
        const log: HydrationLog = { id: uid(), userId: me.id, ml: v, kind, at: new Date().toISOString(), source }
        const before = rankOf(dbRef.current!, me)
        const day = dayKey(new Date(), me.timezone)
        const wasDone = completion(dbRef.current!, me, day) >= 1
        const next = { ...dbRef.current!, logs: [...dbRef.current!.logs, log] }
        const after = rankOf(next, me)
        const goalNow = kind === 'water' && !wasDone && completion(next, me, day) >= 1
        setDb(next)
        setNow(new Date())
        if (kind === 'water') setSplash((s) => s + 1)
        if (goalNow) setGoalHit((g) => g + 1)
        if (before > 0 && after >= 0 && after < before) setRankUp((r) => r + 1)
        try { navigator.vibrate?.(goalNow ? [18, 40, 28] : 12) } catch { /* haptics are optional */ }
        const undo = { label: 'Undo', run: () => mutate((d) => ({ ...d, logs: d.logs.filter((l) => l.id !== log.id) })) }
        if (kind === 'water') {
          const cheers = ['Splash! Nice sip.', 'Hydration hero move!', 'Your squad felt that one.', 'Glug glug, streak saved.', 'Wave secured.']
          toast({ title: `+${v} ml logged`, body: goalNow ? 'Daily goal reached! Your streak just grew.' : after >= 0 && after < before ? `Your squad climbed to #${after + 1}!` : cheers[Math.floor(Math.random() * cheers.length)], tone: 'ok', action: undo })
        } else {
          const s = settingsFor(dbRef.current!, me.id)
          toast({ title: kind === 'coffee' ? 'Coffee logged' : 'Energy drink logged', body: s.caffeineOn ? `Game rule: target +${s.caffeineBonusMl} ml today.` : 'Caffeine offset is off in Settings.', tone: 'info', action: undo })
        }
        return { ok: true }
      },
      removeLog(id) {
        mutate((d) => ({ ...d, logs: d.logs.filter((l) => !(l.id === id && l.userId === me?.id)) }))
      },
      removeWater(ml) {
        if (!me) return { ok: false, error: 'Please log in first.' }
        const want = Math.round(Number(ml))
        if (!Number.isFinite(want) || want <= 0) return { ok: false, error: 'Enter an amount above 0 ml.' }
        const d = dbRef.current!
        const day = dayKey(new Date(), me.timezone)
        const todays = logsFor(d, me.id, day, me.timezone).filter((l) => l.kind === 'water').sort((a, b) => b.at.localeCompare(a.at))
        const total = todays.reduce((a, l) => a + l.ml, 0)
        if (total <= 0) return { ok: false, error: 'No water is logged today, so there is nothing to remove.' }
        const gone = Math.min(want, total)
        let left = gone
        const removed: HydrationLog[] = []
        const trimmed: { id: string; from: number; to: number }[] = []
        for (const l of todays) {
          if (left <= 0) break
          if (l.ml <= left) { removed.push(l); left -= l.ml } else { trimmed.push({ id: l.id, from: l.ml, to: l.ml - left }); left = 0 }
        }
        mutate((x) => ({
          ...x,
          logs: x.logs.filter((l) => !removed.some((r) => r.id === l.id)).map((l) => { const t = trimmed.find((y) => y.id === l.id); return t ? { ...l, ml: t.to } : l }),
        }))
        setNow(new Date())
        const undo = {
          label: 'Undo',
          run: () => mutate((x) => {
            const have = new Set(x.logs.map((l) => l.id))
            return { ...x, logs: [...x.logs.map((l) => { const t = trimmed.find((y) => y.id === l.id); return t ? { ...l, ml: t.from } : l }), ...removed.filter((r) => !have.has(r.id))] }
          }),
        }
        toast({ title: `−${gone} ml removed`, body: gone < want ? `That was everything logged today (${total} ml).` : 'Your bottle level has been updated.', tone: 'info', action: undo })
        return { ok: true }
      },
      setTodayWater(totalMl) {
        if (!me) return { ok: false, error: 'Please log in first.' }
        const t = Math.round(Number(totalMl))
        if (!Number.isFinite(t) || t < 0 || t > 10000) return { ok: false, error: 'Enter a total between 0 and 10,000 ml.' }
        const d = dbRef.current!
        const day = dayKey(new Date(), me.timezone)
        const cur = intake(d, me, day)
        if (t === cur) return { ok: false, error: `Today's total is already ${cur} ml.` }
        if (t < cur) return api.removeWater(cur - t)
        let need = t - cur
        const added: HydrationLog[] = []
        while (need > 0) {
          const v = Math.min(need, MAX_LOG_ML)
          added.push({ id: uid(), userId: me.id, ml: v, kind: 'water', at: new Date().toISOString(), source: 'custom' })
          need -= v
        }
        const wasDone = completion(d, me, day) >= 1
        const next = { ...d, logs: [...d.logs, ...added] }
        const goalNow = !wasDone && completion(next, me, day) >= 1
        setDb(next)
        setNow(new Date())
        setSplash((x) => x + 1)
        if (goalNow) setGoalHit((g) => g + 1)
        const ids = new Set(added.map((a) => a.id))
        toast({ title: `Total set to ${t} ml`, body: `+${t - cur} ml added to today.`, tone: 'ok', action: { label: 'Undo', run: () => mutate((x) => ({ ...x, logs: x.logs.filter((l) => !ids.has(l.id)) })) } })
        return { ok: true }
      },
      createSquad(name) {
        if (!me) return { ok: false, error: 'Please log in first.' }
        const n = name.trim()
        if (n.length < 3 || n.length > 32) return { ok: false, error: 'Squad name must be 3–32 characters.' }
        if (dbRef.current!.squads.some((s) => s.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'That squad name is taken.' }
        let code = inviteCode()
        while (dbRef.current!.squads.some((s) => s.code === code)) code = inviteCode()
        const id = uid()
        mutate((d) => ({
          ...d,
          squads: [...d.squads, { id, name: n, code, hue: Math.floor(Math.random() * 360), createdBy: me.id, createdAt: new Date().toISOString() }],
          users: d.users.map((u) => (u.id === me.id ? { ...u, squadId: id } : u)),
        }))
        return { ok: true }
      },
      joinSquad(code) {
        if (!me) return { ok: false, error: 'Please log in first.' }
        const s = dbRef.current!.squads.find((x) => x.code === code.trim().toUpperCase())
        if (!s) return { ok: false, error: 'No squad found with that invite code.' }
        if (s.id === me.squadId) return { ok: false, error: "You're already in this squad." }
        if (me.remote && isSampleSquad(s.id)) return { ok: false, error: 'Sample squads are for the demo account. Create a squad, or join a friend’s code.' }
        const count = dbRef.current!.users.filter((u) => u.squadId === s.id).length
        if (count >= MAX_SQUAD) return { ok: false, error: `${s.name} is full (${MAX_SQUAD}/${MAX_SQUAD}).` }
        mutate((d) => ({ ...d, users: d.users.map((u) => (u.id === me.id ? { ...u, squadId: s.id } : u)) }))
        return { ok: true }
      },
      leaveSquad() {
        if (!me) return
        mutate((d) => ({ ...d, users: d.users.map((u) => (u.id === me.id ? { ...u, squadId: null } : u)) }))
      },
      updateSettings(s) {
        if (!me) return
        mutate((d) => ({ ...d, settings: { ...d.settings, [me.id]: { ...settingsFor(d, me.id), ...s } } }))
      },
      scanSticker(stickerId) {
        if (!me) return { ok: false, error: 'Log in to use your bottle sticker.' }
        const last = dbRef.current!.qrScans[stickerId]
        // idempotency window: the same sticker cannot log twice within 10 minutes
        if (last && Date.now() - new Date(last).getTime() < 10 * 60_000) return { ok: false, error: 'This sticker was just scanned — duplicate log blocked.' }
        mutate((d) => ({ ...d, qrScans: { ...d.qrScans, [stickerId]: new Date().toISOString() } }))
        return api.logDrink(500, 'water', 'qr')
      },
      async resetDemo() {
        const s = await buildSeed()
        setToken(null)
        lastSnap.current = null
        setSyncState('local')
        setDb(s)
      },
    }
    return api
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, me, now, toasts, splash, rankUp, goalHit, online, syncState])

  // Optional live campus simulation: other squads keep sipping.
  useEffect(() => {
    if (!value?.settings.liveSim) return
    const t = setInterval(() => {
      const d = dbRef.current
      if (!d) return
      const others = d.users.filter((u) => u.id !== d.sessionUserId && u.squadId && !u.remote)
      const u = others[Math.floor(Math.random() * others.length)]
      if (!u) return
      mutate((x) => ({ ...x, logs: [...x.logs, { id: uid(), userId: u.id, ml: [150, 250][Math.floor(Math.random() * 2)], kind: 'water', at: new Date().toISOString(), source: 'sim' }] }))
    }, 9000)
    return () => clearInterval(t)
  }, [value?.settings.liveSim, mutate])

  if (!value || !ready)
    return (
      <div className="grid min-h-screen place-items-center bg-abyss text-aqua">
        <div className="animate-pulse font-display text-2xl">Filling the bottle…</div>
      </div>
    )
  return <C.Provider value={value}>{children}</C.Provider>
}
