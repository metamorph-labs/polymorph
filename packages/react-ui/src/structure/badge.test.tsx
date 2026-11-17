import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import { tokenColor, tokenLength } from '../controls/token-probe'
import { Badge } from './Badge'

/**
 * Badge's count and dot forms (`design/components/badge.md`). The text form is
 * held by the completeness law and the contrast law through its fixture.
 */

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement | null {
  return render(node).container.firstElementChild as HTMLElement | null
}

describe('the count', () => {
  it('draws the number in the text’s place', () => {
    const badge = mount(<Badge count={7}>ignored</Badge>) as HTMLElement
    expect(badge.textContent).toBe('7')
    expect(badge.dataset['count']).toBe('')
  })

  it('draws the cap and a plus sign past max', () => {
    expect(mount(<Badge count={99} />)?.textContent).toBe('99')
    expect(mount(<Badge count={100} />)?.textContent).toBe('99+')
    expect(mount(<Badge count={12} max={9} />)?.textContent).toBe('9+')
  })

  it('draws nothing at zero, below it, or for a value that is not a number', () => {
    expect(mount(<Badge count={0} />)).toBeNull()
    expect(mount(<Badge count={-2} />)).toBeNull()
    expect(mount(<Badge count={Number.NaN} />)).toBeNull()
  })

  it('is never narrower than it is tall, and keeps its width as digits change', () => {
    const one = (mount(<Badge count={1} />) as HTMLElement).getBoundingClientRect()
    expect(one.width).toBeGreaterThanOrEqual(one.height - 0.5)
    const eight = (mount(<Badge count={8} />) as HTMLElement).getBoundingClientRect()
    expect(eight.width).toBe(one.width)
    expect(
      getComputedStyle(mount(<Badge count={8} />) as HTMLElement).fontVariantNumeric,
    ).toContain('tabular-nums')
  })

  it('keeps the variant × tone cell', () => {
    const badge = mount(<Badge variant="solid" tone="accent" count={3} />) as HTMLElement
    expect(getComputedStyle(badge).backgroundColor).toBe(tokenColor('--pm-accent-bg'))
  })
})

describe('the dot', () => {
  it('draws a round mark of one size and no visible text', () => {
    const dot = mount(
      <Badge tone="accent" dot icon="time">
        New
      </Badge>,
    ) as HTMLElement
    const box = dot.getBoundingClientRect()
    expect(`${box.width}px`).toBe(tokenLength('--pm-space-3'))
    expect(`${box.height}px`).toBe(tokenLength('--pm-space-3'))
    expect(dot.querySelector('svg')).toBeNull()
    expect(dot.dataset['dot']).toBe('')
  })

  it('fills with the tone’s solid colour, whatever the variant', () => {
    for (const variant of ['soft', 'solid', 'outline'] as const) {
      const dot = mount(
        <Badge variant={variant} tone="danger" dot>
          Failed
        </Badge>,
      ) as HTMLElement
      expect(getComputedStyle(dot).backgroundColor, variant).toBe(tokenColor('--pm-danger-solid'))
    }
  })

  it('keeps its words for a screen reader, hidden from the eye', () => {
    const dot = mount(
      <Badge tone="accent" dot>
        New
      </Badge>,
    ) as HTMLElement
    expect(dot.getAttribute('aria-hidden')).toBeNull()
    expect(dot.textContent).toBe('New')
    const words = dot.firstElementChild as HTMLElement
    expect(words.getBoundingClientRect().width).toBeLessThanOrEqual(1)
  })

  it('is hidden from assistive technology when it has no words', () => {
    const dot = mount(<Badge tone="accent" dot />) as HTMLElement
    expect(dot.getAttribute('aria-hidden')).toBe('true')
    expect(dot.textContent).toBe('')
  })
})
