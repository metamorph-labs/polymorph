import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { afterAll, describe, expect, it } from 'vitest'

import { ELEMENTS_UNEMITTED, emitScreen, UnemittedFrameworkError } from './emit'
import { emitCheckedScreen, validateSpec } from './lawful'
import type { ScreenSpec } from './schema'

/**
 * A spec, read for the elements.
 *
 * Every read tool takes the elements: a spec is validated against the members
 * the elements vocabulary ships. No emitter writes an elements page, because a
 * spec's inputs include callbacks and node renderers, and HTML has no syntax
 * that binds either to a member. The emitter, its checked path and `pnpm emit`
 * each refuse with that reason and write nothing.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

const inbox = JSON.parse(
  readFileSync(resolve(ROOT, 'design/screens/inbox.json'), 'utf8'),
) as ScreenSpec

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

describe('a spec for the elements', () => {
  it('is validated against the members the elements vocabulary ships', () => {
    const editor = { ...inbox, root: { component: 'ImageEditor', props: {} } } as ScreenSpec
    const absent = registry.components.find((member) => member.name === 'ImageEditor')
    expect(absent?.frameworks.elements.status).toBe('absent')
    const { ok, faults } = validateSpec(registry, editor, { framework: 'elements' })
    expect(ok).toBe(false)
    expect(faults.map((fault) => fault.message).join('\n')).toContain(
      '`ImageEditor` is absent in elements',
    )
  })

  it('is refused by the emitter, with the reason', async () => {
    await expect(emitScreen(inbox, { framework: 'elements', registry })).rejects.toThrow(
      UnemittedFrameworkError,
    )
    await expect(emitScreen(inbox, { framework: 'elements', registry })).rejects.toThrow(
      'HTML has no way to bind a screen’s callbacks and node renderers',
    )
    expect(await emitCheckedScreen(inbox, { framework: 'elements', registry })).toEqual({
      code: '',
      violations: [],
      fatal: ELEMENTS_UNEMITTED,
    })
  })
})

describe('pnpm emit, for the elements', () => {
  const scratch = mkdtempSync(resolve(tmpdir(), 'polymorph-emit-elements-bin-'))
  temporaries.push(scratch)
  const BIN = resolve(ROOT, 'packages/spec/bin/emit.js')
  const run = (args: string[]) =>
    spawnSync(process.execPath, [BIN, ...args], { cwd: ROOT, encoding: 'utf8' })

  it('refuses --framework elements and a .html output, and writes nothing', () => {
    const input = resolve(scratch, 'inbox.json')
    writeFileSync(input, JSON.stringify(inbox))
    for (const args of [
      [input, resolve(scratch, 'inbox.html')],
      [input, '--framework', 'elements'],
    ]) {
      const result = run(args)
      expect(result.status, args.join(' ')).toBe(1)
      expect(result.stderr).toContain(`emit: ${ELEMENTS_UNEMITTED}`)
      expect(result.stdout).toBe('')
    }
    expect(existsSync(resolve(scratch, 'inbox.html'))).toBe(false)
    // Each run loads the emitter's modules, which takes seconds under the suite's load.
  }, 120_000)
})
