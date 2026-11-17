import { render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { treeLaw, type TreeLawProps } from '@polymorph/conformance/tree'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { assertGoverned } from '@polymorph/react'
import { Tree, type TreeItem, type TreeProps } from './Tree'

/**
 * What a browser settles for Tree: the roles and names a screen reader hears,
 * what the two busy rows are, the strings a host passes, where the ring and the
 * fills are drawn, and how a row is indented. The keys, the selection, who holds
 * the open branches and where focus is when a level arrives are the law's
 * (`@polymorph/conformance/tree`), which this file calls for React.
 */

beforeAll(installTestTheme)

afterEach(() => {
  document.documentElement.removeAttribute('dir')
})

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<TreeProps>(true)
  })
})

const UNITS: TreeItem[] = [
  {
    id: 'engineering',
    label: 'Engineering',
    children: [
      { id: 'platform', label: 'Platform', hasChildren: true },
      { id: 'applications', label: 'Applications', description: 'Two teams' },
    ],
  },
  { id: 'design', label: 'Design', hasChildren: true },
  { id: 'sales', label: 'Sales' },
]

const OPEN = new Set(['engineering'])

const tree = () => screen.getByRole('tree', { name: 'Units' })
const item = (name: string) => screen.getByRole('treeitem', { name })
const rowOf = (element: HTMLElement) =>
  element.querySelector<HTMLElement>(':scope > [data-tree-part="row"]') as HTMLElement

/** Two frames, in which a tree that moves focus after a change has moved it. */
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

/**
 * The keys, the selection, the open branches and focus, which the law states
 * once for every web shell. The tree is mounted in a component that holds its
 * props, as the application around it does.
 */
treeLaw({
  shell: 'React',
  mount({ props, defaultExpanded, defaultValue, onChange, onExpandedChange, onLoadMore }) {
    let change: (next: Partial<TreeLawProps>) => void = () => {}
    function Held() {
      const [held, setHeld] = useState(props)
      change = (next) => setHeld((was) => ({ ...was, ...next }))
      return (
        <Tree
          label="Units"
          defaultExpanded={defaultExpanded}
          defaultValue={defaultValue}
          onChange={onChange}
          onExpandedChange={onExpandedChange}
          onLoadMore={onLoadMore}
          {...held}
        />
      )
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => change(next) })
  },
})

describe('Tree — what a screen reader hears', () => {
  it('is a labelled tree of items, with a group under an open branch', () => {
    render(<Tree label="Units" items={UNITS} defaultExpanded={OPEN} />)

    expect(tree().tagName).toBe('UL')
    const top = within(tree())
      .getAllByRole('treeitem')
      .filter((row) => row.parentElement === tree())
    expect(top.map((row) => row.getAttribute('data-tree-item'))).toEqual([
      'engineering',
      'design',
      'sales',
    ])

    const group = within(item('Engineering')).getByRole('group')
    expect(group.tagName).toBe('UL')
    expect(group.parentElement).toBe(item('Engineering'))
    expect(within(group).getAllByRole('treeitem')).toHaveLength(2)
  })

  it('names an item by its label alone, and describes it by its description', () => {
    render(<Tree label="Units" items={UNITS} defaultExpanded={OPEN} />)

    // An open branch holds the rows under it. Its name is its own label, not theirs.
    expect(item('Engineering')).toHaveAccessibleName('Engineering')
    expect(item('Applications')).toHaveAccessibleDescription('Two teams')
    expect(item('Platform')).not.toHaveAccessibleDescription()
  })

  it('names an item whose id holds a space', () => {
    render(<Tree label="Units" items={[{ id: 'north west', label: 'North West' }]} />)
    expect(item('North West').getAttribute('data-tree-item')).toBe('north west')
  })

  it('says a branch is open or closed, and says nothing of it on a leaf', () => {
    render(<Tree label="Units" items={UNITS} defaultExpanded={OPEN} />)

    expect(item('Engineering').getAttribute('aria-expanded')).toBe('true')
    // A branch the application has not loaded is a branch.
    expect(item('Platform').getAttribute('aria-expanded')).toBe('false')
    expect(item('Sales').hasAttribute('aria-expanded')).toBe(false)
    // The chevron is drawn for a pointer. The item says the state.
    expect(rowOf(item('Engineering')).querySelector('[data-tree-part="toggle"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(rowOf(item('Sales')).querySelector('[data-tree-part="toggle"]')).toBeNull()
  })

  it('says which item is selected on every enabled item', () => {
    render(<Tree label="Units" items={UNITS} defaultExpanded={OPEN} defaultValue="platform" />)

    expect(item('Platform').getAttribute('aria-selected')).toBe('true')
    expect(item('Platform')).toHaveAttribute('data-selected')
    expect(item('Sales').getAttribute('aria-selected')).toBe('false')
    expect(item('Sales')).not.toHaveAttribute('data-selected')
  })

  it('opens a branch the application has not loaded onto nothing', async () => {
    render(<Tree label="Units" items={UNITS} defaultExpanded={new Set(['design'])} />)
    expect(item('Design').getAttribute('aria-expanded')).toBe('true')
    expect(within(item('Design')).queryByRole('group')).toBeNull()
  })
})

describe('Tree — a level that is loading', () => {
  const loading = (design: Partial<TreeItem>): TreeItem[] =>
    UNITS.map((unit) => (unit.id === 'design' ? { ...unit, ...design } : unit))

  it('draws one busy row under an open branch, which is a status and no item', () => {
    render(
      <Tree
        label="Units"
        items={loading({ loading: true })}
        defaultExpanded={new Set(['design'])}
      />,
    )

    const branch = item('Design')
    expect(branch).toHaveAttribute('aria-busy', 'true')
    const group = within(branch).getByRole('group')
    expect(within(group).queryAllByRole('treeitem')).toHaveLength(0)
    expect(within(group).getByRole('status')).toHaveTextContent('Loading')
    // The words beside the Spinner are for the eye: the status has said them.
    expect(within(group).getByText('Loading', { selector: '[aria-hidden="true"]' })).toBeVisible()
    expect(group.querySelector('[data-busy]')).not.toBeNull()
  })

  it('draws nothing for a closed branch that is loading', () => {
    render(<Tree label="Units" items={loading({ loading: true })} />)
    expect(item('Design')).not.toHaveAttribute('aria-busy')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('draws the top level’s busy row, and says the tree is busy', () => {
    render(<Tree label="Units" items={UNITS} loading />)
    expect(tree()).toHaveAttribute('aria-busy', 'true')
    const status = screen.getByRole('status')
    expect(status.closest('li')?.parentElement).toBe(tree())
    expect(status.closest('li')).toHaveAttribute('role', 'none')
  })

  it('makes the row that asks for more the busy row, with the same element', () => {
    const { rerender } = render(<Tree label="Units" items={UNITS} hasMore />)
    const more = item('Load more')
    expect(more).toHaveAttribute('data-tree-part', 'more')
    expect(more).not.toHaveAttribute('aria-busy')
    expect(within(more).queryByRole('status')).toBeNull()

    rerender(<Tree label="Units" items={UNITS} hasMore loading />)
    expect(item('Loading')).toBe(more)
    expect(more).toHaveAttribute('aria-busy', 'true')
    expect(rowOf(more)).toHaveAttribute('data-busy')
    // One busy row, not two.
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('says the strings a host passes', () => {
    const messages = { loading: 'Chargement', loadMore: 'Afficher plus' }
    const { rerender } = render(<Tree label="Units" items={UNITS} hasMore messages={messages} />)
    expect(item('Afficher plus')).toBeInTheDocument()

    rerender(<Tree label="Units" items={UNITS} loading messages={messages} />)
    expect(screen.getByRole('status')).toHaveTextContent('Chargement')
    expect(screen.queryByText('Loading')).toBeNull()
  })
})

describe('Tree — what the keys leave alone', () => {
  it('leaves a key with Alt, Control or Meta to the browser', async () => {
    const onExpandedChange = vi.fn()
    render(<Tree label="Units" items={UNITS} onExpandedChange={onExpandedChange} />)
    item('Engineering').focus()

    const seen: boolean[] = []
    const watch = (event: KeyboardEvent) => seen.push(event.defaultPrevented)
    document.addEventListener('keydown', watch)
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}')
    await userEvent.keyboard('{Control>}{Home}{/Control}')
    document.removeEventListener('keydown', watch)

    expect(onExpandedChange).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(item('Engineering'))
    expect(seen.some(Boolean)).toBe(false)
  })

  it('takes its own keys from the page, at an edge too', async () => {
    render(<Tree label="Units" items={UNITS} />)
    item('Sales').focus()

    const seen: boolean[] = []
    const watch = (event: KeyboardEvent) => seen.push(event.defaultPrevented)
    document.addEventListener('keydown', watch)
    // The last row has no next row, and the page still does not scroll.
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard(' ')
    document.removeEventListener('keydown', watch)

    expect(seen).toEqual([true, true])
    expect(document.activeElement).toBe(item('Sales'))
  })

  it('leaves every other key alone', async () => {
    const onChange = vi.fn()
    render(<Tree label="Units" items={UNITS} onChange={onChange} />)
    item('Engineering').focus()

    const seen: boolean[] = []
    const watch = (event: KeyboardEvent) => seen.push(event.defaultPrevented)
    document.addEventListener('keydown', watch)
    await userEvent.keyboard('s')
    document.removeEventListener('keydown', watch)

    // No type-ahead: a letter moves nothing and selects nothing.
    expect(seen).toEqual([false])
    expect(document.activeElement).toBe(item('Engineering'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Tree — what is drawn', () => {
  const px = (value: string) => Number.parseFloat(value)

  it('indents a row by its level and spans the tree’s width at every level', () => {
    render(<Tree label="Units" items={UNITS} defaultExpanded={OPEN} />)

    const top = rowOf(item('Engineering'))
    const under = rowOf(item('Platform'))
    expect(px(getComputedStyle(top).paddingInlineStart)).toBe(0)
    expect(px(getComputedStyle(under).paddingInlineStart)).toBeGreaterThan(0)
    expect(under.getBoundingClientRect().width).toBe(top.getBoundingClientRect().width)
    expect(under.getBoundingClientRect().width).toBe(tree().getBoundingClientRect().width)
  })

  it('aligns a leaf’s label with a branch’s at the same level', () => {
    render(<Tree label="Units" items={UNITS} defaultExpanded={OPEN} />)
    const left = (name: string) => screen.getByText(name).getBoundingClientRect().left
    expect(left('Sales')).toBe(left('Design'))
    expect(left('Applications')).toBe(left('Platform'))
    expect(left('Platform')).toBeGreaterThan(left('Design'))
  })

  it('gives a one-line row, and its chevron, the smallest target', () => {
    render(<Tree label="Units" items={UNITS} />)
    const row = rowOf(item('Engineering'))
    const chevron = row.querySelector('[data-tree-part="toggle"]') as HTMLElement
    const floor = px(
      getComputedStyle(document.documentElement).getPropertyValue('--pm-control-height-sm'),
    )
    expect(floor).toBeGreaterThan(0)
    expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(floor)
    expect(chevron.getBoundingClientRect().height).toBe(row.getBoundingClientRect().height)
    expect(chevron.getBoundingClientRect().width).toBe(floor)
  })

  it('turns an open branch’s chevron and leaves a closed one', () => {
    render(<Tree label="Units" items={UNITS} defaultExpanded={OPEN} />)
    const turn = (name: string) => {
      const chevron = rowOf(item(name)).querySelector('[data-tree-part="toggle"] > span')
      return getComputedStyle(chevron as HTMLElement).transform
    }
    expect(turn('Design')).toBe('none')
    expect(turn('Engineering')).not.toBe('none')
  })

  it('mirrors a closed branch’s chevron where the page reads right to left', () => {
    document.documentElement.setAttribute('dir', 'rtl')
    render(<Tree label="Units" items={UNITS} />)
    const chevron = rowOf(item('Design')).querySelector('[data-tree-part="toggle"] > span')
    expect(getComputedStyle(chevron as HTMLElement).transform).toBe('matrix(-1, 0, 0, 1, 0, 0)')
  })

  it('fills the selected row with the selected surface, and no other row', () => {
    render(<Tree label="Units" items={UNITS} defaultExpanded={OPEN} defaultValue="platform" />)
    const probe = document.createElement('div')
    probe.style.background = 'var(--pm-selection-surface)'
    document.body.append(probe)
    const surface = getComputedStyle(probe).backgroundColor
    probe.remove()

    expect(getComputedStyle(rowOf(item('Platform'))).backgroundColor).toBe(surface)
    expect(getComputedStyle(rowOf(item('Sales'))).backgroundColor).not.toBe(surface)
    // The item holds its group too, so the fill is the row's.
    expect(getComputedStyle(item('Platform')).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  })

  it('draws the focus ring on the row, inside its edge, when focus came from the keyboard', async () => {
    render(<Tree label="Units" items={UNITS} defaultExpanded={OPEN} />)
    item('Engineering').focus()
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(document.activeElement).toBe(item('Platform')))

    const row = getComputedStyle(rowOf(item('Platform')))
    expect(row.outlineStyle).toBe('solid')
    expect(px(row.outlineWidth)).toBeGreaterThan(0)
    expect(px(row.outlineOffset)).toBe(-px(row.outlineWidth))
    // The item draws none: it holds the rows under it.
    expect(getComputedStyle(item('Platform')).outlineStyle).toBe('none')
    expect(getComputedStyle(rowOf(item('Engineering'))).outlineStyle).toBe('none')
  })

  it('wraps a long label inside a narrow column', () => {
    const long = 'Infrastructure-and-developer-experience-engineering-for-the-European-region'
    render(
      <div style={{ inlineSize: 160 }}>
        <Tree label="Units" items={[{ id: 'long', label: long, description: long }]} />
      </div>,
    )
    expect(tree().scrollWidth).toBeLessThanOrEqual(tree().clientWidth)
    expect(tree().getBoundingClientRect().width).toBeLessThanOrEqual(160)
    expect(rowOf(item(long)).getBoundingClientRect().height).toBeGreaterThan(
      px(getComputedStyle(document.documentElement).getPropertyValue('--pm-control-height-sm')),
    )
  })

  it('dims a disabled row and answers no pointer on it', async () => {
    const onChange = vi.fn()
    render(
      <Tree
        label="Units"
        items={[{ id: 'legal', label: 'Legal', disabled: true }, ...UNITS]}
        onChange={onChange}
      />,
    )
    const disabled = item('Legal')
    expect(disabled).toHaveAttribute('data-disabled')
    expect(getComputedStyle(rowOf(disabled)).cursor).toBe('not-allowed')
    expect(getComputedStyle(screen.getByText('Legal')).color).not.toBe(
      getComputedStyle(screen.getByText('Sales')).color,
    )
    await frames()
    expect(disabled).not.toHaveAttribute('tabindex')
  })
})

/**
 * An agent selects, opens and closes through the bridge, as the spec's `agent` fence declares
 * (`design/components/tree.md`, Agent). Its choices are the items a reader can see.
 */
describe('an agent', () => {
  it('opens a branch before it selects what the branch holds, in either form', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      const onExpandedChange = vi.fn()
      function Held() {
        const [value, setValue] = useState<string | null>(null)
        return (
          <Tree
            label="Held units"
            items={UNITS}
            value={value}
            onChange={(id) => {
              onChange(id)
              setValue(id)
            }}
            onExpandedChange={onExpandedChange}
          />
        )
      }
      render(<Held />)
      const [units] = bridge.snapshot().members
      expect(units).toMatchObject({
        member: 'Tree',
        name: 'Held units',
        state: {
          value: null,
          expanded: [],
          items: [
            { id: 'engineering', label: 'Engineering' },
            { id: 'design', label: 'Design' },
            { id: 'sales', label: 'Sales' },
          ],
          loading: false,
        },
      })

      // An item inside a closed branch is not a choice.
      const hidden = await bridge.act([{ id: units?.id, action: 'choose', value: 'applications' }])
      expect(hidden.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })

      const opened = await bridge.act([{ id: units?.id, action: 'expand', value: 'engineering' }])
      expect(opened.results[0]).toMatchObject({
        ok: true,
        changed: { expanded: { from: [], to: ['engineering'] } },
      })
      expect(onExpandedChange).toHaveBeenCalledTimes(1)
      expect(item('Engineering').getAttribute('aria-expanded')).toBe('true')

      const chosen = await bridge.act([{ id: units?.id, action: 'choose', value: 'applications' }])
      expect(chosen.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: null, to: 'applications' } },
      })
      expect(onChange).toHaveBeenLastCalledWith('applications')
      expect(item('Applications').getAttribute('aria-selected')).toBe('true')

      // A leaf neither opens nor closes.
      const leaf = await bridge.act([{ id: units?.id, action: 'expand', value: 'sales' }])
      expect(leaf.results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })

      const closed = await bridge.act([{ id: units?.id, action: 'collapse', value: 'engineering' }])
      expect(closed.results[0]).toMatchObject({
        ok: true,
        changed: { expanded: { from: ['engineering'], to: [] } },
      })
      expect(onExpandedChange).toHaveBeenCalledTimes(2)
    } finally {
      bridge.dispose()
    }
  })

  it('keeps a controlled selection on the value its caller passes back', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <Tree
          label="Units"
          items={UNITS}
          defaultExpanded={OPEN}
          value={null}
          onChange={onChange}
        />,
      )
      const [units] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: units?.id, action: 'choose', value: 'sales' }])
      expect(results[0]).toEqual({ ok: true, id: units?.id, changed: {} })
      expect(onChange).toHaveBeenCalledWith('sales')
      expect(item('Sales').getAttribute('aria-selected')).toBe('false')
    } finally {
      bridge.dispose()
    }
  })
})
