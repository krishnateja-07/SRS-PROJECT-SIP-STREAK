import { motion } from 'framer-motion'
import { useState } from 'react'
import { useStore } from '../lib/store'
import { completion, dayKey, fmtMl, leaderboard, MAX_SQUAD, MIN_SQUAD, membersOf, teamScore, teamStreak, teamTarget, teamTotal } from '../lib/calc'
import { Avatar, PageHeader, SquadBadge, Stat, Tilt, WaterBar } from '../components/ui'
import { isSampleSquad } from '../lib/remote'

export default function Squad() {
  const { db, me, now, createSquad, joinSquad, leaveSquad, toast, settings } = useStore()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  if (!me) return null
  const day = dayKey(now, me.timezone)
  const squad = db.squads.find((s) => s.id === me.squadId)
  const members = squad ? membersOf(db, squad.id).sort((a, b) => completion(db, b, day) - completion(db, a, day)) : []
  const board = leaderboard(db, day)

  const copy = (text: string, what: string) =>
    navigator.clipboard?.writeText(text).then(() => toast({ title: `${what} copied`, tone: 'ok' }), () => toast({ title: what, body: text, tone: 'info' }))

  const join = (c: string) => {
    const r = joinSquad(c)
    if (r.ok) { toast({ title: 'Welcome to the squad!', tone: 'ok' }); setErr(''); setCode('') } else setErr(r.error)
  }

  return (
    <>
      <PageHeader title="My Squad" sub={`Squads have ${MIN_SQUAD}–${MAX_SQUAD} members. Everyone’s goal counts, capped at 100%.`} />
      {squad ? (
        <Tilt className="p-6 sm:p-8" max={3}>
          <div className="flex flex-wrap items-center gap-5">
            <SquadBadge name={squad.name} hue={squad.hue} size={76} />
            <div className="flex-1">
              <h2 className="text-3xl font-black text-white">{squad.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                {members.length}/{MAX_SQUAD} members · Invite code
                <button className="chip font-mono text-sm hover:bg-cyan-300/20" onClick={() => copy(squad.code, 'Invite code')}>{squad.code}</button>
                <button className="chip hover:bg-cyan-300/20" onClick={() => copy(`Join my SipStreak squad "${squad.name}" with code ${squad.code}`, 'Invite message')}>Copy invite</button>
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-5xl font-black text-gradient">{Math.round(teamScore(db, squad.id, day))}%</div>
              <div className="text-sm text-slate-400">team completion</div>
            </div>
          </div>
          {members.length < MIN_SQUAD && <p className="mt-4 rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">Invite {MIN_SQUAD - members.length} more {MIN_SQUAD - members.length === 1 ? 'friend' : 'friends'} to appear on the leaderboard.</p>}
          <div className="mt-6"><WaterBar value={teamScore(db, squad.id, day) / 100} height={16} /></div>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total water today" value={fmtMl(teamTotal(db, squad.id, day))} />
            <Stat label="Daily team target" value={fmtMl(teamTarget(db, squad.id, day))} accent="text-white" />
            <Stat label="Team streak" value={`${teamStreak(db, squad.id, me.timezone, settings.teamStreakThreshold, now)} days`} sub={`days at ≥${settings.teamStreakThreshold}%`} accent="text-neon" />
            <Stat label="Campus rank" value={`#${board.findIndex((r) => r.squad.id === squad.id) + 1}`} sub={`of ${board.length} squads`} />
          </div>
          <h3 className="mt-8 text-lg font-bold text-white">Members today</h3>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {members.map((m, i) => {
              const c = completion(db, m, day)
              return (
                <motion.li key={m.id} initial={{ opacity: 0, y: 20, rotateX: 30 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: i * 0.05 }} className={`flex items-center gap-3 rounded-2xl border p-3 ${m.id === me.id ? 'border-neon/40 bg-neon/5' : 'border-white/5 bg-white/[0.03]'}`}>
                  <Avatar name={m.name} hue={squad.hue} size={42} ring={m.id === me.id} />
                  <div className="flex-1">
                    <div className="flex justify-between gap-2">
                      <span className="truncate font-semibold text-white">{m.name}{m.id === me.id ? ' (you)' : ''}</span>
                      <span className="whitespace-nowrap font-display font-bold tabular-nums text-cyan-200">{Math.round(c * 100)}%{c > 1 && <span className="text-xs text-slate-500"> · counts 100</span>}</span>
                    </div>
                    <div className="mt-1.5"><WaterBar value={Math.min(1, c)} height={8} /></div>
                  </div>
                </motion.li>
              )
            })}
          </ul>
          <div className="mt-6 flex justify-end">
            {confirmLeave ? (
              <div className="flex items-center gap-2 text-sm"><span className="text-slate-400">Leave {squad.name}?</span><button className="btn-ghost" onClick={() => { leaveSquad(); setConfirmLeave(false) }}>Yes, leave</button><button className="btn-ghost" onClick={() => setConfirmLeave(false)}>Cancel</button></div>
            ) : (
              <button className="text-sm text-slate-500 hover:text-coral" onClick={() => setConfirmLeave(true)}>Leave squad</button>
            )}
          </div>
        </Tilt>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Tilt className="p-6">
            <h2 className="text-xl font-bold text-white">Join with an invite code</h2>
            <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); join(code) }}>
              <input className="input font-mono uppercase" maxLength={6} placeholder="e.g. HBB4K9" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Invite code" />
              <button className="btn-primary">Join</button>
            </form>
          </Tilt>
          <Tilt className="p-6">
            <h2 className="text-xl font-bold text-white">Start a new squad</h2>
            <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); const r = createSquad(name); if (r.ok) { toast({ title: 'Squad created!', body: 'Share the invite code with 3–7 friends.', tone: 'ok' }); setName('') } else setErr(r.error) }}>
              <input className="input" maxLength={32} placeholder="Squad name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Squad name" />
              <button className="btn-neon">Create</button>
            </form>
          </Tilt>
          {err && <p className="text-sm text-coral md:col-span-2" role="alert">{err}</p>}
        </div>
      )}

      <h2 className="mb-4 mt-10 text-2xl font-black text-white">Explore squads</h2>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {board.filter((r) => r.squad.id !== me.squadId).map((r) => (
          <Tilt key={r.squad.id} className="p-5">
            <div className="flex items-center gap-3">
              <SquadBadge name={r.squad.name} hue={r.squad.hue} size={46} />
              <div><div className="font-display font-bold text-white">{r.squad.name}</div><div className="text-xs text-slate-400">{r.members.length}/{MAX_SQUAD} members</div></div>
            </div>
            <div className="mt-4 flex justify-between text-sm"><span className="text-slate-400">Today</span><span className="font-display font-bold text-white">{Math.round(r.score)}%</span></div>
            <div className="mt-1.5"><WaterBar value={r.score / 100} height={8} /></div>
            <div className="mt-3 flex -space-x-2">{r.members.map((m) => <span key={m.id} title={m.name}><Avatar name={m.name} hue={r.squad.hue} size={28} /></span>)}</div>
            {(() => {
              const sampleLocked = !!me.remote && isSampleSquad(r.squad.id)
              return (
                <button className="btn-ghost mt-4 w-full" disabled={sampleLocked || r.members.length >= MAX_SQUAD} onClick={() => join(r.squad.code)}>
                  {sampleLocked ? 'Sample squad' : r.members.length >= MAX_SQUAD ? 'Full' : squad ? 'Switch to this squad' : 'Join'}
                </button>
              )
            })()}
          </Tilt>
        ))}
      </div>
      {squad && err && <p className="mt-3 text-sm text-coral" role="alert">{err}</p>}
    </>
  )
}
