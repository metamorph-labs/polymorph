import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isRecord, SPEC_DEFAULTS, specNames, specPattern, type SpecDefault } from './strings'

/**
 * The defaults the specs name (`strings.ts`), which both platforms' contracts
 * declare as `PMStrings`. Each is held to the spec it cites, so a spec that
 * changes its words fails here until the list follows; `contracts.test.ts`
 * and `kotlin.test.ts` hold the Swift and the Kotlin each platform writes.
 */

const ROOT = resolve(import.meta.dirname, '../../..')

describe('the defaults the specs name (`strings.ts`)', () => {
  const entries: SpecDefault[] = SPEC_DEFAULTS.flatMap((entry) =>
    isRecord(entry) ? entry.fields : [entry],
  )

  it('are each held to the spec that names them: the whole text is in it, a value in each parameter', () => {
    const faults = entries.flatMap((entry) => {
      const spec = readFileSync(resolve(ROOT, entry.spec), 'utf8')
      return specNames(entry.english, spec)
        ? []
        : [`${entry.name}: "${entry.english}" is not in ${entry.spec}`]
    })
    expect(faults).toEqual([])
  })

  it('match a template only where every literal part stands in order', () => {
    const spoken = specPattern('step {position} of {count}, {state}')
    expect(spoken.test('Read as "step 2 of 4, current".')).toBe(true)
    expect(spoken.test('Read as "step 2\nof 4, current", wrapped.')).toBe(true)
    expect(spoken.test('Read as "step 2 of 4" and then the state.')).toBe(false)
    expect(spoken.test('Read as "4 of 2 steps, current".')).toBe(false)
    expect(specPattern('Add "{text}"').test('the offer reads Add "Billing"')).toBe(true)
    expect(specPattern('Close').test('a close button')).toBe(false)
  })

  it('match a default without parameters only where the spec names it as text', () => {
    const table =
      '| Prop | Type | Default | Notes |\n| --- | --- | --- | --- |\n| `closeLabel` | `string` | Close | the name |'
    expect(specNames('Close', 'a close button')).toBe(false)
    expect(specNames('Close', 'The Close button sits at the top.')).toBe(false)
    expect(specNames('Deny', 'onDeny: () => void')).toBe(false)
    expect(specNames('failed', '| failed | `status="error"` | `data-status="error"` |')).toBe(false)
    expect(specNames('Close', 'Its generic default is `Close`;')).toBe(true)
    expect(specNames('Close', `label="Close"`)).toBe(true)
    expect(specNames('Close', table)).toBe(true)
    expect(specNames('Allow', 'the approve control; default Allow')).toBe(true)
    expect(specNames('Denied', 'the decided words; defaults Allowed / Denied')).toBe(true)
    expect(specNames('not started', 'read "{label}, {completed|current|not started}"')).toBe(true)
  })

  it('name each parameter a template writes, and no other', () => {
    for (const entry of entries) {
      const written = [...entry.english.matchAll(/\{(\w+)\}/g)].map((match) => match[1])
      expect(written, entry.name).toEqual(
        (entry.parameters ?? []).map((parameter) => parameter.name),
      )
    }
  })

  it('give each property one name', () => {
    const names = SPEC_DEFAULTS.map((entry) => entry.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
