import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { ImageOverlay, MapContainer, Marker, Popup } from 'react-leaflet'
import { useMemo, useState } from 'react'
import { FOUNTAINS } from '../lib/seed'
import { PageHeader, Tilt } from '../components/ui'

const W = 1000
const H = 600

// Stylised campus plan drawn inline so the map works offline and inside sandboxed previews.
const BUILDINGS = [
  { n: 'Hostel Block A', x: 90, y: 70, w: 150, h: 110 },
  { n: 'Hostel Block B', x: 270, y: 60, w: 150, h: 110 },
  { n: 'Central Library', x: 150, y: 370, w: 200, h: 120 },
  { n: 'Main Canteen', x: 440, y: 240, w: 170, h: 110 },
  { n: 'Engineering Block', x: 700, y: 380, w: 220, h: 140 },
  { n: 'Sports Complex', x: 720, y: 60, w: 220, h: 150 },
  { n: 'Admin Building', x: 470, y: 450, w: 170, h: 100 },
]
const plan = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#041328"/>
<g fill="none" stroke="#0c2f55" stroke-width="28" stroke-linecap="round"><path d="M0 300 H1000"/><path d="M420 0 V600"/><path d="M660 0 V600"/></g>
<g fill="none" stroke="#123e6b" stroke-width="2" stroke-dasharray="10 10"><path d="M0 300 H1000"/><path d="M420 0 V600"/><path d="M660 0 V600"/></g>
<ellipse cx="540" cy="140" rx="80" ry="55" fill="#063a3a" stroke="#0e6a5e"/>
${BUILDINGS.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14" fill="#0a2350" stroke="#1e5a8c" stroke-width="2"/><rect x="${b.x + 6}" y="${b.y + 6}" width="${b.w - 12}" height="10" rx="5" fill="#133a73"/><text x="${b.x + b.w / 2}" y="${b.y + b.h - 18}" text-anchor="middle" font-family="Inter,sans-serif" font-size="17" font-weight="600" fill="#8fb8d8">${b.n}</text>`).join('')}
<text x="540" y="146" text-anchor="middle" font-family="Inter,sans-serif" font-size="15" fill="#5fb3a3">Central lawn</text>
</svg>`
const planUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(plan)}`

const icon = (ok: boolean, i: number) => L.divIcon({ className: '', html: `<div class="pin ${ok ? 'ok' : 'no'}"><span>${i}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] })

export default function FountainMap() {
  const [onlyVerified, setOnlyVerified] = useState(false)
  const bounds: L.LatLngBoundsExpression = [[0, 0], [H, W]]
  const list = useMemo(() => FOUNTAINS.map((f, i) => ({ ...f, i: i + 1 })).filter((f) => !onlyVerified || f.verifiedOn), [onlyVerified])
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return (
    <>
      <PageHeader title="Fountain Map" sub="Refill stations across campus. Only stations checked by staff carry a verified badge — don’t assume an unverified one is clean or safe." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Tilt className="p-3" max={2} as3d={false}>
          <div className="h-[460px] overflow-hidden rounded-[1.25rem] sm:h-[600px]">
            <MapContainer crs={L.CRS.Simple} bounds={bounds} maxBounds={[[-100, -100], [H + 100, W + 100]]} minZoom={-1.5} maxZoom={2} zoomSnap={0.25} style={{ height: '100%', width: '100%' }} attributionControl={false}>
              <ImageOverlay url={planUrl} bounds={bounds} />
              {list.map((f) => (
                <Marker key={f.id} position={[H - f.y, f.x]} icon={icon(!!f.verifiedOn, f.i)}>
                  <Popup>
                    <div className="font-display text-base font-bold">{f.name}</div>
                    <div className="text-xs opacity-80">{f.floor}</div>
                    <div className={`mt-1 text-xs font-semibold ${f.verifiedOn ? 'text-emerald-300' : 'text-orange-300'}`}>{f.verifiedOn ? `Verified by ${f.verifiedBy} on ${fmt(f.verifiedOn)}` : 'Not yet verified'}</div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </Tilt>
        <Tilt className="p-5" max={3}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white">Stations</h2>
            <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" className="h-5 w-5 accent-emerald-400" checked={onlyVerified} onChange={(e) => setOnlyVerified(e.target.checked)} /> Verified only</label>
          </div>
          <ul className="space-y-2.5">
            {list.map((f) => (
              <li key={f.id} className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-sm font-bold text-abyss ${f.verifiedOn ? 'bg-neon shadow-neon' : 'bg-slate-400'}`}>{f.i}</span>
                <div>
                  <div className="font-semibold text-white">{f.name}</div>
                  <div className="text-xs text-slate-400">{f.floor}</div>
                  <div className={`mt-1 text-xs font-semibold ${f.verifiedOn ? 'text-neon' : 'text-coral'}`}>{f.verifiedOn ? `Verified ${fmt(f.verifiedOn)} · ${f.verifiedBy}` : 'Unverified — check before drinking'}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Sample stations for the demo campus.</p>
        </Tilt>
      </div>
    </>
  )
}
