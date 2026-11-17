import {
  cond,
  describeMember,
  el,
  emit,
  flag,
  identity,
  lit,
  member,
  portal,
  run,
  text,
  when,
} from '../dsl'

import {
  flattened,
  MENU_PRESENCE,
  menuRows,
  menuSheet,
  submenuPart,
  type MenuRowClasses,
} from './context-menu'

/** The rows name their glyph and label apart from the primary half's, which compose Button's. */
const ROWS: MenuRowClasses = { glyph: 'rowGlyph', label: 'rowLabel' }

/**
 * The recipe reads the positioner's measurements under Radix's dropdown names;
 * Zag's positioner sets them as its own variables, which the list inherits.
 */
const MEASURED = {
  '--radix-dropdown-menu-content-available-height': "'var(--available-height)'",
  '--radix-dropdown-menu-content-transform-origin': "'var(--transform-origin)'",
}

/** The group's appearance, which both halves carry so Button's recipe styles each. */
const APPEARANCE = {
  'data-variant': 'variant',
  'data-tone': 'tone',
  'data-size': 'size',
  'data-disabled': flag('disabled'),
}

const noop = { js: '() => {}' }

const RESOLVE = [
  { label: 'Resolve and notify', onSelect: noop },
  { label: 'Resolve as duplicate', onSelect: noop },
]

const WITH_DANGER = [
  ...RESOLVE,
  { kind: 'separator' },
  { label: 'Resolve and delete thread', tone: 'danger', onSelect: noop },
]

const BASE = { label: 'Resolve', entries: RESOLVE, menuLabel: 'More resolve options' }

/**
 * SplitButton (`design/components/split-button.md`): a default command and a
 * menu of its variants, one control group with one appearance. The primary is
 * a button with Button's recipe; the chevron is the trigger of Zag's menu
 * machine, which owns opening, the highlighted row, typeahead, dismissal and
 * focus returning to the chevron. The rows are Menu's grammar, a submenu a
 * second machine in its own part, as in Menu.
 *
 * While `loading`, the primary's handler is disconnected and the chevron is
 * disabled too: a command in flight is the whole group's state. Under
 * `presentation: 'auto'`, below the sheet presentation's threshold (`phone`),
 * the menu half is drawn in the bottom sheet, as Menu's is; the group never
 * changes.
 */
export default describeMember({
  member: 'SplitButton',
  dir: 'controls',
  recipe: 'controls/split-button',
  types: {
    SplitButtonGrid: "{ solid: 'accent'; soft: 'accent'; outline: 'neutral' | 'accent' }",
    SplitButtonAppearance: 'LawfulVariants<SplitButtonGrid>',
  },
  recipes: { sheet: 'overlays/sheet' },
  uses: ['MenuEntry'],
  defaults: {
    variant: lit('solid'),
    tone: lit('accent'),
    size: lit('md'),
    disabled: 'false',
    loading: 'false',
    presentation: lit('auto'),
  },
  media: { phone: 'phone' },
  derived: {
    sheeting: "presentation === 'auto' && phone",
    flat: flattened('entries'),
  },
  machine: {
    of: 'menu',
    context: {
      defaultOpen: 'defaultOpen',
      disabled: 'disabled || loading',
      // Hangs from the group's end edge, under the chevron, at the anchored-surface constant.
      positioning: "{ placement: 'bottom-end', gutter: 2 }",
    },
    events: {
      // Commands run from the machine's selection, found by label, a flattened submenu's among
      // them; a checkbox reports through its own callback.
      onSelect: {
        run: "flat.forEach((entry) => 'onSelect' in entry && entry.label === details.value && entry.onSelect())",
      },
    },
  },
  provide: { api: 'api', service: 'service' },
  // The spec's `agent` fence: one handle for the whole group, named by the primary half. A press
  // is the primary's own click (`agentPress`), so a loading group ignores it as it ignores a
  // person's. An agent chooses a variant by its id without opening the menu, and the entry's own
  // handler runs, as Menu's choice does; a command closes a menu that is open. While a command
  // runs the chevron is disabled, so a variant is refused and the menu does not open.
  agent: {
    on: 'primary',
    state: {
      disabled: 'disabled',
      loading: 'loading',
      open: 'api.open',
      entries: 'menuChoices(entries)',
    },
    actions: {
      press: 'agentPress(primary)',
      choose: {
        argument: 'id',
        run: `(() => {
          if (loading) throw new Error('A command is running; its variants wait until it ends.')
          if (chooseMenuEntry(entries, value) && api.open) api.setOpen(false)
        })()`,
      },
      open: `(() => {
        if (loading) throw new Error('A command is running; its variants wait until it ends.')
        api.setOpen(true)
      })()`,
      close: 'api.setOpen(false)',
    },
  },
  presence: MENU_PRESENCE,
  effects: [
    // Real focus on the highlighted row, as Radix's menus have it (see `followHighlight`).
    { watch: 'api.highlightedValue', run: 'followHighlight(panel, api.highlightedValue)' },
  ],
  template: [
    el(
      'span',
      { part: 'group', class: ['group'], attrs: { ...APPEARANCE, ...identity('SplitButton') } },
      [
        el(
          'button',
          {
            part: 'primary',
            class: ['primary'],
            // The half that names the group to an agent, and that a press activates.
            ref: 'primary',
            attrs: {
              type: lit('button'),
              disabled: 'disabled',
              'aria-busy': when('loading', 'true'),
              ...APPEARANCE,
              'data-state': when('loading', lit('loading')),
            },
            // Disconnected while loading: Button's double-submit rule.
            on: { click: emit('click', { args: ['$event'], when: '!loading' }) },
          },
          [
            cond(
              'loading',
              [
                el('span', { class: ['spinner'] }, [
                  member('Icon', { name: lit('loading'), size: 'size' }),
                ]),
              ],
              'icon !== undefined',
              [el('span', { class: ['glyph'] }, [member('Icon', { name: 'icon', size: 'size' })])],
            ),
            el('span', { class: ['label'] }, [text('label')]),
          ],
        ),
        // The seam: one pixel, full height, visual only.
        el('span', { class: ['seam'], attrs: { 'aria-hidden': lit('true') } }),
        // A real second button, one tab stop after the primary, square at the control height.
        el(
          'button',
          {
            part: 'trigger',
            class: ['chevron'],
            spread: ['api.getTriggerProps()'],
            attrs: {
              disabled: 'disabled || loading',
              'aria-label': 'menuLabel',
              ...APPEARANCE,
              'data-icon-only': lit(''),
            },
          },
          [member('Icon', { name: lit('expand'), size: 'size' })],
        ),
      ],
    ),
    portal(
      cond('present', [
        el('div', { spread: ['api.getPositionerProps()'] }, [
          el(
            'div',
            {
              part: 'panel',
              class: ['content'],
              spread: ['api.getContentProps()'],
              attrs: { hidden: 'undefined', ...identity('SplitButton') },
              geometry: MEASURED,
              // The machine focuses the list; focus goes on to the highlighted row.
              on: { focus: run('followHighlight(panel, api.highlightedValue)') },
              ref: 'panel',
            },
            [menuRows('entries', 'SplitButtonSubmenu', ROWS)],
          ),
        ]),
      ]),
      ...menuSheet('SplitButton', ROWS),
    ),
  ],
  parts: [submenuPart(ROWS, MEASURED)],
  grid: { props: BASE },
  states: [
    {
      name: 'solid accent — the default default',
      props: BASE,
      expect: { 'data-variant': 'solid', 'data-tone': 'accent', 'data-size': 'md' },
    },
    {
      name: 'soft accent',
      props: { ...BASE, variant: 'soft' },
      expect: { 'data-variant': 'soft' },
    },
    {
      name: 'outline accent',
      props: { ...BASE, variant: 'outline' },
      expect: { 'data-variant': 'outline', 'data-tone': 'accent' },
    },
    {
      name: 'outline neutral — the one lawful neutral',
      props: {
        variant: 'outline',
        tone: 'neutral',
        label: 'Export',
        entries: [
          { label: 'Export as CSV', onSelect: noop },
          { label: 'Export as JSON', onSelect: noop },
        ],
        menuLabel: 'More export options',
      },
      expect: { 'data-variant': 'outline', 'data-tone': 'neutral' },
    },
    { name: 'with icon — leading on the primary', props: { ...BASE, icon: 'confirm' } },
    { name: 'size sm', props: { ...BASE, size: 'sm' }, expect: { 'data-size': 'sm' } },
    { name: 'size lg', props: { ...BASE, size: 'lg' }, expect: { 'data-size': 'lg' } },
    { name: 'open — the siblings one chevron behind', props: { ...BASE, defaultOpen: true } },
    {
      name: 'danger entry — the quarantine, one hairline further away',
      props: { ...BASE, entries: WITH_DANGER, defaultOpen: true },
    },
    {
      name: 'loading — one command in flight is the group’s state',
      props: { ...BASE, loading: true, icon: 'confirm' },
    },
    {
      name: 'disabled — the whole group; halves never disagree',
      props: { ...BASE, disabled: true },
      expect: { 'data-disabled': '' },
    },
  ],
})
