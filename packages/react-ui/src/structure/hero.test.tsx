import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { Button } from '../controls/Button'
import { tokenColor, tokenLength } from '../controls/token-probe'
import { Hero, type HeroProps } from './Hero'

/**
 * Hero, the display tier's page opener.
 *
 * Three things. The title is a real `<h1>` at the *display* step, read from the
 * theme so a serif display face still passes. The Hero sets its own vertical
 * padding. Absent slots are absent from the DOM, because an empty row still
 * takes a `gap`.
 */

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

/** The four properties a type step decides, as the browser computed them. */
function quartet(element: HTMLElement) {
  const style = getComputedStyle(element)
  return {
    family: style.fontFamily,
    size: style.fontSize,
    weight: style.fontWeight,
    lineHeight: style.lineHeight,
  }
}

/** The same four, resolved straight off the token set for a named step. */
function step(scale: 'text' | 'display', name: string) {
  const probe = document.createElement('div')
  probe.style.fontFamily = `var(--pm-${scale}-${name}-family)`
  probe.style.fontSize = `var(--pm-${scale}-${name}-size)`
  probe.style.fontWeight = `var(--pm-${scale}-${name}-weight)`
  probe.style.lineHeight = `var(--pm-${scale}-${name}-line-height)`
  document.body.append(probe)
  const resolved = quartet(probe)
  probe.remove()
  return resolved
}

const TITLE = 'One vocabulary. Any number of faces.'
const LEDE = 'Every design decision is made exactly once, referenced everywhere, verified by law.'
const ACTION = <Button variant="solid" tone="accent" label="Browse components" />

describe('the closed surface', () => {
  it('leaves no way to style it from a call site', () => {
    assertGoverned<HeroProps>(true)
  })
})

describe('Hero', () => {
  it('renders the page’s h1, and exactly one', () => {
    render(<Hero title={TITLE} lede={LEDE} actions={ACTION} />)
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('is a section, not a banner, because the page owns its landmarks', () => {
    // `<header>` at the top of a document is a `banner` landmark. PageHeader can
    // be one because AppShell has none, but a Hero goes into pages that already
    // have one, so it is a section.
    expect(mount(<Hero title={TITLE} />).tagName).toBe('SECTION')
  })

  it('sets the title at display.lg, read from the theme', () => {
    render(<Hero title={TITLE} />)
    const title = screen.getByRole('heading', { level: 1 })

    expect(quartet(title)).toEqual(step('display', 'lg'))
    // Checks the *display slot*, not just a matching family: the test theme uses
    // one face for both slots, so the quartet alone cannot tell them apart.
    //
    // Compared without quotes, which are optional in CSS and dropped by WebKit's
    // computed value.
    const families = (list: string) => list.replaceAll('"', '')
    expect(families(getComputedStyle(title).fontFamily)).toBe(
      families(
        getComputedStyle(document.documentElement).getPropertyValue('--pm-font-display').trim(),
      ),
    )
    expect(getComputedStyle(title).color).toBe(tokenColor('--pm-text-primary'))
    expect(getComputedStyle(title).marginTop).toBe('0px')
  })

  it('sets the lede at text.lg, secondary', () => {
    render(<Hero title={TITLE} lede={LEDE} />)
    const lede = screen.getByText(LEDE)

    expect(lede.tagName).toBe('P')
    expect(quartet(lede)).toEqual(step('text', 'lg'))
    expect(getComputedStyle(lede).color).toBe(tokenColor('--pm-text-secondary'))
  })

  it('sets its own vertical padding from space tokens', () => {
    // The exception hero.md argues for: a display block has its own inset,
    // because the page's padding frames the hero and is not part of it.
    const style = getComputedStyle(mount(<Hero title={TITLE} />))
    expect(style.paddingTop).toBe(tokenLength('--pm-space-8'))
    expect(style.paddingBottom).toBe(tokenLength('--pm-space-7'))
    expect(style.rowGap).toBe(tokenLength('--pm-space-5'))
  })

  it('centres the text and the actions together on request', () => {
    const root = mount(<Hero align="center" title={TITLE} lede={LEDE} actions={ACTION} />)
    expect(root.dataset['align']).toBe('center')
    expect(getComputedStyle(root).textAlign).toBe('center')

    const actions = root.lastElementChild as HTMLElement
    expect(getComputedStyle(actions).justifyContent).toBe('center')
  })

  it('starts at the reading edge by default, actions included', () => {
    const root = mount(<Hero title={TITLE} lede={LEDE} actions={ACTION} />)
    expect(root.dataset['align']).toBe('start')
    expect(getComputedStyle(root).textAlign).toBe('start')

    const actions = root.lastElementChild as HTMLElement
    expect(getComputedStyle(actions).justifyContent).toBe('flex-start')
  })

  it('drops one display step in a narrow container and clips no word', () => {
    /*
     * At phone width one long `display.lg` word can be wider than its box and
     * visibly clipped. Both fixes are asserted, because either alone can lose a
     * word: the step swap (the design decision) and `overflow-wrap` (the
     * fallback). A `24rem` host is under the `26rem` threshold, roughly a 375px
     * phone minus a shell's inset.
     */
    const host = fixedWidthHost(24 * 16)
    const long = 'Internationalization'
    render(<Hero title={long} />, { container: host })
    const title = screen.getByRole('heading', { level: 1 })

    expect(quartet(title)).toEqual(step('display', 'md'))
    expect(getComputedStyle(title).overflowWrap).toBe('break-word')
    // Nothing overflows the title or the page.
    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    )

    host.remove()
  })

  it('renders no slot for a lede or actions it was not given', () => {
    // Absent, not just empty. A blank row is still a flex item and still adds a
    // `gap`, so a title-only Hero would have unwanted space under it.
    const root = mount(<Hero title={TITLE} />)
    expect(root.children).toHaveLength(1)
    expect(root.querySelector('p')).toBeNull()

    expect(mount(<Hero title={TITLE} lede={LEDE} />).children).toHaveLength(2)
    expect(mount(<Hero title={TITLE} actions={ACTION} />).children).toHaveLength(2)
    expect(mount(<Hero title={TITLE} lede={LEDE} actions={ACTION} />).children).toHaveLength(3)
  })
})
