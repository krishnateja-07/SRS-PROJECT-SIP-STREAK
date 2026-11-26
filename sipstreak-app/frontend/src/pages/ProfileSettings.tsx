import { useState } from 'react'
import { useStore } from '../lib/store'
import { baseTarget, fmtMl } from '../lib/calc'
import { Avatar, PageHeader, Tilt } from '../components/ui'
import { go } from '../lib/nav'

const ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    return []
  }
})()

export function Profile() {
  const { me, updateProfile, db, toast } = useStore()
  const [w, setW] = useState(String(me?.weightKg ?? ''))
  if (!me) return null
  const squad = db.squads.find((s) => s.id === me.squadId)
  const zones = ZONES.includes(me.timezone) ? ZONES : [me.timezone, ...ZONES]
  return (
    <>
      <PageHeader title="Profile" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Tilt className="p-6" max={4}>
          <div className="flex items-center gap-4">
            <Avatar name={me.name} hue={squad?.hue ?? 190} size={64} ring />
            <div><div className="font-display text-2xl font-black text-white">{me.name}</div><div className="text-sm text-slate-400">{me.email} · {squad?.name ?? 'No squad'}</div></div>
          </div>
          <div className="mt-6 space-y-4">
            <div><label className="label" htmlFor="pn">Display name</label><input id="pn" className="input" defaultValue={me.name} maxLength={40} onBlur={(e) => e.target.value.trim().length >= 2 && updateProfile({ name: e.target.value.trim() })} /></div>
            <div>
              <label className="label" htmlFor="tz">Timezone (your day resets at local midnight)</label>
              <select id="tz" className="input" value={me.timezone} onChange={(e) => updateProfile({ timezone: e.target.value })}>
                {zones.map((z) => <option key={z}>{z}</option>)}
              </select>
            </div>
          </div>
        </Tilt>
        <Tilt className="p-6" max={4}>
          <h2 className="text-xl font-bold text-white">Daily target</h2>
          <div className="mt-2 font-display text-5xl font-black text-gradient">{fmtMl(baseTarget(me))}</div>
          <div className="text-sm text-slate-400">{me.customTargetMl ? 'Custom target' : `${me.weightKg} kg × ${me.mlPerKg} ml`}</div>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="wk">Weight (kg)</label>
              <input id="wk" className="input" type="number" min={25} max={250} value={w} onChange={(e) => setW(e.target.value)} onBlur={() => { const v = Number(w); if (v >= 25 && v <= 250) updateProfile({ weightKg: v }); else { setW(String(me.weightKg)); toast({ title: 'Weight must be 25–250 kg', tone: 'warn' }) } }} />
            </div>
            <div>
              <label className="label" htmlFor="mpk">ml per kg</label>
              <input id="mpk" className="input" type="number" min={20} max={50} value={me.mlPerKg} onChange={(e) => { const v = Number(e.target.value); if (v >= 20 && v <= 50) updateProfile({ mlPerKg: v }) }} />
            </div>
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm text-slate-300">
            <input type="checkbox" className="h-5 w-5 accent-cyan-400" checked={me.customTargetMl !== null} onChange={(e) => updateProfile({ customTargetMl: e.target.checked ? baseTarget(me) : null })} /> Set my own target instead
          </label>
          {me.customTargetMl !== null && <input className="input mt-3" type="number" min={500} max={6000} step={50} value={me.customTargetMl} onChange={(e) => { const v = Number(e.target.value); if (v >= 500 && v <= 6000) updateProfile({ customTargetMl: v }) }} aria-label="Custom target in ml" />}
          <p className="mt-5 rounded-xl bg-white/5 p-3 text-xs text-slate-400">Weight × 35 ml is a prototype estimate, not medical advice. Hydration needs vary with activity, climate, diet and health — follow your doctor’s guidance if you have one.</p>
        </Tilt>
      </div>
    </>
  )
}

function Switch({ on, set, label, sub }: { on: boolean; set: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div><div className="font-medium text-white">{label}</div>{sub && <div className="text-sm text-slate-400">{sub}</div>}</div>
      <button role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)} className={`relative h-8 w-14 shrink-0 rounded-full transition ${on ? 'bg-gradient-to-r from-cyan-400 to-neon shadow-glow' : 'bg-white/10'}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-7' : 'left-1'}`} />
      </button>
    </div>
  )
}

export function Settings() {
  const { settings: s, updateSettings, toast, resetDemo, logout, me, online } = useStore()
  const [confirm, setConfirm] = useState(false)
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  const enableNudges = async (v: boolean) => {
    updateSettings({ nudgesOn: v })
    if (v && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        const p = await Notification.requestPermission()
        if (p !== 'granted') toast({ title: 'Using in-app nudges', body: 'Browser notifications were not allowed, so nudges will appear here instead.', tone: 'info' })
      } catch {
        toast({ title: 'Using in-app nudges', body: 'This browser blocked the permission prompt.', tone: 'info' })
      }
    }
  }
  const testNudge = () => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('SipStreak', { body: 'Sip o’clock! Your squad is counting on you.', icon: './favicon.svg' })
        return
      }
    } catch { /* fall back */ }
    toast({ title: 'Hydration nudge', body: 'Sip o’clock! Your squad is counting on you.', tone: 'info' })
  }
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Tilt className="p-6" max={3}>
          <h2 className="text-xl font-bold text-white">Hourly hydration nudges</h2>
          <p className="mt-1 text-sm text-slate-400">Opt-in. Permission is only requested when you switch this on. Browser permission: <b className="text-slate-200">{perm}</b>.</p>
          <div className="mt-2 divide-y divide-white/5">
            <Switch on={s.nudgesOn} set={enableNudges} label="Send nudges" sub="Only inside your active hours" />
            <div className="grid grid-cols-3 gap-3 py-4">
              <div><label className="label" htmlFor="ns">From</label><input id="ns" className="input" type="time" value={s.nudgeStart} onChange={(e) => updateSettings({ nudgeStart: e.target.value })} /></div>
              <div><label className="label" htmlFor="ne">Until</label><input id="ne" className="input" type="time" value={s.nudgeEnd} onChange={(e) => updateSettings({ nudgeEnd: e.target.value })} /></div>
              <div><label className="label" htmlFor="ni">Every</label><select id="ni" className="input" value={s.nudgeEveryMin} onChange={(e) => updateSettings({ nudgeEveryMin: Number(e.target.value) })}><option value={30}>30 min</option><option value={60}>60 min</option><option value={90}>90 min</option><option value={120}>2 h</option></select></div>
            </div>
            <Switch on={s.fastDemo} set={(v) => updateSettings({ fastDemo: v })} label="Fast demo mode" sub="Simulate a nudge every 20 seconds" />
            <div className="pt-4"><button className="btn-ghost" onClick={testNudge}>Send a test nudge</button></div>
          </div>
        </Tilt>
        <Tilt className="p-6" max={3}>
          <h2 className="text-xl font-bold text-white">Game rules</h2>
          <div className="divide-y divide-white/5">
            <Switch on={s.caffeineOn} set={(v) => updateSettings({ caffeineOn: v })} label="Caffeine offset" sub="Add water to today’s target per coffee or energy drink" />
            <div className="grid grid-cols-2 gap-3 py-4">
              <div><label className="label" htmlFor="cb">Bonus per drink (ml)</label><input id="cb" className="input" type="number" min={0} max={500} step={50} value={s.caffeineBonusMl} onChange={(e) => updateSettings({ caffeineBonusMl: Math.max(0, Math.min(500, Number(e.target.value))) })} /></div>
              <div><label className="label" htmlFor="ts">Team streak threshold</label><select id="ts" className="input" value={s.teamStreakThreshold} onChange={(e) => updateSettings({ teamStreakThreshold: Number(e.target.value) })}>{[70, 75, 80, 90, 100].map((v) => <option key={v} value={v}>{v}%</option>)}</select></div>
            </div>
            <p className="py-3 text-xs text-slate-500">The +200 ml caffeine offset is a configurable game rule, not a medical requirement.</p>
            <Switch on={s.liveSim} set={(v) => updateSettings({ liveSim: v })} label="Live campus simulation" sub="Other squads log small sips every few seconds" />
          </div>
        </Tilt>
        <Tilt className="p-6" wrap="lg:col-span-2" max={2}>
          <h2 className="text-xl font-bold text-white">Data</h2>
          <p className="mt-1 text-sm text-slate-400">{me?.remote ? 'Your account and drinks are saved on the SipStreak server, so your squad sees them on every device. Sample squads and the demo account stay in this browser. Timestamps are UTC; daily totals use your timezone.' : online ? 'This is a demo account kept in this browser. Create a real account to sync with friends. Timestamps are UTC; daily totals use your timezone.' : 'This build stores everything in your browser (localStorage). Timestamps are UTC ISO strings; daily totals use your timezone.'}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {confirm ? (
              <>
                <span className="self-center text-sm text-coral">Reset all accounts and logs to the sample campus?</span>
                <button className="btn-ghost" onClick={async () => { await resetDemo(); setConfirm(false); go('login'); toast({ title: 'Demo data restored', tone: 'ok' }) }}>Yes, reset</button>
                <button className="btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
              </>
            ) : me?.remote ? null : (
              <button className="btn-ghost" onClick={() => setConfirm(true)}>Reset demo data</button>
            )}
            <button className="btn-ghost" onClick={() => { logout(); go('landing') }}>Log out</button>
          </div>
        </Tilt>
      </div>
    </>
  )
}
