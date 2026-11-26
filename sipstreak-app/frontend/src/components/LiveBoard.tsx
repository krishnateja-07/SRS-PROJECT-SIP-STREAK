import { motion, LayoutGroup } from 'framer-motion'
import { useStore } from '../lib/store'
import { dayKey, fmtMl, leaderboard, MIN_SQUAD } from '../lib/calc'
import { Avatar, SquadBadge, WaterBar } from './ui'

function Crown({ size }: { size: number }) {
  return (
    <motion.svg aria-hidden viewBox="0 0 32 24" width={size} height={size * 0.75} className="absolute left-1/2 z-10 -translate-x-1/2 drop-shadow-[0_0_10px_rgba(57,255,136,.9)]" style={{ top: -size * 0.62 }} initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
      <path d="M3 20 L1 6 L9 12 L16 2 L23 12 L31 6 L29 20 Z" fill="#39ff88" stroke="#b9ffd5" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="16" cy="2.6" r="2" fill="#e6fffb" />
    </motion.svg>
  )
}

/** Animated 3D podium + ranked rows. Rows re-order with layout animation when scores change. */
export function Podium({ big = false }: { big?: boolean }) {
  const { db, me, now } = useStore()
  const board = leaderboard(db, dayKey(now, me?.timezone ?? 'UTC')).filter((r) => r.eligible)
  const top = [board[1], board[0], board[2]]
  const heights = big ? [150, 200, 115] : [96, 130, 72]
  const place = [2, 1, 3]
  return (
    <LayoutGroup>
      <div className="grid grid-cols-3 items-end gap-3" style={{ perspective: 900 }}>
        {top.map((r, i) =>
          r ? (
            <motion.div layout key={r.squad.id} layoutId={`pod-${r.squad.id}`} transition={{ type: 'spring', stiffness: 120, damping: 18 }} className="flex flex-col items-center text-center">
              <motion.div className="relative" animate={place[i] === 1 ? { y: [0, -6, 0] } : {}} transition={{ repeat: Infinity, duration: 2.4 }}>
                {place[i] === 1 && <Crown size={big ? 34 : 24} />}
                <SquadBadge name={r.squad.name} hue={r.squad.hue} size={big ? 64 : 46} />
              </motion.div>
              <div className={`mt-2 line-clamp-2 font-display font-bold ${r.squad.id === me?.squadId ? 'text-neon' : 'text-white'} ${big ? 'text-base' : 'text-xs sm:text-sm'}`}>{r.squad.name}</div>
              <div className="font-display text-lg font-black text-cyan-200">{Math.round(r.score)}%</div>
              <div className="relative mt-3 w-full" style={{ transform: 'rotateX(18deg)', transformStyle: 'preserve-3d' }}>
                <div className="absolute inset-x-0 -top-4 h-4 origin-bottom rounded-t-lg" style={{ transform: 'skewX(-30deg)', background: place[i] === 1 ? 'linear-gradient(#b9ffd5,#39ff88)' : 'linear-gradient(#bff8ff,#3ee6d4)' }} />
                <motion.div layout className="grid place-items-center rounded-b-lg font-display font-black text-abyss" initial={{ height: 0 }} animate={{ height: heights[i] }} style={{ background: place[i] === 1 ? 'linear-gradient(180deg,#39ff88,#0c7d56)' : 'linear-gradient(180deg,#3ee6d4,#0b4f66)', fontSize: big ? 40 : 26, boxShadow: place[i] === 1 ? '0 20px 50px -12px rgba(57,255,136,.6)' : '0 20px 40px -14px rgba(0,229,255,.45)' }}>
                  {place[i]}
                </motion.div>
              </div>
            </motion.div>
          ) : (
            <div key={i} />
          ),
        )}
      </div>
    </LayoutGroup>
  )
}

export function RankList({ showMembers = false }: { showMembers?: boolean }) {
  const { db, me, now } = useStore()
  const board = leaderboard(db, dayKey(now, me?.timezone ?? 'UTC'))
  return (
    <ol className="space-y-2.5">
      {board.map((r, i) => {
        const mine = r.squad.id === me?.squadId
        return (
          <motion.li layout key={r.squad.id} transition={{ type: 'spring', stiffness: 140, damping: 20 }} className={`flex items-center gap-3 rounded-2xl border p-3 ${mine ? 'border-neon/40 bg-neon/[0.07] shadow-neon' : 'border-white/5 bg-white/[0.03]'}`}>
            <span className={`w-7 text-center font-display text-lg font-black ${i < 3 && r.eligible ? 'text-cyan-300' : 'text-slate-500'}`}>{r.eligible ? i + 1 : '–'}</span>
            <SquadBadge name={r.squad.name} hue={r.squad.hue} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="truncate font-display font-bold text-white">{r.squad.name}</span>
                {mine && <span className="chip border-neon/40 bg-neon/10 text-neon">You</span>}
                {!r.eligible && <span className="text-xs text-slate-500">needs {MIN_SQUAD} members to rank</span>}
              </div>
              <div className="mt-1.5"><WaterBar value={r.score / 100} height={8} /></div>
              {showMembers && (
                <div className="mt-2 flex -space-x-2">
                  {r.members.map((m) => <span key={m.id} title={m.name}><Avatar name={m.name} hue={r.squad.hue} size={26} /></span>)}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="font-display text-xl font-black text-white tabular-nums">{Math.round(r.score)}%</div>
              <div className="whitespace-nowrap text-xs text-slate-500">{fmtMl(r.totalMl)} · {r.members.length} ppl</div>
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}
