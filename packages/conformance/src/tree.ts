import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for Tree's keyboard model, its selection, who holds its open
 * branches, and where focus is when a level arrives
 * (`design/components/tree.md`), which every web shell's Tree test calls with
 * a mount of its own. A contract statement starts from a fixture entry and
 * changes no prop (`docs/conformance.md`), so the law changes the tree's props
 * itself, as the application around it would when it loads a level.
 *
 * The tree keeps its model in the document: one `tabindex="0"`, set after each
 * render, and focus moved to a new row when the row that had it is replaced. A
 * shell that rendered `tabindex`, or that set it once at mount, passes a test of
 * a tree that never changes. The law changes the tree under the reader.
 *
 * The law focuses a row from a script and reads `document.activeElement`,
 * because Tab does not stop on every element in WebKit. It waits for each
 * reading, because a shell commits a change a moment after the event, and the
 * tree moves focus after the commit.
 */

/** An item as the law passes it, in the shape of the member's `TreeItem`. */
export interface TreeLawItem {
  id: string
  label: string
  description?: string
  children?: TreeLawItem[]
  hasChildren?: boolean
  loading?: boolean
  hasMore?: boolean
  disabled?: boolean
}

/** What the law sets on the tree after it mounts. */
export interface TreeLawProps {
  items: TreeLawItem[]
  /** The open branches, while the application holds them. `undefined` hands them to the tree. */
  expanded: ReadonlySet<string> | undefined
  /** The selected item, while the application holds it. `undefined` hands it to the tree. */
  value: string | null | undefined
  loading: boolean
  hasMore: boolean
}

export interface TreeLawMount {
  /** The props the tree mounts with. */
  readonly props: TreeLawProps
  readonly defaultExpanded: ReadonlySet<string> | undefined
  readonly defaultValue: string | undefined
  /** The tree's three handlers. */
  readonly onChange: (id: string) => void
  readonly onExpandedChange: (next: ReadonlySet<string>) => void
  readonly onLoadMore: (parentId: string | null) => void
}

export interface MountedTree {
  /** Sets props on the tree, as its parent's state would. */
  set(next: Partial<TreeLawProps>): void | Promise<void>
}

export interface TreeLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * The member that draws the tree, when it is not Tree: `TreeSelect`, whose
   * popup holds a Tree and closes when a node is chosen. The cases that select
   * an item, and the one that moves focus out of the tree, then do not run,
   * because a choice or focus elsewhere closes the popup and takes the tree
   * away. That member's own law states what a choice does there.
   */
  readonly within?: string
  /** Mounts a Tree labelled `Units` with the props and handlers given, with the tree drawn. */
  mount(options: TreeLawMount): Promise<MountedTree>
}

/**
 * Engineering holds three items, and the first is a branch the application has
 * not loaded. Design is one too. Legal is disabled, between two enabled items.
 */
const units = (
  engineering: Partial<TreeLawItem> = {},
  design: Partial<TreeLawItem> = {},
): TreeLawItem[] => [
  {
    id: 'engineering',
    label: 'Engineering',
    children: [
      { id: 'platform', label: 'Platform', hasChildren: true },
      { id: 'applications', label: 'Applications' },
      { id: 'data', label: 'Data' },
    ],
    ...engineering,
  },
  { id: 'design', label: 'Design', hasChildren: true, ...design },
  { id: 'legal', label: 'Legal', disabled: true },
  { id: 'sales', label: 'Sales' },
]

/** What Design holds once the application has loaded it. */
const DESIGN = [
  { id: 'brand', label: 'Brand' },
  { id: 'research', label: 'Research' },
]

const tree = () => document.querySelector<HTMLElement>('[role="tree"]') as HTMLElement

/** An item of the tree as it is drawn now: a shell may draw a row again as a new element. */
const item = (id: string) =>
  document.querySelector<HTMLElement>(`[data-tree-item="${id}"]`) as HTMLElement

/** The row that asks for more of a level: a branch's, or the top level's with `null`. */
const more = (parent: string | null) =>
  (parent === null ? tree() : item(parent)).querySelector<HTMLElement>(
    parent === null
      ? ':scope > [data-tree-part="more"]'
      : ':scope > [role="group"] > [data-tree-part="more"]',
  ) as HTMLElement

/** A row's own row part, where a press selects. */
const rowOf = (element: HTMLElement) =>
  element.querySelector<HTMLElement>(':scope > [data-tree-part="row"]') as HTMLElement

const chevron = (id: string) =>
  rowOf(item(id)).querySelector<HTMLElement>('[data-tree-part="toggle"]') as HTMLElement

/** What has focus, as an item's id, `more` for a row that asks, or `null` outside the tree. */
function focused(): string | null {
  const active = document.activeElement
  if (active === null || !tree().contains(active)) return null
  return active.getAttribute('data-tree-item') ?? active.getAttribute('data-tree-part')
}

/** The ids of the rows with `tabindex="0"`. */
const stops = () =>
  [...tree().querySelectorAll('[role="treeitem"][tabindex="0"]')].map(
    (row) => row.getAttribute('data-tree-item') ?? row.getAttribute('data-tree-part'),
  )

/** Two frames, in which a tree that moves focus after a change has moved it. */
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

export function treeLaw({ shell, within, mount }: TreeLaw): void {
  // A case that selects an item or leaves the tree, which runs where the tree is the member.
  const pane = it.runIf(within === undefined)
  const title =
    within === undefined
      ? `${shell} Tree — keys, selection, open branches and focus as levels arrive`
      : `${shell} ${within} — Tree's keys, open branches and focus as levels arrive`
  describe(title, () => {
    beforeAll(installTestTheme)

    let fields: HTMLElement[] = []

    afterEach(() => {
      for (const field of fields) field.remove()
      fields = []
      document.documentElement.removeAttribute('dir')
    })

    /** A text field of the page around the tree, at the end of the body. */
    function field(): HTMLInputElement {
      const input = document.createElement('input')
      input.setAttribute('aria-label', 'After')
      document.body.append(input)
      fields.push(input)
      return input
    }

    /** The tree, with a spy in each handler, and the application's `set`. */
    async function units_({
      props = {},
      defaultExpanded,
      defaultValue,
    }: {
      props?: Partial<TreeLawProps>
      defaultExpanded?: ReadonlySet<string>
      defaultValue?: string
    } = {}) {
      const onChange = vi.fn<(id: string) => void>()
      const onExpandedChange = vi.fn<(next: ReadonlySet<string>) => void>()
      const onLoadMore = vi.fn<(parentId: string | null) => void>()
      const mounted = await mount({
        props: {
          items: units(),
          expanded: undefined,
          value: undefined,
          loading: false,
          hasMore: false,
          ...props,
        },
        defaultExpanded,
        defaultValue,
        onChange,
        onExpandedChange,
        onLoadMore,
      })
      // The tree sets its tab stop after it mounts.
      await vi.waitFor(() => expect(stops()).toHaveLength(1))
      return { set: mounted.set.bind(mounted), onChange, onExpandedChange, onLoadMore }
    }

    /** Focuses a row from a script, as a press or Tab would leave it. */
    async function focus(row: HTMLElement) {
      row.focus()
      await vi.waitFor(() => expect(document.activeElement).toBe(row))
    }

    const key = async (name: string) => {
      await userEvent.keyboard(`{${name}}`)
    }

    const OPEN = new Set(['engineering'])

    /* ---------------------------------------------------------------------- */
    /* One tab stop                                                           */
    /* ---------------------------------------------------------------------- */

    it('has one tab stop, on the first row, and none on a disabled item', async () => {
      await units_({ defaultExpanded: OPEN })
      expect(stops()).toEqual(['engineering'])
      expect(item('platform').getAttribute('tabindex')).toBe('-1')
      expect(item('sales').getAttribute('tabindex')).toBe('-1')
      expect(item('legal').hasAttribute('tabindex')).toBe(false)
    })

    it('puts the tab stop on the selected item until focus has been in the tree', async () => {
      await units_({ defaultExpanded: OPEN, defaultValue: 'applications' })
      expect(stops()).toEqual(['applications'])
    })

    it('moves the tab stop with focus, and keeps one when rows are drawn again', async () => {
      const { set } = await units_({ defaultExpanded: OPEN })
      await focus(item('data'))
      await vi.waitFor(() => expect(stops()).toEqual(['data']))

      // The application passes the same items again, as a refetch does.
      await set({ items: units() })
      await frames()
      expect(stops()).toEqual(['data'])
      expect(focused()).toBe('data')
    })

    /* ---------------------------------------------------------------------- */
    /* The keys                                                               */
    /* ---------------------------------------------------------------------- */

    it('moves through the rows that are drawn with ArrowDown and ArrowUp, and stops at each end', async () => {
      await units_({ defaultExpanded: OPEN })
      await focus(item('engineering'))

      const down = ['platform', 'applications', 'data', 'design', 'sales', 'sales']
      for (const id of down) {
        await key('ArrowDown')
        await vi.waitFor(() => expect(focused()).toBe(id))
      }
      // Legal is disabled, so the keys passed over it in both directions.
      const up = ['design', 'data', 'applications', 'platform', 'engineering', 'engineering']
      for (const id of up) {
        await key('ArrowUp')
        await vi.waitFor(() => expect(focused()).toBe(id))
      }
      expect(stops()).toEqual(['engineering'])
    })

    it('passes over the rows of a closed branch', async () => {
      await units_()
      await focus(item('engineering'))
      await key('ArrowDown')
      await vi.waitFor(() => expect(focused()).toBe('design'))
    })

    it('moves to the first row with Home and the last with End', async () => {
      await units_({ defaultExpanded: OPEN })
      await focus(item('applications'))
      await key('End')
      await vi.waitFor(() => expect(focused()).toBe('sales'))
      await key('Home')
      await vi.waitFor(() => expect(focused()).toBe('engineering'))
    })

    it('opens a closed branch with ArrowRight, then moves to its first row', async () => {
      const { onExpandedChange } = await units_()
      await focus(item('engineering'))

      await key('ArrowRight')
      await vi.waitFor(() => expect(item('engineering').getAttribute('aria-expanded')).toBe('true'))
      expect(focused()).toBe('engineering')
      expect(onExpandedChange).toHaveBeenCalledTimes(1)
      expect([...(onExpandedChange.mock.calls[0]?.[0] ?? [])]).toEqual(['engineering'])

      await key('ArrowRight')
      await vi.waitFor(() => expect(focused()).toBe('platform'))
      expect(onExpandedChange).toHaveBeenCalledTimes(1)
    })

    it('does nothing with ArrowRight on a leaf', async () => {
      const { onExpandedChange, onChange } = await units_({ defaultExpanded: OPEN })
      await focus(item('applications'))
      await key('ArrowRight')
      await frames()
      expect(focused()).toBe('applications')
      expect(onExpandedChange).not.toHaveBeenCalled()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('moves to the branch a row sits under with ArrowLeft, then closes the branch', async () => {
      const { onExpandedChange } = await units_({ defaultExpanded: OPEN })
      await focus(item('data'))

      await key('ArrowLeft')
      await vi.waitFor(() => expect(focused()).toBe('engineering'))
      expect(onExpandedChange).not.toHaveBeenCalled()

      await key('ArrowLeft')
      await vi.waitFor(() =>
        expect(item('engineering').getAttribute('aria-expanded')).toBe('false'),
      )
      expect(focused()).toBe('engineering')
      expect([...(onExpandedChange.mock.calls[0]?.[0] ?? [])]).toEqual([])

      // A closed branch at the top level has nowhere to go.
      await key('ArrowLeft')
      await frames()
      expect(focused()).toBe('engineering')
      expect(onExpandedChange).toHaveBeenCalledTimes(1)
    })

    it('swaps ArrowLeft and ArrowRight where the page reads right to left', async () => {
      document.documentElement.setAttribute('dir', 'rtl')
      await units_()
      await focus(item('engineering'))

      await key('ArrowRight')
      await frames()
      expect(item('engineering').getAttribute('aria-expanded')).toBe('false')

      await key('ArrowLeft')
      await vi.waitFor(() => expect(item('engineering').getAttribute('aria-expanded')).toBe('true'))
      await key('ArrowLeft')
      await vi.waitFor(() => expect(focused()).toBe('platform'))
      await key('ArrowRight')
      await vi.waitFor(() => expect(focused()).toBe('engineering'))
      await key('ArrowRight')
      await vi.waitFor(() =>
        expect(item('engineering').getAttribute('aria-expanded')).toBe('false'),
      )
    })

    /* ---------------------------------------------------------------------- */
    /* Selection                                                              */
    /* ---------------------------------------------------------------------- */

    pane('selects with Enter and with Space, and not with an arrow key', async () => {
      const { onChange } = await units_({ defaultExpanded: OPEN })
      await focus(item('engineering'))

      await key('ArrowDown')
      await vi.waitFor(() => expect(focused()).toBe('platform'))
      expect(onChange).not.toHaveBeenCalled()
      expect(item('platform').getAttribute('aria-selected')).toBe('false')

      await key('Enter')
      await vi.waitFor(() => expect(item('platform').getAttribute('aria-selected')).toBe('true'))
      expect(onChange).toHaveBeenLastCalledWith('platform')

      await key('ArrowDown')
      await vi.waitFor(() => expect(focused()).toBe('applications'))
      await userEvent.keyboard(' ')
      await vi.waitFor(() =>
        expect(item('applications').getAttribute('aria-selected')).toBe('true'),
      )
      expect(item('platform').getAttribute('aria-selected')).toBe('false')
      expect(onChange).toHaveBeenLastCalledWith('applications')
      expect(onChange).toHaveBeenCalledTimes(2)

      // Selecting the selected item again reports nothing.
      await key('Enter')
      await frames()
      expect(onChange).toHaveBeenCalledTimes(2)
    })

    pane('selects on a press on the row and opens nothing', async () => {
      const { onChange, onExpandedChange } = await units_()
      await userEvent.click(rowOf(item('engineering')))
      await vi.waitFor(() => expect(item('engineering').getAttribute('aria-selected')).toBe('true'))
      expect(onChange).toHaveBeenCalledWith('engineering')
      expect(onExpandedChange).not.toHaveBeenCalled()
      expect(item('engineering').getAttribute('aria-expanded')).toBe('false')
      // The press left focus, and the tab stop, on the row.
      await vi.waitFor(() => expect(stops()).toEqual(['engineering']))
    })

    it('opens and closes on a press on the chevron and selects nothing', async () => {
      const { onChange, onExpandedChange } = await units_()
      await userEvent.click(chevron('engineering'))
      await vi.waitFor(() => expect(item('engineering').getAttribute('aria-expanded')).toBe('true'))
      expect(item('engineering').getAttribute('aria-selected')).toBe('false')

      await userEvent.click(chevron('engineering'))
      await vi.waitFor(() =>
        expect(item('engineering').getAttribute('aria-expanded')).toBe('false'),
      )
      expect(onExpandedChange).toHaveBeenCalledTimes(2)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('takes no press and no selection on a disabled item, and draws a disabled branch closed', async () => {
      const { onChange, onExpandedChange } = await units_({
        props: { items: units({ disabled: true }) },
        defaultExpanded: OPEN,
        defaultValue: 'engineering',
      })
      const disabled = item('engineering')
      expect(disabled.getAttribute('aria-disabled')).toBe('true')
      expect(disabled.hasAttribute('aria-selected')).toBe(false)
      expect(disabled.getAttribute('aria-expanded')).toBe('false')
      expect(disabled.querySelector('[role="group"]')).toBeNull()

      // A dispatched click, because the pointer harness waits for an element
      // that says it is disabled to stop saying so.
      rowOf(disabled).dispatchEvent(new MouseEvent('click', { bubbles: true }))
      chevron('engineering').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await frames()
      expect(onChange).not.toHaveBeenCalled()
      expect(onExpandedChange).not.toHaveBeenCalled()
      // The stop is on the first row the keys reach.
      expect(stops()).toEqual(['design'])
    })

    pane(
      'shows the selection the application holds, and reports a pick without making it',
      async () => {
        const { set, onChange } = await units_({
          props: { value: 'applications' },
          defaultExpanded: OPEN,
        })
        expect(item('applications').getAttribute('aria-selected')).toBe('true')

        await focus(item('data'))
        await key('Enter')
        await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('data'))
        await frames()
        expect(item('applications').getAttribute('aria-selected')).toBe('true')
        expect(item('data').getAttribute('aria-selected')).toBe('false')

        await set({ value: 'data' })
        await vi.waitFor(() => expect(item('data').getAttribute('aria-selected')).toBe('true'))

        // `null` selects nothing.
        await set({ value: null })
        await vi.waitFor(() => expect(item('data').getAttribute('aria-selected')).toBe('false'))
        expect(tree().querySelector('[aria-selected="true"]')).toBeNull()
      },
    )

    /* ---------------------------------------------------------------------- */
    /* Who holds the open branches                                            */
    /* ---------------------------------------------------------------------- */

    it('holds the open branches itself from `defaultExpanded`', async () => {
      const { onExpandedChange } = await units_({ defaultExpanded: OPEN })
      expect(item('engineering').getAttribute('aria-expanded')).toBe('true')
      expect(item('design').getAttribute('aria-expanded')).toBe('false')
      // A leaf says nothing about expansion.
      expect(item('sales').hasAttribute('aria-expanded')).toBe(false)

      await userEvent.click(chevron('design'))
      await vi.waitFor(() => expect(item('design').getAttribute('aria-expanded')).toBe('true'))
      expect([...(onExpandedChange.mock.calls[0]?.[0] ?? [])].sort()).toEqual([
        'design',
        'engineering',
      ])
    })

    it('shows the branches the application holds, and reports a change without making it', async () => {
      const { set, onExpandedChange } = await units_({ props: { expanded: OPEN } })
      expect(item('engineering').getAttribute('aria-expanded')).toBe('true')

      await focus(item('engineering'))
      await key('ArrowLeft')
      await vi.waitFor(() => expect(onExpandedChange).toHaveBeenCalledTimes(1))
      expect([...(onExpandedChange.mock.calls[0]?.[0] ?? [])]).toEqual([])
      await frames()
      expect(item('engineering').getAttribute('aria-expanded')).toBe('true')

      await set({ expanded: new Set() })
      await vi.waitFor(() =>
        expect(item('engineering').getAttribute('aria-expanded')).toBe('false'),
      )
    })

    it('finds the branches as the last change left them when the application stops holding them', async () => {
      const { set } = await units_({ props: { expanded: OPEN } })
      // The reader opens Design. The application holds the set and does not change it.
      await userEvent.click(chevron('design'))
      await frames()
      expect(item('design').getAttribute('aria-expanded')).toBe('false')

      // The application stops passing the set: the tree's own followed the change.
      await set({ expanded: undefined })
      await vi.waitFor(() => expect(item('design').getAttribute('aria-expanded')).toBe('true'))
      expect(item('engineering').getAttribute('aria-expanded')).toBe('true')

      // And the tree holds it from here.
      await userEvent.click(chevron('engineering'))
      await vi.waitFor(() =>
        expect(item('engineering').getAttribute('aria-expanded')).toBe('false'),
      )
    })

    /* ---------------------------------------------------------------------- */
    /* A level the application loads                                          */
    /* ---------------------------------------------------------------------- */

    it('keeps focus on a branch while its level loads and when it arrives', async () => {
      const { set } = await units_()
      await focus(item('design'))
      await key('ArrowRight')
      await vi.waitFor(() => expect(item('design').getAttribute('aria-expanded')).toBe('true'))
      // Open onto nothing: the application has passed no level.
      expect(item('design').querySelector('[role="group"]')).toBeNull()

      await set({ items: units({}, { loading: true }) })
      await vi.waitFor(() => expect(item('design').getAttribute('aria-busy')).toBe('true'))
      // The busy row is no item: the keys do not reach it.
      expect(item('design').querySelectorAll('[role="treeitem"]')).toHaveLength(0)
      expect(item('design').querySelector('[role="status"]')).not.toBeNull()
      await key('ArrowRight')
      await frames()
      expect(focused()).toBe('design')

      await set({ items: units({}, { children: DESIGN }) })
      await vi.waitFor(() => expect(item('brand')).not.toBeNull())
      await frames()
      expect(item('design').hasAttribute('aria-busy')).toBe(false)
      expect(focused()).toBe('design')
      expect(stops()).toEqual(['design'])

      // The level is there for the keys.
      await key('ArrowRight')
      await vi.waitFor(() => expect(focused()).toBe('brand'))
      await key('ArrowDown')
      await vi.waitFor(() => expect(focused()).toBe('research'))
      await key('ArrowDown')
      await vi.waitFor(() => expect(focused()).toBe('sales'))
    })

    /* ---------------------------------------------------------------------- */
    /* More of a level                                                        */
    /* ---------------------------------------------------------------------- */

    /** Engineering with two more items than it has at first. */
    const grown = (engineering: Partial<TreeLawItem> = {}) =>
      units({
        children: [
          ...(units()[0]?.children ?? []),
          { id: 'security', label: 'Security' },
          { id: 'support', label: 'Support' },
        ],
        ...engineering,
      })

    it('asks for more of a branch’s level with Enter and with Space on its last row', async () => {
      const { onLoadMore, onChange } = await units_({
        props: { items: units({ hasMore: true }) },
        defaultExpanded: OPEN,
      })
      // The row that asks is a row: ArrowDown reaches it after the level's items.
      await focus(item('data'))
      await key('ArrowDown')
      await vi.waitFor(() => expect(document.activeElement).toBe(more('engineering')))
      // It is a row that is never selected, and Enter on it selects nothing.
      expect(more('engineering').getAttribute('aria-selected')).toBe('false')

      await key('Enter')
      await vi.waitFor(() => expect(onLoadMore).toHaveBeenLastCalledWith('engineering'))
      await userEvent.keyboard(' ')
      await vi.waitFor(() => expect(onLoadMore).toHaveBeenCalledTimes(2))
      expect(onChange).not.toHaveBeenCalled()
    })

    it('asks for more of the top level with `null`, on a press', async () => {
      const { onLoadMore } = await units_({ props: { hasMore: true } })
      await userEvent.click(rowOf(more(null)))
      await vi.waitFor(() => expect(onLoadMore).toHaveBeenLastCalledWith(null))
    })

    it('keeps focus on the row that asks while its level loads, and asks for nothing more', async () => {
      const { set, onLoadMore } = await units_({
        props: { items: units({ hasMore: true }) },
        defaultExpanded: OPEN,
      })
      await focus(more('engineering'))
      await key('Enter')
      await vi.waitFor(() => expect(onLoadMore).toHaveBeenCalledTimes(1))

      await set({ items: units({ hasMore: true, loading: true }) })
      await vi.waitFor(() => expect(more('engineering').getAttribute('aria-busy')).toBe('true'))
      await frames()
      expect(document.activeElement).toBe(more('engineering'))

      await key('Enter')
      await userEvent.click(rowOf(more('engineering')))
      await frames()
      expect(onLoadMore).toHaveBeenCalledTimes(1)
    })

    it('moves focus to the first new row when the rows replace the row that asked', async () => {
      const { set, onLoadMore } = await units_({
        props: { items: units({ hasMore: true }) },
        defaultExpanded: OPEN,
      })
      await focus(more('engineering'))
      await key('Enter')
      await vi.waitFor(() => expect(onLoadMore).toHaveBeenCalledTimes(1))
      await set({ items: units({ hasMore: true, loading: true }) })
      await vi.waitFor(() => expect(more('engineering').getAttribute('aria-busy')).toBe('true'))

      // The level is whole now, so the row that asked is gone.
      await set({ items: grown() })
      await vi.waitFor(() => expect(focused()).toBe('security'))
      expect(more('engineering')).toBeNull()
      expect(stops()).toEqual(['security'])
    })

    it('moves focus to the first new row when the level still has more', async () => {
      const { set, onLoadMore } = await units_({
        props: { items: units({ hasMore: true }) },
        defaultExpanded: OPEN,
      })
      await focus(more('engineering'))
      await key('Enter')
      await vi.waitFor(() => expect(onLoadMore).toHaveBeenCalledTimes(1))

      await set({ items: grown({ hasMore: true }) })
      await vi.waitFor(() => expect(focused()).toBe('security'))
      expect(more('engineering')).not.toBeNull()
      expect(stops()).toEqual(['security'])
    })

    it('moves focus to the first new row of the top level', async () => {
      const { set, onLoadMore } = await units_({ props: { hasMore: true } })
      await focus(more(null))
      await key('Enter')
      await vi.waitFor(() => expect(onLoadMore).toHaveBeenLastCalledWith(null))

      await set({ items: [...units(), { id: 'support', label: 'Support' }], hasMore: false })
      await vi.waitFor(() => expect(focused()).toBe('support'))
    })

    it('leaves focus where the reader moved it before the rows arrived', async () => {
      const { set, onLoadMore } = await units_({
        props: { items: units({ hasMore: true }) },
        defaultExpanded: OPEN,
      })
      await focus(more('engineering'))
      await key('Enter')
      await vi.waitFor(() => expect(onLoadMore).toHaveBeenCalledTimes(1))
      await key('ArrowUp')
      await vi.waitFor(() => expect(focused()).toBe('data'))

      await set({ items: grown() })
      await vi.waitFor(() => expect(item('security')).not.toBeNull())
      await frames()
      expect(focused()).toBe('data')
    })

    pane('takes no focus when the rows arrive after the reader left the tree', async () => {
      const after = field()
      const { set, onLoadMore } = await units_({
        props: { items: units({ hasMore: true }) },
        defaultExpanded: OPEN,
      })
      await focus(more('engineering'))
      await key('Enter')
      await vi.waitFor(() => expect(onLoadMore).toHaveBeenCalledTimes(1))
      await focus(after)

      await set({ items: grown() })
      await vi.waitFor(() => expect(item('security')).not.toBeNull())
      await frames()
      expect(document.activeElement).toBe(after)
      // The stop is where the reader left it, or on the first row when that row is gone.
      expect(stops()).toHaveLength(1)
    })

    it('keeps focus in the tree when the row that has it leaves', async () => {
      const { set } = await units_({ props: { expanded: OPEN } })
      await focus(item('applications'))

      // The application closes the branch the focused row sits under.
      await set({ expanded: new Set() })
      await vi.waitFor(() => expect(focused()).toBe('engineering'))
      expect(stops()).toEqual(['engineering'])
    })
  })
}
