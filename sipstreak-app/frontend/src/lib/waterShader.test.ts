import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createWaterMaterial, stepWater, WATER_FRAG, WATER_VERT } from '../three/waterShader'

describe('water shader', () => {
  it('declares every uniform the shaders read', () => {
    const m = createWaterMaterial(0.9)
    for (const name of ['uTime', 'uAmp', 'uRippleT', 'uRipple', 'uRadius', 'uColor', 'uGlow']) expect(m.uniforms).toHaveProperty(name)
    expect(WATER_VERT).toContain('uRippleT')
    expect(WATER_FRAG).toContain('uColor')
    expect(m.uniforms.uRadius.value).toBe(0.9)
  })

  it('drives uniforms from the frame state, and silences motion when reduced', () => {
    const u = createWaterMaterial(0.9).uniforms
    const color = new THREE.Color('#ff0000')
    stepWater(u, { t: 3, dt: 0.016, ripple: 0.8, sinceSplash: 0.4, reduce: false, color, glow: 0.5 })
    expect(u.uTime.value).toBe(3)
    expect(u.uAmp.value).toBe(1)
    expect(u.uRipple.value).toBe(0.8)
    expect(u.uRippleT.value).toBe(0.4)
    expect(u.uColor.value.getHexString()).toBe('ff0000')
    stepWater(u, { t: 4, dt: 0.016, ripple: 0.8, sinceSplash: 0.5, reduce: true, color, glow: 0.5 })
    expect(u.uAmp.value).toBe(0)
    expect(u.uRipple.value).toBe(0)
  })
})
