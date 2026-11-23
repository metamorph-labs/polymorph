import { describe, expect, it } from 'vitest'

import { cardType, renderRuntimeCard, type RuntimeCardVocabulary } from './runtime-card'

/**
 * The run-time card's renderer, on types and a vocabulary written here. The
 * card the screen package renders from the generated table is held to the
 * registry's in `packages/screen/src/parity.test.ts`, and its budget and its
 * members in `packages/screen/src/card.test.ts`.
 */

const ROLES = new Set(['add', 'remove'])

describe('a prop’s type, as the card writes it', () => {
  it('leaves out `undefined` and writes the icon roles, booleans and nodes by name', () => {
    expect(cardType('string | undefined', ROLES)).toBe('string')
    expect(cardType('"add" | "remove" | undefined', ROLES)).toBe('IconRole')
    expect(cardType('"add" | undefined', ROLES)).toBe('"add"')
    expect(cardType('false | true', ROLES)).toBe('boolean')
    expect(cardType('ReactNode', ROLES)).toBe('node')
    expect(cardType('string | ReactNode', ROLES)).toBe('node')
    expect(cardType('ReactElement<{ a?: string | undefined; }, string>', ROLES)).toBe('node')
    expect(cardType('readonly string[]', ROLES)).toBe('string[]')
    expect(cardType('{ a: string; b?: number | undefined; }', ROLES)).toBe(
      '{ a: string; b?: number; }',
    )
  })

  it('writes a callback without the DOM event it is handed', () => {
    expect(
      cardType('((event: MouseEvent<HTMLButtonElement, MouseEvent>) => void) | undefined', ROLES),
    ).toBe('() => void')
    expect(
      cardType(
        '((value: string, event: ChangeEvent<HTMLInputElement, Element>) => void) | undefined',
        ROLES,
      ),
    ).toBe('(value: string) => void')
    expect(cardType('ReactEventHandler<HTMLInputElement> | undefined', ROLES)).toBe('() => void')
    expect(cardType('((row: Row) => ReactNode) | undefined', ROLES)).toBe('(row: Row) => node')
  })

  it('reads a function’s result to the end of its text, and parenthesises a function in a union', () => {
    expect(cardType('() => void | Promise<void>', ROLES)).toBe('() => void|Promise<void>')
    expect(
      cardType('((value: string) => void) | undefined | ((values: string[]) => void)', ROLES),
    ).toBe('((value: string) => void)|((values: string[]) => void)')
  })
})

describe('the members section', () => {
  // No framework declares a shell, so each carries React's parts.
  const frameworks = { react: {}, vue: {}, svelte: {}, solid: {}, angular: {}, elements: {} }
  const vocabulary: RuntimeCardVocabulary = {
    components: [
      {
        name: 'Button',
        tier: 'controls',
        purpose: 'The action primitive',
        props: [
          { name: 'label', type: 'string', optional: false },
          { name: 'icon', type: '"add" | "remove" | undefined', optional: true },
          { name: 'controlRef', type: 'Ref<HTMLButtonElement> | undefined', optional: true },
        ],
        parts: [],
        grid: { solid: ['accent'] },
        frameworks,
      },
      {
        name: 'Table',
        tier: 'structure',
        purpose: 'A table',
        props: [{ name: 'children', type: 'ReactNode', optional: true }],
        parts: [
          {
            name: 'Row',
            props: [{ name: 'selected', type: 'boolean | undefined', optional: true }],
          },
        ],
        grid: null,
        frameworks,
      },
    ],
    exceptions: {
      primitives: [
        {
          name: 'Bespoke',
          rung: 4,
          purpose: 'A declared escape zone',
          props: [{ name: 'reason', type: 'string', optional: false }],
        },
      ],
    },
    icons: { roles: [{ name: 'add' }, { name: 'remove' }] },
  }

  it('lists the allowed members by tier, their parts under them, the primitives and the roles', () => {
    const card = renderRuntimeCard(vocabulary, {
      framework: 'react',
      members: new Set(['Button', 'Table', 'Bespoke']),
    })
    expect(card).toContain(
      '- **Button** — The action primitive · label*: string · icon: IconRole · cells: solid(accent)',
    )
    expect(card).toContain('  - **Table.Row** · selected: boolean')
    expect(card).toContain('- **Bespoke** (rung 4) — A declared escape zone · reason*: string')
    expect(card).toContain('one of: add, remove.')
    expect(card.indexOf('### Controls')).toBeLessThan(card.indexOf('### Structure'))
    expect(card).not.toContain('controlRef')
  })

  it('leaves out a member the host does not allow, and the roles when nothing listed takes one', () => {
    const card = renderRuntimeCard(vocabulary, { framework: 'react', members: new Set(['Table']) })
    expect(card).not.toContain('Button')
    expect(card).not.toContain('Bespoke')
    expect(card).not.toContain('IconRole')
  })
})
