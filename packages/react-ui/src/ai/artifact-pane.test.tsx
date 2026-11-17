import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Button } from '../controls/Button'
import { ArtifactPane, type ArtifactPaneProps } from './ArtifactPane'

/**
 * ArtifactPane, in a real browser.
 *
 * A pane is a named region with a body. The tests check that the switch swaps
 * the body, that the body is a tab stop only while it overflows its box, and
 * that the app controls whether the close button appears and what it does.
 */

beforeAll(installTestTheme)

function box(height = 200): HTMLElement {
  const host = document.createElement('div')
  host.style.cssText = `width: 480px; height: ${height}px;`
  document.body.append(host)
  return host
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ArtifactPaneProps>(true)
  })
})

describe('a named region with a body', () => {
  it('is named by its title and renders its body', () => {
    render(
      <ArtifactPane title="deliver.ts" kind="code" meta="TypeScript">
        <p>the code</p>
      </ArtifactPane>,
    )
    expect(screen.getByRole('region', { name: 'deliver.ts' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'deliver.ts' })).toBeTruthy()
    expect(screen.getByText('the code')).toBeTruthy()
  })

  it('switches between views and reports the one shown', async () => {
    const onViewChange = vi.fn()
    render(
      <ArtifactPane
        title="Notes"
        onViewChange={onViewChange}
        views={[
          { id: 'preview', label: 'Preview', content: <p>rendered</p> },
          { id: 'source', label: 'Source', content: <p>raw</p> },
        ]}
      />,
    )
    expect(screen.getByText('rendered')).toBeTruthy()
    expect(screen.queryByText('raw')).toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: 'Source' }))
    expect(screen.getByText('raw')).toBeTruthy()
    expect(onViewChange).toHaveBeenCalledWith('source')
  })

  it('shows no switch for a single view', () => {
    render(
      <ArtifactPane title="Notes" views={[{ id: 'only', label: 'Only', content: <p>x</p> }]} />,
    )
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.getByText('x')).toBeTruthy()
  })

  it('is busy while still being written', () => {
    const { container } = render(
      <ArtifactPane title="deliver.ts" streaming>
        <p>…</p>
      </ArtifactPane>,
    )
    expect((container.firstElementChild as HTMLElement).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('deliver.ts: still being written')
  })

  it('calls the app’s onClose from a button with the app’s label', async () => {
    const onClose = vi.fn()
    render(
      <ArtifactPane title="deliver.ts" onClose={onClose} closeLabel="Schließen">
        <p>x</p>
      </ArtifactPane>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('the body scrolls', () => {
  it('is a tab stop only while the artifact overflows the box', async () => {
    const host = box()
    const { rerender } = render(
      <ArtifactPane title="deliver.ts">
        <p>short</p>
      </ArtifactPane>,
      { container: host },
    )
    const body = () => screen.getByText(/short|long/).parentElement?.parentElement as HTMLElement
    await vi.waitFor(() => expect(body().hasAttribute('tabindex')).toBe(false))
    rerender(
      <ArtifactPane title="deliver.ts">
        <p>{'long '.repeat(400)}</p>
      </ArtifactPane>,
    )
    await vi.waitFor(() => expect(body().getAttribute('tabindex')).toBe('0'))
    expect(screen.getByRole('group', { name: 'deliver.ts' })).toBe(body())
    // One landmark, not two. The pane is the region and the body is a group inside it.
    expect(screen.getAllByRole('region')).toHaveLength(1)
    host.remove()
  })
})

/**
 * An agent and the pane (`design/components/artifact-pane.md`, Agent): it chooses a reading
 * through the pane's own view in both forms and closes the pane through `onClose`. The close
 * Button is the pane's own part and is withheld; the app's actions are listed within the pane.
 */
describe('an agent', () => {
  const VIEWS = [
    { id: 'preview', label: 'Preview', content: <p>rendered</p> },
    { id: 'source', label: 'Source', content: <p>raw</p> },
  ]

  it('chooses a reading in an uncontrolled and a controlled pane', async () => {
    const free = vi.fn()
    const held = vi.fn()
    function Held() {
      const [view, setView] = useState('source')
      return (
        <ArtifactPane
          title="Held"
          views={VIEWS}
          view={view}
          onViewChange={(next) => {
            held(next)
            setView(next)
          }}
        />
      )
    }
    render(
      <>
        <ArtifactPane title="Free" views={VIEWS} onViewChange={free} />
        <Held />
      </>,
    )
    const bridge = createAgentBridge()
    try {
      const [one, two] = bridge.snapshot().members
      expect(one).toMatchObject({
        member: 'ArtifactPane',
        name: 'Free',
        state: {
          view: 'preview',
          views: [
            { id: 'preview', label: 'Preview' },
            { id: 'source', label: 'Source' },
          ],
          streaming: false,
        },
      })
      const chose = await bridge.act([{ id: one?.id, action: 'choose', value: 'source' }])
      expect(chose.results[0]).toMatchObject({
        ok: true,
        changed: { view: { from: 'preview', to: 'source' } },
      })
      expect(free).toHaveBeenCalledWith('source')
      const back = await bridge.act([{ id: two?.id, action: 'choose', value: 'preview' }])
      expect(back.results[0]).toMatchObject({ ok: true, changed: { view: { to: 'preview' } } })
      expect(held).toHaveBeenCalledWith('preview')
      expect(screen.getAllByText('rendered')).toHaveLength(1)
      expect(screen.getAllByText('raw')).toHaveLength(1)
    } finally {
      bridge.dispose()
    }
  })

  it('closes through onClose, withholds its close Button and lists the app’s actions', async () => {
    const onClose = vi.fn()
    const onCopy = vi.fn()
    render(
      <ArtifactPane
        title="deliver.ts"
        onClose={onClose}
        actions={
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            iconOnly
            icon="copy"
            label="Copy"
            onClick={onCopy}
          />
        }
      >
        <p>the code</p>
      </ArtifactPane>,
    )
    const bridge = createAgentBridge()
    try {
      const members = bridge.snapshot().members
      expect(members.map((member) => [member.member, member.name])).toEqual([
        ['ArtifactPane', 'deliver.ts'],
        ['Button', 'Copy'],
      ])
      expect(members[1]?.within).toBe(members[0]?.id)
      expect(bridge.query({ name: 'Close' })).toEqual([])
      const closed = await bridge.act([{ id: members[0]?.id, action: 'close' }])
      expect(closed.results[0]).toMatchObject({ ok: true })
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses to close a pane with no close control', async () => {
    render(<ArtifactPane title="deliver.ts">the code</ArtifactPane>)
    const bridge = createAgentBridge()
    try {
      const [pane] = bridge.snapshot().members
      expect(pane?.state).toEqual({ view: null, views: [], streaming: false })
      const { results } = await bridge.act([{ id: pane?.id, action: 'close' }])
      expect(results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('no close control') },
      })
    } finally {
      bridge.dispose()
    }
  })
})
