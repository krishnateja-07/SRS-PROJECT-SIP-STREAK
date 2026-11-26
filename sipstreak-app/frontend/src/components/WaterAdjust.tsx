import { useState, type FormEvent } from 'react'
import { useStore } from '../lib/store'
import { dayKey, fmtMl, intake } from '../lib/calc'
import { Tilt } from './ui'

const CHIPS = [100, 250, 500]

/**
 * Fix the bottle: take water out, set the exact total you really drank, or clear the day.
 * Every change shows an Undo toast.
 */
export default function WaterAdjust() {
  const { db, me, now, removeWater, setTodayWater } = useStore()
  const [rm, setRm] = useState('')
  const [total, setTotal] = useState('')
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(false)
  if (!me) return null
  const stored = intake(db, me, dayKey(now, me.timezone))

  const run = (r: { ok: true } | { ok: false; error: string }, reset?: () => void) => {
    if (r.ok) { setErr(''); reset?.() } else setErr(r.error)
  }
  const onRemove = (e: FormEvent) => { e.preventDefault(); run(removeWater(Number(rm)), () => setRm('')) }
  const onSet = (e: FormEvent) => { e.preventDefault(); if (total.trim() === '') { setErr('Type the total you have drunk today.'); return } run(setTodayWater(Number(total)), () => setTotal('')) }

  return (
    <Tilt className="p-5 sm:p-6" max={3}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Adjust today’s water</h2>
          <p className="mt-1 text-sm text-slate-400">Logged too much, or forgot a drink? Fix your bottle here.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Stored in your bottle</div>
          <div className="font-display text-3xl font-black text-gradient tabular-nums">{stored.toLocaleString('en-IN')} <span className="text-base font-bold text-cyan-200">ml</span></div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <form onSubmit={onRemove} className="rounded-2xl border border-coral/20 bg-coral/[0.04] p-4">
          <label className="label" htmlFor="rm">Remove water</label>
          <div className="mb-3 flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button key={c} type="button" disabled={stored <= 0} onClick={() => run(removeWater(c))} className="min-h-[44px] rounded-xl border border-coral/30 bg-coral/10 px-3.5 font-display text-sm font-bold text-orange-200 transition hover:bg-coral/20 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Remove ${c} ml`}>
                −{c} ml
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input id="rm" className="input" type="number" inputMode="numeric" min={1} placeholder="Custom ml" value={rm} onChange={(e) => setRm(e.target.value)} />
            <button className="btn-coral shrink-0 px-4" disabled={stored <= 0}>Remove</button>
          </div>
        </form>

        <form onSubmit={onSet} className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4">
          <label className="label" htmlFor="tot">Set exact total for today</label>
          <p className="mb-3 text-xs text-slate-400">Type what you really drank; we add or remove the difference.</p>
          <div className="flex gap-2">
            <input id="tot" className="input" type="number" inputMode="numeric" min={0} max={10000} placeholder={`e.g. ${stored || 1500}`} value={total} onChange={(e) => setTotal(e.target.value)} />
            <button className="btn-primary shrink-0 px-4">Set</button>
          </div>
        </form>
      </div>

      {err && <p className="mt-3 text-sm text-coral" role="alert">{err}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
        <span className="text-xs text-slate-500">Your goal, streak and squad score update straight away.</span>
        {confirm ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-300">Clear all {fmtMl(stored)} from today?</span>
            <button className="btn-coral px-4" onClick={() => { run(removeWater(stored)); setConfirm(false) }}>Yes, clear</button>
            <button className="btn-ghost px-4" onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        ) : (
          <button className="btn-ghost px-4" disabled={stored <= 0} onClick={() => setConfirm(true)}>Clear today’s water</button>
        )}
      </div>
    </Tilt>
  )
}
