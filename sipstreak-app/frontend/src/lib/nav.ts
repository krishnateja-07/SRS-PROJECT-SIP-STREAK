import { useEffect, useState } from 'react'

export const APP_VIEWS = ['dashboard', 'hydration', 'squad', 'leaderboard', 'history', 'plant', 'map', 'profile', 'settings'] as const
export type AppView = (typeof APP_VIEWS)[number]
export type View = 'landing' | 'login' | 'signup' | 'setup' | AppView

/** Plain #name routing (works inside sandboxed hosts and on a static server). */
export function go(v: View) {
  if (v === 'landing') {
    history.replaceState(null, '', location.pathname + location.search)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else location.hash = v
  window.scrollTo({ top: 0 })
}

const read = (): string => location.hash.replace(/^#/, '')

export function useHash(): string {
  const [h, setH] = useState(read)
  useEffect(() => {
    const on = () => setH(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return h
}
