import { animate, motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { dayKey, fmtMl, leaderboard, MIN_SQUAD, systemTz } from '../lib/calc'
import { SquadBadge, Tilt, WaterBar } from '../components/ui'
import { go } from '../lib/nav'
import Bottle3D from '../three/Bottle3D'
import Showcase from '../components/Showcase'
import CrystalSection from '../components/CrystalSection'
import FeatureStrip from '../components/FeatureStrip'

/** Counts up through a motion value, so no React re-render happens per frame. */
function Counter({ to, decimals = 0, suffix = '' }: { to: number; decimals?: number; suffix?: string }) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => `${v.toFixed(decimals)}${suffix}`)
  useEffect(() => {
    if (reduce) {
      mv.set(to)
      return
    }
    const c = animate(mv, to, { duration: 1.4, ease: 'easeOut' })
    return () => c.stop()
  }, [to, reduce, mv])
  return <motion.span>{text}</motion.span>
}

/** Interactive version of the scoring rule: drag a slider and watch the cap do its job. */
function FairnessLab() {
  const [v, setV] = useState([160, 90, 40, 75])
  const names = ['Heavy drinker', 'Steady sipper', 'Forgetful friend', 'Morning chugger']
  const counted = v.map((x) => Math.min(100, x))
  const score = Math.round(counted.reduce((a, b) => a + b, 0) / counted.length)
  const uncapped = Math.round(v.reduce((a, b) => a + b, 0) / v.length)
  return (
    <div className="space-y-3">
      {names.map((n, i) => (
        <div key={n}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <label htmlFor={`fl-${i}`} className="text-slate-300">{n}</label>
            <span className="whitespace-nowrap tabular-nums text-slate-400">{v[i]}% drunk → counts <b className="text-cyan-200">{counted[i]}%</b></span>
          </div>
          <input id={`fl-${i}`} type="range" min={0} max={200} step={5} value={v[i]} onChange={(e) => setV(v.map((x, j) => (j === i ? Number(e.target.value) : x)))} className="h-8 w-full accent-cyan-400" aria-valuetext={`${v[i]} percent of goal, counts ${counted[i]} percent`} />
          <WaterBar value={counted[i] / 100} height={8} />
        </div>
      ))}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/10 pt-4">
        <span className="text-slate-400">Squad score <span className="text-xs text-slate-500">(without the cap it would read {uncapped}%)</span></span>
        <motion.span key={score} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="font-display text-4xl font-black text-gradient">{score}%</motion.span>
      </div>
      <button className="text-sm font-semibold text-cyan-300 hover:underline" onClick={() => setV([160, 90, 40, 75])}>Reset sliders</button>
    </div>
  )
}

export default function Landing() {
  const { db, me, now } = useStore()
  const tz = systemTz()
  const today = dayKey(now, tz)
  const stats = useMemo(() => {
    const board = leaderboard(db, today)
    const active = board.filter((r) => r.eligible)
    const totalL = db.logs.filter((l) => l.kind === 'water').reduce((a, l) => a + l.ml, 0) / 1000
    const campus = active.length ? active.reduce((a, r) => a + r.score, 0) / active.length : 0
    return { heroes: db.users.length, totalL, squads: active.length, campus, board }
  }, [db, today])

  // Deep links (#scoring, #squads…) point at sections that only exist after the store has loaded.
  useEffect(() => {
    const id = location.hash.slice(1)
    if (!id) return
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView(), 60)
    return () => clearTimeout(t)
  }, [])

  const { scrollY, scrollYProgress } = useScroll()
  const bar = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })
  const bottleY = useTransform(scrollY, [0, 600], [0, 140])
  const bottleO = useTransform(scrollY, [0, 500], [1, 0.25])
  const heroProgress = useTransform(scrollY, [0, 700], [0, 1]) // read inside the 3D frame loop

  return (
    <div className="relative">
      <motion.div aria-hidden style={{ scaleX: bar }} className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-cyan-300 to-neon shadow-glow" />

      <header className="fixed inset-x-0 top-0 z-50 border-b border-cyan-300/10 bg-abyss/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3">
          <a href="#" className="flex items-center gap-2.5 font-display text-lg font-black text-white">
            <img src="./favicon.svg" alt="" className="h-7 w-7 drop-shadow-[0_0_10px_rgba(0,229,255,.8)]" /> SipStreak
          </a>
          <nav className="ml-auto hidden items-center gap-6 text-sm font-medium text-slate-300 md:flex" aria-label="Sections">
            <a href="#showcase" className="hover:text-cyan-300">Showcase</a>
            <a href="#crystal" className="hover:text-cyan-300">Crystal</a>
            <a href="#scoring" className="hover:text-cyan-300">Fair scoring</a>
            <a href="#squads" className="hover:text-cyan-300">Squads</a>
          </nav>
          {me ? (
            <button className="btn-primary ml-auto md:ml-0" onClick={() => go('dashboard')}>Open dashboard</button>
          ) : (
            <div className="ml-auto flex gap-2 md:ml-0">
              <button className="btn-ghost" onClick={() => go('login')}>Log in</button>
              <button className="btn-primary max-sm:hidden" onClick={() => go('signup')}>Sign up</button>
            </div>
          )}
        </div>
      </header>

      <section className="relative flex min-h-[100svh] items-center overflow-hidden pt-20">
        <motion.div style={{ y: bottleY, opacity: bottleO }} className="absolute inset-x-0 bottom-0 top-16">
          <Bottle3D level={0.62} hero scroll={heroProgress} fallbackSize={300} />
        </motion.div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#030b1a_80%)]" />
        <div className="pointer-events-none relative mx-auto w-full max-w-7xl px-5">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(260px,420px)_1fr]">
            <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} className="max-lg:text-center">
              <span className="chip mb-5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon" /> Live campus challenge</span>
              <h1 className="font-display text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-6xl xl:text-7xl">
                HYDRO<span className="text-gradient">HERO</span><br />HUNT
              </h1>
              <p className="mt-5 max-w-md text-lg text-slate-300 max-lg:mx-auto">Drink Together. Stay Stronger. Conquer the Hydration Challenge.</p>
              <div className="pointer-events-auto mt-8 flex flex-wrap gap-3 max-lg:justify-center">
                <motion.button whileHover={{ scale: 1.05, rotateX: 8 }} whileTap={{ scale: 0.97 }} className="btn-neon px-7 text-lg" onClick={() => go(me ? 'dashboard' : 'signup')}>Start Your Journey</motion.button>
                <motion.button whileHover={{ scale: 1.05, rotateX: 8 }} whileTap={{ scale: 0.97 }} className="btn-ghost px-7 text-lg" onClick={() => document.getElementById('squads')?.scrollIntoView({ behavior: 'smooth' })}>Explore Squads</motion.button>
              </div>
            </motion.div>
            <div className="h-[340px] lg:h-[560px]" aria-hidden />
            <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="pointer-events-auto grid grid-cols-2 gap-3 lg:grid-cols-1">
              {[
                { l: 'Active Hydration Heroes', v: <Counter to={stats.heroes} /> },
                { l: 'Total Litres Consumed', v: <Counter to={stats.totalL} decimals={1} suffix=" L" /> },
                { l: 'Active Squads', v: <Counter to={stats.squads} /> },
                { l: 'Campus Hydration Score', v: <Counter to={stats.campus} suffix="%" /> },
              ].map((s) => (
                <Tilt key={s.l} className="p-4" max={12}>
                  <div className="text-xs font-medium text-slate-400">{s.l}</div>
                  <div className="mt-1 font-display text-3xl font-black text-gradient">{s.v}</div>
                </Tilt>
              ))}
            </motion.div>
          </div>
        </div>
        <motion.a href="#showcase" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm text-slate-400 hover:text-cyan-300" animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 2 }}>Scroll to dive in ↓</motion.a>
      </section>

      <FeatureStrip />
      <Showcase />
      <CrystalSection heroes={stats.heroes} squads={stats.squads} litres={stats.totalL} />

      <section id="scoring" className="relative mx-auto max-w-7xl px-5 py-20">
        <Tilt className="p-8 md:p-12" max={3}>
          <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-black text-white sm:text-4xl">The fair participation formula</h2>
            <p className="mt-4 text-slate-300">Each member’s contribution is capped at 100% of their own goal. A perfect squad score needs <b className="text-neon">everyone</b> to drink.</p>
            <pre className="mt-6 overflow-x-auto rounded-2xl border border-cyan-300/20 bg-abyss/80 p-5 font-mono text-sm text-cyan-200">TeamScore = Σ min(1, intake / goal) ÷ team size × 100</pre>
            <p className="mt-4 text-sm text-slate-400">Try it: push the heavy drinker to 200% and notice the squad score barely moves.</p>
          </div>
          <FairnessLab />
          </div>
        </Tilt>
      </section>

      <section id="squads" className="relative mx-auto max-w-7xl px-5 py-20">
        <h2 className="text-3xl font-black text-white sm:text-4xl">Today’s campus squads</h2>
        <p className="mt-2 text-slate-400">Live from the sample campus dataset — sign up and join one with its invite code.</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.board.slice(0, 8).map((r, i) => (
            <Tilt key={r.squad.id} className="p-5">
              <div className="flex items-center gap-3">
                <SquadBadge name={r.squad.name} hue={r.squad.hue} size={48} />
                <div>
                  <div className="text-xs text-slate-400">#{i + 1}{!r.eligible ? ` · needs ${MIN_SQUAD} members` : ''}</div>
                  <div className="font-display font-bold text-white">{r.squad.name}</div>
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between"><span className="font-display text-3xl font-black text-gradient">{Math.round(r.score)}%</span><span className="text-sm text-slate-400">{fmtMl(r.totalMl)} today</span></div>
              <div className="mt-2"><WaterBar value={r.score / 100} height={10} /></div>
              <div className="mt-3 text-xs text-slate-500">{r.members.length} members · code <span className="font-mono text-cyan-300">{r.squad.code}</span></div>
            </Tilt>
          ))}
        </div>
        <div className="mt-12 flex justify-center">
          <button className="btn-neon px-8 text-lg" onClick={() => go(me ? 'squad' : 'signup')}>Join the hunt</button>
        </div>
      </section>

      <footer className="border-t border-cyan-300/10 py-10 text-center text-sm text-slate-500">
        <p>SipStreak: HydroHero Hunt — a hackathon prototype. Targets are estimates, not medical advice; needs vary with activity, climate, diet and health.</p>
      </footer>
    </div>
  )
}
