import { useStore } from '../lib/store'
import { dayKey, leaderboard } from '../lib/calc'
import { PageHeader, Tilt } from '../components/ui'
import { Podium, RankList } from '../components/LiveBoard'
import QuickLog from '../components/QuickLog'

export default function Leaderboard() {
  const { db, me, now, settings, updateSettings } = useStore()
  const board = leaderboard(db, dayKey(now, me?.timezone ?? 'UTC'))
  const eligible = board.filter((r) => r.eligible)
  const campus = eligible.length ? eligible.reduce((a, r) => a + r.score, 0) / eligible.length : 0
  return (
    <>
      <PageHeader
        title="HydroHero Leaderboard"
        sub="Squads ranked by the average capped completion of every member, today."
        right={
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
            <span className={`h-2 w-2 rounded-full ${settings.liveSim ? 'animate-pulse bg-neon' : 'bg-slate-500'}`} />
            Live campus simulation
            <input type="checkbox" className="h-5 w-5 accent-cyan-400" checked={settings.liveSim} onChange={(e) => updateSettings({ liveSim: e.target.checked })} />
          </label>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Tilt className="p-6 sm:p-8" max={3}>
          <div className="mb-8 flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-white">Today’s podium</h2>
            <span className="text-sm text-slate-400">Campus score <b className="font-display text-lg text-cyan-200">{Math.round(campus)}%</b></span>
          </div>
          <Podium big />
          <div className="mt-8 border-t border-white/5 pt-6">
            <h3 className="mb-3 text-sm font-semibold text-slate-400">Log a drink and watch the ranks move</h3>
            <QuickLog compact />
          </div>
        </Tilt>
        <Tilt className="p-5 sm:p-6" max={3}>
          <h2 className="mb-4 text-xl font-bold text-white">All squads</h2>
          <RankList showMembers />
        </Tilt>
      </div>
    </>
  )
}
