import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../lib/store'
import { completion, dayKey, fmtMl, intake, leaderboard, personalStreak, targetFor, teamScore } from '../lib/calc'
import { PageHeader, Stat, Tilt, WaterBar } from '../components/ui'
import QuickLog from '../components/QuickLog'
import { Podium } from '../components/LiveBoard'
import { go } from '../lib/nav'
import Bottle3D from '../three/Bottle3D'
import WaterAdjust from '../components/WaterAdjust'


export default function Dashboard() {
  const { db, me, now, splash, goalHit } = useStore()
  if (!me) return null
  const day = dayKey(now, me.timezone)
  const done = intake(db, me, day)
  const target = targetFor(db, me, day)
  const c = completion(db, me, day)
  const streak = personalStreak(db, me, now)
  const squad = db.squads.find((s) => s.id === me.squadId)
  const board = leaderboard(db, day)
  const rank = squad ? board.findIndex((r) => r.squad.id === squad.id) + 1 : 0
  const ts = squad ? teamScore(db, squad.id, day) : 0
  const hour = now.getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <p className="sr-only" aria-live="polite">{Math.round(c * 100)}% of today's target reached, {fmtMl(Math.max(0, target - done))} remaining.</p>
      <PageHeader title={`${greet}, ${me.name.split(' ')[0]}`} sub={c >= 1 ? 'Target smashed. Keep sipping to help your squad.' : `${fmtMl(Math.max(0, target - done))} to go today. Every sip counts for your squad.`} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
        {/* bottle */}
        <Tilt className="overflow-hidden p-0" max={4}>
          <div className="grid md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="flex flex-col">
            <div className="relative h-[360px] sm:h-[420px] xl:min-h-[420px] xl:flex-1">
              <Bottle3D level={c} splash={splash} celebrate={goalHit} fallbackSize={240} />
              {c >= 1 && <div className="absolute left-4 top-4 chip border-neon/40 bg-neon/10 text-neon">Goal reached</div>}
            </div>
              <div className="pb-6 text-center">
                <AnimatePresence mode="popLayout">
                  <motion.div key={Math.round(c * 100)} initial={{ y: 20, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0 }} className="font-display text-6xl font-black text-white drop-shadow-[0_0_24px_rgba(0,229,255,.9)]">
                    {Math.round(c * 100)}%
                  </motion.div>
                </AnimatePresence>
                <div className="text-sm text-cyan-100/80">of today’s target</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-white/5 p-4 md:grid-cols-1 md:border-l md:border-t-0">
              <Stat label="Consumed today" value={fmtMl(done)} />
              <Stat label="Daily target" value={fmtMl(target)} sub={target > done ? undefined : 'done'} accent="text-white" />
              <Stat label="Remaining" value={fmtMl(Math.max(0, target - done))} accent="text-coral" />
              <Stat label="Daily streak" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} accent="text-neon" sub={c >= 1 ? 'today counted' : 'hit today to extend'} />
            </div>
          </div>
        </Tilt>
        <WaterAdjust />
        </div>

        <div className="grid gap-6">
          <Tilt className="p-5 sm:p-6" max={5}>
            <h2 className="mb-4 text-xl font-bold text-white">Quick log</h2>
            <QuickLog />
          </Tilt>
          {squad ? (
            <Tilt className="p-5 sm:p-6" max={5}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-400">Your squad</div>
                  <h2 className="text-xl font-bold text-white">{squad.name}</h2>
                </div>
                <div className="text-right">
                  <motion.div key={Math.round(ts)} initial={{ scale: 1.3, color: '#39ff88' }} animate={{ scale: 1, color: '#ffffff' }} className="font-display text-3xl font-black">{Math.round(ts)}%</motion.div>
                  <div className="text-xs text-slate-400">{rank ? `ranked #${rank}` : 'not ranked'}</div>
                </div>
              </div>
              <WaterBar value={ts / 100} />
              <div className="mt-6"><Podium /></div>
              <button className="btn-ghost mt-5 w-full" onClick={() => go('leaderboard')}>Full leaderboard</button>
            </Tilt>
          ) : (
            <Tilt className="p-6">
              <h2 className="text-xl font-bold text-white">Join a squad to compete</h2>
              <p className="mt-2 text-slate-400">Your sips count more with friends. Join with an invite code or start your own squad.</p>
              <button className="btn-primary mt-4" onClick={() => go('squad')}>Find a squad</button>
            </Tilt>
          )}
        </div>
      </div>
    </>
  )
}
