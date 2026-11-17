import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { Button } from './Button'
import { ProviderButton, type ProviderButtonProps } from './ProviderButton'

/**
 * These tests need a real browser. They check that the styling matches Button exactly
 * (a provider button next to an ordinary one must look identical), that the mark keeps
 * the provider's colours where the theme would recolour a glyph, and that a sign-in
 * cannot be started twice.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ProviderButtonProps>(true)
  })

  it('offers no appearance to choose', () => {
    // @ts-expect-error — `variant` is not a prop. The appearance is fixed at outline/neutral.
    const solid = <ProviderButton provider="google" label="Continue with Google" variant="solid" />
    // @ts-expect-error — the set of providers is fixed.
    const unknown = <ProviderButton provider="gitlab" label="Continue with GitLab" />
    expect([solid, unknown]).toHaveLength(2)
  })
})

describe('ProviderButton', () => {
  it('is named by the app’s label, and the mark adds nothing to the name', () => {
    render(<ProviderButton provider="google" label="Continue with Google" />)
    const button = screen.getByRole('button', { name: 'Continue with Google' })
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(button.dataset['provider']).toBe('google')
  })

  it('matches Button outline/neutral exactly', () => {
    render(
      <>
        <ProviderButton provider="google" label="Continue" />
        <Button variant="outline" tone="neutral" icon="key" label="Continue" />
      </>,
    )
    const [provider, plain] = screen.getAllByRole('button').map((node) => getComputedStyle(node))
    for (const property of [
      'blockSize',
      'paddingInlineStart',
      'borderTopColor',
      'borderTopWidth',
      'borderTopLeftRadius',
      'backgroundColor',
      'color',
      'fontSize',
      'fontWeight',
      'columnGap',
    ] as const) {
      expect(provider?.[property], property).toBe(plain?.[property])
    }
  })

  it('keeps the provider’s colours, where a glyph would take the text colour', () => {
    render(<ProviderButton provider="google" label="Continue with Google" />)
    const fills = [...screen.getByRole('button').querySelectorAll('path')].map(
      (path) => getComputedStyle(path).fill,
    )
    // Four paths, four different fills, none of them the button's own `color`.
    expect(new Set(fills).size).toBe(4)
    expect(fills).not.toContain(getComputedStyle(screen.getByRole('button')).color)
  })

  it('lets GitHub’s monochrome mark follow the text colour, by GitHub’s own terms', () => {
    render(<ProviderButton provider="github" label="Continue with GitHub" />)
    const button = screen.getByRole('button')
    expect(getComputedStyle(button.querySelector('path')!).fill).toBe(
      getComputedStyle(button).color,
    )
  })

  it('starts the sign-in only once', async () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <ProviderButton provider="google" label="Continue with Google" onClick={onClick} />,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <ProviderButton provider="google" label="Continue with Google" loading onClick={onClick} />,
    )
    const busy = screen.getByRole('button', { name: 'Continue with Google' })
    expect(busy.getAttribute('aria-busy')).toBe('true')
    // Loading keeps the name and focusability, and ignores the press.
    busy.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('stretches to the width of a column, as an auth card’s actions do', () => {
    const host = document.createElement('div')
    host.style.cssText = 'display: flex; flex-direction: column; width: 320px'
    document.body.append(host)
    render(<ProviderButton provider="microsoft" label="Continue with Microsoft" />, {
      container: host,
    })
    expect(screen.getByRole('button').getBoundingClientRect().width).toBeCloseTo(320, 0)
    host.remove()
  })

  it('desaturates the mark when disabled, so it does not look active', () => {
    render(<ProviderButton provider="google" label="Continue with Google" disabled />)
    const button = screen.getByRole('button')
    expect(button).toHaveProperty('disabled', true)
    const mark = button.querySelector('svg')!.parentElement!
    expect(getComputedStyle(mark).filter).toContain('grayscale')
  })
})
