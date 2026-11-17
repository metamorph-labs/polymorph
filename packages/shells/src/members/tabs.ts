import {
  cond,
  describeMember,
  each,
  el,
  identity,
  lit,
  member,
  slot,
  text,
  type FixtureChild,
} from '../dsl'

const TWO = [
  { value: 'open', label: 'Open' },
  { value: 'solved', label: 'Solved' },
]

const THREE = [
  { value: 'inbox', label: 'Inbox', icon: 'inbox', count: 12 },
  { value: 'mine', label: 'Assigned to me', icon: 'user', count: 3 },
  { value: 'archive', label: 'Archive', icon: 'archive' },
]

/** One panel per tab, as `<Tabs.Content>` children. */
const panels = (
  tabs: readonly { value: string; label: string }[],
  text?: (tab: { label: string }) => string,
) =>
  tabs.map((tab): FixtureChild => ({
    member: 'TabsContent',
    props: { value: tab.value },
    slots: { default: [{ element: 'p', children: [text ? text(tab) : tab.label] }] },
  }))

/** More tabs than the fixture's narrow box holds in a row. */
const MANY = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity', count: 12 },
  { value: 'members', label: 'Members' },
  { value: 'billing', label: 'Billing' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'audit', label: 'Audit log' },
  { value: 'settings', label: 'Settings' },
]

/** The tab's state for Zag: its value, and whether it is disabled. */
const TAB = '{ value: tab.value, disabled: tab.disabled }'

/** The current tab's trigger, by the state name the recipe keys on. */
const CURRENT = `list?.querySelector('[data-state="active"]')`

/**
 * Tabs (`design/components/tabs.md`): peer views in one place, one at a time.
 * Zag's machine owns the value, the roving focus and the keys. The indicator is
 * Zag's measured rule, placed under the current tab. Zag slides it with a CSS
 * transition, whose duration and curve the recipe's `slide` class takes from
 * the motion tokens, and which reduced motion and `none` turn into a jump. The
 * React member plays the `tabs.indicator` spring through the motion engine; a
 * shell plays the tokens' duration and curve instead.
 *
 * A horizontal strip wider than its container scrolls inside it. The recipe
 * does the scrolling, the edge fade and the room for the focus ring, and the
 * browser scrolls a tab that takes focus into view. The member brings the
 * current tab inside the strip, as React's does, through the engine's
 * `revealInline`: at once when the strip is laid out or changes size, and as
 * the motion setting says when the value changes.
 */
export default describeMember({
  member: 'Tabs',
  dir: 'overlays',
  recipe: 'overlays/tabs',
  types: {
    TabsOrientation: "NonNullable<TabsProps['orientation']>",

    TabDescriptor:
      '{ value: string; label: string; icon?: IconRole; count?: number; disabled?: boolean }',
  },
  defaults: { orientation: lit('horizontal'), keepMounted: 'false' },
  machine: {
    of: 'tabs',
    context: {
      value: 'value',
      // A strip with nothing selected shows no panel, so the first tab is the fallback.
      defaultValue: 'defaultValue ?? tabs[0]?.value',
      orientation: 'orientation',
    },
    events: { onValueChange: { emit: 'change', payload: 'details.value' } },
  },
  provide: { api: 'api', keepMounted: 'keepMounted' },
  // The spec's `agent` fence. The machine owns the value, controlled or not, so a choice goes
  // through it and it reports `change`. The list names the strip.
  agent: {
    on: 'list',
    state: {
      value: 'api.value ?? null',
      tabs: 'tabs.map((tab) => ({ id: tab.value, label: tab.label, ...(tab.disabled === true ? { disabled: true } : {}) }))',
    },
    actions: {
      choose: { argument: 'id', run: 'value === api.value || api.setValue(value)' },
    },
  },
  effects: [
    // Layout, so never animated: the first placement, and one after the list's box changes.
    { run: `revealInline(list, ${CURRENT}, true)`, resize: ['list'] },
    // Travel, so smooth where the motion tokens and the reader's setting allow it.
    { watch: 'api.value', mount: false, run: `revealInline(list, ${CURRENT})` },
  ],
  template: el(
    'div',
    {
      part: 'root',
      class: ['root'],
      spread: ['api.getRootProps()'],
      attrs: { ...identity('Tabs') },
    },
    [
      el(
        'div',
        {
          part: 'list',
          class: ['list'],
          ref: 'list',
          spread: ['api.getListProps()'],
          attrs: { 'data-tabs-part': lit('list') },
        },
        [
          each('tabs', 'tab', 'tab.value', [
            el(
              'button',
              {
                part: 'tab',
                class: ['trigger'],
                spread: [`api.getTriggerProps(${TAB})`],
                attrs: {
                  'data-tabs-part': lit('tab'),
                  // The recipe keys on Radix's state names.
                  'data-state': "api.value === tab.value ? 'active' : 'inactive'",
                  'data-disabled': "tab.disabled ? '' : undefined",
                },
              },
              [
                cond('tab.icon !== undefined', [
                  el('span', { class: ['glyph'] }, [
                    member('Icon', { name: 'tab.icon', size: lit('sm') }),
                  ]),
                ]),
                el('span', {}, [text('tab.label')]),
                // The count belongs to the tab, so it changes tone with it.
                cond('tab.count !== undefined', [
                  el('span', { class: ['count'] }, [
                    member(
                      'Badge',
                      { tone: "api.value === tab.value ? 'accent' : 'neutral'" },
                      { slots: { default: [text('String(tab.count)')] } },
                    ),
                  ]),
                ]),
              ],
            ),
          ]),
          el('div', {
            part: 'indicator',
            class: ['indicator', 'slide'],
            spread: ['api.getIndicatorProps()'],
            // Zag measures the current tab; the rule takes its length along the strip.
            geometry: {
              'inline-size':
                "orientation === 'vertical' ? undefined : Object(api.getIndicatorProps().style)['--width']",
              'block-size':
                "orientation === 'vertical' ? Object(api.getIndicatorProps().style)['--height'] : undefined",
            },
          }),
        ],
      ),
      slot(),
    ],
  ),
  parts: [
    {
      name: 'Content',
      public: true,
      purpose: 'one tab’s panel',
      // Inactive panels unmount, unless the strip keeps them mounted and hidden.
      template: cond('owner.keepMounted || owner.api?.value === value', [
        el(
          'div',
          {
            part: 'tabpanel',
            class: ['content'],
            spread: ['owner.api?.getContentProps({ value }) ?? {}'],
            attrs: {
              'data-tabs-part': lit('tabpanel'),
              'data-state': "owner.api?.value === value ? 'active' : 'inactive'",
            },
          },
          [slot()],
        ),
      ]),
    },
  ],
  states: [
    {
      name: 'two tabs, the first active by default',
      props: { tabs: TWO },
      slots: {
        default: panels(TWO, (tab) =>
          tab.label === 'Open'
            ? 'Everything still waiting on a reply.'
            : 'Closed in the last 30 days.',
        ),
      },
    },
    {
      name: 'icons and counts — the active tab’s count takes the accent',
      props: { tabs: THREE },
      slots: { default: panels(THREE) },
    },
    {
      name: 'second tab active, so the rule starts there',
      props: { tabs: THREE, defaultValue: 'mine' },
      slots: { default: panels(THREE) },
    },
    {
      name: 'vertical — the same strip turned on its side',
      props: { tabs: THREE, orientation: 'vertical' },
      slots: { default: panels(THREE) },
      expect: { 'data-orientation': 'vertical' },
    },
    {
      name: 'vertical, second tab active — the rule runs down the start edge',
      props: { tabs: THREE, orientation: 'vertical', defaultValue: 'mine' },
      slots: { default: panels(THREE) },
    },
    {
      name: 'kept mounted — a tab hop must not tear down a form mid-edit',
      props: { keepMounted: true, tabs: TWO },
      slots: {
        default: panels(TWO, (tab) =>
          tab.label === 'Open' ? 'The visible panel.' : 'Alive and hidden, keeping its state.',
        ),
      },
    },
    {
      name: 'a tab you cannot open yet',
      props: {
        tabs: [
          { value: 'overview', label: 'Overview' },
          { value: 'usage', label: 'Usage', disabled: true },
        ],
      },
      slots: {
        default: panels([
          { value: 'overview', label: 'Usage arrives once the account has a full billing period.' },
          { value: 'usage', label: 'Unreachable.' },
        ]),
      },
    },
    {
      // The box is the container. The current tab is past its end edge.
      name: 'wider than its container — the strip scrolls and opens on the current tab',
      many: {
        within: { element: 'div', class: ['harness'] },
        each: [
          { props: { tabs: MANY, defaultValue: 'integrations' }, slots: { default: panels(MANY) } },
        ],
      },
    },
  ],
})
