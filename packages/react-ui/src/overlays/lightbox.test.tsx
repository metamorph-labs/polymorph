import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { lightboxLaw, type LightboxLawProps } from '@polymorph/conformance/lightbox'
import { serverPassed } from '@polymorph/conformance/server-passed'
import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Button } from '../controls/Button'
import { Lightbox, type LightboxProps } from './Lightbox'

/**
 * How a Lightbox moves, where focus is at its ends, how it fits a picture and
 * where focus goes when it closes is the law every shell runs
 * (`@polymorph/conformance/lightbox`). The tests after it are the React
 * member's own: its trigger, which the law does not mount, and its messages.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<LightboxProps>(true)
  })
})

lightboxLaw({
  shell: 'React',
  async mount({ props, defaultIndex, onIndexChange, onOpenChange }) {
    let update: (next: Partial<LightboxLawProps>) => void = () => {}
    function Application() {
      const [held, setHeld] = useState<LightboxLawProps>(props)
      update = (next) => setHeld((current) => ({ ...current, ...next }))
      return (
        <Lightbox
          defaultOpen
          label="Photographs"
          images={held.images}
          index={held.index}
          defaultIndex={defaultIndex}
          onIndexChange={onIndexChange}
          onOpenChange={onOpenChange}
        />
      )
    }
    render(<Application />)
    return {
      set(next) {
        update(next)
      },
    }
  },
})

const svg = (width: number, height: number) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#2f4a6b"/></svg>`,
  )

const IMAGES = [
  { src: svg(1200, 800), alt: 'A harbour at dusk' },
  { src: svg(800, 1000), alt: 'A pine ridge in the morning' },
]

const panel = () => document.querySelector<HTMLElement>('[data-member="lightbox"]')

describe('Lightbox — its trigger', () => {
  it('opens from its trigger, named by its label, and returns focus to the trigger', async () => {
    render(
      <Lightbox label="Attachment preview" images={IMAGES} trigger={<Button label="View" />} />,
    )
    expect(panel()).toBeNull()

    const trigger = screen.getByRole('button', { name: 'View' })
    // Opened from the keyboard: WebKit leaves a pressed button unfocused, so a
    // press would record the page as the place to return to.
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Attachment preview' })).toBeTruthy(),
    )
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' })),
    )

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('opens from a trigger a server component passed', async () => {
    render(
      <Lightbox
        label="Attachment preview"
        images={IMAGES}
        trigger={serverPassed(<Button label="View" />)}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    await vi.waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Attachment preview' })).toBeTruthy(),
    )
  })

  it('opens nothing for an empty list', async () => {
    const onOpenChange = vi.fn()
    render(
      <Lightbox
        label="Attachment preview"
        images={[]}
        onOpenChange={onOpenChange}
        trigger={<Button label="View" />}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(panel()).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe('Lightbox — its words', () => {
  it('takes every word it writes from its messages', async () => {
    render(
      <Lightbox
        defaultOpen
        label="Vorschau"
        images={IMAGES}
        messages={{
          close: 'Schließen',
          previous: 'Vorheriges Bild',
          next: 'Nächstes Bild',
          position: (position, count) => `Bild ${position} von ${count}`,
        }}
      />,
    )
    await vi.waitFor(() => expect(panel()).not.toBeNull())
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Vorheriges Bild' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nächstes Bild' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Bild 1 von 2')
  })
})

/**
 * An agent moves and closes a lightbox through the bridge, as the spec's `agent` fence declares
 * (`design/components/lightbox.md`, Agent): through the member's own position, so
 * `onIndexChange` reports it whether or not the caller controls the position, and never past an
 * end or while closed.
 */
describe('Lightbox — an agent', () => {
  it('moves a controlled lightbox through onIndexChange, and is refused at an end', async () => {
    const bridge = createAgentBridge()
    try {
      const reported = vi.fn()
      function Held() {
        const [index, setIndex] = useState(0)
        return (
          <Lightbox
            defaultOpen
            label="Photographs"
            images={IMAGES}
            index={index}
            onIndexChange={(next) => {
              reported(next)
              setIndex(next)
            }}
          />
        )
      }
      render(<Held />)
      await vi.waitFor(() => expect(panel()).not.toBeNull())
      const { members } = bridge.snapshot()
      // The previous, next and close Buttons are the lightbox's own, so none is listed.
      expect(members.filter((each) => each.member === 'Button')).toEqual([])
      const member = members.find((each) => each.member === 'Lightbox')
      expect(member).toMatchObject({
        name: 'Photographs',
        state: {
          open: true,
          index: 0,
          images: [{ alt: 'A harbour at dusk' }, { alt: 'A pine ridge in the morning' }],
        },
      })

      const back = await bridge.act([{ id: member?.id, action: 'previous' }])
      expect(back.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: 'previous failed: This is the first picture.' },
      })
      const moved = await bridge.act([{ id: member?.id, action: 'next' }])
      expect(moved.results[0]).toMatchObject({ ok: true, changed: { index: { from: 0, to: 1 } } })
      expect(reported).toHaveBeenLastCalledWith(1)
      expect(screen.getByRole('status').textContent).toBe('2 of 2')
      const past = await bridge.act([{ id: member?.id, action: 'next' }])
      expect(past.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: 'next failed: This is the last picture.' },
      })
      expect(reported).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('lists no closed lightbox, and moves nothing', async () => {
    const bridge = createAgentBridge()
    try {
      const onIndexChange = vi.fn()
      render(
        <Lightbox
          label="Photographs"
          images={IMAGES}
          onIndexChange={onIndexChange}
          trigger={<Button label="View" />}
        />,
      )
      // A closed lightbox has no panel, so the bridge lists nothing for it.
      expect(bridge.snapshot().members.some((each) => each.member === 'Lightbox')).toBe(false)
      const { results } = await bridge.act([{ target: { member: 'Lightbox' }, action: 'next' }])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'unknown-member' } })
      expect(onIndexChange).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})
