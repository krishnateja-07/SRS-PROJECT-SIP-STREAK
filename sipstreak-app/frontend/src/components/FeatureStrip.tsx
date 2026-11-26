const ITEMS = [
  { t: 'Tap to log', d: '250, 500, 750 ml or your own', i: <path d="M12 3C8 8.5 5 12 5 15a7 7 0 0 0 14 0c0-3-3-6.5-7-12z" /> },
  { t: 'Squads of 4–8', d: 'Invite codes, shared goals', i: <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 19c0-3 3-5 6-5s6 2 6 5m0-4.5c1-.3 1.5-.5 2-.5 3 0 6 2 6 5" /> },
  { t: 'Fair scoring', d: 'Capped at 100% per person', i: <path d="M12 4v16M5 8h14M5 8l-3 7a4 4 0 0 0 6 0L5 8zm14 0l-3 7a4 4 0 0 0 6 0l-3-7z" /> },
  { t: 'Streaks & plant', d: 'Keep the seedling alive', i: <path d="M12 21v-9m0 0C12 7 8 4 4 4c0 5 3 8 8 8zm0 0c0-4 3-7 8-7 0 4-3 7-8 7z" /> },
]

/** Bright icon band under the hero, in the style of the CGMarket template. */
export default function FeatureStrip() {
  return (
    <section aria-label="Highlights" className="relative z-10 bg-gradient-to-r from-[#d63a1f] via-[#ee5a26] to-[#ff7a2f] text-abyss shadow-[0_-30px_60px_-20px_rgba(255,106,43,0.35)]">
      <ul className="mx-auto grid max-w-7xl grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((x, n) => (
          <li key={x.t} className={`flex items-center gap-4 px-6 py-6 ${n > 0 ? 'lg:border-l lg:border-abyss/15' : ''} ${n % 2 === 1 ? 'max-lg:border-l max-lg:border-abyss/15' : ''} ${n > 1 ? 'max-lg:border-t max-lg:border-abyss/15' : ''}`}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-abyss/15">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{x.i}</svg>
            </span>
            <span>
              <span className="block font-display text-sm font-black uppercase tracking-widest">{x.t}</span>
              <span className="block text-sm font-medium opacity-80">{x.d}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
