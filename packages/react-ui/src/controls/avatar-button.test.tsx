import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { Menu } from '../overlays/Menu'
import { Popover } from '../overlays/Popover'
import { Avatar } from '../structure/Avatar'
import { AvatarButton, type AvatarButtonProps } from './AvatarButton'
import { Button } from './Button'
import { ProviderButton } from './ProviderButton'
import { tokenColor, tokenLength } from './token-probe'

/**
 * These tests need a real browser. They check the box against Button's and Avatar's own
 * geometry (an AvatarButton lines up with the controls beside it and shows the Avatar an
 * `<Avatar>` of the same size would), that the name is the action's and never the person's, that
 * a command in flight cannot be run twice, and that a Menu and a Popover treat it as they treat
 * a Button: their ARIA lands on it and focus returns to it.
 */

beforeAll(installTestTheme)

// RTL unmounts between tests but does not put focus back, and a key pressed from a detached
// node goes nowhere.
beforeEach(() => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
})

const noop = () => {}

const account = () => screen.getByRole('button', { name: 'Account menu' })

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<AvatarButtonProps>(true)
  })

  it('offers no appearance, icon or type to choose', () => {
    // @ts-expect-error — `variant` is not a prop. The appearance is fixed at ghost/neutral.
    const solid = <AvatarButton name="Ada Lovelace" label="Account menu" variant="solid" />
    // @ts-expect-error — `icon` is not a prop. The face is the whole content.
    const glyph = <AvatarButton name="Ada Lovelace" label="Account menu" icon="user" />
    // @ts-expect-error — `type` is not a prop. A face is never a form's submit.
    const submit = <AvatarButton name="Ada Lovelace" label="Account menu" type="submit" />
    // @ts-expect-error — `label` is required: the name of the action is the caller's decision.
    const unnamed = <AvatarButton name="Ada Lovelace" />
    expect([solid, glyph, submit, unnamed]).toHaveLength(4)
  })
})

describe('AvatarButton', () => {
  it('is named by the action, and the face adds nothing to the name', () => {
    render(<AvatarButton name="Ada Lovelace" label="Account menu" />)
    const button = account()
    expect(button.getAttribute('type')).toBe('button')
    const face = button.querySelector('[data-member="avatar"]')
    expect(face?.getAttribute('aria-hidden')).toBe('true')
    expect(face?.textContent).toBe('AL')
    expect(screen.queryByRole('button', { name: /Ada/ })).toBeNull()
  })

  it('is Button’s icon-only square at sm and md, with the ghost cell and a round edge', () => {
    // The other presets render too. Each of their stylesheets carries Button's rules, so this
    // also holds the box against a copy of those rules that loads after this member's.
    render(
      <>
        <AvatarButton name="Ada Lovelace" label="Account menu (sm)" size="sm" />
        <AvatarButton name="Ada Lovelace" label="Account menu (md)" size="md" />
        <Button variant="ghost" tone="neutral" iconOnly icon="user" label="Plain (sm)" size="sm" />
        <Button variant="ghost" tone="neutral" iconOnly icon="user" label="Plain (md)" size="md" />
        <ProviderButton provider="github" label="Continue with GitHub" />
      </>,
    )
    for (const size of ['sm', 'md'] as const) {
      const avatar = screen.getByRole('button', { name: `Account menu (${size})` })
      const plain = screen.getByRole('button', { name: `Plain (${size})` })
      const box = avatar.getBoundingClientRect()
      expect(box.height, size).toBe(plain.getBoundingClientRect().height)
      expect(box.width, size).toBe(box.height)

      const [mine, buttons] = [getComputedStyle(avatar), getComputedStyle(plain)]
      for (const property of ['color', 'backgroundColor', 'borderTopWidth', 'cursor'] as const) {
        expect(mine[property], `${size} ${property}`).toBe(buttons[property])
      }
      // Round at every geometry: the pill radius, where Button reads the control radius.
      expect(mine.borderTopLeftRadius, size).toBe(tokenLength('--pm-radius-pill'))
    }
  })

  it('shows the Avatar an Avatar of the same size would, inside a space-1 gutter', () => {
    render(
      <>
        {(['sm', 'md', 'lg'] as const).map((size) => (
          <AvatarButton
            key={size}
            name="Ada Lovelace"
            label={`Account menu (${size})`}
            size={size}
          />
        ))}
        {(['sm', 'md', 'lg'] as const).map((size) => (
          <Avatar key={size} name="Ada Lovelace" label={`Ada (${size})`} size={size} />
        ))}
      </>,
    )
    const gutter = Number.parseFloat(tokenLength('--pm-space-1'))
    for (const size of ['sm', 'md', 'lg'] as const) {
      const button = screen.getByRole('button', { name: `Account menu (${size})` })
      const face = button.querySelector('[data-member="avatar"]')!.getBoundingClientRect()
      const alone = screen.getByRole('img', { name: `Ada (${size})` }).getBoundingClientRect()
      expect(face.width, size).toBe(alone.width)
      expect(face.height, size).toBe(alone.height)

      // The box is the face and its gutter, and never under the size's control height.
      const floor = Number.parseFloat(tokenLength(`--pm-control-height-${size}`))
      const box = button.getBoundingClientRect()
      expect(box.height, size).toBe(Math.max(floor, face.height + gutter * 2))
      expect(box.width, size).toBe(box.height)
      // The face sits in the middle of the box.
      expect(face.left - box.left, size).toBeCloseTo(box.right - face.right, 1)
      expect(face.top - box.top, size).toBeCloseTo(box.bottom - face.bottom, 1)
    }
    // At lg the face is larger than every control height, so the box follows the face.
    const large = screen.getByRole('button', { name: 'Account menu (lg)' })
    expect(large.getBoundingClientRect().height).toBeGreaterThan(
      Number.parseFloat(tokenLength('--pm-control-height-lg')),
    )
  })

  it('runs its command once, and not again while loading', async () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <AvatarButton name="Ada Lovelace" label="Account menu" onClick={onClick} />,
    )
    await userEvent.click(account())
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(<AvatarButton name="Ada Lovelace" label="Account menu" loading onClick={onClick} />)
    const busy = account()
    expect(busy.getAttribute('aria-busy')).toBe('true')
    // Loading keeps the name and the focus, and ignores the press.
    busy.focus()
    expect(document.activeElement).toBe(busy)
    busy.click()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('keeps its box while loading, with the spinner where the face was', () => {
    const { rerender } = render(<AvatarButton name="Ada Lovelace" label="Account menu" size="lg" />)
    const before = account().getBoundingClientRect()

    rerender(<AvatarButton name="Ada Lovelace" label="Account menu" size="lg" loading />)
    const button = account()
    const after = button.getBoundingClientRect()
    expect(after.width).toBe(before.width)
    expect(after.height).toBe(before.height)

    const face = button.querySelector('[data-member="avatar"]')!
    expect(getComputedStyle(face).visibility).toBe('hidden')
    const spinner = button.querySelector('svg')!.getBoundingClientRect()
    expect(spinner.left + spinner.width / 2).toBeCloseTo(after.left + after.width / 2, 0)
    expect(spinner.top + spinner.height / 2).toBeCloseTo(after.top + after.height / 2, 0)

    // The box that turns is the glyph's own size. One the size of the button would swing its
    // corners past the round cell and add scrollable overflow to what holds the button.
    const turning = [...button.children].find(
      (child) => getComputedStyle(child).position === 'absolute',
    ) as HTMLElement
    const glyph = getComputedStyle(button.querySelector('svg')!)
    expect(turning.offsetWidth).toBeLessThanOrEqual(Math.ceil(Number.parseFloat(glyph.width)))
    expect(turning.offsetHeight).toBeLessThanOrEqual(Math.ceil(Number.parseFloat(glyph.height)))
  })

  it('desaturates the face when disabled, so it does not look active', () => {
    render(<AvatarButton name="Ada Lovelace" label="Account menu" disabled />)
    const button = account()
    expect(button).toHaveProperty('disabled', true)
    const face = button.querySelector('[data-member="avatar"]')!.parentElement!
    expect(getComputedStyle(face).filter).toContain('grayscale')
    expect(getComputedStyle(face).opacity).toBe('0.5')
  })

  it('holds Button’s active cell while pressed on, and reports the toggle', () => {
    render(
      <>
        <AvatarButton name="Ada Lovelace" label="Show my tickets" pressed />
        <AvatarButton name="Grace Hopper" label="Show her tickets" pressed={false} />
      </>,
    )
    const on = screen.getByRole('button', { name: 'Show my tickets' })
    const off = screen.getByRole('button', { name: 'Show her tickets' })
    expect(on.getAttribute('aria-pressed')).toBe('true')
    expect(off.getAttribute('aria-pressed')).toBe('false')
    // The wash that shows in the gutter around the face.
    expect(getComputedStyle(on).backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
    expect(getComputedStyle(off).backgroundColor).not.toBe(tokenColor('--pm-bg-subtle'))
  })
})

describe('as an overlay’s trigger', () => {
  const items = [{ label: 'Sign out', onSelect: noop }]

  it('carries a Menu’s ARIA, as a Button does, and takes focus back when it closes', async () => {
    render(
      <>
        <Menu
          align="end"
          trigger={<AvatarButton name="Ada Lovelace" label="Account menu" />}
          items={items}
        />
        <Menu
          trigger={
            <Button variant="ghost" tone="neutral" iconOnly icon="overflow" label="Actions" />
          }
          items={items}
        />
      </>,
    )
    const trigger = account()
    const plain = screen.getByRole('button', { name: 'Actions' })
    await vi.waitFor(() => expect(trigger.getAttribute('aria-haspopup')).toBe('menu'))
    for (const attribute of ['aria-haspopup', 'aria-expanded'] as const) {
      expect(trigger.getAttribute(attribute), attribute).toBe(plain.getAttribute(attribute))
    }
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    // Never on the anchor around it: `aria-expanded` on an element with no role is a violation.
    expect(trigger.parentElement?.hasAttribute('aria-expanded')).toBe(false)

    trigger.focus()
    await userEvent.keyboard('{Enter}')
    const menu = await vi.waitFor(() => screen.getByRole('menu'))
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id)

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('carries a Popover’s ARIA, as a Button does, and takes focus back when it closes', async () => {
    render(
      <>
        <Popover
          trigger={<AvatarButton name="Ada Lovelace" label="Account menu" />}
          label="Account"
        >
          <p>Signed in as Ada Lovelace</p>
        </Popover>
        <Popover trigger={<Button label="Filters" />} label="Filter configuration">
          <p>Body</p>
        </Popover>
      </>,
    )
    const trigger = account()
    const plain = screen.getByRole('button', { name: 'Filters' })
    await vi.waitFor(() => expect(trigger.getAttribute('aria-haspopup')).toBe('dialog'))
    for (const attribute of ['aria-haspopup', 'aria-expanded'] as const) {
      expect(trigger.getAttribute(attribute), attribute).toBe(plain.getAttribute(attribute))
    }
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(trigger)
    await vi.waitFor(() => expect(screen.getByRole('dialog', { name: 'Account' })).toBeTruthy())
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
})
