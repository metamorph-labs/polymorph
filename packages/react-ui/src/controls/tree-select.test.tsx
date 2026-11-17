import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { treeSelectLaw, type TreeSelectLawProps } from '@polymorph/conformance/tree-select'
import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'
import { assertGoverned } from '@polymorph/react'
import { type TreeItem } from '../structure/Tree'
import { FormField } from './FormField'
import { Select } from './Select'
import { TreeSelect, type TreeSelectProps } from './TreeSelect'
import { tokenColor } from './token-probe'

/**
 * What a browser settles for TreeSelect in React: the trigger computes Select's
 * values, the panel holds the tree and no role of its own, FormField names the
 * trigger, the panel's measure, and the sheet below `30rem`. The popup's keys,
 * its choices, the empty choice, the hidden field and a level that loads while
 * it is open are the law's (`@polymorph/conformance/tree-select`), which this
 * file calls for React, and which runs Tree's law on the tree in the popup.
 */

beforeAll(installTestTheme)

const NARROW = 420
const WIDE = 1280

afterEach(async () => {
  document.documentElement.removeAttribute('dir')
  await page.viewport(WIDE, 800)
})

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<TreeSelectProps>(true)
  })
})

/**
 * The popup around the tree, and Tree's own law on the tree in it. The member
 * is mounted in a component that holds its props, as the application does.
 */
treeSelectLaw({
  shell: 'React',
  mount({ props, onChange, onExpandedChange, onLoadMore, ...rest }) {
    let change: (next: Partial<TreeSelectLawProps>) => void = () => {}
    function Held() {
      const [held, setHeld] = useState(props)
      change = (next) => setHeld((was) => ({ ...was, ...next }))
      return (
        <TreeSelect
          label="Units"
          aria-label="Move under"
          presentation="popover"
          onChange={onChange}
          onExpandedChange={onExpandedChange}
          onLoadMore={onLoadMore}
          {...rest}
          {...held}
        />
      )
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => change(next) })
  },
})

const UNITS: TreeItem[] = [
  {
    id: 'engineering',
    label: 'Engineering',
    children: [
      { id: 'platform', label: 'Platform' },
      { id: 'applications', label: 'Applications' },
    ],
  },
  { id: 'design', label: 'Design' },
]

// Read from the document, because the open popup is modal and hides the trigger from the
// accessibility tree.
const trigger = () => document.querySelector<HTMLElement>('[role="combobox"]') as HTMLElement
const tree = () => document.querySelector<HTMLElement>('[role="tree"]')

async function open() {
  await userEvent.click(trigger())
  await vi.waitFor(() => expect(tree()).not.toBeNull())
}

describe('TreeSelect — the trigger is Select’s', () => {
  const shared = (element: Element) => {
    const style = getComputedStyle(element)
    return {
      height: style.height,
      background: style.backgroundColor,
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      radius: style.borderTopLeftRadius,
      fontSize: style.fontSize,
      paddingInline: style.paddingLeft,
      color: style.color,
      shadow: style.boxShadow,
    }
  }

  const OPTIONS = [{ value: 'design', label: 'Design' }]

  for (const size of ['sm', 'md', 'lg'] as const) {
    it(`computes Select’s values at ${size}`, () => {
      render(
        <>
          <TreeSelect size={size} label="Units" items={UNITS} aria-label="Move under" />
          <Select size={size} options={OPTIONS} aria-label="Priority" />
        </>,
      )
      const [ours, select] = screen.getAllByRole('combobox')
      expect(shared(ours as HTMLElement)).toEqual(shared(select as HTMLElement))
    })
  }

  it('computes Select’s values when invalid, when disabled and with a placeholder', () => {
    render(
      <>
        <TreeSelect invalid label="Units" items={UNITS} aria-label="A" />
        <Select invalid options={OPTIONS} aria-label="B" />
        <TreeSelect disabled label="Units" items={UNITS} aria-label="C" />
        <Select disabled options={OPTIONS} aria-label="D" />
        <TreeSelect placeholder="Choose" label="Units" items={UNITS} aria-label="E" />
        <Select placeholder="Choose" options={OPTIONS} aria-label="F" />
      </>,
    )
    const [a, b, c, d, e, f] = screen.getAllByRole('combobox') as HTMLElement[]
    expect(shared(a as HTMLElement)).toEqual(shared(b as HTMLElement))
    expect(shared(c as HTMLElement)).toEqual(shared(d as HTMLElement))
    expect(shared(e as HTMLElement)).toEqual(shared(f as HTMLElement))
    expect(getComputedStyle(e as HTMLElement).color).toBe(tokenColor('--pm-text-muted'))
  })

  it('is named by FormField’s label, and reads the chosen node as its value', () => {
    render(
      <FormField label="Move under" description="The unit moves with its members.">
        <TreeSelect label="Units" items={UNITS} defaultValue="platform" />
      </FormField>,
    )
    expect(trigger()).toHaveAccessibleName('Move under')
    expect(trigger()).toHaveAccessibleDescription('The unit moves with its members.')
    expect(trigger()).toHaveTextContent('Platform')
    expect(trigger().getAttribute('aria-haspopup')).toBe('tree')
    expect(trigger().tagName).toBe('BUTTON')
  })

  it('cuts a long label with an ellipsis inside a narrow box', () => {
    const long = 'ticket-export-eu-west-1-production-customer-support-archive'
    render(
      <div style={{ inlineSize: 160 }}>
        <TreeSelect
          label="Units"
          items={[{ id: 'long', label: long }]}
          defaultValue="long"
          aria-label="Archive into"
        />
      </div>,
    )
    expect(trigger().getBoundingClientRect().width).toBeLessThanOrEqual(160)
    const value = trigger().querySelector('span') as HTMLElement
    expect(getComputedStyle(value).textOverflow).toBe('ellipsis')
    expect(value.scrollWidth).toBeGreaterThan(value.clientWidth)
  })
})

describe('TreeSelect — the popup', () => {
  it('holds the tree in a panel with no role of its own', async () => {
    render(<TreeSelect label="Units" items={UNITS} aria-label="Move under" />)
    await open()
    const panel = document.getElementById(trigger().getAttribute('aria-controls') ?? '')
    expect(panel).not.toBeNull()
    expect(panel?.hasAttribute('role')).toBe(false)
    expect(panel?.getAttribute('data-member')).toBe('tree-select')
    expect(tree()?.getAttribute('aria-label')).toBe('Units')
    expect(tree()?.getAttribute('data-member')).toBe('tree')
  })

  it('is at least as wide as the trigger and no wider than the measure', async () => {
    render(<TreeSelect label="Units" items={UNITS} aria-label="Move under" />)
    await open()
    const panel = document.getElementById(trigger().getAttribute('aria-controls') ?? '')
    const width = panel?.getBoundingClientRect().width ?? 0
    expect(width).toBeGreaterThanOrEqual(trigger().getBoundingClientRect().width)
    const measure =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--pm-space-10'),
      ) * 4
    expect(width).toBeLessThanOrEqual(measure)
  })

  it('passes Tree’s strings to the tree', async () => {
    render(
      <TreeSelect
        label="Units"
        items={UNITS}
        hasMore
        messages={{ loading: 'Chargement', loadMore: 'Afficher plus' }}
        aria-label="Move under"
      />,
    )
    await open()
    expect(screen.getByRole('treeitem', { name: 'Afficher plus' })).toBeInTheDocument()
  })

  it('opens nothing while disabled', async () => {
    render(<TreeSelect disabled defaultOpen label="Units" items={UNITS} aria-label="Move under" />)
    expect(trigger()).toBeDisabled()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(tree()).toBeNull()
  })
})

describe('TreeSelect — the sheet below 30rem', () => {
  const sheet = () => document.querySelector<HTMLElement>('[data-presentation="sheet"]')

  it('shows the tree in the shared sheet, and a choice closes it and returns focus', async () => {
    await page.viewport(NARROW, 800)
    const onChange = vi.fn()
    render(<TreeSelect label="Units" items={UNITS} onChange={onChange} aria-label="Move under" />)
    await open()
    expect(sheet()).not.toBeNull()
    expect(sheet()?.contains(tree())).toBe(true)
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute('data-tree-item')).toBe('engineering'),
    )

    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute('data-tree-item')).toBe('design'),
    )
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(sheet()).toBeNull())
    expect(onChange).toHaveBeenCalledWith('design')
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger()))
  })

  it('dismisses on Escape and returns focus to the trigger', async () => {
    await page.viewport(NARROW, 800)
    render(<TreeSelect label="Units" items={UNITS} aria-label="Move under" />)
    await open()
    await vi.waitFor(() => expect(tree()?.contains(document.activeElement)).toBe(true))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheet()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger()))
  })

  it('keeps the anchored popup at every width with `popover`', async () => {
    await page.viewport(NARROW, 800)
    render(
      <TreeSelect presentation="popover" label="Units" items={UNITS} aria-label="Move under" />,
    )
    await open()
    expect(sheet()).toBeNull()
  })
})

/**
 * An agent chooses a node through the bridge, without opening the popup, as the spec's `agent`
 * fence declares (`design/components/tree-select.md`, Agent). The member holds its value, so the
 * choice reaches the trigger whether or not the caller controls it, and `onChange` reports it.
 */
describe('an agent', () => {
  const NESTED: TreeItem[] = [
    {
      id: 'engineering',
      label: 'Engineering',
      children: [
        { id: 'platform', label: 'Platform', children: [{ id: 'runtime', label: 'Runtime' }] },
      ],
    },
    {
      id: 'archive',
      label: 'Archive',
      disabled: true,
      children: [{ id: 'old', label: 'Old units' }],
    },
  ]

  it('chooses a node deep in the hierarchy in an uncontrolled and a controlled field', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      function Held() {
        const [value, setValue] = useState<string | null>('engineering')
        return (
          <TreeSelect
            label="Units"
            aria-label="Held"
            items={NESTED}
            value={value}
            onChange={(next) => {
              held(next)
              setValue(next)
            }}
          />
        )
      }
      render(
        <>
          <TreeSelect label="Units" aria-label="Free" items={NESTED} onChange={free} />
          <Held />
        </>,
      )
      const [one, two] = bridge.snapshot().members
      expect(one).toMatchObject({
        name: 'Free',
        state: {
          value: null,
          options: [
            { id: 'engineering', label: 'Engineering' },
            { id: 'platform', label: 'Platform' },
            { id: 'runtime', label: 'Runtime' },
            { id: 'archive', label: 'Archive', disabled: true },
            { id: 'old', label: 'Old units', disabled: true },
          ],
          open: false,
        },
      })

      const chosen = await bridge.act([{ id: one?.id, action: 'choose', value: 'runtime' }])
      expect(chosen.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: null, to: 'runtime' } },
      })
      expect(free).toHaveBeenLastCalledWith('runtime')
      expect(screen.getByRole('combobox', { name: 'Free' }).textContent).toContain('Runtime')
      expect(screen.getByRole('combobox', { name: 'Free' }).getAttribute('aria-expanded')).toBe(
        'false',
      )

      const changed = await bridge.act([{ id: two?.id, action: 'choose', value: 'platform' }])
      expect(changed.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 'engineering', to: 'platform' } },
      })
      expect(held).toHaveBeenLastCalledWith('platform')

      // A node under a disabled branch is refused, as the tree draws that branch closed.
      const refused = await bridge.act([{ id: one?.id, action: 'choose', value: 'old' }])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      expect(free).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('names the empty choice by the empty string, which onChange reports as null', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <TreeSelect
          label="Units"
          aria-label="Move under"
          items={NESTED}
          emptyOption="Top level"
          defaultValue="platform"
          onChange={onChange}
        />,
      )
      const [member] = bridge.snapshot().members
      expect(member?.state['options']).toContainEqual({ id: '', label: 'Top level' })
      const { results } = await bridge.act([{ id: member?.id, action: 'choose', value: '' }])
      expect(results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 'platform', to: '' } },
      })
      expect(onChange).toHaveBeenLastCalledWith(null)
    } finally {
      bridge.dispose()
    }
  })

  it('withholds the Tree in the open popup, anchored and in the sheet', async () => {
    const sheet = () => document.querySelector<HTMLElement>('[data-presentation="sheet"]')
    for (const [width, inSheet] of [
      [WIDE, false],
      [NARROW, true],
    ] as const) {
      await page.viewport(width, 800)
      const bridge = createAgentBridge()
      const onChange = vi.fn()
      const { unmount } = render(
        <TreeSelect label="Units" aria-label="Move under" items={NESTED} onChange={onChange} />,
      )
      try {
        const [member] = bridge.snapshot().members
        const opened = await bridge.act([{ id: member?.id, action: 'open' }])
        expect(opened.results[0]).toMatchObject({ ok: true, changed: { open: { to: true } } })
        await vi.waitFor(() => expect(tree()).not.toBeNull())
        expect(sheet() !== null).toBe(inSheet)
        // The Tree in the popup is registered.
        const inside = agentRegistrations().filter(({ id }) => id !== member?.id)
        expect(inside.map((registration) => registration.member)).toEqual(['Tree'])
        // It is not listed, found or run while the popup is open: `choose` is the one path.
        expect(bridge.snapshot().members.map((listed) => listed.member)).toEqual(['TreeSelect'])
        expect(bridge.query({ member: 'Tree' })).toEqual([])
        const byId = await bridge.act([{ id: inside[0]?.id, action: 'choose', value: 'platform' }])
        expect(byId.results[0]).toMatchObject({ ok: false, error: { code: 'unknown-member' } })
        const byTarget = await bridge.act([
          { target: { member: 'Tree' }, action: 'choose', value: 'platform' },
        ])
        expect(byTarget.results[0]).toMatchObject({ ok: false, error: { code: 'unknown-member' } })
        expect(onChange).not.toHaveBeenCalled()
      } finally {
        bridge.dispose()
        unmount()
      }
    }
  })
})
