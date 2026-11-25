import { spawn, type ChildProcess } from 'node:child_process'
import { availableParallelism } from 'node:os'

/**
 * How the eval's tests start `eval/run.mjs`: a few at a time, each kept until
 * it exits.
 *
 * At most `limit` evals run at once, so a test file that starts many keeps
 * the machine's load, and each eval's time, within what its setup allows.
 * Every eval still running when a test file ends, a setup that timed out
 * among them, is sent SIGTERM by `stopAll`, which stops the harnesses it
 * started and removes its scratch directories (`onInterrupt`,
 * `eval/harnesses.mjs`).
 */

export interface Ran {
  code: number
  stdout: string
  stderr: string
}

export function evalRunner(
  root: string,
  limit = Math.max(2, Math.floor(availableParallelism() / 2)),
) {
  const running = new Set<ChildProcess>()
  const waiting: (() => void)[] = []
  let active = 0

  const acquire = () =>
    new Promise<void>((done) => {
      if (active < limit) {
        active += 1
        done()
      } else waiting.push(done)
    })
  const release = () => {
    const next = waiting.shift()
    if (next === undefined) active -= 1
    else next()
  }

  /**
   * `node eval/run.mjs <args>`: its exit code and what it printed. `env` is
   * laid over the test's own environment, or replaces it when `whole` is set.
   */
  async function run(args: string[], env: NodeJS.ProcessEnv = {}, whole = false): Promise<Ran> {
    await acquire()
    try {
      return await new Promise<Ran>((done) => {
        const child = spawn(process.execPath, ['eval/run.mjs', ...args], {
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

  /** Sends SIGTERM to every eval still running. */
  function stopAll() {
    for (const child of running) child.kill('SIGTERM')
    running.clear()
  }

  return { run, stopAll }
}
