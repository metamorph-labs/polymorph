import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { evalRunner, StoppedError } from './running'

/**
 * How the eval's tests start their evals (`eval/running.ts`), checked with a
 * script that records that it started and then waits, in place of
 * `eval/run.mjs`.
 */

const SCRATCH = mkdtempSync(resolve(tmpdir(), 'polymorph-eval-running-test-'))

afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }))

/** A script that writes a file named by its first argument, then waits a minute. */
function waiting() {
  const file = resolve(SCRATCH, 'waits.mjs')
  writeFileSync(
    file,
    [
      "import { writeFileSync } from 'node:fs'",
      "writeFileSync(process.argv[2], 'started')",
      'setTimeout(() => {}, 60_000)',
    ].join('\n'),
  )
  return file
}

describe('the evals a test file starts', () => {
  it('start no more than the limit at once, and none once they are stopped', async () => {
    const started = (name: string) => resolve(SCRATCH, `${name}.started`)
    const runner = evalRunner(SCRATCH, 1, waiting())
    const first = runner.run([started('first')])
    const second = runner.run([started('second')])
    for (let tries = 0; !existsSync(started('first')) && tries < 100; tries += 1) {
      await new Promise((done) => setTimeout(done, 50))
    }
    expect(existsSync(started('first'))).toBe(true)
    // The limit is one, so the second waits for the first.
    expect(existsSync(started('second'))).toBe(false)

    // The second is refused as the evals stop, before the first has ended, so its refusal is
    // awaited from here: a rejection nothing waits for is an error of the test run.
    const refused = expect(second).rejects.toBeInstanceOf(StoppedError)
    runner.stopAll()
    await refused
    // The first is stopped, and its end does not start the second.
    expect((await first).code).not.toBe(0)
    await expect(runner.run([started('third')])).rejects.toBeInstanceOf(StoppedError)
    await new Promise((done) => setTimeout(done, 200))
    expect(readdirSync(SCRATCH).filter((entry) => entry.endsWith('.started'))).toEqual([
      'first.started',
    ])
  })
})
