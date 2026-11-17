import fs, { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { breakStaleLock, distLock, type Owner } from './dist-lock'

/**
 * The step of the dist lock that waiters race over: breaking an abandoned
 * owner's lock. Of the waiters that find the same abandoned owner, one breaks
 * the lock, and no other removes the lock a waiter took after it. A waiter
 * that cannot break the lock waits for it.
 */

const CALLS = ['linkSync', 'readFileSync', 'renameSync', 'rmSync', 'writeFileSync'] as const

/**
 * Runs `body` with another waiter's `turn` taken after each call that reads,
 * writes, renames, links or removes a file whose path starts with `prefix`:
 * what another process can do between two of the lock's calls. The calls are
 * replaced on `node:fs` itself and published to every importer with
 * `syncBuiltinESMExports`, so `dist-lock.ts` makes them however it was loaded;
 * this project shares one module registry across files, where a module mock
 * would miss a copy another file loaded first.
 */
async function interleaved<T>(
  prefix: string,
  turn: () => void,
  body: () => T,
): Promise<Awaited<T>> {
  const own = Object.fromEntries(CALLS.map((name) => [name, fs[name]]))
  let turning = false
  for (const name of CALLS) {
    const call = own[name] as (...args: unknown[]) => unknown
    Object.assign(fs, {
      [name]: (...args: unknown[]) => {
        try {
          return call(...args)
        } finally {
          // The turn's own calls take no turn.
          if (!turning && typeof args[0] === 'string' && args[0].startsWith(prefix)) {
            turning = true
            try {
              turn()
            } finally {
              turning = false
            }
          }
        }
      },
    })
  }
  syncBuiltinESMExports()
  try {
    return await body()
  } finally {
    Object.assign(fs, own)
    syncBuiltinESMExports()
  }
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function lockFile(owner: Owner): string {
  const dir = mkdtempSync(join(tmpdir(), 'pm-dist-lock-'))
  dirs.push(dir)
  const file = join(dir, '.dist-lock')
  writeFileSync(file, `${JSON.stringify(owner)}\n`)
  return file
}

const ownerOf = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'))

const dead: Owner = { pid: 2_147_483_000, at: 1, what: 'a killed worker' }
const live: Owner = { pid: process.pid, at: 2, what: 'the first waiter' }

describe('breaking a stale dist lock', () => {
  it('removes the dead owner’s lock, and the break file it held to do so', () => {
    const file = lockFile(dead)
    expect(breakStaleLock(file, dead)).toBe(true)
    expect(existsSync(file)).toBe(false)
    expect(existsSync(`${file}.break`)).toBe(false)
  })

  it('leaves a lock another waiter took after the dead owner’s was broken', () => {
    const file = lockFile(live)
    expect(breakStaleLock(file, dead)).toBe(false)
    expect(ownerOf(file)).toEqual(live)
  })

  it('does nothing when the lock is already gone', () => {
    const file = lockFile(dead)
    rmSync(file)
    expect(breakStaleLock(file, dead)).toBe(false)
    expect(existsSync(file)).toBe(false)
  })

  it('leaves the lock to a waiter that is breaking it', () => {
    const file = lockFile(dead)
    const breaker: Owner = { pid: process.pid, at: Date.now(), what: 'another waiter' }
    writeFileSync(`${file}.break`, `${JSON.stringify(breaker)}\n`)
    expect(breakStaleLock(file, dead)).toBe(false)
    expect(ownerOf(file)).toEqual(dead)
    expect(ownerOf(`${file}.break`)).toEqual(breaker)
  })

  it('removes a break file its holder abandoned, and breaks the lock on the next try', () => {
    const file = lockFile(dead)
    writeFileSync(`${file}.break`, `${JSON.stringify({ ...dead, what: 'a killed breaker' })}\n`)
    expect(breakStaleLock(file, dead)).toBe(false)
    expect(existsSync(`${file}.break`)).toBe(false)
    expect(breakStaleLock(file, dead)).toBe(true)
    expect(existsSync(file)).toBe(false)
  })

  it('keeps the first waiter’s lock while a second breaks and a third claims between its calls', async () => {
    // The first waiter broke the dead owner's lock and took it. The second read the dead owner
    // before that, and breaks now. The third tries to claim the lock after each of its calls.
    const file = lockFile(live)
    const third: Owner = { pid: process.pid, at: 3, what: 'the third waiter' }
    const claims: boolean[] = []
    const claim = () => {
      try {
        writeFileSync(file, `${JSON.stringify(third)}\n`, { flag: 'wx' })
        claims.push(true)
      } catch {
        claims.push(false)
      }
    }
    expect(await interleaved(file, claim, () => breakStaleLock(file, dead))).toBe(false)
    expect(claims.length).toBeGreaterThan(0)
    expect(claims).not.toContain(true)
    expect(ownerOf(file)).toEqual(live)
  })
})

describe('a waiter that cannot break an abandoned lock', () => {
  // `distLock('conformance')` locks `packages/conformance`, which no build test locks.
  const file = resolve(import.meta.dirname, '.dist-lock')
  afterEach(() => {
    rmSync(file, { force: true })
    rmSync(`${file}.break`, { force: true })
  })

  it('waits while another waiter breaks it, and takes the lock once it is free', async () => {
    writeFileSync(file, `${JSON.stringify(dead)}\n`)
    const breaker: Owner = { pid: process.pid, at: Date.now(), what: 'another waiter' }
    writeFileSync(`${file}.break`, `${JSON.stringify(breaker)}\n`)
    let calls = 0
    const count = () => {
      calls += 1
      // A waiter that tried again at once would never yield; this ends its loop.
      if (calls > 1000) throw new Error('the waiter tried again without waiting')
    }
    let taking: Promise<() => void> | undefined
    await interleaved(file, count, async () => {
      taking = distLock('conformance').lock('a waiter')
      await new Promise<void>((wake) => {
        setTimeout(wake, 300)
      })
    })
    expect(calls).toBeGreaterThan(0)
    expect(calls).toBeLessThan(100)
    // The other waiter breaks the lock and lets go of the break file.
    rmSync(file)
    rmSync(`${file}.break`)
    const release = await (taking as Promise<() => void>)
    expect((ownerOf(file) as Owner).what).toBe('a waiter')
    release()
    expect(existsSync(file)).toBe(false)
  })
})
