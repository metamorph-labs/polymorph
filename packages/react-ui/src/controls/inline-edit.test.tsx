import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { inlineEditLaw, type InlineEditLawProps } from '@polymorph/conformance/inline-edit'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { assertGoverned } from '@polymorph/react'
import { Dialog } from '../overlays/Dialog'
import { SettingsRow } from '../structure/SettingsRow'
import { InlineEdit, type InlineEditProps } from './InlineEdit'
import { tokenColor, tokenLength } from './token-probe'

/**
 * What a browser settles for InlineEdit beyond the law: the text step the value shares with the
 * field, the colours of the placeholder and the error, a long value at a phone's width, the
 * wiring SettingsRow hands it, and the strings a host passes. Opening, saving, cancelling, a save
 * that waits, and the row's height are the law's (`@polymorph/conformance/inline-edit`), which this
 * file calls for React.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<InlineEditProps>(true)
  })
})

/**
 * The opening, saving and focus rules, which the law states once for every web shell. The member
 * is mounted in a component that holds its props, as the application around it does.
 */
inlineEditLaw({
  shell: 'React',
  mount({ props, defaultEditing, onCommit, onEditingChange }) {
    let change: (next: Partial<InlineEditLawProps>) => void = () => {}
    function Held() {
      const [held, setHeld] = useState(props)
      change = (next) => setHeld((was) => ({ ...was, ...next }))
      return (
        <InlineEdit
          label="Project name"
          defaultEditing={defaultEditing}
          onCommit={onCommit}
          onEditingChange={onEditingChange}
          {...held}
        />
      )
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => change(next) })
  },
})

const noop = () => {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A key an input method is handling, dispatched on `target`: marked `isComposing`, or reported
 * with key code 229 after the composition has ended, as Safari sends the Enter that confirms it.
 */
function inputMethodKey(
  target: HTMLElement,
  key: string,
  how: 'composing' | 'processed',
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    isComposing: how === 'composing',
  })
  if (how === 'processed') Object.defineProperty(event, 'keyCode', { value: 229 })
  target.dispatchEvent(event)
  return event
}

describe('InlineEdit — keys', () => {
  it('leaves every key an input method is handling to it: Enter saves nothing, Escape keeps the field', async () => {
    const onCommit = vi.fn()
    const onEditingChange = vi.fn()
    render(
      <InlineEdit
        label="Project name"
        value="Acme"
        defaultEditing
        onCommit={onCommit}
        onEditingChange={onEditingChange}
      />,
    )
    const field = screen.getByRole('textbox', { name: 'Project name' })
    for (const how of ['composing', 'processed'] as const) {
      for (const key of ['Enter', 'Escape']) {
        expect(inputMethodKey(field, key, how).defaultPrevented, `${how} ${key}`).toBe(false)
      }
    }
    await sleep(30)
    expect(onCommit).not.toHaveBeenCalled()
    expect(onEditingChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Project name' })).toBe(field)
  })

  it('cancels on Escape inside a Dialog with the Dialog still open, and the next Escape closes it', async () => {
    const onOpenChange = vi.fn()
    const onEditingChange = vi.fn()
    render(
      <Dialog title="Project" defaultOpen onOpenChange={onOpenChange}>
        <InlineEdit
          label="Project name"
          value="Acme"
          onCommit={noop}
          onEditingChange={onEditingChange}
        />
      </Dialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Project name/ }))
    const field = await vi.waitFor(() => screen.getByRole('textbox', { name: 'Project name' }))
    await vi.waitFor(() => expect(document.activeElement).toBe(field))

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(onEditingChange).toHaveBeenLastCalledWith(false))
    await sleep(60)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})

describe('InlineEdit — what the reader sees', () => {
  it('draws the value at the field’s own text step at every size, so the text keeps its size', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const reading = render(
        <InlineEdit label="Project name" value="Acme billing" size={size} onCommit={noop} />,
      )
      const editing = render(
        <InlineEdit
          label="Project name"
          value="Acme billing"
          size={size}
          defaultEditing
          onCommit={noop}
        />,
      )
      const value = reading.container.querySelector('[data-member="inline-edit"] > span')
      const input = editing.container.querySelector('input')
      expect(value, size).not.toBeNull()
      expect(getComputedStyle(value as Element).fontSize, size).toBe(
        getComputedStyle(input as Element).fontSize,
      )
      expect(
        (reading.container.firstElementChild as HTMLElement).getBoundingClientRect().height,
        size,
      ).toBeCloseTo(Number.parseFloat(tokenLength(`--pm-control-height-${size}`)), 0)
      reading.unmount()
      editing.unmount()
    }
  })

  it('draws an empty value as its placeholder, in the muted role', () => {
    const { container } = render(
      <InlineEdit label="Device name" value="" placeholder="Unnamed device" onCommit={noop} />,
    )
    const value = container.querySelector('[data-placeholder]') as HTMLElement
    expect(value.textContent).toBe('Unnamed device')
    expect(getComputedStyle(value).color).toBe(tokenColor('--pm-text-muted'))
  })

  it('draws the error in the danger role under the field', () => {
    render(
      <InlineEdit
        label="Project name"
        value="Acme billing"
        defaultEditing
        error="A project named Acme billing already exists."
        onCommit={noop}
      />,
    )
    const message = screen.getByText('A project named Acme billing already exists.')
    expect(getComputedStyle(message).color).toBe(tokenColor('--pm-danger-text'))
    const field = screen.getByRole('textbox', { name: 'Project name' })
    expect(message.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      field.getBoundingClientRect().bottom,
    )
  })

  it('wraps a long value at a phone’s width, and its field never widens the column', () => {
    const value =
      'Acme billing and invoicing for the European and North American subsidiaries, including the reseller programme'
    const { container } = render(
      <div style={{ inlineSize: '320px' }}>
        <InlineEdit label="Project name" value={value} onCommit={noop} />
        <InlineEdit label="Project name" value={value} defaultEditing onCommit={noop} />
      </div>,
    )
    const column = container.firstElementChild as HTMLElement
    const [reading, editing] = [
      ...column.querySelectorAll<HTMLElement>('[data-member="inline-edit"]'),
    ] as [HTMLElement, HTMLElement]
    expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
    expect(reading.getBoundingClientRect().width).toBeLessThanOrEqual(320)
    expect(editing.getBoundingClientRect().width).toBeLessThanOrEqual(320)
    // Several lines: the text wraps rather than truncating.
    expect(reading.getBoundingClientRect().height).toBeGreaterThan(
      Number.parseFloat(tokenLength('--pm-control-height-md')) * 2,
    )
    expect(editing.querySelector('input')?.value).toBe(value)
  })
})

describe('InlineEdit — what a screen reader hears', () => {
  it('takes its names and the row’s description from a SettingsRow', () => {
    render(
      <SettingsRow
        label="Workspace name"
        description="Shown to everyone you invite."
        control={<InlineEdit label="Workspace name" value="Acme" defaultEditing onCommit={noop} />}
      />,
    )
    const field = screen.getByRole('textbox', { name: 'Workspace name' })
    expect(field.getAttribute('aria-label')).toBeNull()
    expect(field.getAttribute('aria-labelledby')).not.toBeNull()
    const described = (field.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
    expect(described).toContain('Shown to everyone you invite.')
  })

  it('says the words a host passes', () => {
    render(
      <InlineEdit
        label="Nom du projet"
        value="Acme"
        onCommit={noop}
        messages={{ edit: (label) => `Modifier ${label}`, save: 'Enregistrer', cancel: 'Annuler' }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Modifier Nom du projet' })).toBeTruthy()
  })

  it('names save and cancel from the messages while the field is open', () => {
    render(
      <InlineEdit
        label="Nom du projet"
        value="Acme"
        defaultEditing
        onCommit={noop}
        messages={{ edit: (label) => `Modifier ${label}`, save: 'Enregistrer', cancel: 'Annuler' }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy()
  })
})

/**
 * An agent sees one InlineEdit where a person sees one value, opens it, saves a text and
 * cancels, as the spec's `agent` fence declares (`design/components/inline-edit.md`, Agent),
 * and is refused what the open row refuses a person.
 */
describe('an agent', () => {
  it('opens an uncontrolled field, saves a changed text once, and closes it', async () => {
    const bridge = createAgentBridge()
    try {
      const commits: string[] = []
      const changes: boolean[] = []
      render(
        <InlineEdit
          label="Project name"
          value="Acme billing"
          onCommit={(text) => commits.push(text)}
          onEditingChange={(open) => changes.push(open)}
        />,
      )
      const members = bridge.snapshot().members
      expect(members.map((member) => [member.member, member.name])).toEqual([
        ['InlineEdit', 'Edit Project name'],
      ])
      const id = members[0]?.id
      const closed = await bridge.act([{ id, action: 'save', value: 'Acme' }])
      expect(closed.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('closed') },
      })

      const { results } = await bridge.act([
        { id, action: 'edit' },
        { id, action: 'save', value: 'Acme invoicing' },
        { id, action: 'edit' },
        { id, action: 'save', value: 'Acme billing' },
      ])
      expect(results).toMatchObject([
        { ok: true, changed: { editing: { from: false, to: true } } },
        { ok: true, changed: { editing: { from: true, to: false } } },
        { ok: true, changed: { editing: { from: false, to: true } } },
        { ok: true, changed: { editing: { from: true, to: false } } },
      ])
      // The unchanged text closes the field and reports nothing.
      expect(commits).toEqual(['Acme invoicing'])
      expect(changes).toEqual([true, false, true, false])
    } finally {
      bridge.dispose()
    }
  })

  it('leaves a controlled field open after a save, and refuses a save or a cancel in flight', async () => {
    const bridge = createAgentBridge()
    try {
      function Held() {
        const [value, setValue] = useState('Acme')
        const [editing, setEditing] = useState(true)
        const [pending, setPending] = useState(false)
        return (
          <InlineEdit
            label="Workspace name"
            value={value}
            editing={editing}
            onEditingChange={setEditing}
            pending={pending}
            required
            onCommit={(text) => {
              setPending(true)
              setValue(text)
            }}
          />
        )
      }
      render(<Held />)
      const [member] = bridge.snapshot().members
      const id = member?.id
      expect(member?.state).toMatchObject({ editing: true, pending: false, error: '' })
      const blank = await bridge.act([{ id, action: 'save', value: '   ' }])
      expect(blank.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('required') },
      })
      const saved = await bridge.act([{ id, action: 'save', value: 'Relay' }])
      expect(saved.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 'Acme', to: 'Relay' }, pending: { from: false, to: true } },
      })
      expect(bridge.snapshot().members[0]?.state['editing']).toBe(true)
      for (const step of [{ action: 'save', value: 'Other' }, { action: 'cancel' }]) {
        const { results } = await bridge.act([{ id, ...step }])
        expect(results[0]).toMatchObject({
          ok: false,
          error: { code: 'failed', message: expect.stringContaining('in flight') },
        })
      }
    } finally {
      bridge.dispose()
    }
  })

  it('reads the error the application passes while the field is open', async () => {
    const bridge = createAgentBridge()
    try {
      render(
        <InlineEdit
          label="Project name"
          value="Acme billing"
          defaultEditing
          error="A project named Acme billing already exists."
          onCommit={noop}
        />,
      )
      const [member] = bridge.snapshot().members
      expect(member).toMatchObject({
        name: 'Project name',
        state: { editing: true, error: 'A project named Acme billing already exists.' },
      })
      const { results } = await bridge.act([{ id: member?.id, action: 'cancel' }])
      expect(results[0]).toMatchObject({
        ok: true,
        changed: {
          editing: { from: true, to: false },
          error: { from: 'A project named Acme billing already exists.', to: '' },
        },
      })
    } finally {
      bridge.dispose()
    }
  })
})
