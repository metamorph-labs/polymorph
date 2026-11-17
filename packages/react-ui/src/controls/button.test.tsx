import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import {
  appendThemeCSS,
  composeTheme,
  emitThemeCSS,
  exampleQuietSystem,
  exampleVioletPalette,
  resolveTheme,
  type SystemOverrides,
} from '@polymorph/engine'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Button, type ButtonProps } from './Button'
import { tokenColor, tokenLength } from './token-probe'

/**
 * Button tests run in a real browser. The recipes are about *resolved* values, and `:hover`,
 * `:active` and `:focus-visible` can only be reached with a real pointer and keyboard.
 */

beforeAll(installTestTheme)

/**
 * Uses RTL's own container on purpose. It is attached to `document.body`, which `:focus-visible`
 * and `getComputedStyle` both need, and `cleanup()` removes it afterwards, so no test has to clear
 * the DOM for the next one.
 */
function mount(node: React.ReactElement): HTMLButtonElement {
  return render(node).container.querySelector('button') as HTMLButtonElement
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ButtonProps>(true)
  })

  it('makes an unlawful variant × tone cell a type error', () => {
    // `pnpm typecheck` checks this law. The catalogue has no neutral interactive fill, so
    // `solid`/`neutral` must not compile. If it ever compiles, the directive is unused and *this*
    // line fails.
    // @ts-expect-error — `neutral` is lawful for outline and ghost only.
    const unlawful = <Button variant="solid" tone="neutral" label="No such button" />
    expect(unlawful).toBeTruthy()
  })
})

describe('recipes resolve to role tokens', () => {
  it('paints solid/accent from the accent role, not from a colour', () => {
    const button = mount(<Button label="Save" />)
    const style = getComputedStyle(button)
    expect(style.backgroundColor).toBe(tokenColor('--pm-accent-bg'))
    expect(style.color).toBe(tokenColor('--pm-accent-contrast'))

    // The gradient layer in both kinds of system. A partnered theme paints the token as the image.
    // A partnerless theme resolves it to a plain colour, which is not an image, so the layer
    // computes to `none` and only the solid fill and its state colours apply.
    const token = getComputedStyle(document.documentElement)
      .getPropertyValue('--pm-accent-gradient')
      .trim()
    if (token.startsWith('linear-gradient')) {
      expect(style.backgroundImage).toContain('linear-gradient')
    } else {
      expect(style.backgroundImage).toBe('none')
    }
  })

  it('paints solid/danger from the danger role', () => {
    const style = getComputedStyle(mount(<Button tone="danger" label="Delete" />))
    expect(style.backgroundColor).toBe(tokenColor('--pm-danger-solid'))
  })

  it('gives soft its subtle wash and its own text role', () => {
    const style = getComputedStyle(mount(<Button variant="soft" label="Save" />))
    expect(style.backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
    expect(style.color).toBe(tokenColor('--pm-accent-text'))
  })

  it('leaves outline and ghost unfilled', () => {
    for (const variant of ['outline', 'ghost'] as const) {
      const style = getComputedStyle(mount(<Button variant={variant} tone="neutral" label="Go" />))
      expect(style.backgroundColor, variant).toBe('rgba(0, 0, 0, 0)')
    }
  })

  it('collapses every disabled fill to the same inert recipe', () => {
    for (const variant of ['solid', 'soft'] as const) {
      const style = getComputedStyle(mount(<Button variant={variant} disabled label="Save" />))
      expect(style.backgroundColor, variant).toBe(tokenColor('--pm-bg-subtle'))
      expect(style.color, variant).toBe(tokenColor('--pm-text-disabled'))
      expect(style.cursor, variant).toBe('not-allowed')
    }
  })
})

describe('sizes', () => {
  it('takes its height from the control token at every size', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const button = mount(<Button size={size} label="Save" />)
      expect(getComputedStyle(button).height, size).toBe(tokenLength(`--pm-control-height-${size}`))
      expect(button.dataset['size']).toBe(size)
    }
  })

  it('makes an icon-only button square, at every size', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const style = getComputedStyle(
        mount(<Button size={size} iconOnly icon="edit" label="Edit" />),
      )
      expect(style.width, size).toBe(style.height)
    }
  })
})

describe('content', () => {
  it('names an icon-only button from its label, and shows no text', () => {
    const button = mount(<Button iconOnly icon="edit" label="Edit" />)
    expect(button.getAttribute('aria-label')).toBe('Edit')
    expect(button.textContent).toBe('')
    expect(button.dataset['iconOnly']).toBe('')
  })

  it('keeps the visible label as the accessible name when it has one', () => {
    const button = mount(<Button icon="add" label="New ticket" />)
    expect(button.getAttribute('aria-label')).toBeNull()
    expect(button.textContent).toBe('New ticket')
  })

  it('can add contextual naming and supporting-copy associations', () => {
    const button = mount(
      <Button
        label="Sign out"
        aria-label="Sign out pat@example.com"
        aria-describedby="account-status"
      />,
    )
    expect(button.getAttribute('aria-label')).toBe('Sign out pat@example.com')
    expect(button.getAttribute('aria-describedby')).toBe('account-status')
    expect(button.textContent).toBe('Sign out')
  })

  it('ellipsises a label too long for the box it was given, and keeps the icon', () => {
    const host = document.createElement('div')
    host.style.width = '120px'
    document.body.append(host)
    render(<Button icon="add" label="A label far longer than the box its caller gave it" />, {
      container: host,
    })

    const button = host.querySelector('button') as HTMLButtonElement
    const label = button.querySelector('span:last-of-type') as HTMLElement
    const glyph = button.querySelector('svg') as SVGElement

    expect(button.getBoundingClientRect().width).toBeLessThanOrEqual(120)
    expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
    expect(getComputedStyle(label).textOverflow).toBe('ellipsis')
    // The text shrinks. The icon is `flex: none` and keeps its token size.
    expect(glyph.getBoundingClientRect().width).toBe(
      Number.parseFloat(tokenLength('--pm-icon-size-md')),
    )
    host.remove()
  })

  it('renders leading and trailing glyphs as decoration', () => {
    const button = mount(<Button icon="add" trailingIcon="next" label="Continue" />)
    const glyphs = [...button.querySelectorAll('svg')]
    expect(glyphs).toHaveLength(2)
    for (const glyph of glyphs) expect(glyph.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('loading', () => {
  it('announces itself busy and keeps its accessible name', () => {
    const button = mount(<Button loading icon="add" label="Saving" />)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.dataset['state']).toBe('loading')
    expect(button.textContent).toBe('Saving')
  })

  it('replaces the leading icon rather than adding to it', () => {
    const button = mount(<Button loading icon="add" label="Saving" />)
    const glyphs = [...button.querySelectorAll('svg')]
    expect(glyphs).toHaveLength(1)
    expect(glyphs[0]?.getAttribute('data-icon')).toBe('loading')
  })

  it('does not fire while loading, from a pointer or a keyboard', () => {
    const onClick = vi.fn()
    const button = mount(<Button loading label="Saving" onClick={onClick} />)
    expect(getComputedStyle(button).pointerEvents).toBe('none')
    // The keyboard path ignores `pointer-events`, which is why the guard is in
    // the component as well as in the stylesheet.
    button.click()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('keeps its rest colours, because loading is not a disabled state', () => {
    const loading = getComputedStyle(mount(<Button loading label="Saving" />))
    expect(loading.backgroundColor).toBe(tokenColor('--pm-accent-bg'))
  })
})

describe('the toggle', () => {
  it('renders neither attribute when it is not a toggle', () => {
    const button = mount(<Button label="Save" />)
    expect(button.hasAttribute('aria-pressed')).toBe(false)
    expect(button.hasAttribute('data-state')).toBe(false)
  })

  it('mirrors pressed to aria-pressed and data-state', () => {
    const on = mount(<Button pressed label="Watching" />)
    expect(on.getAttribute('aria-pressed')).toBe('true')
    expect(on.dataset['state']).toBe('on')

    const off = mount(<Button pressed={false} label="Watching" />)
    expect(off.getAttribute('aria-pressed')).toBe('false')
    expect(off.dataset['state']).toBe('off')
  })

  it('shows the variant’s own active cell while on', () => {
    // No new cells. The on state reuses the active rows.
    const soft = mount(<Button variant="soft" pressed label="Watching" />)
    expect(getComputedStyle(soft).backgroundColor).toBe(tokenColor('--pm-accent-subtle-active'))

    const ghost = mount(<Button variant="ghost" tone="neutral" pressed label="Watching" />)
    expect(getComputedStyle(ghost).backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
  })

  it('shows the rest row when off, like any other command', () => {
    const off = mount(<Button variant="soft" pressed={false} label="Watching" />)
    expect(getComputedStyle(off).backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
  })

  it('lets loading take precedence in data-state while aria-pressed keeps the toggle state', () => {
    const busy = mount(<Button pressed loading label="Watching" />)
    expect(busy.dataset['state']).toBe('loading')
    expect(busy.getAttribute('aria-pressed')).toBe('true')
  })

  it('yields to disabled, so an unavailable toggle does not look pressed', () => {
    const button = mount(<Button variant="soft" pressed disabled label="Watching" />)
    expect(getComputedStyle(button).backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
    // Assistive technology still gets the pressed state. Only the styling changes.
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('the disclosure trigger', () => {
  it('renders neither attribute when it discloses nothing', () => {
    const button = mount(<Button label="Save" />)
    expect(button.hasAttribute('aria-expanded')).toBe(false)
    expect(button.hasAttribute('aria-controls')).toBe(false)
  })

  it('mirrors expanded to aria-expanded and names its region', () => {
    const open = mount(<Button expanded aria-controls="region" label="Details" />)
    expect(open.getAttribute('aria-expanded')).toBe('true')
    expect(open.getAttribute('aria-controls')).toBe('region')

    const closed = mount(<Button expanded={false} label="Details" />)
    expect(closed.getAttribute('aria-expanded')).toBe('false')
    expect(closed.hasAttribute('aria-controls')).toBe(false)
  })

  it('draws no cell of its own, so it is not read as a toggle', () => {
    const open = mount(<Button variant="soft" expanded label="Details" />)
    expect(open.hasAttribute('data-state')).toBe(false)
    expect(open.hasAttribute('aria-pressed')).toBe(false)
    expect(getComputedStyle(open).backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
  })
})

describe('the count', () => {
  const bell = (
    value: number,
    extra: Pick<ButtonProps, 'onClick' | 'disabled' | 'aria-label' | 'size'> = {},
  ) => (
    <Button
      variant="ghost"
      tone="neutral"
      iconOnly
      icon="notification"
      label="Notifications"
      count={{ value, label: `Notifications, ${value} unread` }}
      {...extra}
    />
  )

  it('names the button in the app’s words, with the whole number', () => {
    const button = mount(bell(128))
    expect(button.getAttribute('aria-label')).toBe('Notifications, 128 unread')
    // The eye sees the cap, and the Badge is hidden, so the count is heard once.
    const badge = button.querySelector('[data-member="badge"]') as HTMLElement
    expect(badge.textContent).toBe('99+')
    expect(badge.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('draws nothing at zero, and the label names the button', () => {
    const button = mount(bell(0))
    expect(button.getAttribute('aria-label')).toBe('Notifications')
    expect(button.querySelector('[data-member="badge"]')).toBeNull()
  })

  it('yields to an aria-label the caller passes', () => {
    const button = mount(bell(3, { 'aria-label': 'Open the notification panel' }))
    expect(button.getAttribute('aria-label')).toBe('Open the notification panel')
  })

  /** The button's box, its glyph's and its count's, as the browser drew them. */
  const boxes = (button: HTMLButtonElement) => ({
    box: button.getBoundingClientRect(),
    glyph: (button.querySelector('svg') as SVGElement).getBoundingClientRect(),
    mark: (button.querySelector('[data-member="badge"]') as HTMLElement).getBoundingClientRect(),
  })

  it('starts at the button’s inline centre, so one figure covers the glyph’s top end corner', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { box, glyph, mark } = boxes(mount(bell(3, { size })))
      expect(mark.left - box.left, size).toBeCloseTo(box.width / 2, 0)
      // At the top, inside the button's hairline border.
      expect(mark.top - box.top, size).toBeGreaterThanOrEqual(0)
      expect(mark.top - box.top, size).toBeLessThanOrEqual(1)
      expect(mark.bottom, size).toBeLessThanOrEqual(box.bottom)
      // One figure stays inside the box and over the glyph's top end corner.
      expect(mark.right, size).toBeLessThanOrEqual(box.right + 1)
      expect(mark.left, size).toBeLessThan(glyph.right)
      expect(mark.bottom, size).toBeGreaterThan(glyph.top)
      // The square stays square: the count does not widen an icon-only button.
      expect(box.width, size).toBe(parseFloat(tokenLength(`--pm-control-height-${size}`)))
    }
  })

  it('grows a wide count toward the end edge, past it, and never back across the glyph', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const one = boxes(mount(bell(3, { size })))
      const capped = boxes(mount(bell(128, { size })))
      expect(capped.mark.left - capped.box.left, size).toBeCloseTo(one.mark.left - one.box.left, 0)
      expect(capped.mark.right, size).toBeGreaterThan(capped.box.right)
      // It reaches less than half the button past the edge, which the topbar's padding holds.
      expect(capped.mark.right - capped.box.right, size).toBeLessThan(capped.box.width / 2)
      expect(capped.mark.top - capped.box.top, size).toBeLessThanOrEqual(1)
    }
  })

  it('grows toward the inline end in a right-to-left document, which is the left', () => {
    const host = document.createElement('div')
    host.dir = 'rtl'
    document.body.append(host)
    const button = render(bell(128), { container: host }).container.querySelector(
      'button',
    ) as HTMLButtonElement
    const { box, mark } = boxes(button)
    expect(box.right - mark.right).toBeCloseTo(box.width / 2, 0)
    expect(mark.left).toBeLessThan(box.left)
    expect(mark.top - box.top).toBeLessThanOrEqual(1)
    host.remove()
  })

  it('follows a visible label in the flow', () => {
    const button = mount(
      <Button
        variant="outline"
        tone="neutral"
        label="Inbox"
        count={{ value: 12, label: 'Inbox, 12 unread' }}
      />,
    )
    const label = button.querySelector('span:not([aria-hidden])') as HTMLElement
    const badge = button.querySelector('[data-member="badge"]') as HTMLElement
    expect(badge.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      label.getBoundingClientRect().right,
    )
    expect(button.getAttribute('aria-label')).toBe('Inbox, 12 unread')
  })

  it('takes no press of its own', () => {
    const onClick = vi.fn()
    const button = mount(bell(3, { onClick }))
    const badge = button.querySelector('[data-member="badge"]') as HTMLElement
    expect(getComputedStyle(badge.parentElement as HTMLElement).pointerEvents).toBe('none')
    button.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('fades with a disabled button', () => {
    const button = mount(bell(3, { disabled: true }))
    const count = (button.querySelector('[data-member="badge"]') as HTMLElement)
      .parentElement as HTMLElement
    expect(getComputedStyle(count).filter).toBe('grayscale(1)')
  })
})

describe('disabled', () => {
  it('uses the native attribute, so an unavailable command is not a tab stop', () => {
    const button = mount(<Button disabled label="Save" />)
    expect(button.disabled).toBe(true)
    expect(button.dataset['disabled']).toBe('')
    expect(button.getAttribute('aria-disabled')).toBeNull()
  })

  it('does not fire', () => {
    const onClick = vi.fn()
    mount(<Button disabled label="Save" onClick={onClick} />).click()
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('behaviour', () => {
  it('fires on click', () => {
    const onClick = vi.fn()
    mount(<Button label="Save" onClick={onClick} />).click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('defaults to type="button", so it cannot submit a form by accident', () => {
    expect(mount(<Button label="Save" />).type).toBe('button')
    expect(mount(<Button type="submit" label="Save" />).type).toBe('submit')
  })

  it('draws the shared focus ring on keyboard focus', () => {
    const button = mount(<Button label="Save" />)
    expect(getComputedStyle(button).outlineStyle).toBe('none')

    button.focus({ focusVisible: true } as FocusOptions)
    const style = getComputedStyle(button)
    expect(style.outlineStyle).toBe('solid')
    expect(style.outlineWidth).toBe(tokenLength('--pm-focus-width'))
  })
})

describe('an agent', () => {
  it('reads expanded as aria-expanded says it, and as null on a button that discloses nothing', () => {
    const bridge = createAgentBridge()
    try {
      render(
        <>
          <Button label="Open details" expanded />
          <Button label="Closed details" expanded={false} />
          <Button label="Save" />
        </>,
      )
      const read = (name: string) =>
        bridge.snapshot().members.find((member) => member.name === name)?.state
      expect(read('Open details')).toMatchObject({ pressed: null, expanded: true })
      expect(read('Closed details')).toMatchObject({ pressed: null, expanded: false })
      expect(read('Save')).toEqual({
        disabled: false,
        loading: false,
        pressed: null,
        expanded: null,
      })
    } finally {
      bridge.dispose()
    }
  })

  it('reads pressed as aria-pressed says it, and as null on a button that is not a toggle', () => {
    const bridge = createAgentBridge()
    try {
      render(
        <>
          <Button label="Watching" pressed />
          <Button label="Muted" pressed={false} />
          <Button label="Save" />
        </>,
      )
      const read = (name: string) =>
        bridge.snapshot().members.find((member) => member.name === name)?.state
      expect(read('Watching')).toMatchObject({ pressed: true, expanded: null })
      expect(read('Muted')).toMatchObject({ pressed: false, expanded: null })
      expect(read('Save')).toMatchObject({ pressed: null })
    } finally {
      bridge.dispose()
    }
  })

  it('turns a toggle by pressing it, so the caller’s onClick sets pressed', async () => {
    function Toggle() {
      const [on, setOn] = useState(false)
      return <Button label="Watching" pressed={on} onClick={() => setOn((was) => !was)} />
    }
    const bridge = createAgentBridge()
    try {
      render(<Toggle />)
      const id = bridge.snapshot().members[0]?.id ?? ''
      const { results } = await bridge.act([{ id, action: 'press' }])
      expect(results[0]).toMatchObject({
        ok: true,
        changed: { pressed: { from: false, to: true } },
      })
    } finally {
      bridge.dispose()
    }
  })
})

/**
 * The system's unfilled hover choice, read through a nested pairing whose system makes it. Motion
 * is off in the pairing, so a computed colour is the end of its transition, not a frame of it.
 */
describe('the unfilled hover choice', () => {
  function pairing(name: string, overrides: SystemOverrides): HTMLElement {
    const theme = resolveTheme(
      composeTheme({ ...exampleQuietSystem, name, overrides }, exampleVioletPalette),
    )
    appendThemeCSS(emitThemeCSS(theme), theme.name)
    const host = document.createElement('div')
    host.setAttribute('data-system', theme.system)
    host.setAttribute('data-palette', theme.palette)
    host.setAttribute('data-mode', 'light')
    host.setAttribute('data-motion', 'none')
    document.body.append(host)
    return host
  }

  /** A role's computed colour inside the host's pairing. */
  function role(host: HTMLElement, token: string): string {
    const probe = document.createElement('div')
    probe.style.backgroundColor = `var(${token})`
    host.append(probe)
    const value = getComputedStyle(probe).backgroundColor
    probe.remove()
    return value
  }

  function mountIn(host: HTMLElement, node: React.ReactElement): HTMLButtonElement {
    const container = host.appendChild(document.createElement('div'))
    return render(node, { container }).container.querySelector('button') as HTMLButtonElement
  }

  it('washes outline and ghost under the pointer by default', async () => {
    const host = pairing('example-hover-wash', {})
    const ghost = mountIn(host, <Button variant="ghost" tone="accent" label="Edit" />)
    await userEvent.hover(ghost)
    expect(getComputedStyle(ghost).backgroundColor).toBe(role(host, '--pm-accent-subtle'))
    host.remove()
  })

  it('leaves them unwashed where the system chooses none, and keeps the other hover changes', async () => {
    const host = pairing('example-hover-none', { hover: { unfilled: 'none' } })
    for (const variant of ['outline', 'ghost'] as const) {
      for (const tone of ['neutral', 'accent', 'danger'] as const) {
        const button = mountIn(host, <Button variant={variant} tone={tone} label="Edit" />)
        await userEvent.hover(button)
        expect(getComputedStyle(button).backgroundColor, `${variant}/${tone}`).toBe(
          'rgba(0, 0, 0, 0)',
        )
      }
    }
    // The hover itself still lands: ghost/neutral's text and outline/neutral's border change.
    const ghost = mountIn(host, <Button variant="ghost" tone="neutral" label="Edit" />)
    await userEvent.hover(ghost)
    expect(getComputedStyle(ghost).color).toBe(role(host, '--pm-text-primary'))
    const outline = mountIn(host, <Button variant="outline" tone="neutral" label="Edit" />)
    await userEvent.hover(outline)
    expect(getComputedStyle(outline).borderTopColor).toBe(role(host, '--pm-border-strong'))
    host.remove()
  })

  it('keeps a toggle’s on state washed, hovered or not', async () => {
    const host = pairing('example-hover-none-on', { hover: { unfilled: 'none' } })
    const on = mountIn(host, <Button variant="ghost" tone="accent" pressed label="Watching" />)
    await userEvent.hover(on)
    expect(getComputedStyle(on).backgroundColor).toBe(role(host, '--pm-accent-subtle-hover'))
    host.remove()
  })

  it('leaves the filled variants their own hover', async () => {
    const host = pairing('example-hover-none-soft', { hover: { unfilled: 'none' } })
    const soft = mountIn(host, <Button variant="soft" label="Save" />)
    await userEvent.hover(soft)
    expect(getComputedStyle(soft).backgroundColor).toBe(role(host, '--pm-accent-subtle-hover'))
    host.remove()
  })
})
