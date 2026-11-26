import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Float, Lightformer, PerformanceMonitor, Sparkles } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { MotionValue } from 'framer-motion'
import type { Tier } from './quality'
import { createWaterMaterial, stepWater } from './waterShader'

/* ------------------------------------------------------------------ */
/* Geometry constants                                                  */
/* ------------------------------------------------------------------ */
const BASE_Y = -1.9
const MAX_H = 3.0 // water height at 100% of the daily goal
const R_IN = 0.9
const GOAL_Y = BASE_Y + MAX_H

/** Re-used colours: nothing is allocated inside useFrame. */
const LOW = new THREE.Color('#ff7a59')
const MID = new THREE.Color('#00d5ff')
const HIGH = new THREE.Color('#39ff88')

function waterColor(l: number, out: THREE.Color) {
  if (l < 0.5) return out.copy(LOW).lerp(MID, l / 0.5)
  return out.copy(MID).lerp(HIGH, Math.min(1, (l - 0.5) / 0.5))
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const profile = [
  [0, -2], [0.88, -2], [1, -1.82], [1, 1.25], [0.9, 1.6], [0.6, 1.9], [0.52, 2.0], [0.52, 2.3], [0, 2.3],
].map(([x, y]) => new THREE.Vector2(x, y))

export interface BottleSceneProps {
  /** Real completion (0–1+). Drives the water level, colour and glow. */
  level: number
  /** Increment on every water log: ripple, splash and squash-and-stretch. */
  splash?: number
  /** Increment when the daily goal is first reached: spin + confetti burst. */
  celebrate?: number
  /** Landing-page mode: self-animating demo fill, floating droplets. */
  hero?: boolean
  tier?: Tier
  /** prefers-reduced-motion: render on demand and snap instead of easing. */
  reduce?: boolean
  /** False when scrolled off-screen: the render loop is stopped entirely. */
  active?: boolean
  /** Optional 0–1 scroll progress (read inside the frame loop, never via React state). */
  scroll?: MotionValue<number>
  /** Called when the frame rate stays low, so the parent can drop to the low tier. */
  onDegrade?: () => void
}

type BottleProps = Required<Pick<BottleSceneProps, 'level' | 'splash' | 'celebrate' | 'hero' | 'tier' | 'reduce'>> &
  Pick<BottleSceneProps, 'scroll'>

/* ------------------------------------------------------------------ */
/* The bottle                                                          */
/* ------------------------------------------------------------------ */
function Bottle({ level, splash, celebrate, hero, tier, reduce, scroll }: BottleProps) {
  const group = useRef<THREE.Group>(null)
  const water = useRef<THREE.Mesh>(null)
  const surface = useRef<THREE.Mesh>(null)
  const waterMat = useRef<THREE.MeshPhysicalMaterial>(null)
    const goalMat = useRef<THREE.MeshBasicMaterial>(null)
  const halo = useRef<THREE.Mesh>(null)
  const bubbles = useRef<THREE.InstancedMesh>(null)
  const drops = useRef<THREE.InstancedMesh>(null)

  const shown = useRef(0)
  const ripple = useRef(0)
  const pulse = useRef(0)
  const spin = useRef(0)
  const spinAcc = useRef(0)
  const frame = useRef(0)

  const col = useMemo(() => new THREE.Color(), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const invalidate = useThree((s) => s.invalidate)
  const loop = useThree((s) => s.frameloop)

  const surfGeo = useMemo(() => (tier === 'high' ? new THREE.RingGeometry(0.001, R_IN, 96, 28) : new THREE.RingGeometry(0.001, R_IN, 40, 12)), [tier])
  const surfMat = useMemo(() => createWaterMaterial(R_IN), [])
  useEffect(() => () => { surfGeo.dispose(); surfMat.dispose() }, [surfGeo, surfMat])
  const sinceSplash = useRef(10)
  const bubbleCount = tier === 'high' ? 28 : 14
  const bubbleData = useMemo(
    () => Array.from({ length: bubbleCount }, () => ({ x: (Math.random() - 0.5) * 1.3, z: (Math.random() - 0.5) * 1.3, y: Math.random(), s: 0.25 + Math.random() * 0.6, r: 0.025 + Math.random() * 0.05 })),
    [bubbleCount],
  )
  const dropData = useMemo(() => Array.from({ length: 28 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 })), [])

  // Splash on every log: ripple rings, droplets, squash-and-stretch.
  useEffect(() => {
    if (!splash) return
    ripple.current = 1
    sinceSplash.current = 0
    pulse.current = 1
    const top = BASE_Y + Math.max(0.05, shown.current) * MAX_H
    for (let i = 0; i < 14; i++) {
      const d = dropData[i]
      const a = Math.random() * Math.PI * 2
      const sp = 0.6 + Math.random() * 1.4
      d.p.set(Math.cos(a) * 0.3, top, Math.sin(a) * 0.3)
      d.v.set(Math.cos(a) * sp * 0.6, 2.2 + Math.random() * 2.2, Math.sin(a) * sp * 0.6)
      d.life = 1
    }
  }, [splash, dropData])

  // Goal reached: twirl, big ripple, full confetti burst.
  useEffect(() => {
    if (!celebrate) return
    ripple.current = 1
    sinceSplash.current = 0
    pulse.current = 1
    spin.current = 1
    const top = BASE_Y + MAX_H
    for (const d of dropData) {
      const a = Math.random() * Math.PI * 2
      const sp = 1 + Math.random() * 2.2
      d.p.set(Math.cos(a) * 0.4, top, Math.sin(a) * 0.4)
      d.v.set(Math.cos(a) * sp, 3.2 + Math.random() * 3, Math.sin(a) * sp)
      d.life = 1.3
    }
  }, [celebrate, dropData])

  // In on-demand mode nothing re-renders by itself: ask for a frame whenever inputs change.
  useEffect(() => {
    invalidate()
  }, [level, splash, celebrate, tier, loop, invalidate])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.25) // cap a long pause (tab switch); exponential damping stays stable at low frame rates
    const t = state.clock.elapsedTime
    const target = hero && !reduce ? 0.18 + 0.72 * (0.5 + 0.5 * Math.sin(t * 0.55 - 1.2)) : Math.min(1.15, Math.max(0, level))
    shown.current = reduce ? target : THREE.MathUtils.damp(shown.current, target, 2.4, dt)
    ripple.current = Math.max(0, ripple.current - dt * 0.7)
    sinceSplash.current += dt
    pulse.current = Math.max(0, pulse.current - dt * 2.4)
    spin.current = Math.max(0, spin.current - dt * 0.8)
    spinAcc.current += spin.current * dt * 10
    frame.current++

    const lv = Math.max(0.03, shown.current)
    const h = Math.min(lv, 1.12) * MAX_H
    if (water.current) {
      water.current.scale.y = h
      water.current.position.y = BASE_Y + h / 2
    }

    waterColor(Math.min(1, shown.current), col)
    waterMat.current?.color.copy(col)
    waterMat.current?.emissive.copy(col).multiplyScalar(0.25 + Math.min(1, shown.current) * 0.25)

    // Goal line brightens as you approach 100%.
    if (goalMat.current) {
      const near = smooth(0.7, 1, shown.current)
      goalMat.current.opacity = 0.35 + near * 0.55 + (shown.current >= 0.995 ? Math.sin(t * 5) * 0.12 : 0)
    }
    if (halo.current) {
      ;(halo.current.material as THREE.MeshBasicMaterial).color.copy(col)
      halo.current.scale.setScalar(1 + (reduce ? 0 : Math.sin(t * 2) * 0.04) + ripple.current * 0.3)
    }

    // Water surface: displaced, lit and rippled on the GPU (see waterShader.ts).
    if (surface.current) {
      surface.current.position.y = BASE_Y + h + 0.002
      stepWater(surfMat.uniforms, { t, dt, ripple: ripple.current, sinceSplash: sinceSplash.current, reduce, color: col, glow: Math.min(1, shown.current) })
    }

    if (bubbles.current) {
      for (let i = 0; i < bubbleData.length; i++) {
        const b = bubbleData[i]
        b.y += dt * b.s * 0.25
        if (b.y > 1) b.y = 0
        dummy.position.set(b.x * 0.62 + Math.sin(t * 2 + i) * 0.03, BASE_Y + 0.05 + b.y * Math.max(0.01, h - 0.1), b.z * 0.62)
        dummy.scale.setScalar(shown.current > 0.06 ? b.r : 0)
        dummy.updateMatrix()
        bubbles.current.setMatrixAt(i, dummy.matrix)
      }
      bubbles.current.instanceMatrix.needsUpdate = true
    }

    if (drops.current) {
      for (let i = 0; i < dropData.length; i++) {
        const d = dropData[i]
        if (d.life > 0) {
          const pdt = Math.min(dt, 0.05) // keep particle integration stable
          d.life -= pdt * 0.9
          d.v.y -= 9 * pdt
          d.p.addScaledVector(d.v, pdt)
        }
        dummy.position.copy(d.p)
        dummy.scale.setScalar(d.life > 0 ? 0.06 * (0.5 + d.life) : 0)
        dummy.updateMatrix()
        drops.current.setMatrixAt(i, dummy.matrix)
      }
      drops.current.instanceMatrix.needsUpdate = true
      ;(drops.current.material as THREE.MeshStandardMaterial).color.copy(col)
    }

    if (group.current) {
      const s = scroll ? scroll.get() : 0
      if (reduce) {
        group.current.rotation.y = 0.35
        group.current.position.y = 0
      } else {
        const px = state.pointer.x
        const py = state.pointer.y
        const want = px * 0.6 + Math.sin(t * 0.4) * 0.25 + spinAcc.current + s * Math.PI * 1.4
        group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, want, 3, dt)
        group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -py * 0.15, 3, dt)
        group.current.position.y = Math.sin(t * 1.1) * 0.08 - s * 0.5
        // Squash-and-stretch when a drink lands.
        const k = Math.sin(pulse.current * Math.PI)
        group.current.scale.set(1 - k * 0.035, 1 + k * 0.06, 1 - k * 0.035)
      }
    }
  })

  const glass =
    tier === 'high' ? (
      <meshPhysicalMaterial key="g-hi" transmission={1} thickness={0.35} roughness={0.04} ior={1.45} clearcoat={1} clearcoatRoughness={0.05} color="#d8fbff" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} envMapIntensity={1.6} />
    ) : (
      <meshPhysicalMaterial key="g-lo" roughness={0.05} clearcoat={1} color="#bff6ff" transparent opacity={0.24} side={THREE.DoubleSide} depthWrite={false} envMapIntensity={1.4} />
    )

  return (
    <group ref={group}>
      <mesh renderOrder={2}>
        <latheGeometry args={[profile, tier === 'high' ? 96 : 48]} />
        {glass}
      </mesh>
      <mesh ref={water} renderOrder={1}>
        <cylinderGeometry args={[R_IN, R_IN - 0.06, 1, tier === 'high' ? 64 : 32, 1, true]} />
        <meshPhysicalMaterial ref={waterMat} transparent opacity={0.78} roughness={0.15} metalness={0} clearcoat={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, BASE_Y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R_IN - 0.05, 40]} />
        <meshStandardMaterial color="#0a3b55" />
      </mesh>
      <mesh ref={surface} geometry={surfGeo} material={surfMat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} />

      {/* Measurement marks: only on the working dashboard bottle, never on the hero. */}
      {!hero && (
        <>
          {[0.25, 0.5, 0.75].map((f) => (
            <mesh key={f} position={[0, BASE_Y + MAX_H * f, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[1.008, 0.006, 6, 72]} />
              <meshBasicMaterial color="#9ff3ff" transparent opacity={0.28} toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, GOAL_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.014, 0.014, 8, 96]} />
            <meshBasicMaterial ref={goalMat} color="#39ff88" transparent opacity={0.4} toneMapped={false} />
          </mesh>
        </>
      )}

      <instancedMesh ref={bubbles} args={[undefined, undefined, bubbleCount]} key={bubbleCount}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshStandardMaterial color="#eaffff" transparent opacity={0.75} emissive="#9ff" emissiveIntensity={0.4} />
      </instancedMesh>
      <instancedMesh ref={drops} args={[undefined, undefined, 28]}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshStandardMaterial transparent opacity={0.9} emissiveIntensity={0.6} />
      </instancedMesh>

      <mesh position={[0, 2.55, 0]}>
        <cylinderGeometry args={[0.58, 0.58, 0.55, 48]} />
        <meshStandardMaterial color="#0b1f3d" metalness={0.6} roughness={0.25} />
      </mesh>
      <mesh position={[0, 2.84, 0]}>
        <torusGeometry args={[0.36, 0.06, 12, 48]} />
        <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.4} />
      </mesh>
      <mesh ref={halo} position={[0, -2.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.3, 1.42, 96]} />
        <meshBasicMaterial transparent opacity={0.7} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Droplet({ position, scale, color, tier }: { position: [number, number, number]; scale: number; color: string; tier: Tier }) {
  return (
    <Float speed={1.4} rotationIntensity={1.2} floatIntensity={2}>
      <mesh position={position} scale={[scale, scale * 1.25, scale]}>
        <sphereGeometry args={[1, tier === 'high' ? 32 : 16, tier === 'high' ? 32 : 16]} />
        {tier === 'high' ? (
          <meshPhysicalMaterial key="d-hi" transmission={1} thickness={0.6} roughness={0} ior={1.33} color={color} envMapIntensity={2} />
        ) : (
          <meshPhysicalMaterial key="d-lo" roughness={0.05} color={color} transparent opacity={0.5} envMapIntensity={1.6} />
        )}
      </mesh>
    </Float>
  )
}

const DROPLETS: { position: [number, number, number]; scale: number; color: string }[] = [
  { position: [-3.2, 1.6, -1], scale: 0.38, color: '#aef6ff' },
  { position: [3.1, 2.1, -1.5], scale: 0.28, color: '#b5ffd6' },
  { position: [-2.6, -1.8, 0.5], scale: 0.22, color: '#aef6ff' },
  { position: [2.8, -1.2, 0.8], scale: 0.34, color: '#9ff3ff' },
  { position: [0.2, 3.4, -2.5], scale: 0.2, color: '#c8fff0' },
]

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */
export default function BottleScene({ level, splash = 0, celebrate = 0, hero = false, tier = 'high', reduce = false, active = true, scroll, onDegrade }: BottleSceneProps) {
  return (
    <Canvas
      dpr={tier === 'high' ? [1, 1.75] : [1, 1.25]}
      camera={{ position: [0, 0.4, hero ? 11 : 10.2], fov: 38 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      frameloop={!active ? 'never' : reduce ? 'demand' : 'always'}
    >
      {onDegrade && <PerformanceMonitor flipflops={2} onFallback={onDegrade} onDecline={onDegrade} />}
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={1.4} color="#e0fbff" />
      <pointLight position={[-4, 1, 3]} intensity={30} color="#00e5ff" />
      <pointLight position={[4, -2, 2]} intensity={18} color="#39ff88" />
      <Environment resolution={tier === 'high' ? 256 : 128}>
        <Lightformer form="rect" intensity={3} color="#bff6ff" position={[0, 4, 4]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={2} color="#00e5ff" position={[-5, 0, 2]} rotation-y={Math.PI / 2} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#39ff88" position={[5, -1, 1]} rotation-y={-Math.PI / 2} scale={[5, 5, 1]} />
        <Lightformer form="ring" intensity={2} color="#ffffff" position={[0, 0, -6]} scale={4} />
      </Environment>
      <Bottle level={level} splash={splash} celebrate={celebrate} hero={hero} tier={tier} reduce={reduce} scroll={scroll} />
      {hero && DROPLETS.slice(0, tier === 'high' ? 5 : 3).map((d, i) => <Droplet key={i} {...d} tier={tier} />)}
      {!reduce && <Sparkles count={hero ? (tier === 'high' ? 70 : 24) : tier === 'high' ? 30 : 12} scale={[7, 6, 4]} size={hero ? 3 : 2} speed={0.4} color="#7ff5ff" opacity={0.7} />}
    </Canvas>
  )
}
