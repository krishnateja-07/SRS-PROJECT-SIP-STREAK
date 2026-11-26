import { motion } from 'framer-motion'
import { useState } from 'react'
import { useStore } from '../lib/store'
import { MAX_LOG_ML } from '../lib/calc'

const PRESETS = [
  { ml: 250, label: 'Cup', h: 0.45 },
  { ml: 500, label: 'Bottle', h: 0.7 },
  { ml: 750, label: 'Tumbler', h: 0.95 },
]

function Vessel({ h }: { h: number }) {
  return (
    <svg viewBox="0 0 40 52" className="h-12 w-10" aria-hidden>
      <defs>
        <clipPath id={`v${h}`}><rect x="6" y="6" width="28" height="42" rx="6" /></clipPath>
      </defs>
      <rect x="6" y="6" width="28" height="42" rx="6" fill="rgba(255,255,255,.06)" stroke="rgba(160,250,255,.6)" strokeWidth="2" />
      <g clipPath={`url(#v${h})`}>
        <g style={{ transform: `translateY(${48 - h * 40}px)` }}>
          <g className="wave-x"><path d="M0 3 Q 5 0 10 3 T 20 3 T 30 3 T 40 3 T 50 3 T 60 3 T 70 3 T 80 3 V60 H0z" fill="#00e5ff" opacity=".85" /></g>
        </g>
      </g>
    </svg>
  )
}

export default function QuickLog({ compact = false }: { compact?: boolean }) {
  const { logDrink, toast } = useStore()
  const [custom, setCustom] = useState('')
  const [err, setErr] = useState('')
  const [pressed, setPressed] = useState<number | null>(null)
  const tap = (ml: number) => {
    const r = logDrink(ml)
    if (!r.ok) toast({ title: 'Not logged', body: r.error, tone: 'warn' })
    setPressed(ml)
    setTimeout(() => setPressed(null), 500)
  }
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {PRESETS.map((p) => (
          <motion.button
            key={p.ml}
            whileHover={{ y: -4, rotateX: 10 }}
            whileTap={{ y: 3, scale: 0.96 }}
            onClick={() => tap(p.ml)}
            className="group relative flex flex-col items-center gap-1 overflow-hidden rounded-2xl border border-cyan-300/25 bg-gradient-to-b from-cyan-300/15 to-cyan-500/5 px-2 py-3 shadow-[0_6px_0_rgba(0,120,150,.55),0_18px_30px_-12px_rgba(0,229,255,.6)] focus-visible:outline-neon"
            style={{ transformPerspective: 600 }}
            aria-label={`Log ${p.ml} ml ${p.label}`}
          >
            {pressed === p.ml && <motion.span className="absolute inset-0 rounded-2xl bg-cyan-300/30" initial={{ scale: 0, opacity: 1 }} animate={{ scale: 2, opacity: 0 }} transition={{ duration: 0.5 }} />}
            {!compact && <Vessel h={p.h} />}
            <span className="font-display text-xl font-black text-white sm:text-2xl">+{p.ml}<span className="text-sm font-bold text-cyan-200">ml</span></span>
            <span className="text-xs font-medium text-cyan-100/70">{p.label}</span>
          </motion.button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const r = logDrink(Number(custom), 'water', 'custom')
          if (r.ok) { setCustom(''); setErr('') } else setErr(r.error)
        }}
      >
        <input className="input" type="number" inputMode="numeric" min={1} max={MAX_LOG_ML} placeholder="Custom amount (ml)" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom amount in ml" />
        <button className="btn-ghost shrink-0">Log</button>
      </form>
      {err && <p className="mt-2 text-sm text-coral" role="alert">{err}</p>}
    </div>
  )
}
