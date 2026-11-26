import { BarController, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip, type ChartOptions } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { useStore } from '../lib/store'
import { completion, dayKey, fmtMl, intake, lastDays, leaderboard, personalStreak, targetFor, teamScore, teamStreak } from '../lib/calc'
import { PageHeader, Stat, Tilt } from '../components/ui'

ChartJS.register(BarController, LineController, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler)
ChartJS.defaults.color = '#94a3b8'
ChartJS.defaults.font.family = 'Inter, sans-serif'

const label = (k: string, today: string) => (k === today ? 'Today' : new Date(`${k}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }))

const baseOpts = (unit: string, max?: number): ChartOptions<'bar'> => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { labels: { boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 3 } },
    tooltip: { backgroundColor: '#0a2350', borderColor: 'rgba(0,229,255,.35)', borderWidth: 1, padding: 10, callbacks: { label: (c) => `${c.dataset.label}: ${Math.round(Number(c.raw))}${unit}` } },
  },
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true, max, grid: { color: 'rgba(148,163,184,.08)' }, ticks: { callback: (v) => `${v}${unit}` } },
  },
})

export default function History() {
  const { db, me, now, settings } = useStore()
  if (!me) return null
  const today = dayKey(now, me.timezone)
  const days = lastDays(7, me.timezone, now)
  const labels = days.map((d) => label(d, today))
  const mine = days.map((d) => intake(db, me, d))
  const targets = days.map((d) => targetFor(db, me, d))
  const hits = days.filter((d) => completion(db, me, d) >= 1).length
  const squad = db.squads.find((s) => s.id === me.squadId)
  const team = squad ? days.map((d) => teamScore(db, squad.id, d)) : []
  const campus = days.map((d) => {
    const b = leaderboard(db, d).filter((r) => r.eligible)
    return b.length ? b.reduce((a, r) => a + r.score, 0) / b.length : 0
  })

  const grad = (ctx: { chart: ChartJS }) => {
    const { ctx: c, chartArea } = ctx.chart
    if (!chartArea) return '#00e5ff'
    const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top)
    g.addColorStop(0, 'rgba(0,229,255,.25)')
    g.addColorStop(1, 'rgba(57,255,136,.95)')
    return g
  }

  return (
    <>
      <PageHeader title="Weekly History" sub="Your last seven local days. Logs are never wiped at midnight — each day is just a different slice." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Personal streak" value={`${personalStreak(db, me, now)} days`} accent="text-neon" />
        <Stat label="Targets hit this week" value={`${hits}/7`} />
        <Stat label="7-day total" value={fmtMl(mine.reduce((a, b) => a + b, 0))} accent="text-white" />
        <Stat label="Team streak" value={squad ? `${teamStreak(db, squad.id, me.timezone, settings.teamStreakThreshold, now)} days` : '—'} sub={`days at ≥${settings.teamStreakThreshold}%`} accent="text-neon" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Tilt className="p-5 sm:p-6" max={3} as3d={false}>
          <h2 className="text-lg font-bold text-white">Personal intake vs target</h2>
          <div className="relative mt-4 h-72">
            <Chart
              type="bar"
              data={{
                labels,
                datasets: [
                  { type: 'bar', label: 'Water', data: mine, backgroundColor: (c) => grad(c), borderRadius: 10, borderSkipped: false, maxBarThickness: 42 },
                  { type: 'line' as const, label: 'Target', data: targets, borderColor: '#ff7a59', borderDash: [6, 5], pointRadius: 3, pointBackgroundColor: '#ff7a59', tension: 0.3 } as never,
                ],
              }}
              options={baseOpts(' ml')}
            />
          </div>
          <div className="mt-4 flex justify-between gap-1">
            {days.map((d, i) => (
              <div key={d} className="flex flex-1 flex-col items-center gap-1 text-xs text-slate-500">
                <span className={`grid h-8 w-8 place-items-center rounded-full border ${completion(db, me, d) >= 1 ? 'border-neon bg-neon/20 text-neon shadow-neon' : 'border-white/10 text-slate-500'}`}>{completion(db, me, d) >= 1 ? '✓' : Math.round(completion(db, me, d) * 100)}</span>
                {labels[i].slice(0, 3)}
              </div>
            ))}
          </div>
        </Tilt>
        <Tilt className="p-5 sm:p-6" max={3} as3d={false}>
          <h2 className="text-lg font-bold text-white">{squad ? `${squad.name} vs campus` : 'Campus average'}</h2>
          <div className="relative mt-4 h-72">
            <Chart
              type="bar"
              data={{
                labels,
                datasets: [
                  ...(squad ? [{ type: 'bar' as const, label: squad.name, data: team, backgroundColor: 'rgba(0,229,255,.75)', hoverBackgroundColor: '#39ff88', borderRadius: 10, maxBarThickness: 42 }] : []),
                  { type: 'line' as const, label: 'Campus average', data: campus, borderColor: '#a5f3fc', backgroundColor: 'rgba(165,243,252,.08)', fill: true, pointRadius: 3, tension: 0.35 } as never,
                ],
              }}
              options={baseOpts('%', 100)}
            />
          </div>
          <p className="mt-4 text-sm text-slate-400">Team score = average of each member’s completion, capped at 100%.</p>
        </Tilt>
      </div>
    </>
  )
}
