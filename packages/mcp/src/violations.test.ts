import { resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { describe, expect, it } from 'vitest'

import { fix, validate, type ToolContext } from './tools'
import { withClimb } from './violations'

/**
 * Every violation `validate` returns carries its answer: the rule's fix when
 * the violation has exactly one rewrite, the alternatives its message names as
 * data, and the message itself. An agent reads `fix` and `alternatives`
 * instead of parsing a sentence, and gets the same answer the sentence gives.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)
const context: ToolContext = { registry, root: ROOT }

const screen = (body: string, imports = '') =>
  `${imports}export function Screen() {\n  return ${body}\n}\n`

describe('a violation from validate', () => {
  it('carries the rule’s fix as an edit, when the rewrite is certain', async () => {
    const code = screen(
      '<Button className="mt-4" label="Save" />',
      "import { Button } from '@polymorph/react-ui'\n\n",
    )
    const [violation] = (await validate(context, { code })).violations ?? []

    expect(violation?.rule).toBe('polymorph/no-raw-styles')
    const edit = violation?.fix
    expect(edit).not.toBeNull()
    const { range, text } = edit as { range: [number, number]; text: string }
    // Applying the edit is what `fix` returns.
    const applied = code.slice(0, range[0]) + text + code.slice(range[1])
    expect(applied).toBe((await fix(context, { code })).code)
  })

  it('carries the alternatives its message names, with the rung each is on', async () => {
    const answer = await validate(context, {
      code: screen("<div style={{ display: 'flex', gap: 12, padding: 16 }} />"),
    })
    const [violation] = answer.violations ?? []

    expect(violation?.fix).toBeNull()
    expect(violation?.message).toBe(
      'Unexpected `style` on <div>. `display`, `gap` and `padding` are `<Inline gap={4} p={5}>` ' +
        '(rung 1).',
    )
    expect(violation?.alternatives).toEqual([{ member: 'Inline', prop: 'gap', rung: 1 }])
    // The ladder is still there for when the named answer does not fit.
    expect(violation?.climb.map((rung) => rung.rung)).toEqual([1, 3, 4])
  })

  it('names the nearest token by value for a raw colour, on the zone’s rung', async () => {
    // Application code reads a `var(--pm-…)` only inside a zone, so the token
    // is rung 4; the member's `tone` beside it is rung 1.
    const answer = await validate(context, { code: "const BRAND = '#0089ea'\n" })
    const [violation] = answer.violations ?? []
    expect(violation?.message).toMatch(/^Unexpected colour `#0089ea`\. Its nearest role is `--pm-/)
    expect(violation?.alternatives).toEqual(
      expect.arrayContaining([
        { token: expect.stringMatching(/^--pm-/), rung: 4 },
        { prop: 'tone', rung: 1 },
      ]),
    )
  })

  it('carries a member and its prop for a raw control', async () => {
    const answer = await validate(context, { code: screen('<input type="search" name="q" />') })
    expect(answer.violations?.[0]?.alternatives).toEqual([{ member: 'SearchInput', rung: 1 }])
  })

  it('puts a promotion on rung 5, with nothing to write', async () => {
    const answer = await validate(context, {
      code: "import { Rocket } from 'lucide-react'\n\nexport const A = () => <Rocket />\n",
    })
    expect(answer.violations?.[0]?.alternatives).toEqual([{ rung: 5 }])
  })

  it('puts the vocabulary’s own answers on no rung', async () => {
    const answer = await validate(context, {
      code: '.button {\n  padding: 12px;\n}\n',
      surface: 'vocabulary',
    })
    const [violation] = answer.violations ?? []
    expect(violation?.rule).toBe('polymorph/token-values-only')
    expect(violation?.fix).toBeNull()
    expect(violation?.alternatives).toEqual([
      { token: expect.stringMatching(/^--pm-space-/), rung: null },
    ])
    expect(violation?.climb).toEqual([])
  })

  it('keeps every message under 200 characters', async () => {
    const answer = await validate(context, {
      code: screen(
        '<div style={{ padding: 12, color: \'rebeccapurple\' }} className="flex gap-2" onClick={go}><button>Save</button><input type="email" /><select /></div>',
      ),
    })
    expect((answer.violations ?? []).length).toBeGreaterThan(4)
    for (const violation of answer.violations ?? []) {
      expect(violation.message.length, violation.message).toBeLessThan(200)
      expect(violation.fix !== null || violation.alternatives.length > 0, violation.message).toBe(
        true,
      )
    }
  })
})

describe('withClimb', () => {
  it('passes the fix and the alternatives through, beside the rungs', () => {
    const [violation] = withClimb(registry, [
      {
        rule: 'polymorph/no-raw-interactive',
        message: 'Unexpected <select>. Use `<Select options={…}>` (rung 1).',
        line: 1,
        column: 1,
        endLine: null,
        endColumn: null,
        fix: null,
        alternatives: [{ member: 'Select', prop: 'options', rung: 1 }],
      },
    ])
    expect(violation).toMatchObject({
      fix: null,
      alternatives: [{ member: 'Select', prop: 'options', rung: 1 }],
      law: expect.stringContaining('vocabulary'),
    })
    expect(violation?.climb.map((rung) => rung.rung)).toEqual([1, 4])
  })
})
