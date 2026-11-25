import { describe, expect, it } from 'vitest'

import { fix, fixCode, fixCss, verifyCode, verifyCss } from './verify'

/**
 * `fix` end to end: the rules' own fixes, run until none are left.
 *
 * Each rule's test pins what its fix writes in one pass. This file checks the
 * final result, because that is what `eslint --fix` and the MCP server's `fix`
 * tool return. Overlapping edits are applied a pass apart, an import two fixes
 * both need is added once, and the remaining reports are exactly the ones no fix
 * could resolve.
 */

/** A screen with every fixable violation, plus one that needs a decision. */
const WITHOUT_THE_SYSTEM = `import { Card } from '@polymorph/react-ui'
import { Trash2 } from 'lucide-react'

export function Row({ onDelete }: { onDelete: () => void }) {
  return (
    <Card className="p-4" style={{ margin: 0 }}>
      <div style={{ display: 'flex' }}>
        <Trash2 />
        <button type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </Card>
  )
}
`

describe('fixCode', () => {
  it('applies every fix the rules offer and leaves the decisions', () => {
    const result = fixCode(WITHOUT_THE_SYSTEM)

    expect(result.fatal).toBeNull()
    expect(result.output).toBe(`import { Card, Icon, Button } from '@polymorph/react-ui'

export function Row({ onDelete }: { onDelete: () => void }) {
  return (
    <Card>
      <div style={{ display: 'flex' }}>
        <Icon name="delete" />
        <Button label="Delete" onClick={onDelete} />
      </div>
    </Card>
  )
}
`)

    // Four reports resolved, from three rules.
    expect(result.fixed).toEqual({
      'polymorph/no-external-icons': 1,
      'polymorph/no-raw-interactive': 1,
      'polymorph/no-raw-styles': 2,
    })

    // One report remains, and it needs a decision. The `style` on a plain
    // element affects layout, and its author decides what replaces it
    // (`Inline`, a `patch`, or a zone).
    expect(result.diagnostics.map(({ rule, line }) => ({ rule, line }))).toEqual([
      { rule: 'polymorph/no-raw-styles', line: 6 },
    ])
  })

  it('leaves styled elements exactly as written', () => {
    // The same two elements, each with a prop that has an effect: a size `Icon`
    // would have to map to a step, and a class the member has no place for. A
    // fix keeps everything or does not run, so neither is changed. Both are
    // still reported, the class on the raw element too, and nothing is counted
    // as fixed.
    const styled = `import { Trash2 } from 'lucide-react'

export const Row = ({ onDelete }) => (
  <>
    <Trash2 size={20} />
    <button className="btn-danger" onClick={onDelete}>Delete</button>
  </>
)
`
    const result = fixCode(styled)

    expect(result.output).toBe(styled)
    expect(result.fixed).toEqual({})
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual([
      'polymorph/no-external-icons',
      'polymorph/no-raw-interactive',
      'polymorph/no-raw-styles',
    ])
  })

  it('reports afterwards exactly what linting its own output reports', () => {
    // The same promise `validate` makes, kept after a rewrite: what `fix` reports
    // as remaining is what the toolchain would report on the returned code.
    const result = fixCode(WITHOUT_THE_SYSTEM)
    expect(result.diagnostics).toEqual(verifyCode(result.output).diagnostics)
  })

  it('changes nothing on a second run', () => {
    const once = fixCode(WITHOUT_THE_SYSTEM)
    const twice = fixCode(once.output)
    expect(twice.output).toBe(once.output)
    expect(twice.fixed).toEqual({})
  })

  it('returns lawful code untouched', () => {
    const lawful = `import { Button, Stack } from '@polymorph/react-ui'

export const Screen = () => (
  <Stack gap={4}>
    <Button label="Save" />
  </Stack>
)
`
    expect(fixCode(lawful)).toEqual({ output: lawful, fixed: {}, diagnostics: [], fatal: null })
  })

  it('applies overlapping edits a pass apart and adds a shared import once', () => {
    const result = fixCode(`import { Card } from '@polymorph/react-ui'

export const A = () => (
  <Card className="wide" style={{ width: 1 }}>
    <button type="button" onClick={a}>One</button>
    <button onClick={b}>Two</button>
  </Card>
)
`)
    // The second button has no `type`, which in HTML means `submit`.
    expect(result.output).toBe(`import { Card, Button } from '@polymorph/react-ui'

export const A = () => (
  <Card>
    <Button label="One" onClick={a} />
    <Button label="Two" onClick={b} type="submit" />
  </Card>
)
`)
    // The fix writes Button's defaults, which make a main Button. Which of the two leads the
    // Card is a decision, so `one-main-button` reports the second and nothing rewrites it.
    expect(result.diagnostics.map((diagnostic) => [diagnostic.rule, diagnostic.line])).toEqual([
      ['polymorph/one-main-button', 6],
    ])
  })

  it('leaves a `<button>` as written when there is no module to import `Button` from', () => {
    // A repository that vendors its members imports them by path, and indicates
    // that by leaving the option out. The other fixes need no such module: `Icon`
    // is added to the file's existing vocabulary import, or imported from
    // `@polymorph/react`.
    const result = fixCode(WITHOUT_THE_SYSTEM, { vocabulary: null })

    expect(result.output).toContain('<button type="button" onClick={onDelete}>')
    expect(result.output).toContain('<Icon name="delete" />')
    expect(result.output).toContain("import { Card, Icon } from '@polymorph/react-ui'")
    expect(result.fixed['polymorph/no-raw-interactive']).toBeUndefined()
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toContain(
      'polymorph/no-raw-interactive',
    )
  })

  it('changes nothing in a fragment that does not parse', () => {
    const broken = 'export const A = () => <button onClick={send}>Send</button'
    const result = fixCode(broken)
    expect(result.output).toBe(broken)
    expect(result.fatal).not.toBeNull()
    expect(result.fixed).toEqual({})
  })
})

describe('fixCss', () => {
  const filename = 'apps/app/src/screen.css'

  it('reports a stylesheet and rewrites none of it', async () => {
    // No CSS rule has a fix. A misspelled token looks fixable, and the message
    // includes the nearest real name. But a wrong token name is usually guessed,
    // and the name one letter away is a different token: `--pm-accent-fg` is not
    // a typo for `--pm-accent-bg`.
    const source = '.cta {\n  color: var(--pm-accent-fg);\n  transition: color 200ms;\n}\n'
    const result = await fixCss(source, { filename })

    expect(result.output).toBe(source)
    expect(result.fixed).toEqual({})
    expect(result.diagnostics).toEqual((await verifyCss(source, { filename })).diagnostics)
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule).sort()).toEqual([
      'polymorph/no-ghost-tokens',
      'polymorph/no-motion-outside-vocabulary',
    ])
    expect(result.diagnostics.map((diagnostic) => diagnostic.message).join(' ')).toContain(
      'Did you mean',
    )
  })
})

describe('fix', () => {
  it('routes by filename, as `verify` does', async () => {
    const css = await fix('.hero {\n  transition: color 200ms;\n}\n', {
      filename: 'apps/app/src/screen.css',
    })
    expect(css.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual([
      'polymorph/no-motion-outside-vocabulary',
    ])

    const code = await fix(WITHOUT_THE_SYSTEM)
    expect(code.output).toContain('<Icon name="delete" />')
  })
})
