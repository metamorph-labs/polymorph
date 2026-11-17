import { render } from '@testing-library/react'
import { useState } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { modeSwitchLaw, type ModeSwitchLawProps } from '@polymorph/conformance/mode-switch'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { assertGoverned, STORAGE_KEYS, teardownTheme } from '@polymorph/react'
import { ModeSwitch, type ModeSwitchProps } from './ModeSwitch'

/**
 * What a ModeSwitch shows and what a choice does is the law every shell runs
 * (`@polymorph/conformance/mode-switch`). The tests after it are React's own:
 * the identity on the track, and a server render that hydrates with no
 * mismatch.
 */

beforeAll(installTestTheme)

const root = document.documentElement

afterEach(() => {
  teardownTheme()
  root.removeAttribute('data-mode')
  localStorage.removeItem(STORAGE_KEYS.mode)
})

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ModeSwitchProps>(true)
  })
})

modeSwitchLaw({
  shell: 'React',
  mount({ label, props, messages, onChange }) {
    let change: (next: Partial<ModeSwitchLawProps>) => void = () => {}
    function Held() {
      const [held, setHeld] = useState(props)
      change = (next) => setHeld((was) => ({ ...was, ...next }))
      return (
        <ModeSwitch
          label={label}
          value={held.value}
          disabled={held.disabled}
          messages={messages}
          onChange={onChange}
        />
      )
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => change(next) })
  },
})

describe('ModeSwitch — the track', () => {
  it('carries the ModeSwitch’s identity, and the SegmentedControl’s recipe', () => {
    const { container } = render(<ModeSwitch label="Appearance" value="dark" />)
    const track = container.querySelector('[role="radiogroup"]') as HTMLElement
    expect(track.getAttribute('data-member')).toBe('mode-switch')
    expect(container.querySelector('[data-member="segmented-control"]')).toBeNull()
    // The segments hold the glyph each choice is drawn with, hidden from assistive technology.
    expect(track.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3)
  })
})

describe('ModeSwitch on a server and while React hydrates', () => {
  it('renders System on a server, where no preference is stored', () => {
    const markup = renderToString(<ModeSwitch label="Appearance" />)
    const host = document.createElement('div')
    host.innerHTML = markup
    const checked = host.querySelector('[aria-checked="true"]')
    expect(checked?.textContent).toBe('System')
  })

  it('hydrates the server’s markup with no mismatch, then shows the stored choice', async () => {
    const markup = renderToString(<ModeSwitch label="Appearance" />)
    // What the pre-paint script leaves for a reader who chose dark on an earlier visit.
    localStorage.setItem(STORAGE_KEYS.mode, 'dark')
    root.setAttribute('data-mode', 'dark')
    const host = document.createElement('div')
    host.innerHTML = markup
    document.body.append(host)
    const reported: string[] = []
    const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      reported.push(args.map(String).join(' '))
    })
    const hydrated = hydrateRoot(host, <ModeSwitch label="Appearance" />, {
      onRecoverableError: (failure) => reported.push(String(failure)),
    })
    try {
      const track = host.querySelector('[role="radiogroup"]')
      await vi.waitFor(() =>
        expect(host.querySelector('[aria-checked="true"]')?.textContent).toBe('Dark'),
      )
      // React kept the server's track and reported no mismatch.
      expect(host.querySelector('[role="radiogroup"]')).toBe(track)
      expect(reported).toEqual([])
    } finally {
      error.mockRestore()
      hydrated.unmount()
      host.remove()
    }
  })
})

describe('ModeSwitch for an agent', () => {
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

  it('lists one member in place of its SegmentedControl', () => {
    const bridge = createAgentBridge()
    try {
      render(<ModeSwitch label="Appearance" value="dark" />)
      expect(bridge.snapshot().members).toEqual([
        {
          id: expect.any(String),
          member: 'ModeSwitch',
          name: 'Appearance',
          state: {
            value: 'dark',
            options: [
              { id: 'light', label: 'Light' },
              { id: 'dark', label: 'Dark' },
              { id: 'system', label: 'System' },
            ],
            disabled: false,
          },
          actions: [{ name: 'choose', argument: 'id' }],
        },
      ])
      expect(bridge.query({ member: 'SegmentedControl' })).toEqual([])
    } finally {
      bridge.dispose()
    }
  })

  it('applies the mode uncontrolled, and only reports the choice controlled', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      render(<ModeSwitch label="Appearance" onChange={free} />)
      render(<ModeSwitch label="Preview" value="light" onChange={held} />)
      const [appearance, preview] = bridge.snapshot().members

      const applied = await asAgent(() =>
        bridge.act([{ id: appearance?.id, action: 'choose', value: 'dark' }]),
      )
      expect(applied.results[0]).toEqual({
        ok: true,
        id: appearance?.id,
        changed: { value: { from: 'system', to: 'dark' } },
      })
      expect(root.getAttribute('data-mode')).toBe('dark')
      expect(free).toHaveBeenLastCalledWith('dark')

      // Controlled: the application decides, so nothing is applied and the shown value stays.
      const reported = await asAgent(() =>
        bridge.act([{ id: preview?.id, action: 'choose', value: 'system' }]),
      )
      expect(reported.results[0]).toEqual({ ok: true, id: preview?.id, changed: {} })
      expect(held).toHaveBeenLastCalledWith('system')
      expect(root.getAttribute('data-mode')).toBe('dark')
    } finally {
      bridge.dispose()
    }
  })
})
