import { describe, expect, it } from 'vitest'

import { lawfulCells, type LawfulVariants } from './variants'

/**
 * The grid from `design/components/button.md`, used as a test case for the
 * utility. Button defines its own type. This grid is the reason the utility
 * exists: `neutral` is excluded from the filled variants by law.
 */
type ButtonAppearance = LawfulVariants<{
  solid: 'accent' | 'danger'
  soft: 'accent' | 'danger'
  outline: 'neutral' | 'accent' | 'danger'
  ghost: 'neutral' | 'accent' | 'danger'
}>

describe('LawfulVariants', () => {
  it('accepts every lawful cell', () => {
    const lawful: ButtonAppearance[] = [
      {},
      { variant: 'solid' },
      { tone: 'danger' },
      { variant: 'solid', tone: 'accent' },
      { variant: 'solid', tone: 'danger' },
      { variant: 'soft', tone: 'accent' },
      { variant: 'outline', tone: 'neutral' },
      { variant: 'ghost', tone: 'neutral' },
      { variant: 'ghost', tone: 'danger' },
    ]
    expect(lawful).toHaveLength(9)
  })

  it('makes an unlawful cell a type error, not a runtime warning', () => {
    // A grey filled button is excluded by law because the catalogue has no
    // neutral interactive fill. If this line ever compiles, the unused
    // `@ts-expect-error` becomes the error, so the test still fails.
    // @ts-expect-error `neutral` is not lawful with `solid`
    const unlawful: ButtonAppearance = { variant: 'solid', tone: 'neutral' }
    expect(unlawful).toBeDefined()
  })

  it('rejects a tone that is in no cell at all', () => {
    // @ts-expect-error `warning` is not a Button tone
    const unknown: ButtonAppearance = { variant: 'solid', tone: 'warning' }
    expect(unknown).toBeDefined()
  })

  it('rejects a variant that does not exist', () => {
    // @ts-expect-error there is no `filled` variant
    const unknown: ButtonAppearance = { variant: 'filled' }
    expect(unknown).toBeDefined()
  })
})

describe('lawfulCells', () => {
  it('flattens the grid into the cells a fixture should render', () => {
    const cells = lawfulCells({
      solid: ['accent', 'danger'],
      soft: ['accent', 'danger'],
      outline: ['neutral', 'accent', 'danger'],
      ghost: ['neutral', 'accent', 'danger'],
    })

    // Ten lawful cells, not the twelve a two-enum cross-product would give.
    expect(cells).toHaveLength(10)
    expect(cells).toContainEqual({ variant: 'outline', tone: 'neutral' })
    expect(cells).not.toContainEqual({ variant: 'solid', tone: 'neutral' })
  })
})
