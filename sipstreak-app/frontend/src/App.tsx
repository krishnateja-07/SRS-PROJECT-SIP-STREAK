import { lazy, Suspense, useEffect, useRef } from 'react'
import { useStore } from './lib/store'
import { APP_VIEWS, go, useHash, type AppView } from './lib/nav'
import AppShell from './components/AppShell'
import { Toasts } from './components/ui'
import Landing from './pages/Landing'
import { Login, Setup, Signup } from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Hydration from './pages/Hydration'
import Squad from './pages/Squad'
import Leaderboard from './pages/Leaderboard'
import Plant from './pages/Plant'
import { Profile, Settings } from './pages/ProfileSettings'

const History = lazy(() => import('./pages/History'))
const FountainMap = lazy(() => import('./pages/FountainMap'))

const PAGES: Record<AppView, () => React.ReactNode> = {
  dashboard: () => <Dashboard />,
  hydration: () => <Hydration />,
  squad: () => <Squad />,
  leaderboard: () => <Leaderboard />,
  history: () => <History />,
  plant: () => <Plant />,
  map: () => <FountainMap />,
  profile: () => <Profile />,
  settings: () => <Settings />,
}

const PENDING_QR = 'sipstreak.pendingQr'

export default function App() {
  const hash = useHash()
  const { me, scanSticker, toast } = useStore()
  const handled = useRef('')

  // Bottle sticker deep link: #qr-<sticker>. Consumed once, then the hash is cleared.
  useEffect(() => {
    const m = hash.match(/^qr-([a-z0-9]+)$/i)
    let pending: string | null = null
    try { pending = sessionStorage.getItem(PENDING_QR) } catch { /* ignore */ }
    const id = m?.[1] ?? (me ? pending : null)
    if (!id || handled.current === id + (me?.id ?? '')) return
    if (!me) {
      try { sessionStorage.setItem(PENDING_QR, id) } catch { /* ignore */ }
      toast({ title: 'Bottle sticker scanned', body: 'Log in and we’ll add your +500 ml.', tone: 'info' })
      go('login')
      return
    }
    handled.current = id + me.id
    try { sessionStorage.removeItem(PENDING_QR) } catch { /* ignore */ }
    const r = scanSticker(`bottle-${id}`)
    if (!r.ok) toast({ title: 'Scan blocked', body: r.error, tone: 'warn' })
    go('dashboard')
  }, [hash, me, scanSticker, toast])

  let content: React.ReactNode
  if (hash === 'login') content = me ? <Redirect to="dashboard" /> : <Login />
  else if (hash === 'signup') content = me ? <Redirect to="setup" /> : <Signup />
  else if (hash === 'setup') content = me ? <Setup /> : <Redirect to="login" />
  else if ((APP_VIEWS as readonly string[]).includes(hash)) {
    const v = hash as AppView
    content = me ? (
      <AppShell view={v}>
        <Suspense fallback={<div className="py-20 text-center text-cyan-300">Loading…</div>}>{PAGES[v]()}</Suspense>
      </AppShell>
    ) : <Redirect to="login" />
  } else content = <Landing />

  return (
    <>
      {content}
      <Toasts />
    </>
  )
}

function Redirect({ to }: { to: AppView | 'login' | 'setup' }) {
  useEffect(() => { go(to) }, [to])
  return null
}
