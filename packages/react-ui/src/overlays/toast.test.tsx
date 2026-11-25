import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { toastFocusLaw } from '@polymorph/conformance/toast-focus'
import { Button } from '../controls/Button'
import { Input } from '../controls/Input'
import { Select } from '../controls/Select'
import { shadowCuts, shadowReach, tokenColor, tokenLength } from '../controls/token-probe'
import {
  appendThemeCSS,
  composeTheme,
  emitThemeCSS,
  parsePalette,
  parseSystem,
  resolveTheme,
} from '@polymorph/engine'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Dialog } from './Dialog'
import { Toaster } from './Toaster'
import { getToasts, removeToast, toast, TOAST_MAX_VISIBLE, type ToastTone } from './toast-store'

/**
 * Toast. The store is module-level and the viewport is portalled, so these
 * tests work as an application does: mount one `<Toaster />`, call `toast()`
 * from outside React, and check what renders.
 */

beforeAll(installTestTheme)

afterEach(() => {
  toast.dismiss()
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const cards = () => [...document.querySelectorAll('li')] as HTMLElement[]
const settled = async (count: number) =>
  vi.waitFor(() => expect(cards()).toHaveLength(count), { timeout: 3000 })
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

/** The cards once their entrance has ended: every box the same on two frames in a row. */
async function resting(count: number): Promise<HTMLElement[]> {
  await settled(count)
  return vi.waitFor(
    async () => {
      const before = cards().map((card) => card.getBoundingClientRect().toJSON())
      await frame()
      await frame()
      expect(cards().map((card) => card.getBoundingClientRect().toJSON())).toEqual(before)
      return cards()
    },
    { timeout: 3000 },
  )
}

/** The shipped systems and palettes, so a law about a shadow holds for every shadow they derive. */
const SYSTEMS = import.meta.glob<string>('../../../../design/systems/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const PALETTES = import.meta.glob<string>('../../../../design/palettes/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/**
 * Every state a card takes from here on, each with the card's `pointer-events`
 * at that moment. A leaving card is `closed` for as long as its leave lasts,
 * which can be shorter than the interval a poll samples at, so the changes are
 * recorded as they happen. The observer's callback runs before the card can be
 * removed, because removal waits for a later task.
 */
function watchCardStates(): { seen: { state: string; pointerEvents: string }[]; stop: () => void } {
  const seen: { state: string; pointerEvents: string }[] = []
  const record = (card: HTMLElement) =>
    seen.push({
      state: card.dataset['state'] ?? '',
      pointerEvents: getComputedStyle(card).pointerEvents,
    })
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        if (mutation.target instanceof HTMLLIElement) record(mutation.target)
        continue
      }
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLLIElement) record(node)
      }
    }
  })
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-state'],
  })
  return { seen, stop: () => observer.disconnect() }
}

const statesOf = (watch: { seen: { state: string }[] }) => watch.seen.map((entry) => entry.state)

toastFocusLaw({
  shell: 'React',
  mount: async () => render(<Toaster />),
  raise: (options) => void toast({ ...options, durationMs: Number.POSITIVE_INFINITY }),
  clear: () => getToasts().forEach((record) => removeToast(record.id)),
})

/**
 * A toast raised while a Dialog is open is newer than the dialog. Escape in
 * the dialog's field belongs to the dialog all the same: a card takes Escape
 * only while focus is in it.
 */
describe('a toast raised over an open Dialog', () => {
  const dialogOpen = () => document.querySelector('[role="dialog"]') !== null

  async function raiseOverDialog(options: Parameters<typeof toast>[0]) {
    render(
      <>
        <Toaster />
        <Dialog defaultOpen title="Edit ticket">
          <Input aria-label="Subject" />
        </Dialog>
      </>,
    )
    await vi.waitFor(() => expect(dialogOpen()).toBe(true))
    screen.getByLabelText('Subject').focus()
    toast(options)
    await settled(1)
  }

  it('leaves Escape in the dialog’s field to the dialog', async () => {
    await raiseOverDialog({ title: 'Saved', durationMs: Number.POSITIVE_INFINITY })
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(dialogOpen()).toBe(false))
    expect(getToasts().filter((record) => record.closing !== true)).toHaveLength(1)
  })

  it('leaves it to the dialog when the toast cannot be dismissed', async () => {
    await raiseOverDialog({ title: 'Retry required', dismissible: false })
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(dialogOpen()).toBe(false))
    expect(getToasts()).toHaveLength(1)
  })
})

describe('the imperative API', () => {
  it('raises a toast from outside React and returns its id', async () => {
    render(<Toaster />)
    const id = toast({ title: 'Ticket created' })
    expect(id).toMatch(/^toast-\d+$/)
    await settled(1)
    expect(screen.getByText('Ticket created')).toBeTruthy()
  })

  it('shows a description when one is given', async () => {
    render(<Toaster />)
    toast({ title: 'Ticket created', description: 'Assigned to the triage queue.' })
    await settled(1)
    expect(screen.getByText('Assigned to the triage queue.')).toBeTruthy()
  })

  it('offers a shorthand per tone', async () => {
    render(<Toaster />)
    toast.success('Saved')
    await settled(1)
    expect(cards()[0]?.dataset['tone']).toBe('success')
  })

  it('dismisses one by id, or all of them at once', async () => {
    render(<Toaster />)
    const first = toast({ title: 'First' })
    toast({ title: 'Second' })
    await settled(2)

    toast.dismiss(first)
    await settled(1)
    expect(screen.getByText('Second')).toBeTruthy()

    toast.dismiss()
    await settled(0)
  })

  it('keeps at most four, and the four it keeps are the newest', async () => {
    render(<Toaster />)
    for (let index = 1; index <= TOAST_MAX_VISIBLE + 2; index += 1) {
      toast({ title: `Toast ${index}` })
    }
    await settled(TOAST_MAX_VISIBLE)
    expect(screen.queryByText('Toast 1')).toBeNull()
    expect(screen.getByText(`Toast ${TOAST_MAX_VISIBLE + 2}`)).toBeTruthy()
  })

  it('stacks newest last, which is nearest the corner it grows from', async () => {
    render(<Toaster />)
    toast({ title: 'Older' })
    toast({ title: 'Newer' })
    await settled(2)
    expect(cards()[0]?.textContent).toContain('Older')
    expect(cards()[1]?.textContent).toContain('Newer')
  })
})

describe('update-in-place by id', () => {
  it('replaces the record: same card, same position, new content', async () => {
    render(<Toaster />)
    toast({ title: 'Before', durationMs: Number.POSITIVE_INFINITY })
    const id = toast({
      id: 'job',
      title: 'Exporting 0 of 3…',
      durationMs: Number.POSITIVE_INFINITY,
    })
    toast({ title: 'After', durationMs: Number.POSITIVE_INFINITY })
    await settled(3)

    const element = cards()[1] as HTMLElement
    expect(element.textContent).toContain('Exporting 0 of 3…')

    expect(toast({ id, title: 'Export ready', tone: 'success' })).toBe(id)
    await vi.waitFor(() => expect(screen.getByText('Export ready')).toBeTruthy())

    // One publish, not a remove and an add: the same element in the same slot,
    // so the stack does not move.
    expect(cards()).toHaveLength(3)
    expect(cards()[1]).toBe(element)
    expect(cards()[1]?.textContent).toContain('Export ready')
    expect(cards()[1]?.dataset['tone']).toBe('success')
    expect(screen.queryByText('Exporting 0 of 3…')).toBeNull()
  })

  it('restarts the timer, so an updated toast gets a full reading window', async () => {
    render(<Toaster />)
    toast({ id: 'brief', title: 'First face', durationMs: 900 })
    await settled(1)
    await sleep(500)
    toast({ id: 'brief', title: 'Second face', durationMs: 900 })

    // Well past the first version's deadline and well inside the second's. It
    // is still shown because the update reset the timer, and the margins are
    // wide enough that a busy runner cannot fake either half.
    await sleep(600)
    expect(cards()).toHaveLength(1)
    expect(cards()[0]?.textContent).toContain('Second face')
    await settled(0)
  })

  it('raises a new toast for an unknown id', async () => {
    render(<Toaster />)
    toast({ id: 'fresh', title: 'First of its name' })
    await settled(1)
    expect(cards()[0]?.textContent).toContain('First of its name')
  })
})

describe('toast.promise', () => {
  it('pins the loading state, then changes to success in place', async () => {
    render(<Toaster />)
    let resolve!: () => void
    const id = toast.promise(
      new Promise<void>((r) => {
        resolve = r
      }),
      {
        loading: 'Archiving…',
        // An options object where a string would do, on purpose: both are
        // accepted, and the short timer lets this test see the settled toast leave.
        success: { title: 'Archived', durationMs: 250 },
        error: 'Could not archive',
      },
    )
    expect(typeof id).toBe('string')
    await settled(1)

    const element = cards()[0] as HTMLElement
    expect(element.textContent).toContain('Archiving…')
    expect(element.dataset['tone']).toBe('neutral')
    // The pending state: the loading glyph spinning in the tone slot.
    const wait = element.querySelector('svg[data-icon="loading"]')?.parentElement as HTMLElement
    expect(wait).toBeTruthy()
    expect(getComputedStyle(wait).animationName).not.toBe('none')

    // Pinned: a wait must not time out.
    await sleep(400)
    expect(cards()).toHaveLength(1)

    resolve()
    await vi.waitFor(() => expect(screen.getByText('Archived')).toBeTruthy())
    // The settled state, in the same card, never a second one.
    expect(cards()).toHaveLength(1)
    expect(cards()[0]).toBe(element)
    expect(cards()[0]?.dataset['tone']).toBe('success')
    expect(cards()[0]?.querySelector('svg[data-icon="loading"]')).toBeNull()
    // The timer starts on settle, so the success toast closes itself.
    await settled(0)
  })

  it('changes to the danger state when the promise rejects', async () => {
    render(<Toaster />)
    let reject!: () => void
    toast.promise(
      new Promise<void>((_, r) => {
        reject = r
      }),
      {
        loading: 'Archiving…',
        success: 'Archived',
        error: { title: 'Could not archive', description: 'The queue is read-only.' },
      },
    )
    await settled(1)

    reject()
    await vi.waitFor(() => expect(screen.getByText('Could not archive')).toBeTruthy())
    expect(cards()[0]?.dataset['tone']).toBe('danger')
    expect(screen.getByText('The queue is read-only.')).toBeTruthy()
  })
})

describe('what it says, and how loudly', () => {
  it('marks each tone, and shows a glyph for all but neutral', async () => {
    render(<Toaster />)
    for (const tone of ['success', 'danger', 'warning', 'info'] as ToastTone[]) {
      toast({ title: tone, tone })
    }
    await settled(4)
    for (const card of cards()) {
      expect(card.querySelector('svg[data-icon]'), card.dataset['tone']).toBeTruthy()
    }

    toast.dismiss()
    await settled(0)
    toast({ title: 'Neutral' })
    await settled(1)
    // Neutral has no icon: the card is the same, and the title carries the message.
    const glyphs = [...(cards()[0]?.querySelectorAll('svg[data-icon]') ?? [])]
    expect(glyphs.map((glyph) => glyph.getAttribute('data-icon'))).toEqual(['close'])
  })

  it('interrupts for danger and warning, and is polite for the rest', async () => {
    render(<Toaster />)
    toast({ title: 'Went wrong', tone: 'danger' })
    await settled(1)
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-live="assertive"]')?.textContent).toContain(
        'Went wrong',
      ),
    )

    toast.dismiss()
    await settled(0)
    toast({ title: 'Saved', tone: 'success' })
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain('Saved'),
    )
  })
})

describe('the action', () => {
  it('runs and then dismisses the toast', async () => {
    render(<Toaster />)
    const onClick = vi.fn()
    toast({ title: 'Ticket archived', tone: 'success', action: { label: 'Undo', onClick } })
    await settled(1)

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    await settled(0)
  })

  it('takes the danger tone on a danger toast', async () => {
    render(<Toaster />)
    toast({ title: 'Deleted', tone: 'danger', action: { label: 'Undo', onClick: () => undefined } })
    await settled(1)
    const undo = screen.getByRole('button', { name: 'Undo' })
    expect(undo.dataset['tone']).toBe('danger')
    expect(undo.dataset['variant']).toBe('ghost')
    expect(getComputedStyle(undo).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(undo).borderTopWidth).toBe('0px')
    await userEvent.hover(undo)
    expect(getComputedStyle(undo).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  })
})

describe('leaving', () => {
  it('closes itself when its time is up', async () => {
    render(<Toaster />)
    toast({ title: 'Brief', durationMs: 150 })
    await settled(1)
    await settled(0)
  })

  it('stays until it is dismissed when it is pinned', async () => {
    render(<Toaster />)
    toast({ title: 'Pinned', durationMs: Number.POSITIVE_INFINITY })
    await settled(1)
    await sleep(600)
    expect(cards()).toHaveLength(1)
  })

  it('closes from its own dismiss button', async () => {
    render(<Toaster />)
    toast({ title: 'Ticket created', durationMs: Number.POSITIVE_INFINITY })
    await settled(1)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await settled(0)
  })

  it('passes through the closed state while leaving, however it was dismissed', async () => {
    render(<Toaster />)

    // Dismissed by hand. Without the two-step store this element would leave
    // while still marked open, and the rule that stops a leaving card taking a
    // click would never apply.
    const byHand = watchCardStates()
    toast({ title: 'By hand', durationMs: Number.POSITIVE_INFINITY })
    await settled(1)
    toast.dismiss()
    await vi.waitFor(() => expect(statesOf(byHand)).toEqual(['open', 'closed']), {
      timeout: 3000,
    })
    expect(byHand.seen.at(-1)?.pointerEvents).toBe('none')
    await settled(0)
    byHand.stop()

    // And when its own timer runs out.
    const timedOut = watchCardStates()
    toast({ title: 'Timed out', durationMs: 100 })
    await vi.waitFor(() => expect(statesOf(timedOut)).toEqual(['open', 'closed']), {
      timeout: 3000,
    })
    await settled(0)
    timedOut.stop()
  })

  it('moves the card with the finger while it is dragged, and dismisses it past the threshold', async () => {
    render(<Toaster />)
    toast({ title: 'Dragged', durationMs: Number.POSITIVE_INFINITY })
    await settled(1)
    const card = cards()[0] as HTMLElement
    // After the enter, when the engine has left its last `translate` inline.
    await Promise.all(card.getAnimations().map((animation) => animation.finished))
    const rest = card.getBoundingClientRect().x

    // The browser does not capture a synthetic pointer id, so the capture is stubbed.
    // The card's own handlers still measure the drag and mark the card.
    const capture = vi.spyOn(card, 'setPointerCapture').mockImplementation(() => {})
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 20, clientY: 0 })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 90, clientY: 0 })
    expect(card.dataset['swipe']).toBe('move')
    const offset = Number.parseFloat(card.style.getPropertyValue('--radix-toast-swipe-move-x'))
    expect(offset).toBeGreaterThan(0)
    // The card is drawn where the finger is, not where the enter left it.
    expect(Math.round(card.getBoundingClientRect().x - rest)).toBe(Math.round(offset))

    fireEvent.pointerUp(card, { pointerId: 1, clientX: 90, clientY: 0 })
    capture.mockRestore()
    await vi.waitFor(() => expect(card.dataset['state']).toBe('closed'))
    // It leaves from where the finger let go.
    expect(card.getBoundingClientRect().x - rest).toBeGreaterThan(0)
    await settled(0)
  })

  it('returns the card to rest when the drag is let go short of the threshold', async () => {
    render(<Toaster />)
    toast({ title: 'Let go', durationMs: Number.POSITIVE_INFINITY })
    await settled(1)
    const card = cards()[0] as HTMLElement
    await Promise.all(card.getAnimations().map((animation) => animation.finished))
    const rest = card.getBoundingClientRect().x

    const capture = vi.spyOn(card, 'setPointerCapture').mockImplementation(() => {})
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 12, clientY: 0 })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 30, clientY: 0 })
    expect(card.dataset['swipe']).toBe('move')
    expect(card.getBoundingClientRect().x - rest).toBeGreaterThan(0)
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 30, clientY: 0 })
    capture.mockRestore()

    expect(card.dataset['swipe']).toBe('cancel')
    await vi.waitFor(() => expect(Math.round(card.getBoundingClientRect().x - rest)).toBe(0))
    expect(card.dataset['state']).toBe('open')
  })

  it('holds its timer while the pointer is on it', async () => {
    render(<Toaster />)
    toast({ title: 'Held', durationMs: 250 })
    await settled(1)

    // Dispatched rather than performed: the pointer harness waits for the
    // element to be actionable, and a card with 250ms left is gone before
    // then. The viewport pauses on `pointermove` over its region.
    ;(cards()[0] as HTMLElement).dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, composed: true }),
    )

    await sleep(700)
    expect(cards(), 'the timer ran while the pointer was on the card').toHaveLength(1)

    // It resumes when the pointer leaves. The viewport listens on the region
    // around its list, and `pointerleave` does not bubble.
    ;(document.querySelector('ol')?.parentElement as HTMLElement).dispatchEvent(
      new PointerEvent('pointerleave', { bubbles: false, composed: true }),
    )
    await settled(0)
  })
})

describe('recipe', () => {
  it('is one neutral surface, whatever the tone', async () => {
    render(<Toaster />)
    for (const tone of ['neutral', 'success', 'danger'] as ToastTone[]) {
      toast({ title: tone, tone })
    }
    await settled(3)
    for (const card of cards()) {
      const style = getComputedStyle(card)
      expect(style.backgroundColor, card.dataset['tone']).toBe(tokenColor('--pm-bg-raised'))
      expect(style.borderTopLeftRadius, card.dataset['tone']).toBe(tokenLength('--pm-radius-lg'))
      // Border colour is checked below rather than here. The hover step is a
      // real rule, and a pointer left over the corner would fail this loop for
      // the wrong reason.
    }
  })

  it('borders in the default role, with no pointer on it', async () => {
    const { container } = render(
      <>
        <Button label="Somewhere else" />
        <Toaster />
      </>,
    )
    // The physical pointer is wherever the last test left it, and the viewport
    // is in the corner every test clicks into. Move it out of the way first.
    await userEvent.hover(container.querySelector('button') as HTMLElement)

    toast({ title: 'Ticket created', durationMs: Number.POSITIVE_INFINITY })
    await settled(1)
    const card = cards()[0] as HTMLElement
    expect(card.matches(':hover'), 'a stray pointer is sitting on the card').toBe(false)
    expect(getComputedStyle(card).borderTopColor).toBe(tokenColor('--pm-border-default'))
    // A dispatched event cannot reach the hover step, because a synthetic
    // `pointerover` does not make `:hover` match. So it is in
    // `requiredSelectors` and checked in source by `selectors.test.ts`, which
    // is the case the completeness law keeps that list for.
  })

  it('colours only the glyph', async () => {
    render(<Toaster />)
    toast({ title: 'Went wrong', tone: 'danger' })
    await settled(1)
    const mark = cards()[0]?.querySelector('svg[data-icon="error"]')?.parentElement as HTMLElement
    expect(getComputedStyle(mark).color).toBe(tokenColor('--pm-danger-text'))
    expect(getComputedStyle(screen.getByText('Went wrong')).color).toBe(
      tokenColor('--pm-text-primary'),
    )
  })

  it('sits in the corner, at the width the spec gives it', async () => {
    render(<Toaster />)
    toast({ title: 'Ticket created', durationMs: Number.POSITIVE_INFINITY })
    const [card] = await resting(1)
    const viewport = document.querySelector('ol') as HTMLElement
    expect(getComputedStyle(viewport).position).toBe('fixed')
    const inset = Number.parseFloat(tokenLength('--pm-space-6'))
    const box = (card as HTMLElement).getBoundingClientRect()
    expect(box.width).toBeCloseTo(
      Math.min(Number.parseFloat(tokenLength('--pm-space-10')) * 4, window.innerWidth - inset * 2),
      0,
    )
    expect(box.right).toBeCloseTo(window.innerWidth - inset, 0)
    expect(box.bottom).toBeCloseTo(window.innerHeight - inset, 0)
  })

  it('is a tab stop with the one focus ring', async () => {
    render(<Toaster />)
    toast({ title: 'Ticket created', durationMs: Number.POSITIVE_INFINITY })
    await settled(1)
    const card = cards()[0] as HTMLElement
    expect(card.tabIndex).toBe(0)
    card.focus({ focusVisible: true } as FocusOptions)
    expect(getComputedStyle(card).outlineStyle).toBe('solid')
  })
})

/**
 * The list scrolls when the cards are taller than the window, and a scroll container cuts what it
 * holds at its padding edge, on both axes. So the list is larger than its cards by the room their
 * shadow takes, and it takes no pointer events, so the room takes no click meant for the page.
 */
describe('the room around the cards', () => {
  const CORNER = { width: 1280, height: 800 }
  const PHONE = { width: 420, height: 800 }

  afterEach(async () => {
    await page.viewport(CORNER.width, CORNER.height)
  })

  const list = () => document.querySelector('ol') as HTMLElement

  /** Two pinned cards, the second with a description, as in a stack a reader sees. */
  async function stack(container?: HTMLElement): Promise<HTMLElement[]> {
    render(<Toaster />, container === undefined ? {} : { container })
    toast({ title: 'Continua is in use', durationMs: Number.POSITIVE_INFINITY })
    toast({
      title: 'Support',
      description: 'Write to support, or ask in the help panel.',
      durationMs: Number.POSITIVE_INFINITY,
    })
    return resting(2)
  }

  /**
   * Every part of each card's shadow that falls inside the window is drawn: the list, which cuts
   * what it holds at its padding box, cuts none of it. Past the window's edge nothing is drawn.
   */
  function expectWholeShadows(what: string) {
    for (const card of cards()) {
      const name = `${what}, ${card.textContent?.slice(0, 12) ?? ''}`
      expect(shadowReach(card).bottom, `${name}: the card draws no shadow`).toBeGreaterThan(0)
      expect(shadowCuts(card), `${name}: its shadow is cut`).toEqual([])
    }
  }

  for (const [layout, size] of [
    ['the corner', CORNER],
    ['the phone register', PHONE],
  ] as const) {
    it(`cuts none of a card's shadow in ${layout}, in every shipped system`, async () => {
      await page.viewport(size.width, size.height)
      for (const [path, source] of Object.entries(SYSTEMS)) {
        const system = parseSystem(JSON.parse(source))
        const palette = PALETTES[`../../../../design/palettes/${system.defaultPalette}.json`]
        expect(palette, `${path}: its default palette`).toBeDefined()
        const theme = resolveTheme(composeTheme(system, parsePalette(JSON.parse(palette ?? ''))))
        appendThemeCSS(emitThemeCSS(theme), theme.name)
        const host = document.createElement('div')
        host.setAttribute('data-system', theme.system)
        host.setAttribute('data-palette', theme.palette)
        document.body.append(host)
        await stack(host)
        expectWholeShadows(`${theme.system} in ${layout}`)
        toast.dismiss()
        await settled(0)
        cleanup()
        host.remove()
      }
    })
  }

  it('keeps each card where it was in the phone register: full width, at the bottom inset', async () => {
    await page.viewport(PHONE.width, PHONE.height)
    const [, last] = await stack()
    const edge = Number.parseFloat(tokenLength('--pm-space-4'))
    const box = (last as HTMLElement).getBoundingClientRect()
    expect(box.left).toBeCloseTo(edge, 0)
    expect(box.right).toBeCloseTo(window.innerWidth - edge, 0)
    expect(box.bottom).toBeCloseTo(
      window.innerHeight - Number.parseFloat(tokenLength('--pm-space-6')),
      0,
    )
  })

  for (const [layout, size] of [
    ['the corner', CORNER],
    ['the phone register', PHONE],
  ] as const) {
    it(`takes no click meant for the page around the cards or between them, in ${layout}`, async () => {
      await page.viewport(size.width, size.height)
      const underneath = document.createElement('div')
      underneath.style.cssText = 'position:fixed;inset:0'
      document.body.append(underneath)
      const [first, second] = (await stack()).map((card) => card.getBoundingClientRect()) as [
        DOMRect,
        DOMRect,
      ]
      const points = {
        'between the cards': [first.left + first.width / 2, (first.bottom + second.top) / 2],
        'beside the start side': [first.left - 4, first.top + first.height / 2],
        'above the stack': [first.left + first.width / 2, first.top - 4],
        'beside the end side': [second.right + 4, second.top + second.height / 2],
        'below the stack': [second.left + second.width / 2, second.bottom + 4],
      } as const
      for (const [where, [x, y]] of Object.entries(points)) {
        expect(document.elementFromPoint(x, y), where).toBe(underneath)
      }
      for (const card of cards()) {
        const box = card.getBoundingClientRect()
        const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        expect(card.contains(at), 'a card takes its own clicks').toBe(true)
      }
      underneath.remove()
    })
  }

  it('scrolls when the cards are taller than the window, under the pointer too', async () => {
    await page.viewport(CORNER.width, 360)
    render(<Toaster />)
    for (let index = 1; index <= TOAST_MAX_VISIBLE; index += 1) {
      toast({
        title: `Export ${index} is ready`,
        description: 'The file is in your downloads, and a copy is attached to the ticket.',
        durationMs: Number.POSITIVE_INFINITY,
      })
    }
    const all = await resting(TOAST_MAX_VISIBLE)
    const inset = Number.parseFloat(tokenLength('--pm-space-6'))
    expect(getComputedStyle(list()).overflowY).toBe('auto')
    expect(list().scrollHeight, 'the list does not scroll').toBeGreaterThan(list().clientHeight)

    list().scrollTop = 0
    await vi.waitFor(() =>
      expect((all[0] as HTMLElement).getBoundingClientRect().top).toBeCloseTo(inset, 0),
    )
    await userEvent.wheel(all[1] as HTMLElement, { delta: { y: 120 } })
    await vi.waitFor(() => expect(list().scrollTop, 'a wheel over a card').toBeGreaterThan(0))

    list().scrollTop = list().scrollHeight
    await vi.waitFor(() =>
      expect((all.at(-1) as HTMLElement).getBoundingClientRect().bottom).toBeCloseTo(
        window.innerHeight - inset,
        0,
      ),
    )
  })
})

describe('motion', () => {
  it('animates only transform and opacity, never the box', async () => {
    render(<Toaster />)
    toast({ title: 'Ticket created', durationMs: Number.POSITIVE_INFINITY })
    await settled(1)
    const inline = (cards()[0] as HTMLElement).getAttribute('style') ?? ''
    for (const property of ['width', 'height', 'margin', 'top', 'left']) {
      expect(inline, `the engine animated ${property}`).not.toMatch(
        new RegExp(`(^|;)\\s*${property}:`),
      )
    }
  })

  it('leaves no orphan behind when a stack is dismissed all at once', async () => {
    render(<Toaster />)
    for (let index = 0; index < 4; index += 1) {
      toast({ title: `Toast ${index}`, durationMs: Number.POSITIVE_INFINITY })
    }
    await settled(4)
    toast.dismiss()
    await settled(0)
  })

  it('handles being raised and dismissed repeatedly', async () => {
    render(<Toaster />)
    for (let index = 0; index < 10; index += 1) {
      const id = toast({ title: `Toast ${index}`, durationMs: Number.POSITIVE_INFINITY })
      await sleep(20)
      toast.dismiss(id)
      // The cap applies to the store. The DOM can hold a few more while their
      // exits run, which is what presence is for.
      expect(getToasts().length, 'the store grew past its cap').toBeLessThanOrEqual(
        TOAST_MAX_VISIBLE,
      )
      const titles = cards().map((card) => card.textContent)
      expect(new Set(titles).size, 'the same toast was on screen twice').toBe(titles.length)
    }
    await settled(0)
  })
})

/**
 * The stacking order: announcements are above surfaces, which are above the
 * frame. It prevents a toast raised while a select sheet is open from being
 * hidden by it: both surfaces are portalled, and without a layer the sheet,
 * mounted later, would paint over the announcement. `--pm-z-toast` (200) above
 * `--pm-z-overlay` (100) is the only safeguard, checked here by hit-testing.
 */
describe('the stacking order', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('paints an announcement above an open select sheet', async () => {
    // 420: below the overlay class's 30rem threshold, so the select uses a sheet.
    await page.viewport(420, 800)
    render(
      <>
        <Toaster />
        <Select
          defaultOpen
          aria-label="Queue"
          options={[
            { value: 'billing', label: 'Billing' },
            { value: 'onboarding', label: 'Onboarding' },
          ]}
        />
      </>,
    )
    await vi.waitFor(() =>
      expect(document.querySelector('[data-presentation="sheet"]')).not.toBeNull(),
    )

    toast({ title: 'Export ready', durationMs: Number.POSITIVE_INFINITY })
    const title = await vi.waitFor(() => screen.getByText('Export ready'))
    const card = title.closest('li') as HTMLElement

    await vi.waitFor(() => {
      const rect = card.getBoundingClientRect()
      const at = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      expect(at, 'the toast is the announcement — no surface may bury it').not.toBeNull()
      expect(card.contains(at), 'the hit at the toast’s centre belongs to the toast').toBe(true)
    })
  })
})

/**
 * An agent reads the notices on screen and answers them through the store, as the spec's
 * `agent` fence declares (`design/components/toast.md`, Agent). The viewport is one Toast, and
 * the cards' own Buttons are not listed beside it.
 */
describe('an agent', () => {
  it('reads what each notice says, and lists none of the cards’ own Buttons', async () => {
    render(<Toaster />)
    const bridge = createAgentBridge()
    try {
      expect(bridge.snapshot().members).toMatchObject([
        { member: 'Toast', name: 'Notifications (F8)', state: { notices: [], details: [] } },
      ])
      const created = toast({ title: 'Ticket created', durationMs: Number.POSITIVE_INFINITY })
      const failed = toast.danger('Could not delete', {
        description: 'The ticket is referenced by another.',
        action: { label: 'Retry', onClick: () => undefined },
      })
      await settled(2)
      const members = bridge.snapshot().members
      expect(members.map((member) => member.member)).toEqual(['Toast'])
      expect(members[0]?.state).toEqual({
        notices: [
          { id: created, label: 'Ticket created' },
          { id: failed, label: 'Could not delete' },
        ],
        details: [
          { id: created, title: 'Ticket created', tone: 'neutral', dismissible: true },
          {
            id: failed,
            title: 'Could not delete',
            description: 'The ticket is referenced by another.',
            tone: 'danger',
            action: 'Retry',
            dismissible: true,
          },
        ],
      })
      // The danger tone colours the message, so no answer asks a person.
      expect(members[0]?.actions).toEqual([
        { name: 'dismiss', argument: 'id' },
        { name: 'act', argument: 'id' },
      ])
      expect(bridge.query({ member: 'Button' })).toEqual([])
      expect(bridge.query({ name: 'Retry' })).toEqual([])
      expect(bridge.query({ name: 'Could not delete' })).toMatchObject([
        { member: 'Toast', option: { id: failed, label: 'Could not delete' } },
      ])
    } finally {
      bridge.dispose()
    }
  })

  it('dismisses a notice and runs an action through the store, so the handlers run', async () => {
    const calls: string[] = []
    render(<Toaster />)
    const archived = toast.success('Ticket archived', {
      action: { label: 'Undo', onClick: () => calls.push('undo') },
      durationMs: Number.POSITIVE_INFINITY,
      onDismiss: () => calls.push('archived left'),
    })
    const assigned = toast({
      title: 'Ticket assigned',
      durationMs: Number.POSITIVE_INFINITY,
      onDismiss: () => calls.push('assigned left'),
    })
    await settled(2)
    const bridge = createAgentBridge()
    try {
      const [viewport] = bridge.snapshot().members
      const { results } = await bridge.act([
        { id: viewport?.id, action: 'act', value: archived },
        { id: viewport?.id, action: 'dismiss', value: assigned },
      ])
      expect(results).toMatchObject([{ ok: true }, { ok: true }])
      expect(calls).toEqual(['undo', 'archived left', 'assigned left'])
      expect(bridge.snapshot().members[0]?.state).toEqual({ notices: [], details: [] })
      await settled(0)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses to dismiss a notice that cannot be, and to act on one with no action', async () => {
    const onDismiss = vi.fn()
    render(<Toaster />)
    const held = toast.danger('Payment failed', { dismissible: false, onDismiss })
    const plain = toast({ title: 'Ticket created', durationMs: Number.POSITIVE_INFINITY })
    await settled(2)
    const bridge = createAgentBridge()
    try {
      const [viewport] = bridge.snapshot().members
      const dismissed = await bridge.act([{ id: viewport?.id, action: 'dismiss', value: held }])
      expect(dismissed.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('cannot be dismissed') },
      })
      const acted = await bridge.act([{ id: viewport?.id, action: 'act', value: plain }])
      expect(acted.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('has no action') },
      })
      expect(onDismiss).not.toHaveBeenCalled()
      expect(getToasts().filter((record) => record.closing !== true)).toHaveLength(2)
    } finally {
      bridge.dispose()
      toast.dismiss()
    }
  })
})
