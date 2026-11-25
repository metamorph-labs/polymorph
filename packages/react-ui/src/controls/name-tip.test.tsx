import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { nameTipLaw } from '@polymorph/conformance/name-tip'
import { installTestTheme } from '@polymorph/engine/testing'
import { TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS } from '@polymorph/react'
import { reactAdapter } from '../conformance/react'
import { Button } from './Button'

/**
 * The name tip (`design/components/button.md`) in the React shell: the law
 * every web shell runs, and a prop the app changes after the mount, which the
 * law's adapter cannot change.
 */

nameTipLaw({ shell: 'React', adapter: reactAdapter })

beforeAll(installTestTheme)

const tip = () => document.querySelector<HTMLElement>('body > [popover]')

afterEach(async () => {
  vi.useRealTimers()
  const corner = document.createElement('div')
  corner.style.cssText = 'position: fixed; left: 0; bottom: 0; width: 8px; height: 8px'
  document.body.append(corner)
  await userEvent.hover(corner, { force: true })
  corner.remove()
})

describe('an icon-only Button the app changes', () => {
  it('closes its tip when it is disabled, and shows none while it is', async () => {
    const { rerender } = render(<Button iconOnly icon="archive" label="Archive" />)
    const button = screen.getByRole('button', { name: 'Archive' })
    await new Promise((resolve) => setTimeout(resolve, TOOLTIP_SKIP_DELAY_MS))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await userEvent.hover(button)
    await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS)
    expect(tip()?.textContent).toBe('Archive')
    rerender(<Button iconOnly icon="archive" label="Archive" disabled />)
    expect(tip()).toBeNull()
  })

  it('closes its tip when it is no longer icon-only', async () => {
    const { rerender } = render(<Button iconOnly icon="archive" label="Archive" />)
    const button = screen.getByRole('button', { name: 'Archive' })
    await new Promise((resolve) => setTimeout(resolve, TOOLTIP_SKIP_DELAY_MS))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await userEvent.hover(button)
    await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS)
    expect(tip()).not.toBeNull()
    rerender(<Button icon="archive" label="Archive" />)
    expect(tip()).toBeNull()
  })
})
