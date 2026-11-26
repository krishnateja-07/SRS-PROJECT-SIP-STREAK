import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion'
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import { useStore } from '../lib/store'
import { go, type View } from '../lib/nav'

type ArtKind = 'phone' | 'squad' | 'podium' | 'plant' | 'map' | 'qr'

interface CardDef {
  no: string
  tag: string
  title: string
  sub: string
  bg: string
  ink: string
  art: ArtKind
  to: View
}

const CARDS: CardDef[] = [
  { no: '01', tag: 'LOG', title: 'Quick-tap logging', sub: '+250 · +500 · +750 ml, or your own amount', bg: 'linear-gradient(165deg,#ffd45e 0%,#ff8a2f 55%,#e0421f 100%)', ink: '#2b1200', art: 'phone', to: 'dashboard' },
  { no: '02', tag: 'SQUAD', title: 'Hydration squads', sub: '4–8 friends, one invite code', bg: 'linear-gradient(165deg,#3df2c0 0%,#12a98a 55%,#06604f 100%)', ink: '#022a22', art: 'squad', to: 'squad' },
  { no: '03', tag: 'RANK', title: 'Fair leaderboard', sub: 'Everyone counts up to 100%', bg: 'linear-gradient(165deg,#ff9ad5 0%,#c04fd6 55%,#5b2bb0 100%)', ink: '#240a3a', art: 'podium', to: 'leaderboard' },
  { no: '04', tag: 'STREAK', title: 'Plant companion', sub: 'Grows with every streak day', bg: 'linear-gradient(165deg,#d8ff6a 0%,#6fcf3a 55%,#1f7d2c 100%)', ink: '#10290a', art: 'plant', to: 'plant' },
  { no: '05', tag: 'MAP', title: 'Fountain map', sub: 'Only verified stations get a badge', bg: 'linear-gradient(165deg,#7fd0ff 0%,#2f7bff 55%,#1a2fa8 100%)', ink: '#061440', art: 'map', to: 'map' },
  { no: '06', tag: 'SCAN', title: 'Bottle QR sticker', sub: 'Scan it and +500 ml is logged', bg: 'linear-gradient(165deg,#ffffff 0%,#ffd0e0 55%,#ff7aa6 100%)', ink: '#3a0a1c', art: 'qr', to: 'hydration' },
]

function Art({ kind, ink }: { kind: ArtKind; ink: string }) {
  const c = { stroke: ink, fill: 'none', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden>
      {kind === 'phone' && (
        <>
          <rect x="34" y="8" width="52" height="104" rx="10" {...c} />
          <path d="M60 36 C51 49 47 56 47 65 a13 13 0 0 0 26 0 C73 56 69 49 60 36z" fill={ink} opacity=".9" />
          <rect x="50" y="94" width="20" height="5" rx="2.5" fill={ink} opacity=".5" />
        </>
      )}
      {kind === 'squad' && (
        <>
          {[[38, 42], [82, 42], [38, 84], [82, 84]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="15" fill={ink} opacity={0.35 + i * 0.18} />)}
          <path d="M38 42 L82 42 L82 84 L38 84 Z M38 42 L82 84 M82 42 L38 84" {...c} strokeWidth="1.6" opacity=".6" />
        </>
      )}
      {kind === 'podium' && (
        <>
          <rect x="18" y="66" width="26" height="40" rx="4" fill={ink} opacity=".5" />
          <rect x="47" y="40" width="26" height="66" rx="4" fill={ink} opacity=".9" />
          <rect x="76" y="80" width="26" height="26" rx="4" fill={ink} opacity=".35" />
          <path d="M52 30 l4 -10 l4 7 l4 -7 l4 10 z" fill={ink} />
        </>
      )}
      {kind === 'plant' && (
        <>
          <path d="M60 104 C58 80 62 62 60 40" {...c} />
          <ellipse cx="44" cy="62" rx="16" ry="8" transform="rotate(-30 44 62)" fill={ink} opacity=".75" />
          <ellipse cx="76" cy="50" rx="16" ry="8" transform="rotate(30 76 50)" fill={ink} opacity=".75" />
          <circle cx="60" cy="34" r="9" fill={ink} />
          <path d="M40 104 h40 l-5 12 h-30z" fill={ink} opacity=".6" />
        </>
      )}
      {kind === 'map' && (
        <>
          <rect x="12" y="20" width="96" height="80" rx="10" {...c} />
          <path d="M44 20 V100 M76 20 V100 M12 54 H108" {...c} strokeWidth="1.6" opacity=".55" />
          <path d="M60 78 C48 62 46 56 46 50 a14 14 0 0 1 28 0 C74 56 72 62 60 78z" fill={ink} />
          <circle cx="60" cy="50" r="5" fill="#fff" />
        </>
      )}
      {kind === 'qr' && (
        <>
          {[[16, 16], [76, 16], [16, 76]].map(([x, y], i) => (
            <g key={i}><rect x={x} y={y} width="28" height="28" rx="4" {...c} /><rect x={x + 8} y={y + 8} width="12" height="12" rx="2" fill={ink} /></g>
          ))}
          {[[80, 80], [96, 80], [88, 92], [80, 100], [100, 100], [58, 58], [74, 58], [58, 74], [42, 60]].map(([x, y], i) => <rect key={i} x={x} y={y} width="8" height="8" rx="1.5" fill={ink} />)}
        </>
      )}
    </svg>
  )
}

function useCardWidth() {
  const [w, setW] = useState(250)
  useEffect(() => {
    const on = () => setW(innerWidth < 520 ? 200 : innerWidth < 900 ? 230 : 260)
    on()
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])
  return w
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function Card({ def, i, pos, width, active, onPick }: { def: CardDef; i: number; pos: MotionValue<number>; width: number; active: boolean; onPick: (i: number) => void }) {
  const off = useTransform(pos, (p) => i - p)
  const x = useTransform(off, (o) => o * width * 1.0)
  const rotateY = useTransform(off, (o) => clamp(-o * 24, -48, 48))
  const z = useTransform(off, (o) => -Math.abs(o) * 60)
  const scale = useTransform(off, (o) => 1 - Math.min(Math.abs(o), 3) * 0.06)
  const opacity = useTransform(off, (o) => 1 - Math.min(Math.abs(o), 3.4) * 0.2)
  const zIndex = useTransform(off, (o) => 100 - Math.round(Math.abs(o) * 10))
  return (
    <motion.button
      type="button"
      onClick={() => onPick(i)}
      aria-label={`${def.title}${active ? ': open' : ''}`}
      aria-current={active}
      style={{ x, z, rotateY, scale, opacity, zIndex, width, height: width * 1.5, marginLeft: -width / 2, left: '50%', top: 20, background: def.bg, color: def.ink }}
      className="absolute flex flex-col justify-between rounded-[1.6rem] p-5 text-left shadow-[0_40px_70px_-25px_rgba(0,0,0,0.9)] ring-1 ring-white/20 focus-visible:outline-neon"
    >
      <div className="flex items-start justify-between font-display text-xs font-black tracking-widest">
        <span>({def.no})</span>
        <span>{def.tag}</span>
      </div>
      <div className="mx-auto h-[46%] w-[72%]"><Art kind={def.art} ink={def.ink} /></div>
      <div>
        <div className="font-editorial text-[1.85rem] leading-[0.95]">{def.title}</div>
        <div className="mt-1.5 text-[13px] font-semibold leading-snug opacity-80">{def.sub}</div>
      </div>
    </motion.button>
  )
}

/** Glossy droplet floating over a wireframe ring: the "object on a stage" from the template. */
function Orbit() {
  const reduce = useReducedMotion()
  return (
    <div className="relative mx-auto mt-4 h-44 w-[min(88vw,22rem)]" style={{ perspective: 700 }} aria-hidden>
      <div className="absolute inset-0" style={{ transform: 'rotateX(68deg)', transformStyle: 'preserve-3d' }}>
        {[1, 0.74, 0.5].map((s, i) => (
          <div key={s} className={`absolute left-1/2 top-1/2 rounded-full border ${i === 1 ? 'ring-spin-rev border-dashed border-cyan-200/40' : 'ring-spin border-cyan-200/50'}`} style={{ width: `${s * 100}%`, height: `${s * 100}%`, marginLeft: `${-s * 50}%`, marginTop: `${-s * 50}%` }} />
        ))}
        <div className="absolute left-1/2 top-1/2 h-px w-full -translate-x-1/2 bg-cyan-200/30" />
        <div className="absolute left-1/2 top-1/2 h-full w-px -translate-y-1/2 bg-cyan-200/30" />
      </div>
      <motion.svg viewBox="0 0 80 100" className="absolute left-1/2 top-1/2 h-24 w-20 -translate-x-1/2 -translate-y-[60%] drop-shadow-[0_18px_30px_rgba(0,229,255,0.45)]" animate={reduce ? undefined : { y: [0, -10, 0], rotate: [-3, 3, -3] }} transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}>
        <defs>
          <radialGradient id="orb" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#ffffff" /><stop offset=".45" stopColor="#d9f7ff" /><stop offset="1" stopColor="#7cc8e6" /></radialGradient>
        </defs>
        <path d="M40 4 C26 26 10 42 10 62 a30 30 0 0 0 60 0 C70 42 54 26 40 4z" fill="url(#orb)" />
        <path d="M24 52 q4 -14 14 -24" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".85" />
      </motion.svg>
    </div>
  )
}

export default function Showcase() {
  const { me } = useStore()
  const reduce = useReducedMotion()
  const width = useCardWidth()
  const [idx, setIdx] = useState(2)
  const pos = useMotionValue(2)

  useEffect(() => {
    const c = animate(pos, idx, reduce ? { duration: 0 } : { type: 'spring', stiffness: 130, damping: 20 })
    return () => c.stop()
  }, [idx, pos, reduce])

  const move = useCallback((d: number) => setIdx((i) => clamp(i + d, 0, CARDS.length - 1)), [])
  const pick = (i: number) => (i === idx ? go(me ? CARDS[i].to : 'login') : setIdx(i))
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) }
  }
  const cur = CARDS[idx]

  return (
    <section id="showcase" className="relative overflow-hidden py-24" style={{ background: 'radial-gradient(900px 500px at 50% 35%, rgba(112,64,200,.28), transparent 70%)' }}>
      <div className="mx-auto max-w-7xl px-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-display text-sm font-bold tracking-widest text-ember">(01) SHOWCASE</div>
            <h2 className="mt-3 max-w-2xl font-editorial text-5xl leading-[0.95] text-white sm:text-7xl">Six ways to make <em className="text-gradient">water</em> a team sport.</h2>
          </div>
          <p className="max-w-xs text-slate-400">Drag, swipe or use the arrows. Tap the centre card to open it.</p>
        </div>
      </div>

      <div role="group" aria-roledescription="carousel" aria-label="Feature showcase" tabIndex={0} onKeyDown={onKey} className="relative mt-10 outline-none focus-visible:ring-2 focus-visible:ring-neon/60">
        <motion.div onPanEnd={(_, info) => { if (info.offset.x < -50) move(1); else if (info.offset.x > 50) move(-1) }} style={{ perspective: 1500, height: width * 1.5 + 50, touchAction: 'pan-y' }} className="relative mx-auto max-w-[1500px] cursor-grab overflow-hidden active:cursor-grabbing">
          <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
            {CARDS.map((def, i) => <Card key={def.no} def={def} i={i} pos={pos} width={width} active={i === idx} onPick={pick} />)}
          </div>
        </motion.div>
        <button aria-label="Previous feature" disabled={idx === 0} onClick={() => move(-1)} className="absolute left-3 top-1/2 z-[200] grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-abyss/70 text-white backdrop-blur transition hover:border-ember hover:text-ember disabled:opacity-30 sm:left-8">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <button aria-label="Next feature" disabled={idx === CARDS.length - 1} onClick={() => move(1)} className="absolute right-3 top-1/2 z-[200] grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-abyss/70 text-white backdrop-blur transition hover:border-ember hover:text-ember disabled:opacity-30 sm:right-8">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      <div className="mx-auto mt-6 flex max-w-xl flex-col items-center gap-3 px-5 text-center" aria-live="polite">
        <div className="font-display text-sm font-bold tracking-widest text-slate-400">({cur.no}) {cur.tag}</div>
        <div className="font-editorial text-4xl text-white">{cur.title}</div>
        <button className="btn-coral px-7" onClick={() => go(me ? cur.to : 'login')}>{me ? 'Open it' : 'Log in to try it'}</button>
        <div className="mt-1 flex gap-2" role="tablist" aria-label="Choose feature">
          {CARDS.map((c, i) => <button key={c.no} role="tab" aria-selected={i === idx} aria-label={c.title} onClick={() => setIdx(i)} className={`h-2.5 rounded-full transition-all ${i === idx ? 'w-8 bg-ember' : 'w-2.5 bg-white/25 hover:bg-white/50'}`} />)}
        </div>
      </div>

      <Orbit />
    </section>
  )
}
