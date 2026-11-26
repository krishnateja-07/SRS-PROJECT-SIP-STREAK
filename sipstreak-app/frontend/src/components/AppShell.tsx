import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { APP_VIEWS, go, type AppView } from '../lib/nav'
import { completion, dayKey, intake, targetFor, fmtMl } from '../lib/calc'
import { Avatar, Bubbles, Celebrate } from './ui'

const LABELS: Record<AppView, string> = {
  dashboard: 'Dashboard', hydration: 'My Hydration', squad: 'My Squad', leaderboard: 'Leaderboard', history: 'Weekly History',
  plant: 'Plant Companion', map: 'Fountain Map', profile: 'Profile', settings: 'Settings',
}

const ICONS: Record<AppView, ReactNode> = {
  dashboard: <path d="M4 13h6V4H4zm10 7h6V11h-6zM4 20h6v-5H4zm10-16v5h6V4z" />,
  hydration: <path d="M12 3C8 8.5 5 12 5 15a7 7 0 0 0 14 0c0-3-3-6.5-7-12z" />,
  squad: <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 19c0-3 3-5 6-5s6 2 6 5m0-4.5c1-.3 1.5-.5 2-.5 3 0 6 2 6 5" />,
  leaderboard: <path d="M8 21V11H3v10zm6.5 0V4h-5v17zM21 21v-7h-5v7z" />,
  history: <path d="M3 3v18h18M7 15v2m4-6v6m4-9v9m4-12v12" />,
  plant: <path d="M12 21v-9m0 0C12 7 8 4 4 4c0 5 3 8 8 8zm0 0c0-4 3-7 8-7 0 4-3 7-8 7z" />,
  map: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zm0 0v14m6-12v14" />,
  profile: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9c0-4 4-6 8-6s8 2 8 6" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />,
}

export const Icon = ({ v, className = 'h-5 w-5' }: { v: AppView; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[v]}</svg>
)

const NUDGES = [
  'Sip o’clock! Your squad is counting on you.',
  'A quick glass keeps the leaderboard dreams alive.',
  'Your bottle misses you. Take a sip!',
  'Hydration check: 250 ml would look great right now.',
  'Heroes hydrate. Grab your bottle!',
]

function useNudges() {
  const { me, settings, db, toast, now } = useStore()
  const last = useRef<number | null>(null)
  useEffect(() => {
    if (!me || !settings.nudgesOn) return
    const iv = setInterval(() => {
      const n = new Date()
      const hm = n.toTimeString().slice(0, 5)
      if (hm < settings.nudgeStart || hm > settings.nudgeEnd) return // quiet hours
      const every = settings.fastDemo ? 20_000 : settings.nudgeEveryMin * 60_000
      if (last.current === null) last.current = Date.now() // the first nudge comes one interval after the page opens
      if (Date.now() - last.current < every) return
      last.current = Date.now()
      const day = dayKey(n, me.timezone)
      const left = Math.max(0, targetFor(db, me, day) - intake(db, me, day))
      if (left === 0) return
      const msg = `${NUDGES[Math.floor(Math.random() * NUDGES.length)]} ${fmtMl(left)} to go today.`
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('SipStreak', { body: msg, icon: './favicon.svg', tag: 'sipstreak-nudge' })
          return
        }
      } catch {
        /* fall through to in-app toast */
      }
      toast({ title: 'Hydration nudge', body: msg, tone: 'info' })
    }, 5000)
    return () => clearInterval(iv)
  }, [me, settings, db, toast, now])
}

export default function AppShell({ view, children }: { view: AppView; children: ReactNode }) {
  const { me, db, logout, rankUp, goalHit, now, sync, online } = useStore()
  const [open, setOpen] = useState(false)
  useNudges()
  if (!me) return null
  const day = dayKey(now, me.timezone)
  const c = completion(db, me, day)
  const squad = db.squads.find((s) => s.id === me.squadId)

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {APP_VIEWS.map((v) => (
        <button key={v} onClick={() => { go(v); setOpen(false) }} aria-current={view === v ? 'page' : undefined}
          className={`group relative flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition ${view === v ? 'text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
          {view === v && <motion.span layoutId="navpill" className="absolute inset-0 rounded-xl border border-cyan-300/30 bg-gradient-to-r from-cyan-400/20 to-neon/10 shadow-glow" />}
          <span className="relative"><Icon v={v} /></span>
          <span className="relative">{LABELS[v]}</span>
        </button>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen">
      <Bubbles />
      <a href="#main-content" onClick={(e) => { e.preventDefault(); document.getElementById('main-content')?.focus() }} className="sr-only z-[200] rounded-xl bg-neon px-4 py-2 font-display font-bold text-abyss focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <Celebrate trigger={rankUp + goalHit} />
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-cyan-300/10 bg-abyss/70 p-4 backdrop-blur-xl lg:flex">
        <button onClick={() => go('landing')} className="mb-6 flex items-center gap-2.5 px-2 font-display text-lg font-black text-white">
          <img src="./favicon.svg" alt="" className="h-8 w-8 drop-shadow-[0_0_10px_rgba(0,229,255,.8)]" /> SipStreak
        </button>
        {nav}
        <div className="mt-auto rounded-2xl border border-white/5 bg-white/[0.03] p-3">
          <div className="flex items-center gap-3">
            <Avatar name={me.name} hue={squad?.hue ?? 190} />
            <div className="flex-1">
              <div className="truncate text-sm font-semibold text-white">{me.name}</div>
              <div className="truncate text-xs text-slate-400">{squad?.name ?? 'No squad yet'}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500" aria-live="polite">
                <span className={`h-1.5 w-1.5 rounded-full ${sync === 'synced' ? 'bg-neon' : sync === 'syncing' ? 'animate-pulse bg-cyan-300' : sync === 'offline' ? 'bg-coral' : 'bg-slate-500'}`} />
                {me.remote ? (sync === 'synced' ? 'Synced' : sync === 'syncing' ? 'Syncing…' : 'Offline, will retry') : online ? 'Demo account (this browser)' : 'Saved in this browser'}
              </div>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-neon" style={{ width: `${Math.min(100, c * 100)}%` }} /></div>
          <button onClick={() => { logout(); go('landing') }} className="mt-3 w-full rounded-lg py-2 text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-white">Log out</button>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-cyan-300/10 bg-abyss/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <button aria-label="Open menu" onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <span className="font-display font-black text-white">{LABELS[view]}</span>
        <span className="ml-auto font-display text-sm font-bold text-cyan-300">{Math.round(c * 100)}%</span>
      </header>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <motion.div initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', damping: 26 }} className="absolute inset-y-0 left-0 w-72 border-r border-cyan-300/10 bg-abyss p-4">
              <div className="mb-4 flex items-center justify-between px-2 font-display font-black text-white">SipStreak <button aria-label="Close menu" className="h-11 w-11 text-2xl text-slate-400" onClick={() => setOpen(false)}>×</button></div>
              {nav}
              <button onClick={() => { logout(); go('landing') }} className="mt-4 w-full rounded-lg py-3 text-sm font-semibold text-slate-400 hover:bg-white/5">Log out</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* mobile quick bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-cyan-300/10 bg-abyss/90 backdrop-blur-xl lg:hidden" aria-label="Quick">
        {(['dashboard', 'hydration', 'squad', 'leaderboard', 'history'] as AppView[]).map((v) => (
          <button key={v} onClick={() => go(v)} className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] ${view === v ? 'text-cyan-300' : 'text-slate-500'}`}>
            <Icon v={v} />{LABELS[v].replace('My ', '').replace('Weekly ', '')}
          </button>
        ))}
      </nav>

      <main id="main-content" tabIndex={-1} className="outline-none px-4 pb-28 pt-6 sm:px-6 lg:ml-64 lg:px-10 lg:pb-12 lg:pt-10">
        <motion.div key={view} initial={{ opacity: 0, y: 16, rotateX: 6 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.35 }} className="mx-auto max-w-7xl" style={{ transformPerspective: 1200 }}>
          {children}
        </motion.div>
      </main>
    </div>
  )
}
