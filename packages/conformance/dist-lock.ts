import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A lock over one package's `dist`, held by every test file that builds it.
 * Each package that has a build test calls `distLock` once, in its own
 * `dist-lock.ts`, and every test that builds or reads that `dist` takes the
 * lock it returns.
 *
 * Vitest runs test files in parallel workers. Without the lock two builds run
 * at once, and one file's assertions read a tree the other build is rewriting:
 *
 *  - the build empties `dist/` before it writes, so a reader can find a module
 *    or a stylesheet missing.
 *  - the declarations are written only after the JavaScript, so a reader
 *    between the two steps finds the JavaScript without its declarations.
 *  - a build that keeps a scratch directory inside `dist` (the engine's
 *    `dist/.tsc`) can lose it to the other build's cleanup and fail while
 *    copying out of it.
 *
 * None of these failures is about what the tests assert. A test that fails for
 * unrelated reasons gets re-run until green and stops being a check.
 *
 * The lock covers the whole critical section, not only the build command. A
 * mutex around `execFileSync` alone would still let the next build empty the
 * tree a reader's assertions read after its own build returned. The holder owns
 * `dist` through the build and every read after it, until it releases the lock.
 *
 * The lock is a file created with `wx` (`packages/<package>/.dist-lock`). One
 * syscall both claims the lock and records the holder, so the lock never exists
 * without an owner. It is broken only when its owner is gone (no such pid,
 * which is what a killed vitest worker leaves) or has held it longer than
 * `STALE`, which no real hold lasts. Breaking is serialised behind a second
 * file claimed the same way (`.dist-lock.break`), under which the breaker reads
 * the owner again, so of the waiters that find one abandoned lock, one breaks
 * it and the others find it broken or taken since (`breakStaleLock`).
 *
 * One window is left. A breaker killed while it holds the break file leaves it
 * behind, and a waiter removes it once its holder is gone. Two waiters that
 * remove it at once can both go on to break, and both can then build.
 */

const ROOT = resolve(import.meta.dirname, '../..')

/**
 * The age at which a hold is stolen whether or not its pid is alive: longer
 * than `WAIT` and than the hooks' 900s budget, so only a hold that has
 * outlived any real one is. A waiter facing a stuck but live owner gives up at
 * `WAIT` first and prints the manual fix. The age check is for a dead owner
 * whose pid was recycled and looks alive.
 */
const STALE = 1_200_000
/** How long a waiter tries before giving up and naming who it waited for. */
const WAIT = 720_000

export interface Owner {
  pid: number
  at: number
  what: string
}

const readOwnerAt = (file: string): Owner | null => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Owner
  } catch {
    return null
  }
}

/**
 * Whether a holder has abandoned its file: its process is gone, or it has held
 * the file longer than `STALE`.
 */
const abandoned = (owner: Owner): boolean => !alive(owner.pid) || Date.now() - owner.at > STALE

/**
 * Removes the lock of an owner a waiter found abandoned (`stale`), and only
 * that lock. Returns whether it did.
 *
 * Two waiters can find the same abandoned owner. The first breaks the lock and
 * takes a new one, and the second must not break that. So a waiter breaks only
 * while it holds `<lock>.break`, claimed with `wx` as the lock is, and reads the
 * owner again under it: the lock is removed only while it is still `stale`'s.
 * Between that read and the removal nothing else changes the lock: its owner
 * is gone (one past `STALE` is a dead owner whose pid was reused), every other
 * breaker waits, and a waiter's `wx` claim fails while the lock exists.
 *
 * A waiter that finds the break file held returns `false`, and waits for the
 * lock as it would for a live owner. When the break file's holder has itself
 * abandoned it, the waiter removes it first.
 */
export function breakStaleLock(lockFile: string, stale: Owner): boolean {
  const breakFile = `${lockFile}.break`
  const mine: Owner = { pid: process.pid, at: Date.now(), what: `breaking pid ${stale.pid}'s lock` }
  try {
    writeFileSync(breakFile, `${JSON.stringify(mine)}\n`, { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const breaker = readOwnerAt(breakFile)
    if (breaker && abandoned(breaker)) rmSync(breakFile, { force: true })
    return false
  }
  try {
    const held = readOwnerAt(lockFile)
    if (held?.pid !== stale.pid || held.at !== stale.at) return false
    rmSync(lockFile, { force: true })
    return true
  } finally {
    const breaker = readOwnerAt(breakFile)
    if (breaker?.pid === mine.pid && breaker.at === mine.at) rmSync(breakFile, { force: true })
  }
}

export interface DistLock {
  /**
   * Takes the lock and returns a release function. `what` names the holder in
   * the message a waiter prints when it gives up, so a stuck test can be
   * diagnosed from the log instead of from a pid.
   *
   * Release in an `afterAll` (or a `finally`). Hold the lock until the last
   * read of `dist`, not only until the build returns.
   */
  lock(what: string): Promise<() => void>
  /**
   * The build every holder runs (`pnpm --filter @polymorph/<package> build`),
   * defined once so they stay identical. It refuses to run without the lock.
   */
  build(): void
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // `EPERM` means the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** The lock over `packages/<directory>/dist`, whose package is `@polymorph/<directory>`. */
export function distLock(directory: string): DistLock {
  const lockFile = resolve(ROOT, 'packages', directory, '.dist-lock')
  const where = `packages/${directory}`

  /** What this worker holds, or `null`. Compared before releasing, so it frees only its own. */
  let holding: Owner | null = null

  // `null` when the file is gone (released between the failed claim and this
  // read) or half-written (read before the writer finished). In both cases the
  // waiter knows nothing, so it waits instead of stealing.
  const readOwner = (): Owner | null => readOwnerAt(lockFile)

  /** Removes the lock, but only if it is still the one this worker took. */
  const drop = (): void => {
    if (!holding) return
    const held = readOwner()
    if (held?.pid === holding.pid && held.at === holding.at) rmSync(lockFile, { force: true })
    holding = null
  }

  return {
    async lock(what) {
      const deadline = Date.now() + WAIT

      for (;;) {
        const mine: Owner = { pid: process.pid, at: Date.now(), what }
        try {
          writeFileSync(lockFile, `${JSON.stringify(mine)}\n`, { flag: 'wx' })
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error

          const held = readOwner()
          // A waiter that could not break the lock waits as it would for a live owner: another
          // waiter is breaking it, or has broken it and may hold it now.
          if (held && abandoned(held) && breakStaleLock(lockFile, held)) {
            console.warn(
              `${directory}: broke an abandoned dist lock — pid ${held.pid}, ${held.what}`,
            )
            continue
          }

          if (Date.now() > deadline) {
            const owner = held ? `pid ${held.pid} (${held.what})` : 'an owner it could not read'
            throw new Error(
              `${directory}: waited ${WAIT / 1000}s for the lock on ${where}/dist, held by ${owner}. ` +
                `If nothing is building, delete ${where}/.dist-lock.`,
            )
          }

          await new Promise<void>((wake) => {
            setTimeout(wake, 100)
          })
          continue
        }

        holding = mine
        // Releases the lock for a worker that exits without running its
        // `afterAll`. A killed worker runs nothing, and the pid check above
        // handles that case.
        process.on('exit', drop)
        return () => {
          process.off('exit', drop)
          drop()
        }
      }
    },

    build() {
      if (!holding) {
        throw new Error(
          `${directory}: build inside the dist lock — two builds at once race over dist`,
        )
      }
      try {
        execFileSync('pnpm', ['--filter', `@polymorph/${directory}`, 'build'], {
          cwd: ROOT,
          stdio: 'pipe',
        })
      } catch (error) {
        // `pipe` keeps a passing run quiet. A failing run must include the
        // compiler output, or the error says only `Command failed: pnpm`.
        const failed = error as { stdout?: Buffer; stderr?: Buffer }
        throw new Error(
          `${directory}: the build failed\n${failed.stdout?.toString() ?? ''}${failed.stderr?.toString() ?? ''}`,
        )
      }
    },
  }
}
