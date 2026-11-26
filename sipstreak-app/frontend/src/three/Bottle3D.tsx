import { Component, lazy, Suspense, useRef, useState, type ReactNode } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import { LiquidRing } from '../components/ui'
import { detectTier, webglAvailable, type Tier } from './quality'
import type { BottleSceneProps } from './BottleScene'

const BottleScene = lazy(() => import('./BottleScene'))

/** Warm the 3D chunk (three.js + drei) while the user is still on a light page. */
export const preload3D = () => import('./BottleScene')

export class GLBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function Skeleton() {
  return (
    <div className="grid h-full w-full place-items-center" aria-hidden>
      <div className="relative h-56 w-24 animate-pulse rounded-[2rem] border border-cyan-300/30 bg-gradient-to-b from-cyan-300/5 to-cyan-400/20 shadow-glow">
        <div className="absolute inset-x-0 -top-4 mx-auto h-6 w-10 rounded-md bg-deep" />
      </div>
    </div>
  )
}

type Props = Omit<BottleSceneProps, 'tier' | 'reduce' | 'active' | 'onDegrade'> & { fallbackSize?: number }

/**
 * Production wrapper around the R3F scene:
 *  - lazy-loaded chunk with a skeleton while it arrives
 *  - 2D liquid-ring fallback if WebGL is unavailable or the scene throws
 *  - render loop stops when scrolled off-screen
 *  - starts on a quality tier matched to the device and downgrades itself if frames drop
 *  - exposed to assistive tech as a labelled image with the live percentage
 */
export default function Bottle3D({ fallbackSize = 220, ...scene }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '160px' })
  const reduce = !!useReducedMotion()
  const [tier, setTier] = useState<Tier>(detectTier)
  const [failed, setFailed] = useState(() => !webglAvailable())
  const pct = Math.round(scene.level * 100)

  return (
    <div ref={ref} role="img" aria-label={`Water bottle ${pct}% full`} className="relative h-full w-full">
      {failed ? (
        <div className="grid h-full place-items-center">
          <LiquidRing value={scene.level} size={fallbackSize} />
        </div>
      ) : (
        <GLBoundary onError={() => setFailed(true)}>
          <Suspense fallback={<Skeleton />}>
            <BottleScene {...scene} tier={tier} reduce={reduce} active={inView} onDegrade={() => setTier('low')} />
          </Suspense>
        </GLBoundary>
      )}
    </div>
  )
}
