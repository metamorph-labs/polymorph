import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { PAGER_ADDRESSES, pagerHoldLaw, type CursorHold } from '@polymorph/conformance/pager-hold'
import { installTestTheme } from '@polymorph/engine/testing'
import { CursorPagination, type CursorPaginationProps } from './CursorPagination'

/**
 * Button draws the controls, so little needs a browser: each direction calls its
 * handler, a window in flight blocks a second request, and no count is shown.
 * The append form is one action, and says when the list runs out through a
 * status region that was there before its words.
 */

beforeAll(installTestTheme)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<CursorPaginationProps>(true)
  })
})

/** The replace form's props, the form `mode` defaults to. */
type ReplaceProps = Extract<CursorPaginationProps, { mode?: 'replace' }>

/** The append form's props. */
type AppendProps = Extract<CursorPaginationProps, { mode: 'append' }>

function pager(props: Partial<ReplaceProps> = {}) {
  const onPrevious = vi.fn()
  const onNext = vi.fn()
  const view = render(
    <CursorPagination hasPrevious hasNext onPrevious={onPrevious} onNext={onNext} {...props} />,
  )
  return { onPrevious, onNext, ...view }
}

describe('CursorPagination', () => {
  it('moves to the adjacent window in either direction', async () => {
    const { onPrevious, onNext } = pager()

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onNext).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(onPrevious).toHaveBeenCalledTimes(1)
  })

  it('disables a direction the list has no cursor for', () => {
    pager({ hasPrevious: false })
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', false)
  })

  it('draws no page numbers, because a cursor list has no page count', () => {
    pager({ position: '26–50' })
    // Always two controls, so nothing looks like a numbered page.
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(document.querySelector('[aria-current]')).toBeNull()
  })

  it('renders nothing for a single window', () => {
    const { container } = pager({ hasPrevious: false, hasNext: false })
    expect(container.innerHTML).toBe('')
  })

  it('is a named landmark, so it can be jumped to', () => {
    pager({ label: 'Audit event pages' })
    expect(screen.getByRole('navigation', { name: 'Audit event pages' })).toBeTruthy()
  })

  it('announces the position politely, in the app’s words', () => {
    pager({ position: '26–50' })
    const position = screen.getByText('26–50')
    expect(position.getAttribute('aria-live')).toBe('polite')
  })

  it('uses localized messages when given', () => {
    pager({ messages: { previous: 'Précédent', next: 'Suivant' } })
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })
})

/**
 * Dispatches a click on `link` and reports whether the member took the navigation from the
 * browser. A listener on the document hears the click after the member, reads its decision, and
 * then stops the navigation itself, so a click the member leaves alone does not move the runner's
 * page or open a tab.
 */
function taken(link: HTMLElement, init: MouseEventInit = {}): boolean {
  let prevented = false
  const watch = (event: MouseEvent) => {
    prevented = event.defaultPrevented
    event.preventDefault()
  }
  document.addEventListener('click', watch, { once: true })
  try {
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
  } finally {
    document.removeEventListener('click', watch)
  }
  return prevented
}

describe('with addresses (`cursor-pagination.md`, Behavior)', () => {
  const addresses = { previousHref: '#before-26', nextHref: '#after-50' }

  it('links both directions to their windows, under their buttons’ names', () => {
    pager({ ...addresses, position: '26–50' })
    const previous = screen.getByRole('link', { name: 'Previous' })
    const next = screen.getByRole('link', { name: 'Next' })
    expect(previous.getAttribute('href')).toBe('#before-26')
    expect(next.getAttribute('href')).toBe('#after-50')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('calls the direction’s handler for a plain click, in place of the browser’s navigation', () => {
    const { onPrevious, onNext } = pager(addresses)
    expect(taken(screen.getByRole('link', { name: 'Next' }))).toBe(true)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(taken(screen.getByRole('link', { name: 'Previous' }))).toBe(true)
    expect(onPrevious).toHaveBeenCalledTimes(1)
  })

  it('leaves a click with a modifier key or another button to the browser', () => {
    const { onPrevious, onNext } = pager(addresses)
    for (const name of ['Previous', 'Next']) {
      const link = screen.getByRole('link', { name })
      for (const init of [
        { metaKey: true },
        { ctrlKey: true },
        { shiftKey: true },
        { altKey: true },
        { button: 1 },
      ]) {
        expect(taken(link, init), `${name} ${JSON.stringify(init)}`).toBe(false)
      }
    }
    expect(onPrevious).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('keeps a direction with no window a disabled button', () => {
    pager({ ...addresses, hasPrevious: false })
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('link', { name: 'Next' })).toBeTruthy()
  })

  it('draws no link while a window is in flight or the app holds the pager', () => {
    const { rerender } = pager({ ...addresses, pending: true })
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getAllByRole('button')).toHaveLength(2)

    rerender(
      <CursorPagination
        hasPrevious
        hasNext
        disabled
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        {...addresses}
      />,
    )
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveProperty('disabled', true)
    }
  })

  it('draws the pressed link again as the busy button, which keeps focus', async () => {
    function Harness() {
      const [pending, setPending] = useState(false)
      return (
        <CursorPagination
          hasPrevious
          hasNext
          pending={pending}
          onPrevious={() => setPending(true)}
          onNext={() => setPending(true)}
          {...addresses}
        />
      )
    }
    render(<Harness />)
    const watch = (event: MouseEvent) => event.preventDefault()
    document.addEventListener('click', watch)
    try {
      screen.getByRole('link', { name: 'Next' }).focus()
      await userEvent.keyboard('{Enter}')
    } finally {
      document.removeEventListener('click', watch)
    }

    const next = screen.getByRole('button', { name: 'Next' })
    expect(next.getAttribute('aria-busy')).toBe('true')
    expect(next).toHaveProperty('disabled', false)
    await vi.waitFor(() => expect(document.activeElement).toBe(next))
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', true)
  })

  it('makes the append form’s action a link to the next window', () => {
    const onNext = vi.fn()
    const { rerender } = render(
      <CursorPagination
        mode="append"
        hasPrevious={false}
        hasNext
        nextHref="#after-50"
        onNext={onNext}
      />,
    )
    const more = screen.getByRole('link', { name: 'Load more' })
    expect(more.getAttribute('href')).toBe('#after-50')
    expect(more.dataset['variant']).toBe('outline')
    expect(taken(more)).toBe(true)
    expect(onNext).toHaveBeenCalledTimes(1)

    // Busy while its window is in flight, and disabled while the app holds it: a button then.
    for (const state of [{ pending: true }, { disabled: true }]) {
      rerender(
        <CursorPagination
          mode="append"
          hasPrevious={false}
          hasNext
          nextHref="#after-50"
          onNext={onNext}
          {...state}
        />,
      )
      expect(screen.queryByRole('link')).toBeNull()
      expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy()
    }
  })

  it('looks like the button it replaces', () => {
    render(
      <CursorPagination
        label="Buttons"
        hasPrevious
        hasNext
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )
    render(
      <CursorPagination
        label="Links"
        hasPrevious
        hasNext
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        {...addresses}
      />,
    )
    const within = (label: string, role: 'button' | 'link', name: string) =>
      screen
        .getAllByRole(role, { name })
        .find((control) => control.closest('nav')?.getAttribute('aria-label') === label)

    for (const name of ['Previous', 'Next']) {
      const button = within('Buttons', 'button', name)
      const link = within('Links', 'link', name)
      if (button === undefined || link === undefined) throw new Error(`no ${name} control`)
      for (const attribute of ['data-variant', 'data-tone', 'data-size']) {
        expect(link.getAttribute(attribute), `${name} ${attribute}`).toBe(
          button.getAttribute(attribute),
        )
      }
      const drawn = getComputedStyle(button)
      const linked = getComputedStyle(link)
      for (const property of [
        'color',
        'background-color',
        'border-radius',
        'font-size',
        'font-weight',
        'text-decoration-line',
        'cursor',
      ] as const) {
        expect(linked.getPropertyValue(property), `${name} ${property}`).toBe(
          drawn.getPropertyValue(property),
        )
      }
      expect(link.getBoundingClientRect().width).toBe(button.getBoundingClientRect().width)
      expect(link.getBoundingClientRect().height).toBe(button.getBoundingClientRect().height)
    }
  })

  it('draws only buttons without addresses', () => {
    pager()
    expect(screen.getByRole('navigation').querySelector('a')).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})

describe('a window in flight', () => {
  /** Stands in for the app: `pending` while it fetches, as a query library reports it. */
  function Harness({ onNext }: { onNext: () => void }) {
    const [pending, setPending] = useState(false)
    return (
      <>
        <CursorPagination
          hasPrevious
          hasNext
          pending={pending}
          onPrevious={() => setPending(true)}
          onNext={() => {
            onNext()
            setPending(true)
          }}
        />
        <button type="button" onClick={() => setPending(false)}>
          settle
        </button>
      </>
    )
  }

  it('marks the pressed direction busy and disables the other', async () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))

    const next = screen.getByRole('button', { name: 'Next' })
    expect(next.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('navigation').getAttribute('aria-busy')).toBe('true')
  })

  it('does not request the same window twice', async () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)

    const next = screen.getByRole('button', { name: 'Next' })
    await userEvent.click(next)
    // A loading button keeps its focus and name and ignores the press, so a
    // command in flight does not fire again from a repeated Enter.
    next.click()
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('re-enables both directions when the window arrives', async () => {
    render(<Harness onNext={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await userEvent.click(screen.getByRole('button', { name: 'settle' }))

    expect(screen.getByRole('button', { name: 'Next' }).getAttribute('aria-busy')).toBeNull()
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', false)
  })

  it('stays on screen while the last window is loading', () => {
    render(
      <CursorPagination
        hasPrevious={false}
        hasNext={false}
        pending
        onPrevious={() => {}}
        onNext={() => {}}
      />,
    )
    expect(screen.getByRole('navigation')).toBeTruthy()
  })
})

describe('a pager the app holds', () => {
  it('disables both directions, shows neither busy, and asks for nothing', () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    render(
      <CursorPagination hasPrevious hasNext disabled onPrevious={onPrevious} onNext={onNext} />,
    )

    const previous = screen.getByRole('button', { name: 'Previous' })
    const next = screen.getByRole('button', { name: 'Next' })
    expect(previous).toHaveProperty('disabled', true)
    expect(next).toHaveProperty('disabled', true)
    expect(next.getAttribute('aria-busy')).toBeNull()
    previous.click()
    next.click()
    expect(onPrevious).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()

    const pager = screen.getByRole('navigation')
    expect(pager.hasAttribute('data-disabled')).toBe(true)
    expect(pager.getAttribute('aria-busy')).toBeNull()
  })

  it('stays drawn, and gives the directions back when the hold ends', () => {
    const pager = (disabled: boolean) => (
      <CursorPagination
        hasPrevious
        hasNext={false}
        disabled={disabled}
        onPrevious={() => {}}
        onNext={() => {}}
      />
    )
    const { rerender } = render(pager(true))
    rerender(pager(false))

    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', false)
    // The list has no next cursor, so the hold ending does not enable that direction.
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('navigation').hasAttribute('data-disabled')).toBe(false)
  })

  it('keeps the pressed direction busy and focused when a window is also in flight', async () => {
    function Held() {
      const [pending, setPending] = useState(false)
      return (
        <CursorPagination
          hasPrevious
          hasNext
          pending={pending}
          disabled={pending}
          onPrevious={() => {}}
          onNext={() => setPending(true)}
        />
      )
    }
    render(<Held />)

    // Focused first and pressed from the keyboard: an engine may leave focus where it was
    // when a button is clicked, and the claim is about a button that has it.
    const next = screen.getByRole('button', { name: 'Next' })
    next.focus()
    await userEvent.keyboard('{Enter}')

    await vi.waitFor(() => expect(next.getAttribute('aria-busy')).toBe('true'))
    expect(next).toHaveProperty('disabled', false)
    expect(document.activeElement).toBe(next)
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', true)
  })

  it('disables the append form’s action', () => {
    const onNext = vi.fn()
    render(<CursorPagination mode="append" hasPrevious={false} hasNext disabled onNext={onNext} />)

    const more = screen.getByRole('button', { name: 'Load more' })
    expect(more).toHaveProperty('disabled', true)
    more.click()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('still renders nothing for a single window', () => {
    render(
      <CursorPagination
        hasPrevious={false}
        hasNext={false}
        disabled
        onPrevious={() => {}}
        onNext={() => {}}
      />,
    )
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})

/**
 * Where focus goes when a hold disables the direction that has it, which the
 * law states once for every web shell. The pager is mounted in a component
 * that holds its props, as the application around it does.
 */
pagerHoldLaw({
  shell: 'React',
  member: 'CursorPagination',
  mount({ append, addressed, asked }) {
    let change: (next: Partial<CursorHold>) => void = () => {}
    const addresses = addressed
      ? { previousHref: PAGER_ADDRESSES.previous, nextHref: PAGER_ADDRESSES.next }
      : {}
    function Held() {
      const [hold, setHold] = useState<CursorHold>({
        disabled: false,
        pending: false,
        hasNext: true,
      })
      change = (next) => setHold((was) => ({ ...was, ...next }))
      return append ? (
        <CursorPagination
          mode="append"
          label="Tickets"
          hasPrevious={false}
          onNext={asked}
          {...addresses}
          {...hold}
        />
      ) : (
        <CursorPagination
          label="Tickets"
          hasPrevious
          onPrevious={asked}
          onNext={asked}
          {...addresses}
          {...hold}
        />
      )
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => change(next) })
  },
})

describe('the append form — load more', () => {
  function more(props: Partial<AppendProps> = {}) {
    const onNext = vi.fn()
    const view = render(
      <CursorPagination mode="append" hasPrevious={false} hasNext onNext={onNext} {...props} />,
    )
    return { onNext, ...view }
  }

  /**
   * Stands in for the app: it fetches a window when asked, and the window that
   * answers has no next one. `hasPrevious` is a query library's flag for a
   * forward feed, false throughout, which the append form does not read.
   */
  function Feed({ messages }: { messages?: AppendProps['messages'] }) {
    const [hasNext, setHasNext] = useState(true)
    return (
      <CursorPagination
        mode="append"
        hasPrevious={false}
        hasNext={hasNext}
        position="120 shown"
        messages={messages}
        onNext={() => setHasNext(false)}
      />
    )
  }

  it('is one action, which asks for the next window', async () => {
    const { onNext } = more({ position: '50 shown' })

    expect(screen.getAllByRole('button')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull()
  })

  it('is busy while a window is in flight, and does not ask twice', () => {
    const { onNext } = more({ pending: true })

    const button = screen.getByRole('button', { name: 'Load more' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('navigation').getAttribute('aria-busy')).toBe('true')
    button.click()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('says the list ran out in a status region that was there before its words', async () => {
    render(<Feed />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))

    // The same element, so a screen reader hears the change.
    expect(screen.getByRole('status')).toBe(status)
    expect(status.textContent).toBe('No more to load')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('120 shown')).toBeTruthy()
  })

  it('renders nothing for a single window, whatever hasPrevious says', () => {
    expect(more({ hasNext: false }).container.innerHTML).toBe('')
    // Not asked for a window, so the list never grew: no end line under it.
    expect(more({ hasPrevious: true, hasNext: false }).container.innerHTML).toBe('')
  })

  it('takes no previous handler, because it has no previous direction', () => {
    const f = () => {}
    // @ts-expect-error — the append form takes no `onPrevious`.
    const bad = <CursorPagination mode="append" hasPrevious hasNext onNext={f} onPrevious={f} />
    expect(bad).toBeTruthy()
  })

  it('uses localized words for its action and its end', async () => {
    const messages = {
      previous: 'Précédent',
      next: 'Suivant',
      more: 'Charger plus',
      end: 'Plus rien à charger',
    }
    render(<Feed messages={messages} />)
    await userEvent.click(screen.getByRole('button', { name: 'Charger plus' }))
    expect(screen.getByRole('status').textContent).toBe('Plus rien à charger')
  })

  it('warns in development when localized messages leave the append form’s words out', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    more({ messages: { previous: 'Précédent', next: 'Suivant' } })
    expect(warned).toHaveBeenCalledTimes(1)
    expect(String(warned.mock.calls[0]?.[0])).toContain('messages.more')
  })
})

describe('the replace form without onPrevious', () => {
  it('does not type-check, and warns in development for a caller the types do not reach', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // @ts-expect-error — the replace form requires `onPrevious`, its previous direction's handler.
    render(<CursorPagination hasPrevious hasNext onNext={() => {}} />)
    expect(warned).toHaveBeenCalledTimes(1)
    expect(String(warned.mock.calls[0]?.[0])).toContain('onPrevious')
  })
})

/**
 * An agent asks for the next or the previous window through the bridge, as the spec's `agent`
 * fence declares (`design/components/cursor-pagination.md`, Agent). A direction a person cannot
 * press is refused, and the pager withholds its Buttons.
 */
describe('an agent', () => {
  it('asks for a window in each direction, and is refused one a person cannot press', async () => {
    const bridge = createAgentBridge()
    try {
      const onNext = vi.fn()
      const onPrevious = vi.fn()
      function Held() {
        const [pending, setPending] = useState(false)
        return (
          <CursorPagination
            label="Events"
            hasPrevious={false}
            hasNext
            position="1–25"
            pending={pending}
            onPrevious={onPrevious}
            onNext={() => {
              onNext()
              setPending(true)
            }}
          />
        )
      }
      render(<Held />)
      const { members } = bridge.snapshot()
      expect(members.map((member) => member.member)).toEqual(['CursorPagination'])
      const [pager] = members
      expect(pager).toMatchObject({
        name: 'Events',
        state: {
          'has-previous': false,
          'has-next': true,
          position: '1–25',
          pending: false,
          disabled: false,
        },
      })

      const back = await bridge.act([{ id: pager?.id, action: 'previous' }])
      expect(back.results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
      expect(onPrevious).not.toHaveBeenCalled()

      const ahead = await bridge.act([{ id: pager?.id, action: 'next' }])
      expect(ahead.results[0]).toEqual({
        ok: true,
        id: pager?.id,
        changed: { pending: { from: false, to: true } },
      })
      expect(onNext).toHaveBeenCalledTimes(1)
      // The pressed direction is busy while its window is in flight, as a person's press makes it.
      expect(screen.getByRole('button', { name: 'Next' }).getAttribute('data-state')).toBe(
        'loading',
      )

      const again = await bridge.act([{ id: pager?.id, action: 'next' }])
      expect(again.results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
      expect(onNext).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('has no previous direction in the append form', async () => {
    const bridge = createAgentBridge()
    try {
      const onNext = vi.fn()
      render(<CursorPagination mode="append" hasPrevious hasNext onNext={onNext} />)
      const [pager] = bridge.snapshot().members
      expect(pager?.state['has-previous']).toBe(false)
      const back = await bridge.act([{ id: pager?.id, action: 'previous' }])
      expect(back.results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
      const more = await bridge.act([{ id: pager?.id, action: 'next' }])
      expect(more.results[0]).toMatchObject({ ok: true })
      expect(onNext).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })
})
