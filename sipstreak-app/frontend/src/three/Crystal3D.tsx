import { lazy, Suspense, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import { GLBoundary } from './Bottle3D'
import { detectTier, webglAvailable, type Tier } from './quality'

const CrystalScene = lazy(() => import('./CrystalScene'))

/** Pure-CSS stand-in used while the 3D chunk loads, and when WebGL isn't available. */
function Gem() {
  return (
    <div className="grid h-full w-full place-items-center" aria-hidden>
      <div className="h-40 w-40 rotate-45 rounded-[2rem] shadow-[0_0_60px_rgba(255,122,47,0.45)]" style={{ background: 'conic-gradient(from 40deg, #ff7a2f, #ff3da8, #3a8bff, #6ff3e5, #ff7a2f)', opacity: 0.85 }} />
    </div>
  )
}

export default function Crystal3D() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '160px' })
  const reduce = !!useReducedMotion()
  const [tier] = useState<Tier>(detectTier)
  const [failed, setFailed] = useState(() => !webglAvailable())
  return (
    <div ref={ref} role="img" aria-label="A rotating iridescent glass crystal" className="relative h-full w-full">
      {failed ? (
        <Gem />
      ) : (
        <GLBoundary onError={() => setFailed(true)}>
          <Suspense fallback={<Gem />}>
            <CrystalScene tier={tier} reduce={reduce} active={inView} />
          </Suspense>
        </GLBoundary>
      )}
    </div>
  )
}
