import { describe, expect, it } from 'vitest'
import { diffSnap, isSampleSquad, localOnly, mergeRemote, snapshotOf, type RemoteState } from './remote'
import { defaultSettings } from './calc'
import { mkDb, mkLog, mkSquad, mkUser } from '../test/fixtures'
import type { DB } from './types'

const AT = '2026-11-20T08:00:00.000Z'
const remoteState = (over: Partial<RemoteState> = {}): RemoteState => ({ users: [], logs: [], settings: {}, squads: [], qrScans: {}, serverTime: AT, ...over })

/** A signed-in real account ("me") plus one sample user who lives only in the browser. */
function baseDb(): DB {
  const me = { ...mkUser('me', { squadId: 's1' }), remote: true }
  const db = mkDb([me, mkUser('sample', { squadId: 'sq-1' })], [mkLog('me', 500, AT), mkLog('sample', 250, AT)], [mkSquad('sq-1')])
  return { ...db, sessionUserId: 'me' }
}

describe('diffing local edits against the last synced snapshot', () => {
  it('reports nothing when nothing changed', () => {
    const db = baseDb()
    expect(diffSnap(db, 'me', snapshotOf(db, 'me')).body).toBeNull()
  })

  it('sends only new, removed and edited logs of the signed-in user', () => {
    const db = baseDb()
    const last = snapshotOf(db, 'me')
    const added = mkLog('me', 750, AT)
    const edited = db.logs.map((l) => (l.userId === 'me' ? { ...l, ml: 300 } : l))
    expect(diffSnap({ ...db, logs: [...db.logs, added] }, 'me', last).body?.logs).toEqual({ add: [added], remove: [], update: [] })
    expect(diffSnap({ ...db, logs: db.logs.filter((l) => l.userId !== 'me') }, 'me', last).body?.logs?.remove).toEqual([db.logs[0].id])
    expect(diffSnap({ ...db, logs: edited }, 'me', last).body?.logs?.update).toEqual([{ id: db.logs[0].id, ml: 300 }])
  })

  it('never includes other people’s logs', () => {
    const db = baseDb()
    const last = snapshotOf(db, 'me')
    const next = { ...db, logs: [...db.logs, mkLog('sample', 999, AT)] }
    expect(diffSnap(next, 'me', last).body).toBeNull()
  })

  it('detects profile, settings and sticker changes', () => {
    const db = baseDb()
    const last = snapshotOf(db, 'me')
    const renamed = { ...db, users: db.users.map((u) => (u.id === 'me' ? { ...u, name: 'New Name', squadId: null } : u)) }
    expect(diffSnap(renamed, 'me', last).body?.profile).toMatchObject({ name: 'New Name', squadId: null })
    const withSettings = { ...db, settings: { me: { ...defaultSettings(), caffeineBonusMl: 150 } } }
    expect(diffSnap(withSettings, 'me', last).body?.settings?.caffeineBonusMl).toBe(150)
    const scanned = { ...db, qrScans: { 'bottle-me': AT } }
    expect(diffSnap(scanned, 'me', last).body?.qr).toEqual({ 'bottle-me': AT })
  })

  it('asks the server to create a squad only once', () => {
    const db = baseDb()
    const last = snapshotOf(db, 'me')
    const created = { ...db, squads: [...db.squads, mkSquad('mine', { createdBy: 'me', name: 'Night Owls', code: 'NIGHTO' })] }
    expect(diffSnap(created, 'me', last).body?.createSquad).toMatchObject({ id: 'mine', name: 'Night Owls' })
    // after the server returns it, it is flagged remote and no longer a pending creation
    const synced = { ...created, squads: created.squads.map((s) => (s.id === 'mine' ? { ...s, remote: true } : s)) }
    expect(diffSnap(synced, 'me', snapshotOf(synced, 'me')).body).toBeNull()
  })
})

describe('merging the server’s view into the local database', () => {
  const others = [{ ...mkUser('bob', { squadId: 'sq-9' }), remote: true }]

  it('keeps sample data and flags everything from the server as remote', () => {
    const merged = mergeRemote(baseDb(), remoteState({ users: others, logs: [mkLog('bob', 400, AT)], squads: [mkSquad('sq-9')] }), 'me', false)
    expect(merged.users.find((u) => u.id === 'sample')?.remote).toBeUndefined()
    expect(merged.users.find((u) => u.id === 'bob')?.remote).toBe(true)
    expect(merged.squads.find((s) => s.id === 'sq-9')?.remote).toBe(true)
    expect(merged.logs.some((l) => l.userId === 'sample')).toBe(true)
  })

  it('keeps my unsynced edits while others’ data refreshes', () => {
    const db = baseDb()
    const pendingLog = mkLog('me', 111, AT)
    const local = { ...db, logs: [...db.logs, pendingLog] }
    const merged = mergeRemote(local, remoteState({ users: [{ ...db.users[0] }, ...others], logs: [mkLog('bob', 700, AT)] }), 'me', false)
    expect(merged.logs.filter((l) => l.userId === 'me')).toContainEqual(pendingLog)
    expect(merged.logs.some((l) => l.userId === 'bob' && l.ml === 700)).toBe(true)
  })

  it('adopts the server’s copy of me when there is nothing pending', () => {
    const db = baseDb()
    const serverLog = mkLog('me', 1234, AT)
    const merged = mergeRemote(db, remoteState({ users: [{ ...db.users[0], name: 'From Server' }], logs: [serverLog] }), 'me', true)
    expect(merged.users.find((u) => u.id === 'me')?.name).toBe('From Server')
    expect(merged.logs.filter((l) => l.userId === 'me')).toEqual([serverLog])
  })

  it('does not duplicate a squad once the server returns the one I created', () => {
    const db = baseDb()
    const local = { ...db, squads: [...db.squads, mkSquad('mine', { createdBy: 'me' })] }
    const merged = mergeRemote(local, remoteState({ squads: [mkSquad('mine', { createdBy: 'me' })] }), 'me', false)
    expect(merged.squads.filter((s) => s.id === 'mine')).toHaveLength(1)
    expect(merged.squads.find((s) => s.id === 'mine')?.remote).toBe(true)
  })

  it('drops a squad I created if the server rejected it', () => {
    const db = baseDb()
    const local = { ...db, squads: [...db.squads, mkSquad('rejected', { createdBy: 'me' })] }
    const merged = mergeRemote(local, remoteState(), 'me', true)
    expect(merged.squads.some((s) => s.id === 'rejected')).toBe(false)
  })

  it('removes people (and their logs) who are no longer on the server', () => {
    const withBob = mergeRemote(baseDb(), remoteState({ users: others, logs: [mkLog('bob', 400, AT)] }), 'me', false)
    const gone = mergeRemote(withBob, remoteState(), 'me', false)
    expect(gone.users.some((u) => u.id === 'bob')).toBe(false)
    expect(gone.logs.some((l) => l.userId === 'bob')).toBe(false)
  })

  it('takes other people’s caffeine settings from the server but leaves sample settings alone', () => {
    const db = { ...baseDb(), settings: { sample: { ...defaultSettings(), caffeineBonusMl: 99 } } }
    const merged = mergeRemote(db, remoteState({ users: others, settings: { bob: { caffeineOn: false, caffeineBonusMl: 0 } } }), 'me', false)
    expect(merged.settings.bob?.caffeineOn).toBe(false)
    expect(merged.settings.sample?.caffeineBonusMl).toBe(99)
  })
})

describe('what is saved locally', () => {
  it('drops server data and the remote session, keeping sample data', () => {
    const db = { ...baseDb(), settings: { me: defaultSettings(), sample: defaultSettings() }, squads: [mkSquad('sq-1'), { ...mkSquad('real'), remote: true }] }
    const local = localOnly(db)
    expect(local.users.map((u) => u.id)).toEqual(['sample'])
    expect(local.logs.every((l) => l.userId === 'sample')).toBe(true)
    expect(local.squads.map((s) => s.id)).toEqual(['sq-1'])
    expect(Object.keys(local.settings)).toEqual(['sample'])
    expect(local.sessionUserId).toBeNull()
  })

  it('keeps a local (demo) session', () => {
    expect(localOnly({ ...baseDb(), sessionUserId: 'sample' }).sessionUserId).toBe('sample')
  })

  it('recognises the built-in sample squads by id', () => {
    expect(isSampleSquad('sq-1')).toBe(true)
    expect(isSampleSquad('sq-42')).toBe(true)
    expect(isSampleSquad('abc123')).toBe(false)
    expect(isSampleSquad(null)).toBe(false)
  })
})
