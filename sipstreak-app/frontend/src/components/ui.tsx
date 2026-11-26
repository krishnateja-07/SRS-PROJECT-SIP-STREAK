import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, AnimatePresence } from 'framer-motion'
import { useId, useState, type ReactNode, type PointerEvent } from 'react'
import { useStore } from '../lib/store'

/** Glass card that tilts in 3D toward the pointer. */
/** `wrap` styles the outer grid item (e.g. col-span); `className` styles the glass surface itself. */
export function Tilt({ children, className = '', wrap = '', max = 8, as3d: want3d = true }: { children: ReactNode; className?: string; wrap?: string; max?: number; as3d?: boolean }) {
  const reduceMotion = useReducedMotion()
  const as3d = want3d && !reduceMotion
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [max, -max]), { stiffness: 200, damping: 20 })
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-max, max]), { stiffness: 200, damping: 20 })
  const glareX = useTransform(x, [-0.5, 0.5], ['0%', '100%'])
  const glare = useTransform(glareX, (g) => `radial-gradient(600px circle at ${g} 0%, rgba(0,229,255,.10), transparent 40%)`)
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    x.set((e.clientX - r.left) / r.width - 0.5)
    y.set((e.clientY - r.top) / r.height - 0.5)
  }
  return (
    <div style={{ perspective: 1200 }} className={`h-full ${wrap}`}>
      <motion.div
        onPointerMove={as3d ? onMove : undefined}
        onPointerLeave={() => { x.set(0); y.set(0) }}
        style={as3d ? { rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' } : undefined}
        className={`glass glass-hover h-full ${className}`}
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-3xl opacity-60"
          style={{ background: glare }}
        />
        <div style={{ transform: as3d ? 'translateZ(30px)' : undefined }} className="relative">{children}</div>
      </motion.div>
    </div>
  )
}

export function Avatar({ name, hue = 190, size = 36, ring = false }: { name: string; hue?: number; size?: number; ring?: boolean }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full font-display font-bold text-abyss ${ring ? 'ring-2 ring-neon ring-offset-2 ring-offset-abyss' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue} 95% 70%), hsl(${(hue + 50) % 360} 90% 55%))`, boxShadow: `0 6px 16px -6px hsl(${hue} 90% 50%)` }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

export function SquadBadge({ name, hue, size = 52 }: { name: string; hue: number; size?: number }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full drop-shadow-[0_8px_16px_rgba(0,229,255,.35)]">
        <defs>
          <linearGradient id={`sb${hue}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={`hsl(${hue} 95% 68%)`} />
            <stop offset="1" stopColor={`hsl(${(hue + 60) % 360} 90% 45%)`} />
          </linearGradient>
        </defs>
        <path d="M32 3 C21 17 9 27 9 41 a23 23 0 0 0 46 0 C55 27 43 17 32 3z" fill={`url(#sb${hue})`} />
        <path d="M22 30 q4 -8 9 -12" stroke="rgba(255,255,255,.7)" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
      <span className="relative mt-3 font-display font-black text-abyss" style={{ fontSize: size * 0.27 }}>{initials}</span>
    </span>
  )
}

/** Water-filled progress bar with an SVG wave edge. */
export function WaterBar({ value, height = 14, color = 'from-cyan-400 to-neon' }: { value: number; height?: number; color?: string }) {
  const w = Math.max(0, Math.min(100, value * 100))
  return (
    <div className="relative overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/5" style={{ height }}>
      <motion.div className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${color}`} initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ type: 'spring', stiffness: 60, damping: 16 }}>
        <div className="absolute inset-0 overflow-hidden rounded-full opacity-50">
          <svg className="wave-x absolute top-0 h-full w-[200%]" viewBox="0 0 200 10" preserveAspectRatio="none">
            <path d="M0 5 Q 12.5 0 25 5 T 50 5 T 75 5 T 100 5 T 125 5 T 150 5 T 175 5 T 200 5 V10 H0z" fill="rgba(255,255,255,.35)" />
          </svg>
        </div>
      </motion.div>
    </div>
  )
}

/** Circular liquid-fill ring with SVG keyframe waves (no canvas recalculation). */
export function LiquidRing({ value, size = 180, label }: { value: number; size?: number; label?: string }) {
  const v = Math.max(0, Math.min(1, value))
  const r = 44
  const c = 2 * Math.PI * r
  const id = useId().replace(/:/g, '')
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id={`rg${id}`} x1="0" x2="1">
            <stop offset="0" stopColor="#00e5ff" />
            <stop offset="1" stopColor="#39ff88" />
          </linearGradient>
          <clipPath id={`cl${id}`}><circle cx="50" cy="50" r="37" /></clipPath>
        </defs>
        <circle cx="50" cy="50" r={r} stroke="rgba(255,255,255,.07)" strokeWidth="6" fill="none" />
        <motion.circle cx="50" cy="50" r={r} stroke={`url(#rg${id})`} strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - v) }} transition={{ type: 'spring', stiffness: 50, damping: 15 }} style={{ filter: 'drop-shadow(0 0 4px rgba(0,229,255,.8))' }} />
      </svg>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <g clipPath={`url(#cl${id})`}>
          <rect x="0" y="0" width="100" height="100" fill="rgba(0,40,80,.5)" />
          <motion.g initial={{ y: 87 }} animate={{ y: 87 - v * 74 }} transition={{ type: 'spring', stiffness: 50, damping: 14 }}>
            <g className="wave-x"><path d="M0 4 Q 12.5 0 25 4 T 50 4 T 75 4 T 100 4 T 125 4 T 150 4 T 175 4 T 200 4 V100 H0z" fill="rgba(0,229,255,.55)" /></g>
            <g className="wave-x-slow"><path d="M0 6 Q 12.5 2 25 6 T 50 6 T 75 6 T 100 6 T 125 6 T 150 6 T 175 6 T 200 6 V100 H0z" fill="rgba(57,255,136,.35)" /></g>
          </motion.g>
        </g>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display text-3xl font-black text-white drop-shadow-[0_0_12px_rgba(0,229,255,.8)]">{Math.round(value * 100)}%</div>
          {label && <div className="text-xs text-cyan-100/80">{label}</div>}
        </div>
      </div>
    </div>
  )
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-slate-400">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function Stat({ label, value, sub, accent = 'text-cyan-300' }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-abyss/40 p-4">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className={`mt-1 whitespace-nowrap font-display text-2xl font-extrabold ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export function Toasts() {
  const { toasts, dismiss } = useStore()
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2 max-md:bottom-24" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: 30, scale: 0.9, rotateX: -30 }} animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }} exit={{ opacity: 0, x: 60 }} className="glass pointer-events-auto flex items-start gap-3 p-3.5 pr-2">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${t.tone === 'warn' ? 'bg-coral shadow-[0_0_10px_#ff7a59]' : t.tone === 'info' ? 'bg-cyan-300 shadow-glow' : 'bg-neon shadow-neon'}`} />
            <div className="flex-1">
              <div className="font-display font-bold text-white">{t.title}</div>
              {t.body && <div className="text-sm text-slate-300">{t.body}</div>}
            </div>
            {t.action && (
              <button className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-cyan-300 hover:bg-cyan-300/10" onClick={() => { t.action!.run(); dismiss(t.id) }}>
                {t.action.label}
              </button>
            )}
            <button aria-label="Dismiss" className="rounded-lg px-2 py-1 text-slate-500 hover:text-white" onClick={() => dismiss(t.id)}>×</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/** Cheap CSS bubbles rising in the background. */
export function Bubbles({ count = 18 }: { count?: number }) {
  const [items] = useState(() =>
    Array.from({ length: count }, (_, i) => ({ left: Math.random() * 100, size: 6 + Math.random() * 26, dur: 14 + Math.random() * 18, delay: -Math.random() * 30, dx: `${(Math.random() - 0.5) * 120}px`, k: i })),
  )
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="liquid-bg absolute inset-0" />
      <div className="absolute -left-40 top-1/4 h-[480px] w-[480px] rounded-full bg-cyan-500/10 blur-[120px]" />
      <div className="absolute -right-40 bottom-0 h-[520px] w-[520px] rounded-full bg-emerald-400/10 blur-[140px]" />
      {items.map((b) => (
        <span key={b.k} className="bubble" style={{ left: `${b.left}%`, width: b.size, height: b.size, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s`, ['--dx' as string]: b.dx }} />
      ))}
    </div>
  )
}

/** Confetti droplets for podium celebrations. */
/** Deterministic scatter (a pure hash), so confetti needs no randomness during render. */
const hash = (i: number, k: number) => { const v = Math.sin((i + 1) * 12.9898 * (k + 1)) * 43758.5453; return v - Math.floor(v) }
const CONFETTI = Array.from({ length: 40 }, (_, i) => ({ i, x: (hash(i, 1) - 0.5) * 700, r: hash(i, 2) * 720, c: ['#00e5ff', '#39ff88', '#3ee6d4', '#ffffff', '#a5f3fc'][i % 5], d: hash(i, 3) * 0.3 }))

export function Celebrate({ trigger }: { trigger: number }) {
  const reduce = useReducedMotion()
  const pieces = CONFETTI
  if (!trigger || reduce) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-1/3 z-[90] flex justify-center">
      {pieces.map((p) => (
        <motion.span key={`${trigger}-${p.i}`} className="absolute h-3 w-2 rounded-full" style={{ background: p.c, boxShadow: `0 0 8px ${p.c}` }} initial={{ y: 0, x: 0, opacity: 1, rotate: 0 }} animate={{ y: [0, -260, 420], x: p.x, opacity: [1, 1, 0], rotate: p.r }} transition={{ duration: 2.2, delay: p.d, ease: 'easeOut' }} />
      ))}
    </div>
  )
}
