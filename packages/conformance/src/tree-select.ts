import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { treeLaw, type TreeLawItem } from './tree'

/**
 * The law for TreeSelect (`design/components/tree-select.md`), which every web
 * shell's TreeSelect test calls with a mount of its own.
 *
 * The popup holds the Tree member, so Tree's keys, its open branches and focus
 * as a level arrives are Tree's law, run here against the tree in the popup
 * (`treeLaw` with `within`). This law adds what the popup does around it: focus
 * on the chosen node once the branches above it open, a choice that closes the
 * popup and reports, the chosen node chosen again, a branch opened without
 * being chosen, Escape and Tab, the empty choice, the hidden field, and what
 * the trigger shows while the chosen node's level is not loaded.
 *
 * The law focuses a row from a script and reads `document.activeElement`,
 * because Tab does not stop on every element in WebKit. It waits for each
 * reading, because a shell commits a change a moment after the event.
 */

/** What the law sets on the TreeSelect after it mounts. */
export interface TreeSelectLawProps {
  items: TreeLawItem[]
  /** The open branches, while the application holds them. `undefined` hands them to the member. */
  expanded: ReadonlySet<string> | undefined
  /** The chosen node, while the application holds it. `undefined` hands it to the member. */
  value: string | null | undefined
  valueLabel: string | undefined
  loading: boolean
  hasMore: boolean
}

export interface TreeSelectLawMount {
  /** The props the TreeSelect mounts with. */
  readonly props: TreeSelectLawProps
  readonly defaultExpanded: ReadonlySet<string> | undefined
  readonly defaultValue: string | undefined
  readonly emptyOption: string | undefined
  readonly placeholder: string | undefined
  /** The hidden field's name. */
  readonly name: string | undefined
  readonly onChange: (id: string | null) => void
  readonly onExpandedChange: (next: ReadonlySet<string>) => void
  readonly onLoadMore: (parentId: string | null) => void
}

export interface MountedTreeSelect {
  /** Sets props on the TreeSelect, as its parent's state would. */
  set(next: Partial<TreeSelectLawProps>): void | Promise<void>
}

export interface TreeSelectLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts a closed TreeSelect with `label="Units"` and `aria-label="Move
   * under"`, the props and the handlers given, and presentation `popover`.
   */
  mount(options: TreeSelectLawMount): Promise<MountedTreeSelect>
}

/**
 * Engineering holds three items, and the first is a branch the application has
 * not loaded. Design is one too. Legal is disabled, between two enabled items.
 * Tree's law uses the same units.
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

const trigger = () =>
  document.querySelector<HTMLElement>('[role="combobox"][aria-haspopup="tree"]') as HTMLElement

const tree = () => document.querySelector<HTMLElement>('[role="tree"]')

const item = (id: string) =>
  document.querySelector<HTMLElement>(`[role="tree"] [data-tree-item="${id}"]`) as HTMLElement

const rowOf = (element: HTMLElement) =>
  element.querySelector<HTMLElement>(':scope > [data-tree-part="row"]') as HTMLElement

const chevron = (id: string) =>
  rowOf(item(id)).querySelector<HTMLElement>('[data-tree-part="toggle"]') as HTMLElement

/** The empty choice: the first top-level item, whose id the member makes. */
const first = () => tree()?.querySelector<HTMLElement>(':scope > [role="treeitem"]') as HTMLElement

/** What has focus, as an item's id, or `null` outside the tree. */
function focused(): string | null {
  const active = document.activeElement
  const root = tree()
  if (active === null || root === null || !root.contains(active)) return null
  return active.getAttribute('data-tree-item') ?? active.getAttribute('data-tree-part')
}

/** The words the trigger shows. */
const shown = () => trigger().textContent?.trim() ?? ''

const hidden = (name: string) =>
  document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)

/** Two frames, in which a member that moves focus after a change has moved it. */
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

/**
 * Opens the popup with a press on the trigger, as a reader does, and waits for
 * the tree and for focus in it.
 */
async function open() {
  // A shell may draw the trigger a moment after it mounts.
  await vi.waitFor(() => expect(trigger()).not.toBeNull())
  await userEvent.click(trigger())
  await vi.waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('true'))
  await vi.waitFor(() => expect(focused()).not.toBeNull())
}

/** The popup closed and its tree gone, after its exit. */
async function closed() {
  await vi.waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'))
  await vi.waitFor(() => expect(tree()).toBeNull())
}

const key = async (name: string) => {
  await userEvent.keyboard(`{${name}}`)
}

export function treeSelectLaw({ shell, mount }: TreeSelectLaw): void {
  // Tree's keys, open branches and levels, on the tree in the popup.
  treeLaw({
    shell,
    within: 'TreeSelect',
    async mount({ props, defaultExpanded, defaultValue, onChange, onExpandedChange, onLoadMore }) {
      const mounted = await mount({
        props: { ...props, valueLabel: undefined },
        defaultExpanded,
        defaultValue,
        emptyOption: undefined,
        placeholder: undefined,
        name: undefined,
        onChange: (id) => {
          if (id !== null) onChange(id)
        },
        onExpandedChange,
        onLoadMore,
      })
      await open()
      return { set: (next) => mounted.set(next) }
    },
  })

  describe(`${shell} TreeSelect — the popup around the tree`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      document.documentElement.removeAttribute('dir')
    })

    /** The TreeSelect, closed, with a spy in each handler, and the application's `set`. */
    async function select({
      props = {},
      defaultExpanded,
      defaultValue,
      emptyOption,
      placeholder,
      name,
    }: {
      props?: Partial<TreeSelectLawProps>
      defaultExpanded?: ReadonlySet<string>
      defaultValue?: string
      emptyOption?: string
      placeholder?: string
      name?: string
    } = {}) {
      const onChange = vi.fn<(id: string | null) => void>()
      const onExpandedChange = vi.fn<(next: ReadonlySet<string>) => void>()
      const onLoadMore = vi.fn<(parentId: string | null) => void>()
      const mounted = await mount({
        props: {
          items: units(),
          expanded: undefined,
          value: undefined,
          valueLabel: undefined,
          loading: false,
          hasMore: false,
          ...props,
        },
        defaultExpanded,
        defaultValue,
        emptyOption,
        placeholder,
        name,
        onChange,
        onExpandedChange,
        onLoadMore,
      })
      await vi.waitFor(() => expect(trigger()).not.toBeNull())
      return { set: mounted.set.bind(mounted), onChange, onExpandedChange, onLoadMore }
    }

    /* ---------------------------------------------------------------------- */
    /* Opening                                                                */
    /* ---------------------------------------------------------------------- */

    it('is a combobox that opens a tree, closed at first', async () => {
      await select({ placeholder: 'Choose a unit' })
      expect(trigger().getAttribute('aria-expanded')).toBe('false')
      expect(trigger().hasAttribute('data-placeholder')).toBe(true)
      expect(shown()).toBe('Choose a unit')
      expect(tree()).toBeNull()

      await open()
      expect(tree()?.getAttribute('aria-label')).toBe('Units')
      // The trigger names the popup it opens.
      const controls = trigger().getAttribute('aria-controls')
      expect(controls).not.toBeNull()
      expect(document.getElementById(controls ?? '')?.contains(tree())).toBe(true)
    })

    it('opens on the first row when nothing is chosen', async () => {
      await select()
      await open()
      expect(focused()).toBe('engineering')
    })

    it('opens the branches above the chosen node and puts focus on it', async () => {
      const { onExpandedChange } = await select({ defaultValue: 'data' })
      expect(shown()).toBe('Data')

      await open()
      expect(item('engineering').getAttribute('aria-expanded')).toBe('true')
      await vi.waitFor(() => expect(focused()).toBe('data'))
      expect(item('data').getAttribute('aria-selected')).toBe('true')
      expect([...(onExpandedChange.mock.calls[0]?.[0] ?? [])]).toEqual(['engineering'])
    })

    it('opens with ArrowDown and with ArrowUp on the trigger', async () => {
      await select()
      trigger().focus()
      await key('ArrowDown')
      await vi.waitFor(() => expect(focused()).toBe('engineering'))
      await key('Escape')
      await closed()
      await vi.waitFor(() => expect(document.activeElement).toBe(trigger()))

      await key('ArrowUp')
      await vi.waitFor(() => expect(focused()).toBe('engineering'))
    })

    /* ---------------------------------------------------------------------- */
    /* Choosing                                                               */
    /* ---------------------------------------------------------------------- */

    it('chooses with Enter, closes, reports the id and returns focus to the trigger', async () => {
      const { onChange } = await select({ placeholder: 'Choose a unit' })
      await open()
      await key('ArrowDown')
      await vi.waitFor(() => expect(focused()).toBe('design'))
      expect(onChange).not.toHaveBeenCalled()

      await key('Enter')
      await closed()
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenLastCalledWith('design')
      expect(shown()).toBe('Design')
      expect(trigger().hasAttribute('data-placeholder')).toBe(false)
      await vi.waitFor(() => expect(document.activeElement).toBe(trigger()))
    })

    it('chooses with Space', async () => {
      const { onChange } = await select()
      await open()
      await key('End')
      await vi.waitFor(() => expect(focused()).toBe('sales'))
      await userEvent.keyboard(' ')
      await closed()
      expect(onChange).toHaveBeenLastCalledWith('sales')
      expect(shown()).toBe('Sales')
    })

    it('chooses a branch with a press on its row, without opening it', async () => {
      const { onChange, onExpandedChange } = await select()
      await open()
      await userEvent.click(rowOf(item('engineering')))
      await closed()
      expect(onChange).toHaveBeenLastCalledWith('engineering')
      expect(onExpandedChange).not.toHaveBeenCalled()
      expect(shown()).toBe('Engineering')
    })

    it('closes and reports nothing when the chosen node is chosen again', async () => {
      const { onChange } = await select({ defaultValue: 'design' })
      await open()
      await vi.waitFor(() => expect(focused()).toBe('design'))
      await key('Enter')
      await closed()

      await open()
      await userEvent.click(rowOf(item('design')))
      await closed()
      expect(onChange).not.toHaveBeenCalled()
      expect(shown()).toBe('Design')
    })

    it('opens a branch with ArrowRight and with its chevron, and chooses nothing', async () => {
      const { onChange, onExpandedChange } = await select()
      await open()
      await key('ArrowRight')
      await vi.waitFor(() => expect(item('engineering').getAttribute('aria-expanded')).toBe('true'))
      await userEvent.click(chevron('design'))
      await vi.waitFor(() => expect(item('design').getAttribute('aria-expanded')).toBe('true'))
      await frames()

      expect(trigger().getAttribute('aria-expanded')).toBe('true')
      expect(onExpandedChange).toHaveBeenCalledTimes(2)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('reports a choice without making it while the application holds the value', async () => {
      const { set, onChange } = await select({ props: { value: 'design' } })
      expect(shown()).toBe('Design')
      await open()
      await key('ArrowDown')
      await vi.waitFor(() => expect(focused()).toBe('sales'))
      await key('Enter')
      await closed()
      expect(onChange).toHaveBeenLastCalledWith('sales')
      expect(shown()).toBe('Design')

      await set({ value: 'sales' })
      await vi.waitFor(() => expect(shown()).toBe('Sales'))
      // `null` is no node, so the trigger is in its placeholder state.
      await set({ value: null })
      await vi.waitFor(() => expect(trigger().hasAttribute('data-placeholder')).toBe(true))
    })

    /* ---------------------------------------------------------------------- */
    /* Closing without a choice                                               */
    /* ---------------------------------------------------------------------- */

    it('closes on Escape without choosing and returns focus to the trigger', async () => {
      const { onChange } = await select()
      await open()
      await key('ArrowDown')
      await vi.waitFor(() => expect(focused()).toBe('design'))
      await key('Escape')
      await closed()
      await vi.waitFor(() => expect(document.activeElement).toBe(trigger()))
      expect(onChange).not.toHaveBeenCalled()
    })

    it('keeps focus in the tree on Tab and Shift+Tab', async () => {
      await select()
      await open()
      await key('Tab')
      await frames()
      expect(focused()).toBe('engineering')
      await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
      await frames()
      expect(focused()).toBe('engineering')
      expect(trigger().getAttribute('aria-expanded')).toBe('true')
    })

    /* ---------------------------------------------------------------------- */
    /* The empty choice                                                       */
    /* ---------------------------------------------------------------------- */

    it('offers the empty choice first, shows it as a value and reports it as null', async () => {
      const { onChange } = await select({ emptyOption: 'Top level' })
      expect(shown()).toBe('Top level')
      expect(trigger().hasAttribute('data-placeholder')).toBe(false)

      await open()
      // The empty choice is the first top-level item, chosen, and has focus.
      expect(first().textContent).toContain('Top level')
      expect(first().getAttribute('aria-selected')).toBe('true')
      expect(document.activeElement).toBe(first())

      await key('ArrowDown')
      await vi.waitFor(() => expect(focused()).toBe('engineering'))
      await key('Enter')
      await closed()
      expect(onChange).toHaveBeenLastCalledWith('engineering')

      await open()
      await key('Home')
      await vi.waitFor(() => expect(document.activeElement).toBe(first()))
      await key('Enter')
      await closed()
      expect(onChange).toHaveBeenLastCalledWith(null)
      expect(shown()).toBe('Top level')
    })

    /* ---------------------------------------------------------------------- */
    /* The hidden field                                                       */
    /* ---------------------------------------------------------------------- */

    it('submits the chosen id under its name, and the empty string for no node', async () => {
      await select({ name: 'parent' })
      expect(hidden('parent')?.value).toBe('')

      await open()
      await key('ArrowDown')
      await vi.waitFor(() => expect(focused()).toBe('design'))
      await key('Enter')
      await closed()
      await vi.waitFor(() => expect(hidden('parent')?.value).toBe('design'))
    })

    it('submits the empty string for the empty choice', async () => {
      await select({ name: 'parent', emptyOption: 'Top level', defaultValue: 'design' })
      expect(hidden('parent')?.value).toBe('design')
      await open()
      await key('Home')
      await key('Enter')
      await closed()
      await vi.waitFor(() => expect(hidden('parent')?.value).toBe(''))
    })

    /* ---------------------------------------------------------------------- */
    /* A level the application loads                                          */
    /* ---------------------------------------------------------------------- */

    it('chooses a node from a level the application loads while the popup is open', async () => {
      const { set, onChange, onExpandedChange } = await select()
      await open()
      await key('ArrowDown')
      await vi.waitFor(() => expect(focused()).toBe('design'))

      await key('ArrowRight')
      await vi.waitFor(() => expect(onExpandedChange).toHaveBeenCalledTimes(1))
      await set({ items: units({}, { loading: true }) })
      await vi.waitFor(() => expect(item('design').getAttribute('aria-busy')).toBe('true'))
      await set({ items: units({}, { children: DESIGN }) })
      await vi.waitFor(() => expect(item('brand')).not.toBeNull())

      await key('ArrowRight')
      await vi.waitFor(() => expect(focused()).toBe('brand'))
      await key('Enter')
      await closed()
      expect(onChange).toHaveBeenLastCalledWith('brand')
      expect(shown()).toBe('Brand')
    })

    it('shows `valueLabel` until the chosen node’s level is loaded, then the node’s label', async () => {
      const { set } = await select({
        props: { value: 'brand', valueLabel: 'Design / Brand' },
      })
      expect(shown()).toBe('Design / Brand')

      // The node is not drawn, so the popup opens on the first row.
      await open()
      expect(focused()).toBe('engineering')
      await key('Escape')
      await closed()

      await set({ items: units({}, { children: DESIGN }) })
      await vi.waitFor(() => expect(shown()).toBe('Brand'))
    })
  })
}
