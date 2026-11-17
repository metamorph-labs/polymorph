import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Link, type LinkProps } from './Link'
import { tokenColor, tokenLength } from './token-probe'

/**
 * Link (`design/components/link.md`).
 *
 * The component is small, but the boundary it enforces matters. A Link navigates and a Button
 * acts, and the API keeps it that way. There is no `onClick` here, so "make this text do
 * something" can only be built with a Button.
 */

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<LinkProps>(true)
  })

  it('cannot be written without somewhere to go', () => {
    // @ts-expect-error — a link with no href is really a button.
    const bad = <Link>Nowhere</Link>
    expect(bad).toBeTruthy()
  })

  it('offers no click handler, because that would be a Button', () => {
    // Checked against the prop type rather than through JSX, because a spread would widen the
    // object and the excess-property check, which is what this asserts, would never run.
    // @ts-expect-error — commands are Buttons; if it changes data it is not a Link.
    const bad: LinkProps = { href: '#a', children: 'Act', onClick: () => {} }
    expect(bad.href).toBe('#a')
  })
})

describe('semantics', () => {
  it('is a real anchor with a real destination', () => {
    render(<Link href="#delivery">delivery log</Link>)
    const link = screen.getByRole('link', { name: 'delivery log' })
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('#delivery')
  })

  it('opens an external link safely, and marks it in the markup', () => {
    const link = mount(
      <Link href="https://example.com" external>
        Status page
      </Link>,
    )
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noreferrer')
    expect(link.dataset['external']).toBe('')
  })

  it('leaves target and rel off an internal one', () => {
    const link = mount(<Link href="#a">Internal</Link>)
    expect(link.getAttribute('target')).toBeNull()
    expect(link.getAttribute('rel')).toBeNull()
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

describe('routing (`link.md` §Routing)', () => {
  it('hands a click that would navigate this tab to the app, in place of the browser', async () => {
    const onNavigate = vi.fn()
    let prevented: boolean | undefined
    const watch = (event: MouseEvent) => {
      prevented = event.defaultPrevented
      event.preventDefault()
    }
    document.addEventListener('click', watch)
    render(
      <Link href="#tickets" onNavigate={onNavigate}>
        Tickets
      </Link>,
    )
    await userEvent.click(screen.getByRole('link', { name: 'Tickets' }))
    document.removeEventListener('click', watch)

    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#tickets')
    expect(prevented).toBe(true)
  })

  it('routes the click Enter makes on a focused link', async () => {
    const onNavigate = vi.fn()
    render(
      <Link href="#tickets" variant="standalone" onNavigate={onNavigate}>
        Tickets
      </Link>,
    )
    const watch = (event: MouseEvent) => event.preventDefault()
    document.addEventListener('click', watch)
    screen.getByRole('link', { name: 'Tickets' }).focus()
    await userEvent.keyboard('{Enter}')
    document.removeEventListener('click', watch)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#tickets')
  })

  it('routes the button costume the same way', () => {
    const onNavigate = vi.fn()
    const link = mount(
      <Link href="#billing" variant="button" onNavigate={onNavigate}>
        View billing
      </Link>,
    )
    expect(taken(link)).toBe(true)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#billing')
  })

  it('leaves a click that opens a tab or a window to the browser', () => {
    const onNavigate = vi.fn()
    const link = mount(
      <Link href="#tickets" onNavigate={onNavigate}>
        Tickets
      </Link>,
    )
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

  it('leaves an external link to the browser, which opens it in a new tab', () => {
    const onNavigate = vi.fn()
    const link = mount(
      <Link href="#status" external onNavigate={onNavigate}>
        Status page
      </Link>,
    )
    expect(taken(link)).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('leaves a click another handler took', () => {
    const onNavigate = vi.fn()
    const link = mount(
      <Link href="#tickets" onNavigate={onNavigate}>
        Tickets
      </Link>,
    )
    const first = (event: MouseEvent) => event.preventDefault()
    document.addEventListener('click', first, { capture: true })
    taken(link)
    document.removeEventListener('click', first, { capture: true })
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('lets the browser follow every click when the app has no router', () => {
    const link = mount(<Link href="#tickets">Tickets</Link>)
    expect(taken(link)).toBe(false)
  })
})

describe('the two text variants', () => {
  it('underlines an inline link at rest, because it is inside a sentence', () => {
    expect(getComputedStyle(mount(<Link href="#a">inline</Link>)).textDecorationLine).toBe(
      'underline',
    )
  })

  it('shows the rest underline at the temperament’s strength, and at full strength on hover', async () => {
    // The line is the required signal, so it stays. Its full colour is only the browser default,
    // not a design decision. Hover restores thickness and colour together.
    const link = mount(<Link href="#a">inline</Link>)
    expect(getComputedStyle(link).textDecorationColor).toBe(tokenColor('--pm-accent-underline'))
    await userEvent.hover(link)
    expect(getComputedStyle(link).textDecorationColor).toBe(tokenColor('--pm-accent-text'))
    expect(getComputedStyle(link).textDecorationThickness).toBe('2px')
  })

  it('leaves a standalone link undecorated until hover', () => {
    // A row or a title is already visually separate, so an underline there adds noise.
    const link = mount(
      <Link href="#a" variant="standalone">
        Standalone
      </Link>,
    )
    expect(getComputedStyle(link).textDecorationLine).toBe('none')
    expect(link.dataset['variant']).toBe('standalone')
  })

  it('never signals with colour alone', () => {
    // Both variants pair the accent colour with a non-colour cue, so the link still works for a
    // user who cannot see the hue.
    const inline = mount(<Link href="#a">inline</Link>)
    expect(getComputedStyle(inline).color).toBe(tokenColor('--pm-accent-text'))
    expect(getComputedStyle(inline).textDecorationLine).toBe('underline')
  })

  it('does not resize the sentence it sits in', () => {
    const { container } = render(
      <p style={{ fontSize: '31px' }}>
        body <Link href="#a">and link</Link>
      </p>,
    )
    const link = container.querySelector('a') as HTMLElement
    expect(getComputedStyle(link).fontSize).toBe('31px')
  })
})

describe('the button costume', () => {
  it('stays an anchor while using Button’s data attributes', () => {
    const link = mount(
      <Link href="#billing" variant="button">
        View billing
      </Link>,
    )
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('#billing')
    // `soft`/`accent`/`md` by default. Navigation styled as the page's primary action must opt
    // into `solid` explicitly.
    expect(link.dataset['variant']).toBe('soft')
    expect(link.dataset['tone']).toBe('accent')
    expect(link.dataset['size']).toBe('md')
  })

  it('resolves to Button’s own cells, reused whole and never re-derived', () => {
    const soft = mount(
      <Link href="#billing" variant="button">
        View billing
      </Link>,
    )
    const style = getComputedStyle(soft)
    expect(style.backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
    expect(style.color).toBe(tokenColor('--pm-accent-text'))
    expect(style.height).toBe(tokenLength('--pm-control-height-md'))
    // The frame shows it is clickable. An underline would be a redundant second cue.
    expect(style.textDecorationLine).toBe('none')

    const outline = mount(
      <Link href="#docs" variant="button" buttonVariant="outline" tone="neutral" size="sm">
        Read the docs
      </Link>,
    )
    const outlined = getComputedStyle(outline)
    expect(outlined.borderTopColor).toBe(tokenColor('--pm-border-field'))
    expect(outlined.height).toBe(tokenLength('--pm-control-height-sm'))
  })

  it('shows Button’s hover cell on pointer hover, which is why the guard is :not(:disabled)', async () => {
    // `:enabled` never matches an anchor, so the costume would have rest colours and no hover. A
    // real pointer drives the test, because that is the only way `:hover` matches.
    const link = mount(
      <Link href="#billing" variant="button">
        View billing
      </Link>,
    )
    await userEvent.hover(link)
    await vi.waitFor(() =>
      expect(getComputedStyle(link).backgroundColor).toBe(tokenColor('--pm-accent-subtle-hover')),
    )
    await userEvent.unhover(link)
  })

  it('puts the external glyph in Button’s trailing slot', () => {
    const link = mount(
      <Link href="https://example.com/status" variant="button" buttonVariant="outline" external>
        Status page
      </Link>,
    )
    expect(link.dataset['external']).toBe('')
    expect(link.getAttribute('rel')).toBe('noreferrer')
    const glyph = link.querySelector('svg')
    expect(glyph?.getAttribute('data-icon')).toBe('open-external')
    expect(glyph?.getAttribute('aria-hidden')).toBe('true')
  })

  it('makes costume props on a text variant a type error', () => {
    const styled = (
      // @ts-expect-error — `buttonVariant` is only for the costume.
      <Link href="#a" buttonVariant="solid">
        costumed inline
      </Link>
    )
    const danger = (
      // A destructive destination is a Button routed through ConfirmDialog.
      // @ts-expect-error — the costume's grid has no `danger`.
      <Link href="#a" variant="button" tone="danger">
        delete
      </Link>
    )
    const unlawful = (
      // @ts-expect-error — Button's lawful grid applies: neutral is outline/ghost only.
      <Link href="#a" variant="button" buttonVariant="solid" tone="neutral">
        x
      </Link>
    )
    expect([styled, danger, unlawful]).toHaveLength(3)
  })
})

describe('the external glyph', () => {
  it('is decorative, so the text is not read twice', () => {
    const link = mount(
      <Link href="https://example.com" external>
        Status page
      </Link>,
    )
    expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('link').textContent).toBe('Status page')
  })

  it('stays on the same line as the text it belongs to', () => {
    expect(
      getComputedStyle(
        mount(
          <Link href="https://example.com" external>
            Status page
          </Link>,
        ),
      ).whiteSpace,
    ).toBe('nowrap')
  })
})

describe('an agent', () => {
  /**
   * The bridge waits for the member to render, and React holds every update
   * inside a test's `act` scope until the scope ends. An agent's steps run on
   * a page, outside one.
   */
  async function asAgent<T>(run: () => Promise<T>): Promise<T> {
    const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const was = scope.IS_REACT_ACT_ENVIRONMENT
    scope.IS_REACT_ACT_ENVIRONMENT = false
    try {
      return await run()
    } finally {
      scope.IS_REACT_ACT_ENVIRONMENT = was
    }
  }

  it('presses a link through the router, in both renderings', async () => {
    const bridge = createAgentBridge()
    try {
      const onNavigate = vi.fn()
      render(
        <>
          <Link href="/tickets/1182" onNavigate={onNavigate}>
            Ticket 1182
          </Link>
          <Link href="/billing" variant="button" onNavigate={onNavigate}>
            View billing
          </Link>
        </>,
      )
      const [ticket, billing] = bridge.snapshot().members
      expect(ticket).toMatchObject({
        member: 'Link',
        name: 'Ticket 1182',
        state: { external: false },
        actions: [{ name: 'press' }],
      })
      const { results } = await asAgent(() =>
        bridge.act([
          { id: ticket?.id, action: 'press' },
          { id: billing?.id, action: 'press' },
        ]),
      )
      expect(results.map((result) => result.ok)).toEqual([true, true])
      expect(onNavigate.mock.calls).toEqual([['/tickets/1182'], ['/billing']])
    } finally {
      bridge.dispose()
    }
  })

  it('refuses an external link, which only a person’s press opens', async () => {
    const bridge = createAgentBridge()
    try {
      const clicked = vi.fn((event: MouseEvent) => event.preventDefault())
      render(
        <Link href="https://example.com/status" external>
          Status page
        </Link>,
      )
      screen.getByRole('link', { name: 'Status page' }).addEventListener('click', clicked)
      const [member] = bridge.snapshot().members
      expect(member?.state).toEqual({ external: true })
      const { results } = await bridge.act([{ id: member?.id, action: 'press' }])
      expect(results[0]).toEqual({
        ok: false,
        id: member?.id,
        error: { code: 'failed', message: expect.stringContaining('new tab') },
      })
      expect(clicked).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})
