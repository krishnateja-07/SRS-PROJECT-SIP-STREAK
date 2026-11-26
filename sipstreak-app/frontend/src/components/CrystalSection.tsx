import { motion } from 'framer-motion'
import { useStore } from '../lib/store'
import { go } from '../lib/nav'
import { Tilt } from './ui'
import Crystal3D from '../three/Crystal3D'

/** Two big glass panels: a calm blue one and a dark one with the crystal and an orange call to action. */
export default function CrystalSection({ heroes, squads, litres }: { heroes: number; squads: number; litres: number }) {
  const { me } = useStore()
  return (
    <section id="crystal" className="relative mx-auto max-w-7xl px-5 py-20">
      <div className="font-display text-sm font-bold tracking-widest text-ember">(02) CRYSTAL CLEAR</div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Tilt className="relative overflow-hidden p-8 sm:p-10" max={3}>
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/25 blur-[90px]" />
          <h2 className="relative max-w-md font-editorial text-5xl leading-[0.95] text-white sm:text-6xl">Hydration, at the speed of a <em className="text-sky-300">sip</em>.</h2>
          <p className="relative mt-5 max-w-sm text-slate-300">One tap logs it. Your squad sees it. The leaderboard moves before you've put the bottle down.</p>
          <button className="btn-primary relative mt-7 px-7" onClick={() => go(me ? 'leaderboard' : 'login')}>{me ? 'Watch the ranks' : 'See it live'}</button>
          <div className="relative mx-auto mt-10 h-52 w-72" style={{ perspective: 900 }} aria-hidden>
            <div className="absolute inset-0" style={{ transform: 'rotateX(58deg) rotateZ(-35deg)', transformStyle: 'preserve-3d' }}>
              {[0, 1, 2].map((i) => (
                <motion.div key={i} className="absolute inset-6 rounded-3xl border border-sky-300/40 bg-gradient-to-br from-sky-400/50 to-blue-700/40 shadow-[0_0_40px_rgba(58,139,255,0.35)]" style={{ z: i * 26 }} animate={{ z: [i * 26, i * 26 + 12, i * 26] }} transition={{ repeat: Infinity, duration: 3 + i, ease: 'easeInOut' }} />
              ))}
            </div>
          </div>
        </Tilt>

        <Tilt className="relative overflow-hidden border-ember/20 p-8 sm:p-10" max={3}>
          <div aria-hidden className="pointer-events-none absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-ember/20 blur-[100px]" />
          <div className="relative h-[290px]"><Crystal3D /></div>
          <h2 className="relative mt-2 max-w-md font-editorial text-5xl leading-[0.95] text-white sm:text-6xl">We turn every glass into <em className="text-ember">team</em> momentum.</h2>
          <div className="relative mt-7 flex flex-wrap items-center gap-6">
            <button className="rounded-2xl bg-ember px-7 py-3 font-display font-bold text-abyss shadow-[0_5px_0_#b8430f,0_16px_30px_-10px_rgba(255,106,43,.7)] transition active:translate-y-[3px] active:shadow-none" onClick={() => go(me ? 'dashboard' : 'signup')}>Start your streak</button>
            <dl className="flex gap-7">
              {[['heroes', heroes], ['squads', squads], ['litres', Math.round(litres)]].map(([k, v]) => (
                <div key={k as string}><dd className="font-editorial text-4xl text-ember">{v}+</dd><dt className="text-xs uppercase tracking-widest text-slate-400">{k}</dt></div>
              ))}
            </dl>
          </div>
        </Tilt>
      </div>
    </section>
  )
}
