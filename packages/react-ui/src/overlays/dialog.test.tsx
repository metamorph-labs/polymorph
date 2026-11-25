import { cleanup, render, screen } from '@testing-library/react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { dialogFitLaw } from '@polymorph/conformance/dialog-fit'
import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { serverPassed } from '@polymorph/conformance/server-passed'
import { assertGoverned } from '@polymorph/react'
import { Button } from '../controls/Button'
import { FormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import {
  reachCuts,
  shadowCuts,
  shadowReach,
  tokenColor,
  tokenLength,
} from '../controls/token-probe'
import {
  appendThemeCSS,
  composeTheme,
  emitThemeCSS,
  parsePalette,
  parseSystem,
  resolveTheme,
} from '@polymorph/engine'
import { installTestTheme } from '@polymorph/engine/testing'
import { Dialog, type DialogProps } from './Dialog'
import dialogCss from '@polymorph/recipes/overlays/dialog.module.css?raw'

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
 * Dialog in a real browser. The important parts of a modal (the focus trap,
 * focus return, the scroll lock, an exit that survives interruption) are
 * behaviour that jsdom cannot test.
 */

beforeAll(installTestTheme)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

const panel = () => document.querySelector('[role="dialog"]') as HTMLElement | null
const panels = () => [...document.querySelectorAll('[role="dialog"]')]
const scrim = () => document.querySelector('[data-motion-pattern="fade"]') as HTMLElement | null

/**
 * A pointer press on the scrim, dispatched rather than performed. The panel is
 * at the scrim's centre, and the pointer harness clicks an element's centre, so
 * a "click outside" would land inside. Radix listens for `pointerdown` on the
 * document, which this dispatches.
 */
function pressOutside(target: Element): void {
  for (const type of ['pointerdown', 'pointerup'] as const) {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true }))
  }
  // Radix defers the dismiss to the click that follows the press, so that a
  // drag that started inside and ended outside does not count as "outside".
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<DialogProps>(true)
  })
})

describe('opening and closing', () => {
  it('renders nothing but its trigger until it is opened', () => {
    render(
      <Dialog title="Discard?" trigger={<Button label="Open" />}>
        <p>body</p>
      </Dialog>,
    )
    expect(panel()).toBeNull()
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
  })

  it('opens from its trigger, with the title as its accessible name', async () => {
    render(
      <Dialog title="Discard this ticket?" trigger={<Button label="Open" />}>
        <p>body</p>
      </Dialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('dialog', { name: 'Discard this ticket?' })).toBeTruthy()
  })

  it('opens from a trigger a server component passed', async () => {
    // A client member receives such an element as a lazy reference, which has
    // no props to clone until it is read (`useSupplied`).
    render(
      <Dialog title="Discard this ticket?" trigger={serverPassed(<Button label="Open" />)}>
        <p>body</p>
      </Dialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('dialog', { name: 'Discard this ticket?' })).toBeTruthy()
  })

  it('is modal: it declares it, and nothing behind it is reachable', async () => {
    render(
      <>
        <Button label="Behind" />
        <Dialog defaultOpen title="Discard?" trigger={<Button label="Open" />}>
          <p>body</p>
        </Dialog>
      </>,
    )
    const node = panel() as HTMLElement
    expect(node.getAttribute('aria-modal')).toBe('true')
    expect(node.dataset['state']).toBe('open')
    // Radix hides the rest of the page from assistive tech while a modal is up.
    expect(screen.queryByRole('button', { name: 'Behind' })).toBeNull()
  })

  it('describes itself from its description, when it has one', async () => {
    render(
      <Dialog
        defaultOpen
        title="Discard this ticket?"
        description="Nothing you typed is kept."
        trigger={<Button label="Open" />}
      >
        <p>body</p>
      </Dialog>,
    )
    expect(screen.getByRole('dialog', { description: 'Nothing you typed is kept.' })).toBeTruthy()
  })

  it('reports every open and close to its caller', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog title="Discard?" onOpenChange={onOpenChange} trigger={<Button label="Open" />}>
        <p>body</p>
      </Dialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onOpenChange).toHaveBeenCalledWith(true)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on Escape and returns focus to the trigger it came from', async () => {
    render(
      <Dialog title="Discard?" trigger={<Button label="Open" />}>
        <p>body</p>
      </Dialog>,
    )
    const trigger = screen.getByRole('button', { name: 'Open' })
    // Opened from the keyboard. WebKit follows the macOS convention where a
    // pointer press never focuses a button, so a click-opened dialog records
    // `body` as the restore target, which is what a Safari mouse user gets.
    // The restore is promised to keyboard users, so the test uses the
    // keyboard: focus the trigger, then open.
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(panels()).toHaveLength(1))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panels()).toHaveLength(0))
    // Focus is restored when the focus scope unmounts, after the exit.
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  // An icon-only Button's name tip (`button.md`, Name tip): Escape dismisses the tip and nothing
  // else, so the Dialog closes on the next Escape. The words are the test's own labels.
  it.skipIf(TAB_PASSES_BUTTONS)(
    'keeps the Dialog open when Escape closes the tip of a button the reader tabbed to',
    async () => {
      render(
        <Dialog title="Discard?" trigger={<Button label="Open" />}>
          <Button label="Keep" />
          <Button variant="ghost" tone="neutral" iconOnly icon="edit" label="Edit" />
        </Dialog>,
      )
      screen.getByRole('button', { name: 'Open' }).focus()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep' })),
      )
      await userEvent.keyboard('{Tab}')
      const edit = screen.getByRole('button', { name: 'Edit' })
      expect(document.activeElement).toBe(edit)
      const tip = () => document.querySelector('body > [popover]')
      await vi.waitFor(() => expect(tip()?.textContent).toBe('Edit'))
      await userEvent.keyboard('{Escape}')
      expect(tip()).toBeNull()
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(panels()).toHaveLength(1)
      expect(document.activeElement).toBe(edit)
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(panels()).toHaveLength(0))
    },
  )

  it('closes on a click outside the panel, because the scrim is the dismiss surface', async () => {
    render(
      <Dialog title="Discard?" trigger={<Button label="Open" />}>
        <p>body</p>
      </Dialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    pressOutside(scrim() as HTMLElement)
    await vi.waitFor(() => expect(panels()).toHaveLength(0))
  })
})

describe('non-dismissible', () => {
  it('offers no way to close except the ones the screen provides', async () => {
    render(
      <Dialog
        defaultOpen
        dismissible={false}
        title="Choose one"
        trigger={<Button label="Open" />}
        footer={<Button label="Continue" />}
      >
        <p>body</p>
      </Dialog>,
    )
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()

    await userEvent.keyboard('{Escape}')
    await sleep(120)
    expect(panel(), 'Escape closed a forced choice').not.toBeNull()

    pressOutside(scrim() as HTMLElement)
    await sleep(120)
    expect(panel(), 'an outside click closed a forced choice').not.toBeNull()
  })
})

describe('focus', () => {
  it('starts in the body, not on the close button', async () => {
    render(
      <Dialog
        defaultOpen
        title="New ticket"
        trigger={<Button label="Open" />}
        footer={<Button label="Create" />}
      >
        <Input aria-label="Subject" />
      </Dialog>,
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')))
  })

  it('falls back to the primary action, which is the rightmost one', async () => {
    render(
      <Dialog
        defaultOpen
        title="Publish?"
        trigger={<Button label="Open" />}
        footer={
          <>
            <Button variant="outline" tone="neutral" label="Keep editing" />
            <Button label="Publish" />
          </>
        }
      >
        <p>Nothing focusable in here.</p>
      </Dialog>,
    )
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Publish' })),
    )
  })

  it('never starts on a destructive action: a destructive primary starts on the dismiss', async () => {
    render(
      <Dialog
        defaultOpen
        title="Discard?"
        trigger={<Button label="Open" />}
        footer={
          <>
            <Button variant="outline" tone="neutral" label="Keep editing" />
            <Button tone="danger" label="Discard" />
          </>
        }
      >
        <p>Nothing focusable in here.</p>
      </Dialog>,
    )
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep editing' })),
    )
  })

  it('starts on close when every action is destructive, and passes over one in the body', async () => {
    render(
      <Dialog
        defaultOpen
        title="Discard?"
        trigger={<Button label="Open" />}
        footer={<Button tone="danger" label="Discard" />}
      >
        <Button variant="ghost" tone="danger" label="Discard all drafts" />
      </Dialog>,
    )
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' })),
    )
  })

  it('falls back to close when there is nothing else at all', async () => {
    render(
      <Dialog defaultOpen title="Just a message" trigger={<Button label="Open" />}>
        <p>Nothing focusable in here either.</p>
      </Dialog>,
    )
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' })),
    )
  })

  it('traps the tab loop inside the panel', async () => {
    render(
      <>
        <Button label="Outside" />
        <Dialog
          defaultOpen
          title="Discard?"
          trigger={<Button label="Open" />}
          footer={<Button label="Discard" />}
        >
          <p>body</p>
        </Dialog>
      </>,
    )
    await vi.waitFor(() => expect(document.activeElement).toBeTruthy())

    for (let step = 0; step < 6; step += 1) {
      await userEvent.keyboard('{Tab}')
      expect(panel()?.contains(document.activeElement), 'focus escaped the panel').toBe(true)
    }
  })
})

describe('recipe', () => {
  it('paints the panel as an overlay surface and the scrim from the scrim role', async () => {
    render(
      <Dialog defaultOpen title="Discard?" trigger={<Button label="Open" />}>
        <p>body</p>
      </Dialog>,
    )
    const style = getComputedStyle(panel() as HTMLElement)
    expect(style.backgroundColor).toBe(tokenColor('--pm-bg-overlay'))
    expect(style.borderTopColor).toBe(tokenColor('--pm-border-subtle'))
    expect(style.borderTopLeftRadius).toBe(tokenLength('--pm-radius-lg'))
    expect(style.boxShadow).not.toBe('none')
    expect(getComputedStyle(scrim() as HTMLElement).backgroundColor).toBe(
      tokenColor('--pm-bg-scrim'),
    )
  })

  it('widens with its size, from the space scale, and never past the viewport', async () => {
    // Asserted against the calculation rather than three growing numbers,
    // because a narrow test viewport clamps every size to the same width, and
    // the clamp is half of the rule.
    const step = Number.parseFloat(tokenLength('--pm-space-10'))
    const gutter = Number.parseFloat(tokenLength('--pm-space-7'))
    const multiplier = { sm: 4, md: 5, lg: 7 }

    for (const size of ['sm', 'md', 'lg'] as const) {
      const view = render(
        <Dialog defaultOpen size={size} title={size} trigger={<Button label="Open" />}>
          <p>body</p>
        </Dialog>,
      )
      const node = panel() as HTMLElement
      expect(node.dataset['size']).toBe(size)
      expect(node.offsetWidth, size).toBeCloseTo(
        Math.min(step * multiplier[size], window.innerWidth - gutter * 2),
        0,
      )
      view.unmount()
      await vi.waitFor(() => expect(panels()).toHaveLength(0))
    }
  })

  it('scrolls the body and nothing else', async () => {
    render(
      <Dialog
        defaultOpen
        title="Long"
        trigger={<Button label="Open" />}
        footer={<Button label="Done" />}
      >
        {Array.from({ length: 40 }, (_, index) => (
          <p key={index}>Paragraph {index + 1}</p>
        ))}
      </Dialog>,
    )
    const body = document.querySelector('[data-dialog-part="body"]') as HTMLElement
    expect(getComputedStyle(body).overflowY).toBe('auto')
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight)
    // The panel itself does not scroll, so the title and the actions stay where
    // the reader last saw them.
    const node = panel() as HTMLElement
    expect(node.scrollHeight).toBe(node.clientHeight)
    expect(node.offsetHeight).toBeLessThanOrEqual(window.innerHeight)
  })
})

/**
 * Fields at the edges of the body. The body scrolls, and a scroll container cuts what it holds
 * at its padding edge on both axes, so a field against the body's side, top or bottom would have
 * its seat shadow cut there, which squares off its rounded corners. The body is larger than its
 * content by the room the seat takes, and its margins take that room back, so nothing moves.
 */
describe('fields at the edges of the body', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  const part = (name: 'body' | 'footer') =>
    (panel() as HTMLElement).querySelector(`[data-dialog-part="${name}"]`) as HTMLElement
  const fields = () => [...part('body').querySelectorAll<HTMLElement>('[data-member="input"]')]

  /** The panel once its entrance has ended: its box the same on two frames in a row. */
  const settledPanel = () =>
    vi.waitFor(async () => {
      const before = (panel() as HTMLElement).getBoundingClientRect().toJSON()
      await frame()
      await frame()
      expect((panel() as HTMLElement).getBoundingClientRect().toJSON()).toEqual(before)
    })

  /** Nothing cuts the field's seat shadow inside the window. */
  function expectWholeSeat(field: HTMLElement, what: string) {
    expect(shadowReach(field).bottom, `${what}: the field draws no seat`).toBeGreaterThan(0)
    expect(shadowCuts(field), `${what}: its seat is cut`).toEqual([])
    // A control's focus mark, a 2px line drawn a `space-1` gap outside it, fits the same room.
    const mark = Number.parseFloat(tokenLength('--pm-space-1')) + 2
    expect(reachCuts(field, mark), `${what}: a focus mark is cut`).toEqual([])
  }

  const FORMS = [
    { name: 'card', width: 1280, presentation: 'auto' },
    { name: 'full-screen form', width: 420, presentation: 'auto' },
    { name: 'bottom sheet', width: 420, presentation: 'sheet' },
  ] as const

  for (const form of FORMS) {
    for (const scrolls of [false, true]) {
      it(`draws the whole seat of the first and the last field in the ${form.name}, with a body that ${scrolls ? 'scrolls' : 'does not scroll'}`, async () => {
        await page.viewport(form.width, 800)
        render(
          <Dialog
            defaultOpen
            presentation={form.presentation}
            title="Hosting"
            footer={<Button label="Save" />}
          >
            <Input aria-label="Search" defaultValue="orbit" />
            {Array.from({ length: scrolls ? 60 : 1 }, (_, index) => (
              <p key={index}>Paragraph {index + 1} between the fields.</p>
            ))}
            <FormField label="Monthly cap">
              <Input defaultValue="120" />
            </FormField>
          </Dialog>,
        )
        await settledPanel()
        // At rest: the dialog focused the first field when it opened.
        ;(document.activeElement as HTMLElement | null)?.blur()
        const body = part('body')
        const [first, last] = fields() as [HTMLElement, HTMLElement]
        expect(body.scrollHeight > body.clientHeight, 'the body scrolls').toBe(scrolls)

        body.scrollTop = 0
        await frame()
        expectWholeSeat(first, 'the first field')
        body.scrollTop = body.scrollHeight
        await frame()
        expectWholeSeat(last, 'the last field')

        // The room scrolls nothing that did not scroll before.
        const node = panel() as HTMLElement
        expect(node.scrollHeight, 'the panel scrolls').toBeLessThanOrEqual(node.clientHeight + 1)
        expect(node.scrollWidth, 'the panel pans').toBeLessThanOrEqual(node.clientWidth + 1)
        expect(body.scrollWidth, 'the body pans').toBeLessThanOrEqual(body.clientWidth + 1)
      })
    }
  }

  it('draws the whole seat in every shipped system that draws one', async () => {
    try {
      for (const [path, source] of Object.entries(SYSTEMS)) {
        const system = parseSystem(JSON.parse(source))
        const palette = PALETTES[`../../../../design/palettes/${system.defaultPalette}.json`]
        expect(palette, `${path}: its default palette`).toBeDefined()
        const theme = resolveTheme(composeTheme(system, parsePalette(JSON.parse(palette ?? ''))))
        appendThemeCSS(emitThemeCSS(theme), theme.name)
        document.documentElement.setAttribute('data-system', theme.system)
        document.documentElement.setAttribute('data-palette', theme.palette)
        const view = render(
          <Dialog defaultOpen title="Hosting">
            <Input aria-label="Search" defaultValue="orbit" />
            <FormField label="Monthly cap">
              <Input defaultValue="120" />
            </FormField>
          </Dialog>,
        )
        await settledPanel()
        ;(document.activeElement as HTMLElement | null)?.blur()
        for (const [at, field] of fields().entries()) {
          // A flat system draws no seat, so there is nothing to cut.
          if (shadowReach(field).bottom > 0) expectWholeSeat(field, `${theme.system}, field ${at}`)
        }
        view.unmount()
        await vi.waitFor(() => expect(panels()).toHaveLength(0))
      }
    } finally {
      installTestTheme()
    }
  })

  it('keeps the body’s content where it was: at the panel’s padding, under the title, over the footer', async () => {
    render(
      <Dialog defaultOpen title="Hosting" footer={<Button label="Save" />}>
        <Input aria-label="Search" defaultValue="orbit" />
        <FormField label="Monthly cap">
          <Input defaultValue="120" />
        </FormField>
      </Dialog>,
    )
    await settledPanel()
    const node = panel() as HTMLElement
    const box = node.getBoundingClientRect()
    const inset = Number.parseFloat(tokenLength('--pm-inset-surface'))
    const border = Number.parseFloat(getComputedStyle(node).borderTopWidth)
    const [first, last] = fields().map((field) => field.getBoundingClientRect()) as [
      DOMRect,
      DOMRect,
    ]
    const title = (node.querySelector('h2') as HTMLElement).getBoundingClientRect()
    expect(first.left).toBeCloseTo(box.left + border + inset, 1)
    expect(first.top).toBeCloseTo(title.bottom + Number.parseFloat(tokenLength('--pm-space-5')), 1)
    expect(last.left).toBeCloseTo(box.left + border + inset, 1)
    expect(last.right).toBeCloseTo(box.right - border - inset, 1)
    expect(part('footer').getBoundingClientRect().top).toBeCloseTo(
      last.bottom + Number.parseFloat(tokenLength('--pm-space-6')),
      1,
    )
  })
})

describe('motion, and the interruption laws', () => {
  function Mashable({ open }: { open: boolean }) {
    return (
      <Dialog open={open} title="Discard?">
        <p>body</p>
      </Dialog>
    )
  }

  it('keeps a leaving panel mounted until its exit has run', async () => {
    const view = render(<Mashable open={false} />)
    view.rerender(<Mashable open />)
    await sleep(400)
    expect(panels()).toHaveLength(1)

    view.rerender(<Mashable open={false} />)
    await frame()
    expect(panels(), 'the panel was cut off mid-exit').toHaveLength(1)

    await sleep(500)
    expect(panels(), 'the panel outlived its exit').toHaveLength(0)
  })

  it('never shows two panels, however fast it is toggled', async () => {
    const view = render(<Mashable open={false} />)
    for (let i = 0; i < 12; i += 1) {
      view.rerender(<Mashable open={i % 2 === 0} />)
      await frame()
      expect(panels().length, 'a second panel appeared').toBeLessThanOrEqual(1)
    }
    view.rerender(<Mashable open={false} />)
    await sleep(600)
    expect(panels(), 'an orphan was left behind').toHaveLength(0)
  })

  it('animates only transform and opacity, never the box', async () => {
    render(
      <Dialog defaultOpen title="Discard?" trigger={<Button label="Open" />}>
        <p>body</p>
      </Dialog>,
    )
    const node = panel() as HTMLElement
    const inline = node.getAttribute('style') ?? ''
    for (const property of ['width', 'height', 'top', 'left', 'margin']) {
      expect(inline, `the engine animated ${property}`).not.toMatch(
        new RegExp(`(^|;)\\s*${property}:`),
      )
    }
  })

  it('grows from the trigger it was launched from, not from the middle', async () => {
    render(
      <Dialog title="Discard?" trigger={<Button label="Open" />}>
        <p>body</p>
      </Dialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const origin = getComputedStyle(panel() as HTMLElement).transformOrigin
    // A projected origin is a pair of pixel offsets into the panel's box; the
    // fallback is the panel's centre.
    expect(origin).toBeTruthy()
    const centre = `${(panel() as HTMLElement).offsetWidth / 2}px`
    expect(origin.startsWith(centre), `origin ${origin} is just the centre`).toBe(false)
  })
})

/**
 * The sheet (`docs/layout.md`).
 *
 * The one member that responds to the viewport. The stylesheet explains why
 * beside the rule: an overlay is portalled to the document and positioned
 * `fixed`, so there is no box between the panel and the window. Its container
 * is the viewport. Everything else in the system measures its container
 * because it has one.
 *
 * So this test crosses a viewport threshold by resizing the window, as
 * AppShell's drawer tests do, for the same reason: crossing a breakpoint
 * should be an explicit line of test code, not an unstated default.
 */
describe('the sheet, below 30rem', () => {
  const NARROW = 420
  const WIDE = 1280

  afterEach(async () => {
    await page.viewport(WIDE, 800)
  })

  async function sheet(size?: DialogProps['size']) {
    await page.viewport(NARROW, 800)
    render(
      <Dialog defaultOpen size={size} title="Discard?" trigger={<Button label="Open" />}>
        <p>body</p>
      </Dialog>,
    )
    return panel() as HTMLElement
  }

  it('takes the whole window, on both axes', async () => {
    const node = await sheet()
    await vi.waitFor(() => {
      const box = node.getBoundingClientRect()
      expect(box.width).toBeCloseTo(window.innerWidth, 0)
      expect(box.height).toBeCloseTo(window.innerHeight, 0)
    })
  })

  it('drops its radius, because every edge is now an edge of the screen', async () => {
    const node = await sheet()
    await vi.waitFor(() => {
      const style = getComputedStyle(node)
      expect(style.borderTopLeftRadius).toBe('0px')
      expect(style.borderBottomRightRadius).toBe('0px')
      expect(style.borderTopWidth).toBe('0px')
    })
  })

  it('ignores size, because a full-screen panel has no size', async () => {
    // `[data-size]` outranks the bare panel rule, so a sheet rule without the
    // size selectors would keep reapplying a width. Both ends of the scale.
    for (const size of ['sm', 'lg'] as const) {
      const node = await sheet(size)
      await vi.waitFor(() =>
        expect(node.getBoundingClientRect().width, size).toBeCloseTo(window.innerWidth, 0),
      )
      cleanup()
      await vi.waitFor(() => expect(panels()).toHaveLength(0))
    }
  })

  it('is still a modal dialog, with its title and its close button', async () => {
    // Full-screen changes the shape, not the contract: adaptation degrades
    // composition, never content or semantics (`docs/layout.md`).
    const node = await sheet()
    expect(node.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Discard?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    await vi.waitFor(() => expect(node.contains(document.activeElement)).toBe(true))
  })

  it('goes back to being a dialog above the threshold', async () => {
    // The other half: a sheet that never turned back into a card would pass
    // every test above.
    render(
      <Dialog defaultOpen title="Discard?" trigger={<Button label="Open" />}>
        <p>body</p>
      </Dialog>,
    )
    const node = panel() as HTMLElement
    expect(node.getBoundingClientRect().width).toBeLessThan(window.innerWidth)
    expect(getComputedStyle(node).borderTopLeftRadius).toBe(tokenLength('--pm-radius-lg'))
  })

  it('adds safe-area block padding in the full-screen form', async () => {
    const node = await sheet()
    await vi.waitFor(() => {
      // env() resolves to 0 in this harness. The computed value shows the calc
      // parsed and applied; the source assertions check the env terms inside.
      expect(getComputedStyle(node).paddingBlockStart).toBe(tokenLength('--pm-space-6'))
      expect(getComputedStyle(node).paddingBlockEnd).toBe(tokenLength('--pm-space-6'))
    })
    expect(dialogCss).toContain('env(safe-area-inset-top, 0px)')
    expect(dialogCss).toContain('env(safe-area-inset-bottom, 0px)')
    // The full-screen form is not the sheet: the sheet presentation's attribute
    // stays absent under `auto`, so the two phone forms stay distinct.
    expect(node.hasAttribute('data-presentation')).toBe(false)
  })
})

/**
 * How the panel fits a window shorter than its content, at phone and desktop
 * width, in both presentations, as `@polymorph/conformance/dialog-fit` states
 * it for every web shell.
 */
dialogFitLaw({
  shell: 'React',
  async mount({ title, description, size, presentation, paragraphs, footer }) {
    render(
      <Dialog
        defaultOpen
        title={title}
        {...(description === undefined ? {} : { description })}
        size={size}
        presentation={presentation}
        {...(footer === undefined ? {} : { footer: <Button label={footer} /> })}
      >
        {paragraphs.map((text, at) => (
          <p key={at}>{text}</p>
        ))}
      </Dialog>,
    )
  },
})

/**
 * `presentation="sheet"` (the sheet presentation,
 * `design/components/README.md`): the card above `30rem`, the bottom sheet
 * below it. Only the shape changes: scrim, trap, dismissal and focus are
 * Dialog's in both forms.
 */
describe('presentation="sheet" — the bottom sheet, below 30rem', () => {
  const NARROW = 420
  const WIDE = 1280

  afterEach(async () => {
    await page.viewport(WIDE, 800)
  })

  async function sheet() {
    await page.viewport(NARROW, 800)
    render(
      <Dialog
        defaultOpen
        presentation="sheet"
        title="Snooze until"
        trigger={<Button label="Open" />}
        footer={<Button label="Snooze" />}
      >
        <p>body</p>
      </Dialog>,
    )
    await vi.waitFor(() => expect(panel()).not.toBeNull())
    return panel() as HTMLElement
  }

  it('uses the sheet presentation below 30rem, with the resolved attribute', async () => {
    const node = await sheet()
    expect(node.dataset['presentation']).toBe('sheet')
    expect(node.dataset['motionPattern']).toBe('sheet')

    // Bottom-attached, full-width and as tall as its content, checked after the
    // slide-in.
    await vi.waitFor(() => {
      const box = node.getBoundingClientRect()
      expect(box.bottom).toBeCloseTo(window.innerHeight, 0)
      expect(box.width).toBeCloseTo(window.innerWidth, 0)
      expect(box.height).toBeLessThan(window.innerHeight)
    })

    const style = getComputedStyle(node)
    expect(style.borderTopLeftRadius).toBe(tokenLength('--pm-radius-lg'))
    expect(style.borderBottomLeftRadius).toBe('0px')
    expect(style.borderTopWidth).toBe('1px')
    expect(style.borderBottomWidth).toBe('0px')
    expect(Number.parseFloat(style.maxBlockSize)).toBeCloseTo(window.innerHeight * 0.66, 0)

    // The sheet presentation's safe-area padding, added to this member's
    // `space-6` padding.
    expect(style.paddingBlockEnd).toBe(tokenLength('--pm-space-6'))
  })

  it('keeps Dialog’s contract in the sheet: modal, titled, dismissible, focused', async () => {
    const node = await sheet()
    expect(node.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Snooze until' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    await vi.waitFor(() => expect(node.contains(document.activeElement)).toBe(true))

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panels()).toHaveLength(0))
  })

  it('dismisses from the scrim, which is still the dismiss surface', async () => {
    // A real click, not the dispatched press the card tests need. A sheet is
    // bottom-attached, so the scrim's centre, where the pointer harness aims,
    // is clear of the panel. The real gesture also waits for Radix's deferred
    // outside-press listener, which a dispatch right after `defaultOpen` can
    // run before.
    await sheet()
    await userEvent.click(scrim() as HTMLElement)
    await vi.waitFor(() => expect(panels()).toHaveLength(0))
  })

  it('stays a card above 30rem, without the attribute and with its size', async () => {
    render(
      <Dialog
        defaultOpen
        presentation="sheet"
        title="Snooze until"
        trigger={<Button label="Open" />}
      >
        <p>body</p>
      </Dialog>,
    )
    const node = panel() as HTMLElement
    expect(node.hasAttribute('data-presentation')).toBe(false)
    expect(node.getBoundingClientRect().width).toBeLessThan(window.innerWidth)
    expect(getComputedStyle(node).borderBottomLeftRadius).toBe(tokenLength('--pm-radius-lg'))
  })
})
