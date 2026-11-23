import { cleanup, render, within } from '@testing-library/react'
import { useLayoutEffect, type ReactNode } from 'react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

// The vocabulary by path: the foundation does not depend on it, and its tests draw with it.
import * as vocabulary from '../../../react-ui/src/index'

import { ScreenView, type ScreenAction, type ScreenMembers, type ScreenNode } from './index'

/**
 * A member that reads the elements it is given, drawn in a screen as in
 * written JSX. Avatar.Group reads each child's `name`, `size` and `label`,
 * FormField its control's `disabled`, and Dialog its trigger's `onClick`, from
 * the child element's props. In a screen each child is the renderer's element
 * for a node, which carries the props the member is given, so each parent
 * reads what it would read in JSX.
 */

beforeAll(installTestTheme)
afterEach(cleanup)

const members: ScreenMembers = vocabulary

const doc = (root: object, inputs: { name: string; type: string }[] = []) => ({
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A screen whose parents read their children.',
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

const NAMES = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing']

/** A group of three avatars, with the people bound to the host's data when asked. */
const group = (max?: number) =>
  doc(
    {
      component: 'Stack',
      children: [
        {
          component: 'Avatar.Group',
          props: { label: 'Reviewers', ...(max === undefined ? {} : { max }) },
          children: NAMES.map((_, at) => ({
            component: 'Avatar',
            props: { name: { $: `people.${at}` }, size: 'sm' },
          })),
        },
        { component: 'Text', children: [{ $: 'note' }] },
      ],
    },
    [
      { name: 'people', type: 'string[]' },
      { name: 'note', type: 'string' },
    ],
  )

describe('Avatar.Group reads its avatars', () => {
  it('names each avatar, as written JSX does', () => {
    const { container } = render(
      <ScreenView
        document={group()}
        data={{ people: NAMES, note: 'Due Friday' }}
        members={members}
      />,
    )
    const reviewers = within(container).getByRole('group', { name: 'Reviewers' })
    expect(
      within(reviewers)
        .getAllByRole('img')
        .map((avatar) => avatar.getAttribute('aria-label')),
    ).toEqual(NAMES)
    expect(reviewers.querySelectorAll('[aria-hidden="true"][data-member="avatar"]')).toHaveLength(0)
  })

  it('reads the avatars’ size for the chip it adds past `max`', () => {
    const { container } = render(
      <ScreenView document={group(2)} data={{ people: NAMES, note: '' }} members={members} />,
    )
    const reviewers = within(container).getByRole('group', { name: 'Reviewers' })
    expect(within(reviewers).getAllByRole('img')).toHaveLength(2)
    const chip = within(reviewers).getByText('+1')
    expect(chip.getAttribute('data-size')).toBe('sm')
  })

  it('keeps each avatar mounted while the document streams in and the data changes', () => {
    mounts.clear()
    const text = JSON.stringify(group())
    const view = (length: number, note: string) => (
      <ScreenView
        text={text.slice(0, length)}
        data={{ people: NAMES, note }}
        members={members}
        decorate={counted}
      />
    )
    const { container, rerender } = render(view(0, 'Due Friday'))
    let avatars: Element[] = []
    for (let length = 1; length <= text.length; length += 1) {
      rerender(view(length, 'Due Friday'))
      if (avatars.length === 0) {
        const drawn = container.querySelectorAll('[data-member="avatar"]')
        if (drawn.length === NAMES.length) avatars = [...drawn]
      }
    }
    // The group is drawn before the Text after it arrives.
    expect(avatars).toHaveLength(NAMES.length)
    rerender(view(text.length, 'Due Monday'))
    expect([...container.querySelectorAll('[data-member="avatar"]')]).toEqual(avatars)
    expect(container.textContent).toContain('Due Monday')
    const remounted = [...mounts].filter(([, count]) => count !== 1)
    expect(remounted).toEqual([])
    expect(
      within(container)
        .getAllByRole('img')
        .map((avatar) => avatar.getAttribute('aria-label')),
    ).toEqual(NAMES)
  })
})

describe('other members that read the element they are given', () => {
  it('FormField reads its control’s `disabled`', () => {
    const { container } = render(
      <ScreenView
        document={doc({
          component: 'FormField',
          props: { label: 'Reference' },
          children: [{ component: 'Input', props: { name: 'reference', disabled: true } }],
        })}
        members={members}
      />,
    )
    const field = container.querySelector('[data-member="form-field"]')
    expect(field?.hasAttribute('data-disabled')).toBe(true)
  })

  it('Dialog calls its trigger’s own `onClick` as it opens', async () => {
    const told: ScreenAction[] = []
    render(
      <ScreenView
        document={doc(
          {
            component: 'Dialog',
            props: {
              title: 'Share the report',
              trigger: {
                component: 'Button',
                props: { label: 'Share', onClick: { $: 'onShare' } },
              },
            },
            children: [{ component: 'Text', children: ['Anyone with the link can read it.'] }],
          },
          [{ name: 'onShare', type: '() => void' }],
        )}
        members={members}
        onAction={(action) => {
          told.push(action)
        }}
      />,
    )
    const body = within(document.body)
    await userEvent.click(body.getByRole('button', { name: 'Share' }))
    await vi.waitFor(() => body.getByRole('dialog'))
    expect(told.map(({ name }) => name)).toEqual(['onShare'])
  })
})
