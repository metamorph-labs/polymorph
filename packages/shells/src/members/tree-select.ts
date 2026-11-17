import {
  cond,
  describeMember,
  el,
  flag,
  fx,
  identity,
  js,
  lit,
  member,
  portal,
  run,
  text,
  when,
  type FixtureValue,
  type Node,
} from '../dsl'

/** `open` or `closed`, for the sheet's scrim and panel, whose recipe keys pointer events on it. */
const SHEET_STATE = "api.open ? 'open' : 'closed'"

/**
 * An agent's choice, written without a member literal, because a renderer rewrites a name in a
 * type literal that is also a prop's (`id`, `label`, `disabled`).
 */
const CHOICE = "(Pick<TreeItem, 'id' | 'label'> & Partial<Record<'disabled', true>>)"

/**
 * The open branches with every branch above a node added, so the node is drawn
 * when the popup opens, or the same set when nothing is added. Written out
 * once more for the first value of the member's own set, which is made before
 * any derived value. A node's branches are in the items whenever the node is,
 * because each level is nested in the branch above it.
 */
const reveal = (nodes: string, shownSet: string, wanted: string) =>
  `((tops: TreeItem[], held: ReadonlySet<string>, target: string | null): ReadonlySet<string> => { const walk = (level: TreeItem[], trail: string[]): string[] | null => { for (const node of level) { if (node.id === target) return trail; const under = node.children === undefined ? null : walk(node.children, [...trail, node.id]); if (under !== null) return under } return null }; const above = target === null ? null : walk(tops, []); return above === null || above.every((branch) => held.has(branch)) ? held : new Set([...held, ...above]) })(${nodes}, ${shownSet}, ${wanted})`

/** The popup's content: the Tree member, told the member's items, open branches and choice. */
const tree: Node = member(
  'Tree',
  {
    label: 'label',
    items: 'shownItems',
    expanded: 'branches',
    value: 'treeValue',
    loading: 'loading',
    hasMore: 'hasMore',
    messages: 'messages',
  },
  {
    on: {
      change: run('choose($event)'),
      expandedChange: run('changeExpanded($event)'),
      loadMore: { emit: 'loadMore', args: ['$event'] },
    },
  },
)

/**
 * The popup's attributes the member sets over the machine's: present through
 * its exit, and no role or modal flag of its own, because the tree it holds is
 * the popup the trigger names.
 */
const PANEL_ATTRS = {
  hidden: 'undefined',
  role: 'undefined',
  'aria-modal': 'undefined',
  'aria-labelledby': 'undefined',
  'aria-describedby': 'undefined',
}

/** Choosing the chosen node again closes the popup, which Tree reports nothing for. */
const AGAIN = { keydown: run('closeOnRepick($event)'), click: run('closeOnRepick($event)') }

/* -------------------------------------------------------------------------- */
/* The states fixture                                                          */
/* -------------------------------------------------------------------------- */

type Item = { readonly [key: string]: FixtureValue }

const LABEL = 'Organization units'

/** Three top-level units: a loaded branch three levels deep, a branch the app has not loaded, and a leaf. */
const units = (engineering: Item = {}, design: Item = {}, sales: Item = {}): Item[] => [
  {
    id: 'engineering',
    label: 'Engineering',
    children: [
      {
        id: 'platform',
        label: 'Platform',
        children: [
          { id: 'runtime', label: 'Runtime' },
          { id: 'storage', label: 'Storage' },
        ],
      },
      { id: 'applications', label: 'Applications' },
    ],
    ...engineering,
  },
  { id: 'design', label: 'Design', hasChildren: true, ...design },
  { id: 'sales', label: 'Sales', description: 'Three regions', ...sales },
]

const LONG: Item[] = [
  {
    id: 'programme',
    label: 'Customer support operations for Europe, the Middle East and Africa',
    children: [
      {
        id: 'archive',
        label: 'ticket-export-eu-west-1-production-customer-support-archive',
        description: 'Holds the exports of the last twelve months',
      },
    ],
  },
]

const opened = (...ids: string[]) => js(`new Set(${JSON.stringify(ids)})`)

/**
 * TreeSelect (`design/components/tree-select.md`): a field that picks one node
 * of a hierarchy. It is Select's trigger with the Tree member in its popup, so
 * the rows, the keys and a level the application loads are Tree's.
 *
 * Zag's popover machine owns the popup: the trigger, the position, Escape and a
 * press outside, focus held in the popup while it is open, and focus back on
 * the trigger when it closes. Opening opens the branches above the chosen node
 * and puts focus on it. Choosing a node closes the popup and reports its id,
 * and `emptyOption` is a first top-level item that reports `null`. Under
 * `presentation: 'auto'`, below the sheet presentation's threshold (`phone`),
 * the popup is the shared bottom sheet, with the same Tree inside it.
 */
export default describeMember({
  member: 'TreeSelect',
  dir: 'controls',
  recipe: 'controls/tree-select',
  recipes: { sheet: 'overlays/sheet' },
  uses: ['TreeItem', 'TreeMessages'],
  defaults: {
    loading: 'false',
    hasMore: 'false',
    size: lit('md'),
    invalid: 'false',
    disabled: 'false',
    presentation: lit('auto'),
  },
  media: { phone: 'phone' },
  state: {
    // The choice while the caller passes no `value`.
    ownValue: '(defaultValue ?? null) as string | null',
    // The open branches while the caller passes no `expanded`: the branches `defaultExpanded`
    // names, with those above the chosen node when the popup opens on mount.
    ownExpanded: `defaultOpen === true ? ${reveal('items', 'defaultExpanded ?? new Set<string>()', 'defaultValue ?? null')} : (defaultExpanded ?? new Set<string>())`,
  },
  derived: {
    // The sheet form under `'auto'` and below the threshold; `'popover'` keeps the anchored panel.
    sheeting: "presentation === 'auto' && phone",
    chosen: 'value === undefined ? ownValue : value',
    branches: 'expanded ?? ownExpanded',
    // The empty choice's item id, made for this instance, so no application id can be the same.
    emptyId: '`${uid}-empty`',
    panelId: '`${uid}-panel`',
    shownItems:
      'emptyOption === undefined ? items : [{ id: emptyId, label: emptyOption }, ...items]',
    treeValue: 'chosen ?? (emptyOption === undefined ? null : emptyId)',
    // The label of the node with an id, from the levels the application has passed.
    labelOf:
      '(level: TreeItem[], wanted: string): string | undefined => { for (const node of level) { if (node.id === wanted) return node.label; const under = node.children === undefined ? undefined : labelOf(node.children, wanted); if (under !== undefined) return under } return undefined }',
    placeholderShown: 'chosen === null && emptyOption === undefined',
    // The chosen node's label, else `valueLabel` while its level is not loaded.
    shown:
      "chosen === null ? (emptyOption ?? placeholder ?? '') : (labelOf(items, chosen) ?? valueLabel ?? '')",
    // The member's own set follows every change, whoever holds the set, as Tree's does.
    changeExpanded:
      "(next: ReadonlySet<string>): void => { ownExpanded = next; emit('expandedChange', next) }",
    // Opening opens the branches above the chosen node, so it is drawn and takes focus.
    opened: `(now: boolean): void => { if (!now) return; const next = ${reveal('items', 'branches', 'chosen')}; if (next !== branches) changeExpanded(next) }`,
    choose:
      "(picked: string): void => { const reported = picked === emptyId ? null : picked; ownValue = reported; emit('change', reported); api.setOpen(false) }",
    // ArrowDown and ArrowUp open the popup, as they open Select. Enter and Space are the button's click.
    openFromKeys:
      "(event: KeyboardEvent): void => { if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return; event.preventDefault(); if (!disabled) api.setOpen(true) }",
    // Tree reports nothing for the chosen node chosen again, and the popup still closes, as
    // Select's does. It reads Tree's attributes: the row a press lands on, the chevron, and
    // `aria-selected`, which only an enabled item that asks for nothing can carry as `true`.
    closeOnRepick:
      "(event: Event): void => { const target = event.target instanceof Element ? event.target : null; if (target === null) return; if (event instanceof KeyboardEvent) { if ((event.key !== 'Enter' && event.key !== ' ') || event.altKey || event.ctrlKey || event.metaKey) return; if (target.closest('[role=\"treeitem\"]')?.getAttribute('aria-selected') === 'true') api.setOpen(false); return } if (target.closest('[data-tree-part=\"toggle\"]') !== null) return; if (target.closest('[data-tree-part=\"row\"]')?.parentElement?.getAttribute('aria-selected') === 'true') api.setOpen(false) }",
  },
  machine: {
    of: 'popover',
    context: {
      defaultOpen: 'defaultOpen === true && !disabled',
      // Modal while open, as Select's list is: focus stays in the tree, so Tab does nothing, and
      // the page behind takes no press.
      modal: 'true',
      // Below the trigger and aligned with its start, two pixels off it, as Select's panel is.
      positioning: "{ placement: 'bottom-start' as const, offset: { mainAxis: 2 } }",
      // The caller's id names the trigger, which the machine finds by id, and the panel's id is
      // the one the trigger's `aria-controls` names.
      ids: '{ ...(id === undefined ? {} : { trigger: id }), content: `${uid}-panel` }',
      // Focus on opening: the chosen node when it is drawn, else the first row, which is Tree's
      // stop before focus has been in the tree.
      initialFocusEl:
        '() => { const box = sheetPanel ?? panel; return box?.querySelector<HTMLElement>(\'[role="treeitem"][aria-selected="true"]:not([aria-disabled="true"])\') ?? box?.querySelector<HTMLElement>(\'[role="treeitem"]:not([aria-disabled="true"])\') ?? null }',
    },
    events: { onOpenChange: { run: 'opened(details.open)' } },
  },
  // The spec's `agent` fence. The member holds the choice, so `choose` sets it through the
  // member's own `choose`, which reports `change` and closes the popup, and the machine owns the
  // open state. The choices are every node the application has passed, at every level; a
  // disabled node and every node under a disabled branch are disabled, because the tree draws
  // that branch closed. The empty choice's id is the empty string. The Tree in the popup is the
  // member's own part, so the member withholds the popup: the anchored panel or the sheet's panel.
  agent: {
    on: 'trigger',
    state: {
      value: "chosen === null ? (emptyOption === undefined ? null : '') : chosen",
      options: `[
        ...(emptyOption === undefined ? [] : [{ id: '', label: emptyOption }]),
        ...((level: TreeItem[]): ${CHOICE}[] => {
          const out: ${CHOICE}[] = []
          const walk = (nodes: TreeItem[], off: boolean): void => {
            for (const node of nodes) {
              const shut = off || node.disabled === true
              out.push({ id: node.id, label: node.label, ...(shut ? { disabled: true as const } : {}) })
              if (node.children !== undefined) walk(node.children, shut)
            }
          }
          walk(level, false)
          return out
        })(items),
      ]`,
      open: 'api.open',
      disabled: 'disabled',
      invalid: 'invalid',
    },
    actions: {
      choose: {
        argument: 'id',
        run: "(value === '' ? null : value) === chosen || choose(value === '' ? emptyId : value)",
      },
      open: 'api.setOpen(true)',
      close: 'api.setOpen(false)',
    },
    withholds: 'sheetPanel ?? panel',
  },
  presence: {
    // The anchored panel's recipe animates it; the sheet's panel and scrim play their bindings.
    present: { open: 'api.open && !sheeting', ref: 'panel' },
    sheetPresent: {
      open: 'api.open && sheeting',
      ref: 'sheetPanel',
      binding: 'sheet.panel',
      sheetSide: 'bottom',
    },
    scrimPresent: { open: 'api.open && sheeting', ref: 'scrim', binding: 'dialog.scrim' },
  },
  template: [
    el(
      'button',
      {
        part: 'trigger',
        class: ['trigger'],
        // The control an agent's handle names.
        ref: 'trigger',
        spread: ['api.getTriggerProps()'],
        attrs: {
          // A combobox, as Select's trigger is, so a screen reader reads the label it shows as the
          // field's value. It opens a tree.
          role: lit('combobox'),
          'aria-haspopup': lit('tree'),
          'aria-controls': 'api.open ? panelId : undefined',
          'aria-label': 'ariaLabel',
          'aria-labelledby': 'ariaLabelledby',
          'aria-describedby': 'ariaDescribedby',
          'aria-required': 'ariaRequired',
          'aria-invalid': when('invalid', 'true'),
          disabled: when('disabled', 'true'),
          'data-size': 'size',
          'data-invalid': flag('invalid'),
          'data-disabled': flag('disabled'),
          'data-placeholder': flag('placeholderShown'),
          ...identity('TreeSelect'),
        },
        on: { keydown: run('openFromKeys($event)') },
      },
      [
        el('span', { class: ['value'] }, [text('shown')]),
        el('span', { class: ['chevron'], attrs: { 'aria-hidden': lit('true') } }, [
          member('Icon', { name: lit('expand'), size: 'size' }),
        ]),
      ],
    ),
    // The form value: the chosen id, `''` for none and for the empty choice.
    cond('name !== undefined', [
      el('input', {
        attrs: {
          type: lit('hidden'),
          name: 'name',
          value: "chosen ?? ''",
          disabled: when('disabled', 'true'),
        },
      }),
    ]),
    portal(
      cond('present', [
        el('div', { spread: ['api.getPositionerProps()'] }, [
          el(
            'div',
            {
              part: 'panel',
              class: ['content'],
              spread: ['api.getContentProps()'],
              attrs: { ...PANEL_ATTRS, 'data-size': 'size', ...identity('TreeSelect') },
              // The recipe reads the positioner's measurements under Radix's names; Zag's
              // positioner sets them as its own variables, which the panel inherits.
              geometry: {
                '--radix-popover-trigger-width': "'var(--reference-width)'",
                '--radix-popover-content-available-width': "'var(--available-width)'",
                '--radix-popover-content-available-height': "'var(--available-height)'",
                '--radix-popover-content-transform-origin': "'var(--transform-origin)'",
              },
              on: AGAIN,
              ref: 'panel',
            },
            [tree],
          ),
        ]),
      ]),
      // The sheet: a press on the scrim is outside the panel, so the machine closes it.
      cond('scrimPresent', [
        el('div', { class: ['sheet.scrim'], attrs: { 'data-state': SHEET_STATE }, ref: 'scrim' }),
      ]),
      cond('sheetPresent', [
        el('div', { class: ['sheet.positioner'] }, [
          // The sheet's panel is the machine's content: the boundary its focus trap holds.
          el(
            'div',
            {
              class: ['sheet.panel'],
              spread: ['api.getContentProps()'],
              attrs: { ...PANEL_ATTRS, 'data-presentation': lit('sheet') },
              ref: 'sheetPanel',
            },
            [
              // The sheet's panel is the shared anatomy, so the member's identity goes on the one
              // element inside it that the member owns.
              el(
                'div',
                {
                  part: 'sheetBody',
                  class: ['sheetBody'],
                  attrs: { 'data-size': 'size', ...identity('TreeSelect') },
                  on: AGAIN,
                },
                [tree],
              ),
            ],
          ),
        ]),
      ]),
    ),
  ],
  states: [
    {
      name: 'empty, with a placeholder',
      props: {
        label: LABEL,
        items: units(),
        placeholder: 'Choose a unit',
        'aria-label': 'Move under',
      },
      expect: { 'data-state': 'closed', 'data-size': 'md', 'data-placeholder': '' },
    },
    {
      name: 'a value',
      props: { label: LABEL, items: units(), defaultValue: 'design', 'aria-label': 'Move under' },
      expect: { 'data-placeholder': null },
    },
    {
      name: 'a value deep in the hierarchy',
      props: { label: LABEL, items: units(), defaultValue: 'runtime', 'aria-label': 'Move under' },
    },
    {
      name: 'open on a value deep in the hierarchy',
      props: {
        label: LABEL,
        items: units(),
        defaultValue: 'runtime',
        defaultOpen: true,
        'aria-label': 'Move under, open on its unit',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open, a level loading',
      props: {
        label: LABEL,
        items: units({}, { loading: true }),
        defaultExpanded: opened('design'),
        defaultOpen: true,
        placeholder: 'Choose a unit',
        'aria-label': 'Move under, a level loading',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open, a level with more to load',
      props: {
        label: LABEL,
        items: units({ hasMore: true }),
        hasMore: true,
        defaultExpanded: opened('engineering'),
        defaultOpen: true,
        placeholder: 'Choose a unit',
        'aria-label': 'Move under, more to load',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open, disabled nodes',
      props: {
        label: LABEL,
        items: units({}, { disabled: true }, { disabled: true }),
        defaultExpanded: opened('engineering'),
        defaultValue: 'applications',
        defaultOpen: true,
        'aria-label': 'Move under, with units that cannot be chosen',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'a value whose level is not loaded',
      props: {
        label: LABEL,
        items: units(),
        defaultValue: 'brand',
        valueLabel: 'Brand',
        'aria-label': 'Move under',
      },
      expect: { 'data-placeholder': null },
    },
    {
      name: 'the empty choice, chosen',
      props: { label: LABEL, items: units(), emptyOption: 'Top level', 'aria-label': 'Move under' },
      expect: { 'data-placeholder': null },
    },
    {
      name: 'open on the empty choice',
      props: {
        label: LABEL,
        items: units(),
        emptyOption: 'Top level',
        defaultOpen: true,
        'aria-label': 'Move under, open on the empty choice',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'sizes side by side',
      many: {
        within: { member: 'Inline', props: { gap: 3 } },
        each: (['sm', 'md', 'lg'] as const).map((size) => ({
          props: {
            size,
            label: LABEL,
            items: units(),
            defaultValue: 'platform',
            'aria-label': `Move under (${size})`,
          },
        })),
      },
    },
    {
      name: 'size sm',
      props: {
        size: 'sm',
        label: LABEL,
        items: units(),
        defaultValue: 'platform',
        'aria-label': 'Move under',
      },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      props: {
        size: 'lg',
        label: LABEL,
        items: units(),
        defaultValue: 'platform',
        'aria-label': 'Move under',
      },
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'invalid',
      props: {
        invalid: true,
        label: LABEL,
        items: units(),
        placeholder: 'Required',
        'aria-label': 'Move under',
      },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: {
        disabled: true,
        label: LABEL,
        items: units(),
        defaultValue: 'design',
        'aria-label': 'Move under',
      },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'long labels at a narrow width',
      many: {
        within: { element: 'div', class: ['harness'] },
        each: [
          {
            props: {
              label: LABEL,
              items: LONG,
              defaultValue: 'archive',
              'aria-label': 'Archive into',
            },
          },
        ],
      },
    },
    {
      name: 'the move-target form',
      many: {
        within: { member: 'Inline', props: { gap: 2, align: 'end', wrap: true } },
        each: [],
        also: [
          fx(
            'FormField',
            { label: 'Move under', description: 'The unit and the units inside it move.' },
            {
              default: [
                fx('TreeSelect', { label: LABEL, items: units(), emptyOption: 'Top level' }),
              ],
            },
          ),
          fx('Button', { variant: 'soft', tone: 'accent', label: 'Move unit' }),
        ],
      },
    },
  ],
})
