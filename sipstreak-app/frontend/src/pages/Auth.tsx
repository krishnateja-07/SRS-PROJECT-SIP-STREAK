import { motion } from 'framer-motion'
import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../lib/seed'
import { baseTarget, fmtMl } from '../lib/calc'
import { go } from '../lib/nav'
import { Bubbles, LiquidRing } from '../components/ui'
import { preload3D } from '../three/Bottle3D'

function Shell({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  // Fetch the 3D chunk while the user fills in the form, so the dashboard bottle appears instantly.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number }
    const run = () => { preload3D().catch(() => {}) }
    if (w.requestIdleCallback) w.requestIdleCallback(run)
    else setTimeout(run, 800)
  }, [])
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <Bubbles count={14} />
      <motion.div initial={{ opacity: 0, rotateX: 20, y: 30 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} transition={{ duration: 0.6 }} style={{ perspective: 1000 }} className="w-full max-w-md">
        <div className="glass p-7 sm:p-9">
          <button onClick={() => go('landing')} className="mb-6 flex items-center gap-2 font-display font-black text-white">
            <img src="./favicon.svg" alt="" className="h-7 w-7" /> SipStreak
          </button>
          <h1 className="text-3xl font-black text-white">{title}</h1>
          <p className="mb-6 mt-1 text-slate-400">{sub}</p>
          {children}
        </div>
      </motion.div>
    </div>
  )
}

export function Login() {
  const { login } = useStore()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent, em = email, p = pw) => {
    e.preventDefault()
    setBusy(true)
    const r = await login(em, p)
    setBusy(false)
    if (r.ok) go('dashboard')
    else setErr(r.error)
  }
  return (
    <Shell title="Welcome back, hero" sub="Log in to keep your streak alive.">
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label" htmlFor="em">Email</label><input id="em" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><label className="label" htmlFor="pw">Password</label><input id="pw" className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
        {err && <p className="text-sm text-coral" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <div className="mt-5 rounded-2xl border border-neon/25 bg-neon/5 p-4">
        <div className="text-sm font-semibold text-neon">Pitch demo account</div>
        <p className="mt-1 text-sm text-slate-400">Priya Sharma · Hostel Block B (2nd place, 72%)</p>
        <button className="btn-neon mt-3 w-full" disabled={busy} onClick={(e) => { setEmail(DEMO_EMAIL); setPw(DEMO_PASSWORD); submit(e, DEMO_EMAIL, DEMO_PASSWORD) }}>Log in as Priya</button>
      </div>
      <p className="mt-5 text-center text-sm text-slate-400">New here? <button className="font-semibold text-cyan-300 hover:underline" onClick={() => go('signup')}>Create an account</button></p>
    </Shell>
  )
}

export function Signup() {
  const { signup } = useStore()
  const [f, setF] = useState({ name: '', email: '', password: '', weight: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const w = Number(f.weight)
  const preview = w >= 25 && w <= 250 ? Math.round((w * 35) / 10) * 10 : null
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const r = await signup({ name: f.name, email: f.email, password: f.password, weightKg: w })
    setBusy(false)
    if (r.ok) go('setup')
    else setErr(r.error)
  }
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Shell title="Become a HydroHero" sub="Create your account and get a personal daily target.">
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label" htmlFor="n">Name</label><input id="n" className="input" autoComplete="name" value={f.name} onChange={set('name')} required /></div>
        <div><label className="label" htmlFor="e">Email</label><input id="e" className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></div>
        <div><label className="label" htmlFor="p">Password</label><input id="p" className="input" type="password" autoComplete="new-password" minLength={6} value={f.password} onChange={set('password')} required /></div>
        <div>
          <label className="label" htmlFor="w">Body weight (kg)</label>
          <input id="w" className="input" type="number" inputMode="decimal" min={25} max={250} step="0.1" value={f.weight} onChange={set('weight')} required />
          <p className="mt-2 text-sm text-slate-400">{preview ? <>Suggested target: <b className="text-cyan-300">{fmtMl(preview)}</b> a day ({f.weight} kg × 35 ml)</> : 'We use weight × 35 ml as a starting estimate.'}</p>
        </div>
        {err && <p className="text-sm text-coral" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-400">Already a hero? <button className="font-semibold text-cyan-300 hover:underline" onClick={() => go('login')}>Log in</button></p>
    </Shell>
  )
}

export function Setup() {
  const { me, updateProfile, joinSquad, createSquad, toast, online } = useStore()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  if (!me) return null
  const t = baseTarget(me)
  return (
    <Shell title={`Hi ${me.name.split(' ')[0]}, let’s set your goal`} sub="You can change any of this later in Profile.">
      <div className="flex items-center gap-5">
        <LiquidRing value={0.65} size={120} label="preview" />
        <div>
          <div className="text-sm text-slate-400">Daily target</div>
          <div className="font-display text-4xl font-black text-gradient">{fmtMl(t)}</div>
          <div className="text-xs text-slate-500">{me.weightKg} kg × {me.mlPerKg} ml</div>
        </div>
      </div>
      <label className="label mt-6" htmlFor="mk">ml per kg ({me.mlPerKg})</label>
      <input id="mk" type="range" min={25} max={45} value={me.mlPerKg} onChange={(e) => updateProfile({ mlPerKg: Number(e.target.value) })} className="w-full accent-cyan-400" />
      <p className="mt-2 rounded-xl bg-white/5 p-3 text-xs text-slate-400">35 ml/kg is a prototype heuristic, not medical advice. Needs vary with activity, climate, diet and health.</p>

      <div className="mt-6 space-y-3 border-t border-white/10 pt-6">
        <div className="font-display font-bold text-white">Join a squad</div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const r = joinSquad(code); if (r.ok) { toast({ title: 'Squad joined!', tone: 'ok' }); go('dashboard') } else setErr(r.error) }}>
          <input className="input font-mono uppercase" placeholder="Invite code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Invite code" />
          <button className="btn-primary">Join</button>
        </form>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const r = createSquad(name); if (r.ok) { toast({ title: 'Squad created!', body: 'Share your invite code from My Squad.', tone: 'ok' }); go('squad') } else setErr(r.error) }}>
          <input className="input" placeholder="…or name a new squad" value={name} onChange={(e) => setName(e.target.value)} aria-label="New squad name" />
          <button className="btn-ghost">Create</button>
        </form>
        {err && <p className="text-sm text-coral" role="alert">{err}</p>}
        {me.remote || online ? <p className="text-xs text-slate-500">Create a squad, then share its invite code with 3–7 friends so they can join from their own phones.</p> : <p className="text-xs text-slate-500">Sample codes: HBA7Q2 · HBB4K9 · AQK3M8 · HYD6P5</p>}
        <button className="w-full py-2 text-sm text-slate-400 hover:text-white" onClick={() => go('dashboard')}>Skip for now →</button>
      </div>
    </Shell>
  )
}
