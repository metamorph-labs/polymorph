import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { highlightLaw } from '@polymorph/conformance/highlight'
import { fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { tokenColor } from '../controls/token-probe'
import { Highlight, type HighlightProps } from './Highlight'
import { Text } from './Text'

/**
 * What a Highlight marks and what a screen reader hears is the law every web
 * shell is held to (`@polymorph/conformance/highlight`). This file adds what is
 * React's to check: the closed surface, the mark's paint, and a mark that wraps.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<HighlightProps>(true)
  })
})

highlightLaw({
  shell: 'React',
  async mount(props) {
    render(<Highlight {...props} />)
  },
})

describe('the mark', () => {
  it('paints its own pair, which the contrast law measures in every pairing', () => {
    const { container } = render(<Highlight text="Refund for invoice 2026-118" query="invoice" />)
    const mark = getComputedStyle(container.querySelector('mark') as HTMLElement)
    expect(mark.color).toBe(tokenColor('--pm-warning-text'))
    expect(mark.backgroundColor).toBe(tokenColor('--pm-warning-subtle'))
  })

  it('wraps with the text around it, so a long match never widens what holds it', () => {
    const host = fixedWidthHost(160)
    const term = 'northwind-renewal-for-the-march-invoices-and-credit-notes'
    render(
      <Text>
        <Highlight text={`Ticket about ${term}`} query={term} />
      </Text>,
      { container: host },
    )
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth)
    host.remove()
  })
})
