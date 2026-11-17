import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { Button } from '../controls/Button'
import { tokenLength } from '../controls/token-probe'
import { Card } from '../structure/Card'
import { installTestTheme } from '@polymorph/engine/testing'
import { Bespoke, type BespokeProps } from './Bespoke'
import { DensityScope, ToneScope } from './Scopes'
import { ThirdParty, type ThirdPartyProps } from './ThirdParty'

/**
 * The exception ladder (`docs/rules.md`).
 *
 * Each rung must do what defines it. A scope that did not rescope, or a Bespoke
 * zone that styled its contents, would hide an exception while the inventory
 * reported it as healthy. That is worse than having no ladder.
 */

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

describe('the closed surface', () => {
  it('accepts no style props, not even on Bespoke', () => {
    assertGoverned<BespokeProps>(true)
  })

  it('accepts none on the boundary around another library’s component either', () => {
    assertGoverned<ThirdPartyProps>(true)
  })
})

describe('rung 2 — a contextual scope re-scopes, it does not restyle', () => {
  it('changes what a control measures, from the theme’s own variants', () => {
    const outside = mount(<Button label="Save" />)
    const standard = outside.getBoundingClientRect().height

    render(
      <DensityScope value="compact">
        <Button label="Save" />
      </DensityScope>,
    )
    const inside = screen.getAllByRole('button')[1] as HTMLElement

    expect(inside.getBoundingClientRect().height).toBeLessThan(standard)
    // The height comes from the token, not from a typed length.
    expect(getComputedStyle(inside).height).toBe(
      getComputedStyle(inside).getPropertyValue('--pm-control-height-md').trim(),
    )
  })

  it('leaves the type scale alone, because density changes space only', () => {
    const outside = mount(<Button label="Save" />)
    render(
      <DensityScope value="compact">
        <Button label="Save" />
      </DensityScope>,
    )
    const inside = screen.getAllByRole('button')[1] as HTMLElement

    expect(getComputedStyle(inside).fontSize).toBe(getComputedStyle(outside).fontSize)
  })

  it('resolves the container insets against the scope’s own spacing', () => {
    // An inset is a reference to a space step, resolved where it is declared.
    const outside = mount(<div />)
    const scope = mount(
      <DensityScope value="compact">
        <div />
      </DensityScope>,
    )
    const inside = scope.firstElementChild as HTMLElement
    const read = (element: Element, name: string) =>
      getComputedStyle(element).getPropertyValue(name).trim()
    expect(read(inside, '--pm-inset-surface')).not.toBe(read(outside, '--pm-inset-surface'))
  })

  it('resolves the halos and the shell surfaces against a nested mode’s own roles', () => {
    const scope = mount(
      <div data-mode="dark">
        <div />
      </div>,
    )
    const inside = scope.firstElementChild as HTMLElement
    const read = (element: Element, name: string) =>
      getComputedStyle(element).getPropertyValue(name).trim()
    expect(read(inside, '--pm-shell-topbar-bg')).toBe(read(inside, '--pm-bg-surface'))
    expect(read(inside, '--pm-shell-topbar-bg')).not.toBe(
      read(document.documentElement, '--pm-shell-topbar-bg'),
    )
    expect(read(inside, '--pm-glow-focus')).toContain(read(inside, '--pm-accent-glow'))
  })

  it('sets the same attribute the runtime sets, so nothing new is invented', () => {
    expect(mount(<DensityScope value="comfortable" />).dataset['density']).toBe('comfortable')
    expect(mount(<ToneScope value="inverse" />).dataset['tone']).toBe('inverse')
  })

  it('borrows the opposite mode for an inverse tone, rather than inventing a palette', () => {
    const plain = mount(<Card>plain</Card>)
    render(
      <ToneScope value="inverse">
        <Card>inverted</Card>
      </ToneScope>,
    )
    const inverted = screen.getByText('inverted')

    expect(getComputedStyle(inverted).backgroundColor).not.toBe(
      getComputedStyle(plain).backgroundColor,
    )
  })

  it('is a wrapper, not a surface', () => {
    const scope = mount(<DensityScope value="compact">content</DensityScope>)
    const style = getComputedStyle(scope)
    expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(style.borderTopWidth).toBe('0px')
    expect(style.paddingTop).toBe('0px')
  })

  it('carries section semantics when the region deserves them', () => {
    expect(mount(<DensityScope value="compact" as="section" />).tagName).toBe('SECTION')
  })
})

describe('rung 3 — a patch re-assigns a named decision', () => {
  it('takes token names, and the result is the token', () => {
    const card = mount(<Card patch={{ p: 4, radius: 'sm' }}>patched</Card>)
    expect(getComputedStyle(card).paddingTop).toBe(tokenLength('--pm-space-4'))
    expect(getComputedStyle(card).borderTopLeftRadius).toBe(tokenLength('--pm-radius-sm'))
  })

  it('cannot express a value that is not on the scale', () => {
    // This is the difference between rung 3 and a style prop: the type does
    // not accept a length such as "13px".
    // @ts-expect-error — a length is not a token name.
    const bad = <Card patch={{ p: '13px' }} />
    expect(bad).toBeTruthy()
  })

  it('leaves the keys it does not mention alone', () => {
    const card = mount(<Card patch={{ radius: 'sm' }} />)
    expect(getComputedStyle(card).paddingTop).toBe(tokenLength('--pm-space-6'))
  })

  it('shows up in the DOM, which is how the inventory finds it', () => {
    const card = mount(<Card patch={{ p: 4 }} />)
    expect(card.dataset['p']).toBe('4')
  })
})

describe('rung 4 — a Bespoke zone is a boundary, not a surface', () => {
  it('records its reason where a reviewer and a scanner both find it', () => {
    const zone = mount(<Bespoke reason="A one-off promo illustration.">inside</Bespoke>)
    expect(zone.dataset['bespoke']).toBe('A one-off promo illustration.')
  })

  it('paints nothing and takes no box', () => {
    // With `display: contents`, the zone's children lay out as if it were
    // absent, so declaring an exception never moves what it wraps.
    const zone = mount(<Bespoke reason="x">inside</Bespoke>)
    expect(getComputedStyle(zone).display).toBe('contents')
  })

  it('still inherits the theme, so bespoke work re-themes with everything else', () => {
    render(
      <Bespoke reason="x">
        <Card>inside</Card>
      </Bespoke>,
    )
    const card = screen.getByText('inside')
    const probe = mount(<Card>outside</Card>)

    expect(getComputedStyle(card).backgroundColor).toBe(getComputedStyle(probe).backgroundColor)
    expect(
      getComputedStyle(card).getPropertyValue('--pm-bg-surface').trim(),
      'the token cascade stops at a Bespoke boundary',
    ).not.toBe('')
  })

  it('keeps its contents exposed to assistive technology', () => {
    // A zone never switches off accessibility. A raw control inside a zone is
    // still a control and is still exposed to assistive technology.
    render(
      <Bespoke reason="x">
        <button type="button">Still a button</button>
      </Bespoke>,
    )
    expect(screen.getByRole('button', { name: 'Still a button' })).toBeTruthy()
  })

  it('requires a reason', () => {
    // @ts-expect-error — `reason` is required.
    const bad = <Bespoke>no reason</Bespoke>
    expect(bad).toBeTruthy()
  })
})

describe('rung 4 — a ThirdParty boundary hosts another library’s component', () => {
  it('records the library it hosts where a reviewer and a scanner both find it', () => {
    const boundary = mount(
      <ThirdParty library="leaflet" reason="No member draws map tiles.">
        inside
      </ThirdParty>,
    )
    expect(boundary.dataset['thirdParty']).toBe('leaflet')
    expect(boundary.dataset['reason']).toBe('No member draws map tiles.')
  })

  it('paints nothing and takes no box', () => {
    // The hosted component lays out as a child of whatever holds the boundary.
    const boundary = mount(
      <ThirdParty library="leaflet" reason="x">
        inside
      </ThirdParty>,
    )
    expect(getComputedStyle(boundary).display).toBe('contents')
  })

  it('still inherits the theme, so what it hosts reads the same tokens', () => {
    render(
      <ThirdParty library="leaflet" reason="x">
        <div data-testid="hosted" />
      </ThirdParty>,
    )
    const hosted = screen.getByTestId('hosted')
    expect(getComputedStyle(hosted).getPropertyValue('--pm-accent-bg').trim()).not.toBe('')
  })
})
