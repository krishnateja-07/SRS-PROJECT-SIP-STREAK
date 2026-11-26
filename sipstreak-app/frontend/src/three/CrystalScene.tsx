import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, Environment, Float, Lightformer } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { Tier } from './quality'

function Crystal({ tier, reduce }: { tier: Tier; reduce: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => { invalidate() }, [invalidate, tier])

  useFrame((state, dt) => {
    const m = ref.current
    if (!m) return
    if (reduce) { m.rotation.set(0.5, 0.6, 0); return }
    m.rotation.y += Math.min(dt, 0.1) * 0.45
    m.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.35 - state.pointer.y * 0.3
    m.rotation.z = state.pointer.x * 0.2
  })

  return (
    <Float speed={1.6} floatIntensity={reduce ? 0 : 1.4} rotationIntensity={0}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[1.35, 0]} />
        {tier === 'high' ? (
          <meshPhysicalMaterial key="hi" color="#ffffff" transmission={1} thickness={1.4} roughness={0.02} ior={1.7} iridescence={1} iridescenceIOR={1.5} iridescenceThicknessRange={[150, 700]} clearcoat={1} flatShading envMapIntensity={2.4} attenuationColor="#ff9a5c" attenuationDistance={2.5} />
        ) : (
          <meshPhysicalMaterial key="lo" color="#9fd8ff" roughness={0.05} metalness={0.3} iridescence={1} flatShading envMapIntensity={2} transparent opacity={0.88} />
        )}
        <Edges color="#ffb27a" threshold={15} />
      </mesh>
    </Float>
  )
}

export default function CrystalScene({ tier, reduce, active }: { tier: Tier; reduce: boolean; active: boolean }) {
  return (
    <Canvas dpr={tier === 'high' ? [1, 1.75] : [1, 1.25]} camera={{ position: [0, 0, 5], fov: 40 }} gl={{ antialias: true, alpha: true }} frameloop={!active ? 'never' : reduce ? 'demand' : 'always'}>
      <ambientLight intensity={0.4} />
      <Environment resolution={tier === 'high' ? 256 : 128}>
        <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 4, 3]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={4} color="#ff7a2f" position={[-5, 0, 2]} rotation-y={Math.PI / 2} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={3} color="#3a8bff" position={[5, -1, 2]} rotation-y={-Math.PI / 2} scale={[6, 6, 1]} />
        <Lightformer form="ring" intensity={2} color="#ff3da8" position={[0, -3, -4]} scale={4} />
      </Environment>
      <Crystal tier={tier} reduce={reduce} />
    </Canvas>
  )
}
