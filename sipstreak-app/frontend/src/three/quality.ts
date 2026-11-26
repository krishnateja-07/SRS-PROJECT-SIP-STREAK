export type Tier = 'high' | 'low'

let glSupport: boolean | null = null

/** True when a WebGL context can be created. Cached after the first check. */
export function webglAvailable(): boolean {
  if (glSupport !== null) return glSupport
  try {
    const c = document.createElement('canvas')
    glSupport = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    glSupport = false
  }
  return glSupport
}

/** Pick a starting quality tier. The scene can still downgrade itself at runtime. */
export function detectTier(): Tier {
  if (typeof navigator === 'undefined') return 'high'
  const cores = navigator.hardwareConcurrency ?? 8
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
  return cores < 4 || mem < 4 || (coarse && cores < 8) ? 'low' : 'high'
}
