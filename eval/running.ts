import { spawn, type ChildProcess } from 'node:child_process'
import { availableParallelism } from 'node:os'

/**
 * How the eval's tests start `eval/run.mjs`: a few at a time, each kept until
 * it exits.
 *
 * At most `limit` evals run at once, so a test file that starts many keeps
 * the machine's load, and each eval's time, within what its setup allows.
 * When a test file ends, `stopAll` sends SIGTERM to every eval still running
 * (a setup that timed out leaves some), which stops the harnesses it started
 * and removes its scratch directories (`onInterrupt`, `eval/harnesses.mjs`).
 * The evals still waiting for their turn are refused, and so is every eval
 * asked for afterwards, so none starts once the file has ended.
 *
 * `entry` is the script started, `eval/run.mjs` unless a test of the runner
 * itself names another.
 */

export interface Ran {
  code: number
  stdout: string
  stderr: string
}

/** What a run asked for after `stopAll` is refused with. */
export class StoppedError extends Error {
  constructor() {
    super('the evals were stopped, so this one does not start')
  }
}

export function evalRunner(
  root: string,
  limit = Math.max(2, Math.floor(availableParallelism() / 2)),
  entry = 'eval/run.mjs',
) {
  const running = new Set<ChildProcess>()
  const waiting: { start: () => void; refuse: (error: Error) => void }[] = []
  let active = 0
  let stopped = false

  const acquire = () =>
    new Promise<void>((start, refuse) => {
      if (stopped) refuse(new StoppedError())
      else if (active < limit) {
        active += 1
        start()
      } else waiting.push({ start, refuse })
    })
  const release = () => {
    const next = stopped ? undefined : waiting.shift()
    if (next === undefined) active -= 1
    else next.start()
  }

  /**
   * `node <entry> <args>`: its exit code and what it printed. `env` is laid
   * over the test's own environment, or replaces it when `whole` is set.
   * Refused with `StoppedError` once `stopAll` has run.
   */
  async function run(args: string[], env: NodeJS.ProcessEnv = {}, whole = false): Promise<Ran> {
    await acquire()
    try {
      if (stopped) throw new StoppedError()
      return await new Promise<Ran>((done) => {
        const child = spawn(process.execPath, [entry, ...args], {
          cwd: root,
          env: whole ? env : { ...process.env, ...env },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        running.add(child)
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (chunk) => (stdout += chunk))
        child.stderr.on('data', (chunk) => (stderr += chunk))
        child.on('close', (code, signal) => {
          running.delete(child)
          done({ code: code ?? (signal === null ? 1 : 128), stdout, stderr })
        })
      })
    } finally {
      release()
    }
  }

  /** Sends SIGTERM to every eval still running, and refuses every eval waiting or asked for later. */
  function stopAll() {
    stopped = true
    for (const { refuse } of waiting.splice(0)) refuse(new StoppedError())
    for (const child of running) child.kill('SIGTERM')
    running.clear()
  }

  return { run, stopAll }
}
