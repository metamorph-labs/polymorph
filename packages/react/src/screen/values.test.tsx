import { cleanup, render, within } from '@testing-library/react'
import { useLayoutEffect, type ReactNode } from 'react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

// The vocabulary by path: the foundation does not depend on it, and its tests draw with it.
import * as vocabulary from '../../../react-ui/src/index'

import {
  ScreenDrawing,
  useScreen,
  type Screen,
  type ScreenAction,
  type ScreenMembers,
  type ScreenNode,
  type ScreenSource,
} from './index'

/**
 * What a screen's `values` hold, against what the reader sees in the real
 * members: a named control's value is the reader's choice, else the value
 * given, else its default, else its type's empty value, and a control keeps
 * the text typed in it and no other. The walk's rule is pinned in
 * `packages/screen/src/walk.test.ts`; these tests hold React's drawing to it.
 */

beforeAll(installTestTheme)
afterEach(cleanup)

const members: ScreenMembers = vocabulary

const doc = (root: object, inputs: { name: string; type: string }[] = []) => ({
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A screen whose values are read.',
  inputs,
  root,
})

/** Each path's mounts, counted by a `decorate` that draws nothing of its own. */
const mounts = new Map<string, number>()

function Mounted({ path, children }: { path: string; children: ReactNode }) {
  useLayoutEffect(() => {
    mounts.set(path, (mounts.get(path) ?? 0) + 1)
  }, [path])
  return children
}

const counted = (drawn: ReactNode, node: ScreenNode) => <Mounted path={node.path}>{drawn}</Mounted>

/** A drawing whose screen the test can read. */
function drawn() {
  const seen: { current: Screen | null } = { current: null }
  function Probe(props: ScreenSource) {
    const screen = useScreen(props)
    useLayoutEffect(() => {
      seen.current = screen
    })
    return <ScreenDrawing screen={screen} members={members} decorate={counted} />
  }
  return { seen, Probe }
}

/** The text field a document labels with `aria-label`. */
const field = (container: HTMLElement, label: string) =>
  within(container).getByRole('textbox', { name: label }) as HTMLInputElement

describe('a typed value stays in the control it was typed in', () => {
  it('keeps the text out of a control that takes the place of the one it was typed in, and reports what each field shows', async () => {
    const email = { component: 'Input', props: { name: 'email', 'aria-label': 'Email' } }
    const phone = { component: 'Input', props: { name: 'phone', 'aria-label': 'Phone' } }
    const { seen, Probe } = drawn()
    const { container, rerender } = render(
      <Probe document={doc({ component: 'Stack', children: [email] })} />,
    )
    await userEvent.fill(field(container, 'Email'), 'ada@example.com')
    expect(seen.current?.values).toEqual({ email: 'ada@example.com' })

    // The phone field takes the place the email field had, and the email field moves on. A
    // control is keyed by its place and its name, so neither is the field the text was typed in:
    // the phone field does not show it, and `values` does not report it under another name.
    rerender(<Probe document={doc({ component: 'Stack', children: [phone, email] })} />)
    expect(field(container, 'Phone').value).toBe('')
    expect(seen.current?.values['phone']).toBe('')
    // What `values` says is what the reader sees, field by field.
    expect(seen.current?.values).toEqual({
      phone: field(container, 'Phone').value,
      email: field(container, 'Email').value,
    })
  })
})

describe('the controls the person changed', () => {
  it('names only the field typed in, through a streamed chunk and a data update', async () => {
    const told: ScreenAction[] = []
    const text = JSON.stringify(
      doc(
        {
          component: 'Stack',
          children: [
            { component: 'Input', props: { name: 'first', 'aria-label': 'First' } },
            { component: 'Input', props: { name: 'second', 'aria-label': 'Second' } },
            { component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } },
          ],
        },
        [{ name: 'onSave', type: '() => void' }],
      ),
    )
    const onAction = (action: ScreenAction) => {
      told.push(action)
    }
    const { seen, Probe } = drawn()
    // The text up to the Button: both fields are drawn, and more is to come.
    const before = text.slice(0, text.indexOf('{"component":"Button"'))
    const { container, rerender } = render(<Probe text={before} onAction={onAction} />)
    const second = field(container, 'Second')
    await userEvent.fill(second, 'typed')
    expect(seen.current?.changed).toEqual(['second'])

    // The next chunk leaves both fields where they are, and adds the Button.
    rerender(<Probe text={text} onAction={onAction} />)
    expect(seen.current?.changed).toEqual(['second'])
    rerender(<Probe text={text} data={{ unrelated: 1 }} onAction={onAction} />)
    expect(field(container, 'Second')).toBe(second)
    expect(seen.current?.changed).toEqual(['second'])

    await userEvent.click(within(container).getByRole('button', { name: 'Save' }))
    expect(told).toEqual([
      { name: 'onSave', args: [], values: { first: '', second: 'typed' }, changed: ['second'] },
    ])
  })
})

describe('values are what the reader sees', () => {
  it('reports an untouched field’s default and an untouched checkbox as unchecked', async () => {
    const told: ScreenAction[] = []
    const { seen, Probe } = drawn()
    const { container } = render(
      <Probe
        document={doc(
          {
            component: 'Stack',
            children: [
              {
                component: 'Input',
                props: { name: 'displayName', defaultValue: 'Ada', 'aria-label': 'Name' },
              },
              { component: 'Checkbox', props: { name: 'agree', label: 'I agree' } },
              { component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } },
            ],
          },
          [{ name: 'onSave', type: '() => void' }],
        )}
        onAction={(action) => {
          told.push(action)
        }}
      />,
    )
    expect(field(container, 'Name').value).toBe('Ada')
    await userEvent.click(within(container).getByRole('button', { name: 'Save' }))
    expect(told).toEqual([
      { name: 'onSave', args: [], values: { displayName: 'Ada', agree: false }, changed: [] },
    ])
    expect(seen.current?.values).toEqual({ displayName: 'Ada', agree: false })
  })

  it('shows what `values` holds in a field a dialog draws again', async () => {
    const { seen, Probe } = drawn()
    render(
      <Probe
        document={doc({
          component: 'Dialog',
          props: {
            title: 'Report the message',
            trigger: { component: 'Button', props: { label: 'Report' } },
          },
          children: [{ component: 'Input', props: { name: 'reason', 'aria-label': 'Reason' } }],
        })}
      />,
    )
    const body = within(document.body)
    await userEvent.click(body.getByRole('button', { name: 'Report' }))
    const dialog = await vi.waitFor(() => body.getByRole('dialog'))
    await userEvent.fill(within(dialog).getByRole('textbox', { name: 'Reason' }), 'spam')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(body.queryByRole('dialog')).toBeNull())
    expect(seen.current?.values).toEqual({ reason: 'spam' })

    // The dialog draws its field again; the field starts from what `values` holds.
    await userEvent.click(body.getByRole('button', { name: 'Report' }))
    const again = await vi.waitFor(() => body.getByRole('dialog'))
    const reason = within(again).getByRole('textbox', { name: 'Reason' }) as HTMLInputElement
    expect(reason.value).toBe('spam')
    expect(seen.current?.values).toEqual({ reason: 'spam' })
  })

  /**
   * Each named control with no value given, chosen by the reader. The screen
   * then passes the choice back as the member's default, which changes on each
   * choice while the member stays mounted. React may not warn, and the member
   * may not be mounted again or reset.
   */
  const CONTROLS: {
    name: string
    element: object
    choose: (container: HTMLElement) => Promise<void>
    /** Whether the control shows the reader's choice. */
    shows: (container: HTMLElement) => boolean
    value: unknown
  }[] = [
    {
      name: 'Input',
      element: { component: 'Input', props: { name: 'it', 'aria-label': 'It' } },
      choose: (container) => userEvent.fill(field(container, 'It'), 'typed'),
      shows: (container) => field(container, 'It').value === 'typed',
      value: 'typed',
    },
    {
      name: 'Textarea',
      element: { component: 'Textarea', props: { name: 'it', 'aria-label': 'It' } },
      choose: (container) => userEvent.fill(field(container, 'It'), 'typed'),
      shows: (container) => field(container, 'It').value === 'typed',
      value: 'typed',
    },
    {
      name: 'Select',
      element: {
        component: 'Select',
        props: {
          name: 'it',
          'aria-label': 'It',
          options: [
            { $object: { value: 'a', label: 'Alpha' } },
            { $object: { value: 'b', label: 'Beta' } },
          ],
        },
      },
      choose: async (container) => {
        await userEvent.click(within(container).getByRole('combobox', { name: /It/ }))
        const option = await vi.waitFor(() =>
          within(document.body).getByRole('option', { name: 'Beta' }),
        )
        await userEvent.click(option)
        await vi.waitFor(() => expect(within(document.body).queryByRole('listbox')).toBeNull())
      },
      shows: (container) =>
        within(container).getByRole('combobox', { name: /It/ }).textContent?.includes('Beta') ===
        true,
      value: 'b',
    },
    {
      name: 'Checkbox',
      element: { component: 'Checkbox', props: { name: 'it', label: 'It' } },
      choose: (container) => userEvent.click(within(container).getByRole('checkbox')),
      shows: (container) =>
        (within(container).getByRole('checkbox') as HTMLInputElement).checked ||
        within(container).getByRole('checkbox').getAttribute('aria-checked') === 'true',
      value: true,
    },
    {
      name: 'Switch',
      element: { component: 'Switch', props: { name: 'it', label: 'It' } },
      choose: (container) => userEvent.click(within(container).getByRole('switch')),
      shows: (container) =>
        (within(container).getByRole('switch') as HTMLInputElement).checked ||
        within(container).getByRole('switch').getAttribute('aria-checked') === 'true',
      value: true,
    },
    {
      name: 'RadioGroup',
      element: {
        component: 'RadioGroup',
        props: {
          name: 'it',
          'aria-label': 'It',
          options: [
            { $object: { value: 's', label: 'Small' } },
            { $object: { value: 'l', label: 'Large' } },
          ],
        },
      },
      choose: (container) =>
        userEvent.click(within(container).getByRole('radio', { name: 'Large' })),
      shows: (container) =>
        within(container).getByRole('radio', { name: 'Large' }).getAttribute('aria-checked') ===
        'true',
      value: 'l',
    },
    {
      name: 'DatePicker',
      element: {
        component: 'DatePicker',
        props: { name: 'it', 'aria-label': 'It', locale: 'en-US' },
      },
      choose: async (container) => {
        const [month] = within(container).getAllByRole('spinbutton')
        await userEvent.click(month as HTMLElement)
        await userEvent.keyboard('3152026')
      },
      shows: (container) =>
        within(container)
          .getAllByRole('spinbutton')
          .map((segment) => segment.textContent)
          .join('/') === '3/15/2026',
      value: '2026-03-15',
    },
  ]

  for (const control of CONTROLS) {
    it(`keeps ${control.name} mounted, with no warning, while the screen passes it the reader’s choice as its default`, async () => {
      mounts.clear()
      const { seen, Probe } = drawn()
      const logged = vi.spyOn(console, 'error')
      try {
        const { container, rerender } = render(
          <Probe document={doc({ component: 'Stack', children: [control.element] })} />,
        )
        const before = container.querySelector('[data-member]:not([data-member="stack"])')
        await control.choose(container)
        expect(seen.current?.values).toEqual({ it: control.value })
        // The same document again, as a new object: the default the screen passes stays.
        rerender(<Probe document={doc({ component: 'Stack', children: [control.element] })} />)
        expect(seen.current?.values).toEqual({ it: control.value })
        expect(container.querySelector('[data-member]:not([data-member="stack"])')).toBe(before)
        expect(control.shows(container)).toBe(true)
        expect([...mounts.values()].every((count) => count === 1)).toBe(true)
      } finally {
        logged.mockRestore()
      }
      expect(logged.mock.calls.map((call) => call.map(String).join(' '))).toEqual([])
    })
  }
})
