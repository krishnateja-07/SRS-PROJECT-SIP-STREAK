import { AnimatePresence, motion } from 'framer-motion'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { caffeineCount, completion, dayKey, fmtMl, intake, logsFor, targetFor } from '../lib/calc'
import { LiquidRing, PageHeader, Tilt } from '../components/ui'
import QuickLog from '../components/QuickLog'

export default function Hydration() {
  const { db, me, now, logDrink, removeLog, settings, scanSticker, toast } = useStore()
  const [qr, setQr] = useState('')
  const stickerUrl = me ? `${location.origin}${location.pathname}#qr-${me.id.replace(/[^a-z0-9]/gi, '')}` : ''
  useEffect(() => {
    if (!stickerUrl) return
    QRCode.toDataURL(stickerUrl, { margin: 1, width: 320, color: { dark: '#031226', light: '#e9fdff' } }).then(setQr).catch(() => setQr(''))
  }, [stickerUrl])
  if (!me) return null
  const day = dayKey(now, me.timezone)
  const logs = [...logsFor(db, me.id, day, me.timezone)].sort((a, b) => b.at.localeCompare(a.at))
  const sticker = `bottle-${me.id.replace(/[^a-z0-9]/gi, '')}`

  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: me.timezone })

  return (
    <>
      <PageHeader title="My Hydration" sub="Log water, track caffeine, and print a sticker for your bottle." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Tilt className="p-6" max={5}>
          <div className="flex flex-wrap items-center gap-6">
            <LiquidRing value={completion(db, me, day)} size={170} label={`${fmtMl(intake(db, me, day))} / ${fmtMl(targetFor(db, me, day))}`} />
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white">Log a drink</h2>
              <p className="text-sm text-slate-400">Each tap is saved with a UTC timestamp and counted on your local calendar day.</p>
            </div>
          </div>
          <div className="mt-6"><QuickLog /></div>
        </Tilt>

        <Tilt className="p-6" max={5}>
          <h2 className="text-xl font-bold text-white">Caffeine offset</h2>
          <p className="mt-1 text-sm text-slate-400">
            {settings.caffeineOn ? <>Each coffee or energy drink adds <b className="text-cyan-300">+{settings.caffeineBonusMl} ml</b> to today’s target.</> : 'Offset is off — caffeine is logged but your target stays the same.'}{' '}
            This is a configurable game rule, not a clinical requirement.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button className="btn-ghost" onClick={() => logDrink(200, 'coffee')}>Log coffee</button>
            <button className="btn-ghost" onClick={() => logDrink(250, 'energy')}>Log energy drink</button>
          </div>
          <div className="mt-3 text-sm text-slate-400">Caffeinated drinks today: <b className="text-white">{caffeineCount(db, me, day)}</b></div>

          <h3 className="mt-6 text-lg font-bold text-white">Today’s log</h3>
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {logs.length === 0 && <li className="rounded-xl bg-white/5 p-4 text-sm text-slate-400">Nothing yet — your first sip starts the wave.</li>}
              {logs.map((l) => (
                <motion.li key={l.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40, height: 0 }} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${l.kind === 'water' ? 'bg-cyan-300 shadow-glow' : 'bg-amber-400'}`} />
                  <span className="font-display font-bold text-white">{l.kind === 'water' ? `+${l.ml} ml` : l.kind === 'coffee' ? 'Coffee' : 'Energy drink'}</span>
                  <span className="text-xs text-slate-500">{l.source === 'qr' ? 'bottle sticker' : l.source === 'custom' ? 'custom' : ''}</span>
                  <span className="ml-auto whitespace-nowrap text-sm tabular-nums text-slate-400">{timeFmt.format(new Date(l.at))}</span>
                  <button aria-label="Delete log" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-coral/10 hover:text-coral" onClick={() => removeLog(l.id)}>×</button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Tilt>

        <Tilt className="p-6" wrap="lg:col-span-2" max={3}>
          <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
            <div className="print-area mx-auto rounded-3xl bg-gradient-to-br from-cyan-200 to-emerald-200 p-4 text-center text-abyss shadow-glow">
              {qr ? <img src={qr} alt="QR code for your bottle sticker" className="h-44 w-44 rounded-xl" /> : <div className="grid h-44 w-44 place-items-center">QR…</div>}
              <div className="mt-2 font-display text-sm font-black">SipStreak · +500 ml</div>
              <div className="text-xs">{me.name}</div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Bottle QR sticker</h2>
              <p className="mt-1 text-slate-400">Stick it on your 500 ml bottle. Scanning opens SipStreak with +500 ml pre-logged. The same sticker can’t log twice within 10 minutes, so a refresh or double scan won’t double count.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="btn-primary" onClick={() => { const r = scanSticker(sticker); if (!r.ok) toast({ title: 'Scan blocked', body: r.error, tone: 'warn' }) }}>Simulate a scan</button>
                <button className="btn-ghost" onClick={() => { try { window.print() } catch { toast({ title: 'Printing unavailable here', body: 'Right-click the sticker and save the image instead.', tone: 'info' }) } }}>Print sticker</button>
              </div>
              <p className="mt-3 text-xs text-slate-500">If printing is blocked in this preview, right-click the sticker to save it.</p>
            </div>
          </div>
        </Tilt>
      </div>
    </>
  )
}
