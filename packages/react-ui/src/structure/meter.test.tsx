import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { meterLaw } from '@polymorph/conformance/meter'
import { tokenColor, tokenLength } from '../controls/token-probe'
import { installTestTheme } from '@polymorph/engine/testing'
import { Meter, type MeterProps } from './Meter'
import { Progress } from './Progress'

/**
 * What a Meter says and draws is the law every shell runs
 * (`@polymorph/conformance/meter`). The tests after it are the claims a
 * browser settles for the recipe, which every shell shares: the bar is
 * Progress's, the fill takes its band's colour, and the readout is secondary
 * text in tabular figures.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<MeterProps>(true)
  })
})

meterLaw({
  shell: 'React',
  async mount(props) {
    render(<Meter {...props} />)
  },
})

const meter = () => document.querySelector<HTMLElement>('[data-member="meter"]') as HTMLElement
const track = () => meter().querySelector<HTMLElement>('[role="meter"]') as HTMLElement
const fill = () => track().firstElementChild as HTMLElement

describe('Meter — the recipe', () => {
  it('draws the bar Progress draws', () => {
    const { container } = render(<Progress value={40} label="Import" />)
    const bar = getComputedStyle(container.firstElementChild as HTMLElement)
    render(<Meter label="Storage used" value={40} />)
    const own = getComputedStyle(track())

    expect(own.blockSize).toBe(tokenLength('--pm-space-2'))
    expect(own.blockSize).toBe(bar.blockSize)
    expect(own.backgroundColor).toBe(bar.backgroundColor)
    expect(own.borderRadius).toBe(bar.borderRadius)
    expect(getComputedStyle(fill()).transitionProperty).toBe('transform')
  })

  it('fills in its band’s colour', () => {
    const at = (value: number) => {
      const { unmount } = render(
        <Meter label="Storage used" value={value} max={50} warning={40} danger={45} />,
      )
      const colour = getComputedStyle(fill()).backgroundColor
      unmount()
      return colour
    }
    expect(at(42)).toBe(tokenColor('--pm-warning-solid'))
    expect(at(48)).toBe(tokenColor('--pm-danger-solid'))
  })

  it('colours the status glyph in its band’s text colour', () => {
    render(<Meter label="Storage used" value={48} max={50} danger={45} />)
    const glyph = meter().querySelector('[role="img"]')?.parentElement as HTMLElement
    expect(getComputedStyle(glyph).color).toBe(tokenColor('--pm-danger-text'))
  })

  it('writes the readout as secondary text in tabular figures', () => {
    render(<Meter label="Storage used" value={42} max={50} valueText="42 GB of 50 GB" />)
    const value = meter().querySelector<HTMLElement>('[aria-hidden="true"]') as HTMLElement
    const style = getComputedStyle(value)

    const figures = document.createElement('span')
    figures.style.fontVariantNumeric = 'var(--pm-font-numeric)'
    document.body.append(figures)
    const numeric = getComputedStyle(figures).fontVariantNumeric
    figures.remove()

    expect(style.color).toBe(tokenColor('--pm-text-secondary'))
    expect(style.fontVariantNumeric).toBe(numeric)
    // One space step under the bar.
    expect(getComputedStyle(meter()).rowGap).toBe(tokenLength('--pm-space-2'))
  })
})
