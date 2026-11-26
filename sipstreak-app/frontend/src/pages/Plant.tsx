import { motion } from 'framer-motion'
import { useState } from 'react'
import { useStore } from '../lib/store'
import { completion, dayKey, dayProgress, fmtMl, intake, personalStreak, targetFor } from '../lib/calc'
import { PageHeader, Tilt, WaterBar } from '../components/ui'

const STAGES = ['Seed', 'Sprout', 'Seedling', 'Young plant', 'Leafy', 'Budding', 'In bloom']

export default function Plant() {
  const { db, me, now, settings, logDrink } = useStore()
  const [pokes, setPokes] = useState(0)
  if (!me) return null
  const day = dayKey(now, me.timezone)
  const streak = personalStreak(db, me, now)
  const done = intake(db, me, day)
  const target = targetFor(db, me, day)
  const expected = target * dayProgress(settings.nudgeStart, settings.nudgeEnd, now)
  const pace = expected > 0 ? done / expected : 1
  const mood: 'thriving' | 'okay' | 'wilting' = completion(db, me, day) >= 1 || pace >= 0.9 ? 'thriving' : pace >= 0.6 ? 'okay' : 'wilting'
  const stage = Math.min(6, streak + (completion(db, me, day) >= 0.5 ? 1 : 0))
  const droop = mood === 'wilting' ? 22 : mood === 'okay' ? 8 : 0
  const leaf = mood === 'wilting' ? '#7c9a6a' : mood === 'okay' ? '#3ee6a0' : '#39ff88'
  const stemH = 30 + stage * 22

  return (
    <>
      <PageHeader title="Plant Companion" sub="Your seedling grows with your streak and droops when you fall behind today’s pace." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Tilt className="p-6" max={6}>
          <button className="block w-full" aria-label="Tap your plant" onClick={() => setPokes((p) => p + 1)}>
            <svg viewBox="0 0 300 320" className="mx-auto h-[360px] w-full max-w-md">
              <defs>
                <radialGradient id="glowp" cx="50%" cy="80%" r="60%"><stop offset="0" stopColor={leaf} stopOpacity=".35" /><stop offset="1" stopColor={leaf} stopOpacity="0" /></radialGradient>
                <linearGradient id="pot3d" x1="0" x2="1"><stop offset="0" stopColor="#0b4f66" /><stop offset=".45" stopColor="#1fc8b4" /><stop offset="1" stopColor="#063446" /></linearGradient>
              </defs>
              <ellipse cx="150" cy="250" rx="140" ry="70" fill="url(#glowp)" />
              <ellipse cx="150" cy="305" rx="80" ry="10" fill="#000" opacity=".45" />
              <motion.g key={pokes} animate={{ rotate: pokes ? [0, -6, 5, -3, 0] : 0 }} transition={{ duration: 0.9 }} style={{ originX: '150px', originY: '240px' }}>
                <motion.g animate={{ rotate: [droop - 2, droop + 2, droop - 2] }} transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }} style={{ originX: '150px', originY: '240px' }}>
                  {stage > 0 && <motion.path d={`M150 240 C 145 ${240 - stemH / 2} 158 ${240 - stemH / 2} 150 ${240 - stemH}`} stroke={leaf} strokeWidth="6" fill="none" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />}
                  {Array.from({ length: stage }, (_, i) => {
                    const y = 236 - ((i + 1) * stemH) / (stage + 1)
                    const left = i % 2 === 0
                    return (
                      <g key={i} transform={`rotate(${left ? 25 + droop : -25 - droop} 150 ${y})`}>
                        <motion.ellipse cx={left ? 128 : 172} cy={y} rx="22" ry="9" fill={leaf} opacity={0.92} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + i * 0.12, type: 'spring' }} />
                      </g>
                    )
                  })}
                  {stage >= 5 && (
                    <motion.g initial={{ scale: 0 }} animate={{ scale: mood === 'wilting' ? 0.7 : 1 }} transition={{ type: 'spring', delay: 1 }} style={{ originX: '150px', originY: `${240 - stemH}px` }}>
                      {[0, 60, 120, 180, 240, 300].map((a) => <ellipse key={a} cx="150" cy={240 - stemH - 13} rx="7" ry="14" fill={stage >= 6 ? '#00e5ff' : '#a5f3fc'} transform={`rotate(${a} 150 ${240 - stemH})`} />)}
                      <circle cx="150" cy={240 - stemH} r="7" fill="#e6fffb" />
                    </motion.g>
                  )}
                  {stage === 0 && <ellipse cx="150" cy="236" rx="9" ry="6" fill="#a87b4f" />}
                </motion.g>
              </motion.g>
              <path d="M88 240 h124 l-14 64 h-96z" fill="url(#pot3d)" />
              <ellipse cx="150" cy="240" rx="62" ry="12" fill="#5ff0e2" />
              <ellipse cx="150" cy="242" rx="54" ry="8" fill="#20130b" />
              {mood === 'thriving' && [0, 1, 2].map((i) => <motion.circle key={i} cx={110 + i * 40} cy="200" r="3" fill="#a5f3fc" animate={{ y: [-10, -80], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 3, delay: i }} />)}
            </svg>
          </button>
          <div className="text-center">
            <div className="font-display text-2xl font-black text-white">{STAGES[stage]}</div>
            <div className={`mt-1 font-semibold ${mood === 'thriving' ? 'text-neon' : mood === 'okay' ? 'text-cyan-300' : 'text-coral'}`}>{mood === 'thriving' ? 'Thriving — you’re on schedule' : mood === 'okay' ? 'Doing okay — a sip would help' : 'Wilting — you’re behind today’s pace'}</div>
          </div>
        </Tilt>
        <Tilt className="p-6" max={5}>
          <h2 className="text-xl font-bold text-white">How your plant grows</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li>One growth stage per day of your personal streak (currently <b className="text-neon">{streak}</b>), plus one once you pass 50% today.</li>
            <li>Mood compares today’s intake with the pace expected by now in your active hours ({settings.nudgeStart}–{settings.nudgeEnd}).</li>
          </ul>
          <div className="mt-6">
            <div className="mb-1 flex justify-between text-sm"><span className="text-slate-400">On-schedule meter</span><span className="text-white">{fmtMl(done)} of {fmtMl(Math.round(expected))} expected by now</span></div>
            <WaterBar value={Math.min(1, pace)} height={14} />
          </div>
          <button className="btn-neon mt-6 w-full" onClick={() => logDrink(250)}>Water it (+250 ml for you)</button>
        </Tilt>
      </div>
    </>
  )
}
