import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { tokenColor, tokenLength } from '../controls/token-probe'
import { installTestTheme } from '@polymorph/engine/testing'
import { Badge, BADGE_TONES, BADGE_VARIANTS, type BadgeProps } from './Badge'
import { Card, type CardProps } from './Card'
import { Code } from './Code'
import { EmptyState, type EmptyStateProps } from './EmptyState'
import { PageHeader, type PageHeaderProps } from './PageHeader'
import { Skeleton, type SkeletonProps } from './Skeleton'
import { Text } from './Text'

/**
 * The static members of the structure tier. Every state is reachable through
 * props, so the tests cover geometry and roles that would otherwise only show
 * in screenshots.
 */

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

describe('the closed surfaces', () => {
  it('leave no way to style any of them from a call site', () => {
    assertGoverned<CardProps>(true)
    assertGoverned<BadgeProps>(true)
    assertGoverned<SkeletonProps>(true)
    assertGoverned<PageHeaderProps>(true)
    assertGoverned<EmptyStateProps>(true)
  })
})

describe('Card', () => {
  it('is a surface: the surface fill, a subtle border, and the large radius', () => {
    const style = getComputedStyle(mount(<Card>content</Card>))
    expect(style.backgroundColor).toBe(tokenColor('--pm-bg-surface'))
    expect(style.borderTopColor).toBe(tokenColor('--pm-border-subtle'))
    expect(style.borderTopWidth).toBe('1px')
    expect(style.borderTopLeftRadius).toBe(tokenLength('--pm-radius-lg'))
    expect(style.paddingTop).toBe(tokenLength('--pm-space-6'))
  })

  it('keeps its border at every depth, because it is the separation when there is no shadow', () => {
    // Structural, not decorative: the shadow token may be `none`, the border never is.
    expect(getComputedStyle(mount(<Card />)).borderTopStyle).toBe('solid')
  })

  it('takes a padding patch, from the same table a Stack reads', () => {
    const card = mount(<Card patch={{ p: 4 }} />)
    expect(card.dataset['p']).toBe('4')
    expect(getComputedStyle(card).paddingTop).toBe(tokenLength('--pm-space-4'))
  })

  it('takes a radius patch as a token name, never a length', () => {
    const card = mount(<Card patch={{ radius: 'sm' }} />)
    expect(card.dataset['radius']).toBe('sm')
    expect(getComputedStyle(card).borderTopLeftRadius).toBe(tokenLength('--pm-radius-sm'))
  })

  it('renders a section element when asked', () => {
    expect(mount(<Card as="section" />).tagName).toBe('SECTION')
  })
})

describe('the titled card', () => {
  it('draws its title first, as an h2 in the section-heading recipe', () => {
    const card = mount(<Card title="Billing">content</Card>)
    const heading = screen.getByRole('heading', { level: 2, name: 'Billing' })
    expect(card.firstElementChild).toBe(heading)
    const style = getComputedStyle(heading)
    expect(style.fontSize).toBe(tokenLength('--pm-text-xs-size'))
    expect(style.textTransform).toBe('uppercase')
    expect(style.color).toBe(tokenColor('--pm-text-secondary'))
    expect(style.marginTop).toBe('0px')
    expect(style.marginBottom).toBe(tokenLength('--pm-space-4'))
  })

  it('takes the level from headingLevel, which changes the element and not the look', () => {
    mount(
      <Card title="Invoices" headingLevel={3}>
        content
      </Card>,
    )
    const heading = screen.getByRole('heading', { level: 3, name: 'Invoices' })
    expect(heading.tagName).toBe('H3')
    expect(getComputedStyle(heading).fontSize).toBe(tokenLength('--pm-text-xs-size'))
  })

  it('names a titled section by its title, so it is a region', () => {
    mount(
      <Card as="section" title="Billing">
        content
      </Card>,
    )
    expect(screen.getByRole('region', { name: 'Billing' }).tagName).toBe('SECTION')
  })

  it('leaves a titled div unnamed, because a generic element takes no name', () => {
    expect(mount(<Card title="Billing">content</Card>).hasAttribute('aria-labelledby')).toBe(false)
  })

  it('draws no heading without a title', () => {
    mount(<Card as="section">content</Card>)
    expect(screen.queryByRole('heading')).toBeNull()
  })
})

describe('the interactive card', () => {
  it('stretches one real link over the whole surface, named by its label', () => {
    const card = mount(
      <Card href="#ticket" label="Open ticket 4182">
        <p>Refund not received</p>
      </Card>,
    )
    expect(card.dataset['interactive']).toBe('')

    const link = screen.getByRole('link', { name: 'Open ticket 4182' })
    expect(link.getAttribute('href')).toBe('#ticket')
    // One large target without being a button. `inset: 0` reaches the padding
    // box, so only the 1px border lies outside the link.
    const cardBox = card.getBoundingClientRect()
    const linkBox = link.getBoundingClientRect()
    expect(linkBox.top - cardBox.top).toBeLessThanOrEqual(1)
    expect(linkBox.left - cardBox.left).toBeLessThanOrEqual(1)
    expect(cardBox.width - linkBox.width).toBeLessThanOrEqual(2)
    expect(cardBox.height - linkBox.height).toBeLessThanOrEqual(2)
    expect(linkBox.width).toBeGreaterThan(cardBox.width * 0.9)
  })

  it('keeps the visible content out of the link: one tab stop, one announced name', () => {
    mount(
      <Card href="#ticket" label="Open ticket 4182">
        <p>A whole card read out as one link name is noise wearing a pattern.</p>
      </Card>,
    )
    const link = screen.getByRole('link', { name: 'Open ticket 4182' })
    expect(link.textContent).toBe('')
  })

  it('draws the focus ring on the card when the link is focused', () => {
    const card = mount(
      <Card href="#ticket" label="Open ticket 4182">
        <p>Content</p>
      </Card>,
    )
    expect(getComputedStyle(card).outlineStyle).toBe('none')

    const link = card.querySelector('a') as HTMLAnchorElement
    link.focus({ focusVisible: true } as FocusOptions)
    expect(getComputedStyle(card).outlineStyle).toBe('solid')
    expect(getComputedStyle(card).outlineWidth).toBe(tokenLength('--pm-focus-width'))
    // The link's own UA ring is off, because two rings would show focus in two
    // places.
    expect(getComputedStyle(link).outlineStyle).toBe('none')
  })

  it('shows a pointer cursor on the linked card', () => {
    const card = mount(
      <Card href="#ticket" label="Open ticket 4182">
        <p>Content</p>
      </Card>,
    )
    expect(getComputedStyle(card).cursor).toBe('pointer')
    // The hover step is `:hover`-gated and asserted from source through
    // `requiredSelectors`. Here the check is that rest sits on the raised step.
    expect(mount(<Card />).dataset['interactive']).toBeUndefined()
  })

  it('does not type-check with href and no label', () => {
    // @ts-expect-error — `href` without `label` does not type-check (card.md).
    const bad = <Card href="#ticket">content</Card>
    expect(bad).toBeTruthy()
  })

  it('warns in dev when the stretched link covers interactive content', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      mount(
        <Card href="#ticket" label="Open ticket">
          <button type="button">Unreachable</button>
        </Card>,
      )
      expect(warned).toHaveBeenCalledWith(expect.stringContaining('Card'))
    } finally {
      warned.mockRestore()
    }
  })

  it('does not warn for a linked card with no interactive content', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      mount(
        <Card href="#ticket" label="Open ticket">
          <p>Prose only.</p>
        </Card>,
      )
      expect(warned).not.toHaveBeenCalled()
    } finally {
      warned.mockRestore()
    }
  })
})

/**
 * Dispatches a click on `link` and reports whether the member took the navigation from the
 * browser. A listener on the document hears the click after the member, reads its decision, and
 * then stops the navigation itself, so a click the member leaves alone does not move the runner's
 * page.
 */
function taken(link: HTMLElement, init: MouseEventInit = {}): boolean {
  let prevented = false
  const watch = (event: MouseEvent) => {
    prevented = event.defaultPrevented
    event.preventDefault()
  }
  document.addEventListener('click', watch)
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
  document.removeEventListener('click', watch)
  return prevented
}

describe('the linked card under a router (`link.md` §Routing)', () => {
  it('hands a click that would navigate this tab to the router, in place of the browser', () => {
    const onNavigate = vi.fn()
    mount(
      <Card href="#ticket" label="Open ticket 4182" onNavigate={onNavigate}>
        <p>Refund not received</p>
      </Card>,
    )
    expect(taken(screen.getByRole('link', { name: 'Open ticket 4182' }))).toBe(true)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#ticket')
  })

  it('leaves a click that opens a tab or a window to the browser', () => {
    const onNavigate = vi.fn()
    mount(
      <Card href="#ticket" label="Open ticket 4182" onNavigate={onNavigate}>
        <p>Refund not received</p>
      </Card>,
    )
    const link = screen.getByRole('link', { name: 'Open ticket 4182' })
    for (const init of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ]) {
      expect(taken(link, init), JSON.stringify(init)).toBe(false)
    }
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('lets the browser follow every click when the app has no router', () => {
    mount(
      <Card href="#ticket" label="Open ticket 4182">
        <p>Refund not received</p>
      </Card>,
    )
    expect(taken(screen.getByRole('link', { name: 'Open ticket 4182' }))).toBe(false)
  })

  it('takes a router only with a link', () => {
    // @ts-expect-error — `onNavigate` without `href` does not type-check: there is nothing to route.
    const bad = <Card onNavigate={() => {}}>content</Card>
    expect(bad).toBeTruthy()
  })
})

/**
 * An agent presses a linked card through the bridge, as the spec's `agent`
 * fence declares (`design/components/card.md`, Agent): the card is listed
 * while it draws its stretched link, named by `label`, and a press is the
 * link's own click, which reaches the routing seam as a person's does.
 */
describe('a linked card and an agent', () => {
  it('is listed by its label, and a card without a link is not listed', () => {
    const bridge = createAgentBridge()
    try {
      render(
        <>
          <Card title="Billing">
            <p>Refund not received</p>
          </Card>
          <Card href="#ticket" label="Open ticket 4182">
            <p>Refund not received</p>
          </Card>
        </>,
      )
      expect(bridge.snapshot().members).toEqual([
        expect.objectContaining({
          member: 'Card',
          name: 'Open ticket 4182',
          state: {},
          actions: [{ name: 'press' }],
        }),
      ])
    } finally {
      bridge.dispose()
    }
  })

  it('hands an agent’s press to the router, as a person’s click', async () => {
    const bridge = createAgentBridge()
    try {
      const onNavigate = vi.fn()
      render(
        <Card href="/tickets/4182" label="Open ticket 4182" onNavigate={onNavigate}>
          <p>Refund not received</p>
        </Card>,
      )
      const { results } = await bridge.act([
        { target: { member: 'Card', name: 'Open ticket 4182' }, action: 'press' },
      ])
      expect(results).toMatchObject([{ ok: true }])
      expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/tickets/4182')
    } finally {
      bridge.dispose()
    }
  })

  it('is listed once it is given a link after it mounts', () => {
    const bridge = createAgentBridge()
    try {
      const { rerender } = render(<Card>Refund not received</Card>)
      expect(bridge.snapshot().members).toEqual([])
      rerender(
        <Card href="#ticket" label="Open ticket 4182">
          Refund not received
        </Card>,
      )
      expect(bridge.snapshot().members.map((member) => member.name)).toEqual(['Open ticket 4182'])
    } finally {
      bridge.dispose()
    }
  })
})

describe('Code', () => {
  const SETUP_KEY =
    'otpauth://totp/Relay:ada@example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Relay'

  it('breaks a string with no break in it, instead of widening what holds it', () => {
    const column = document.createElement('div')
    column.style.width = '240px'
    document.body.append(column)
    render(
      <Text>
        Or type <Code>{SETUP_KEY}</Code> into the app.
      </Text>,
      { container: column },
    )
    const chip = column.querySelector('code') as HTMLElement
    expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
    expect(chip.getClientRects().length).toBeGreaterThan(1)
    column.remove()
  })

  it('keeps a short chip on one line', () => {
    render(
      <Text>
        Set <Code>pm-system</Code> on the page root.
      </Text>,
    )
    expect(screen.getByText('pm-system').getClientRects()).toHaveLength(1)
  })
})

describe('Badge', () => {
  it('uses the overline style: uppercase, at the smallest step', () => {
    const style = getComputedStyle(mount(<Badge>Active</Badge>))
    expect(style.textTransform).toBe('uppercase')
    expect(style.fontSize).toBe(tokenLength('--pm-text-xs-size'))
    expect(style.borderTopLeftRadius).toBe(tokenLength('--pm-radius-sm'))
  })

  it('paints all eighteen cells from role tokens, with no transparent text', () => {
    for (const variant of BADGE_VARIANTS) {
      for (const tone of BADGE_TONES) {
        const style = getComputedStyle(
          mount(
            <Badge variant={variant} tone={tone}>
              Active
            </Badge>,
          ),
        )
        const cell = `${variant}/${tone}`
        expect(style.color, cell).not.toBe('rgba(0, 0, 0, 0)')
        if (variant === 'outline') {
          expect(style.backgroundColor, cell).toBe('rgba(0, 0, 0, 0)')
          expect(style.borderTopColor, cell).not.toBe('rgba(0, 0, 0, 0)')
        } else {
          expect(style.backgroundColor, cell).not.toBe('rgba(0, 0, 0, 0)')
        }
      }
    }
  })

  it('uses the recipe for the given tone', () => {
    expect(getComputedStyle(mount(<Badge tone="danger">Failed</Badge>)).backgroundColor).toBe(
      tokenColor('--pm-danger-subtle'),
    )
    expect(
      getComputedStyle(
        mount(
          <Badge variant="solid" tone="success">
            Done
          </Badge>,
        ),
      ).backgroundColor,
    ).toBe(tokenColor('--pm-success-solid'))
  })

  it('renders a decorative glyph when given one', () => {
    const badge = mount(<Badge icon="time">Waiting</Badge>)
    expect(badge.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(badge.textContent).toBe('Waiting')
  })
})

describe('Skeleton', () => {
  it('is exactly the line box of the step it replaces', () => {
    for (const step of ['sm', 'md', '2xl'] as const) {
      const node = mount(<Skeleton textStep={step} />)
      const size = Number.parseFloat(tokenLength(`--pm-text-${step}-size`))
      const lineHeight = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          `--pm-text-${step}-line-height`,
        ),
      )
      expect(node.getBoundingClientRect().height, step).toBeCloseTo(size * lineHeight, 1)
    }
  })

  it('grows text skeletons with the step, so the page does not jump', () => {
    const small = mount(<Skeleton textStep="sm" />).getBoundingClientRect().height
    const large = mount(<Skeleton textStep="3xl" />).getBoundingClientRect().height
    expect(large).toBeGreaterThan(small)
  })

  it('defaults a skeleton with no props to md', () => {
    // A default applied only inside an `in props` guard would leave
    // `<Skeleton />` with no step attribute and zero height.
    const bare = mount(<Skeleton />)
    expect(bare.getAttribute('data-text-step')).toBe('md')
    expect(bare.getBoundingClientRect().height).toBeGreaterThan(0)
  })

  it('sizes a circle from one token', () => {
    const node = mount(<Skeleton shape="circle" size={7} />)
    const box = node.getBoundingClientRect()
    expect(box.width).toBeCloseTo(box.height, 1)
    expect(box.width).toBeCloseTo(Number.parseFloat(tokenLength('--pm-space-7')), 1)
    expect(getComputedStyle(node).borderTopLeftRadius).toBe(tokenLength('--pm-radius-pill'))
  })

  it('sizes a rect from two tokens', () => {
    const box = mount(<Skeleton shape="rect" size={8} width={10} />).getBoundingClientRect()
    expect(box.height).toBeCloseTo(Number.parseFloat(tokenLength('--pm-space-8')), 1)
    expect(box.width).toBeCloseTo(Number.parseFloat(tokenLength('--pm-space-10')), 1)
  })

  it('makes a shape with no size a type error', () => {
    // `size` gives a circle its height. Without one it would be full width and
    // zero height.
    // @ts-expect-error — a circle needs a size.
    const bad = <Skeleton shape="circle" />
    expect(bad).toBeTruthy()
  })

  it('hides itself from screen readers unless it stands for a named region', () => {
    expect(mount(<Skeleton />).getAttribute('aria-hidden')).toBe('true')

    render(<Skeleton label="Loading tickets" />)
    const named = screen.getByRole('status', { name: 'Loading tickets' })
    expect(named.hasAttribute('aria-hidden')).toBe(false)
  })

  it('keeps its fill when the sweep is off, because the placeholder is the signal', () => {
    // The sweep is an enhancement. The `--pm-bg-subtle` fill underneath signals
    // loading at temperament `none` and under reduced motion.
    expect(getComputedStyle(mount(<Skeleton />)).backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
  })
})

describe('PageHeader', () => {
  it('renders the page’s one h1', () => {
    mount(<PageHeader title="Tickets" />)
    const title = screen.getByRole('heading', { level: 1, name: 'Tickets' })
    expect(getComputedStyle(title).fontSize).toBe(tokenLength('--pm-text-2xl-size'))
  })

  it('is a header landmark', () => {
    expect(mount(<PageHeader title="Tickets" />).tagName).toBe('HEADER')
  })

  it('limits the description’s line length', () => {
    mount(<PageHeader title="Tickets" description="Everything customers have asked for." />)
    const description = screen.getByText('Everything customers have asked for.')
    expect(getComputedStyle(description).maxWidth).toBe(
      `${Number.parseFloat(tokenLength('--pm-space-10')) * 6}px`,
    )
    expect(getComputedStyle(description).color).toBe(tokenColor('--pm-text-secondary'))
  })

  it('renders no actions row when there are none', () => {
    const header = mount(<PageHeader title="Tickets" />)
    expect(header.children).toHaveLength(1)
  })
})

describe('EmptyState', () => {
  it('states the situation in a heading', () => {
    mount(<EmptyState title="No tickets yet" />)
    expect(screen.getByRole('heading', { name: 'No tickets yet' })).toBeTruthy()
  })

  it('keeps the icon well muted whatever the icon', () => {
    const calm = mount(<EmptyState title="No tickets yet" />)
    const alarming = mount(<EmptyState icon="error" title="Could not load tickets" />)
    const well = (node: HTMLElement) => getComputedStyle(node.querySelector('span') as HTMLElement)

    // Same recipe both times. A status colour would look alarming, and the title
    // already explains the problem.
    expect(well(alarming).backgroundColor).toBe(well(calm).backgroundColor)
    expect(well(alarming).color).toBe(tokenColor('--pm-text-muted'))
    expect(well(calm).backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
  })

  it('has a default glyph and accepts another', () => {
    expect(mount(<EmptyState title="x" />).querySelector('svg')?.dataset['icon']).toBe('inbox')
    expect(
      mount(<EmptyState icon="search" title="x" />).querySelector('svg')?.dataset['icon'],
    ).toBe('search')
  })

  it('renders no actions row when there are no actions', () => {
    const node = mount(<EmptyState title="No tickets yet" description="Nothing yet." />)
    expect(node.querySelectorAll('button')).toHaveLength(0)
  })
})
