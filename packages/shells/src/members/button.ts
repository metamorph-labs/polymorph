import { cond, describeMember, el, emit, flag, identity, lit, member, text } from '../dsl'

/** Button (`design/components/button.md`): the action primitive. */
export default describeMember({
  member: 'Button',
  dir: 'controls',
  recipe: 'controls/button',
  types: {
    ButtonGrid:
      "{ solid: 'accent' | 'danger'; soft: 'accent' | 'danger'; outline: 'neutral' | 'accent' | 'danger'; ghost: 'neutral' | 'accent' | 'danger' }",
    ButtonAppearance: 'LawfulVariants<ButtonGrid>',
    ButtonCount: '{ value: number; label: string }',
  },
  defaults: {
    variant: lit('solid'),
    tone: lit('accent'),
    size: lit('md'),
    iconOnly: 'false',
    loading: 'false',
    disabled: 'false',
    current: 'false',
    type: lit('button'),
  },
  derived: {
    // Loading takes precedence over the toggle in `data-state`; `aria-pressed` still reports it.
    // Not named `state`: Svelte reads `$state` as a store of a value of that name.
    dataState: "loading ? 'loading' : pressed === undefined ? undefined : pressed ? 'on' : 'off'",
    // `value > 0` is false for `NaN` as well, which Badge would not draw either.
    counted: 'count !== undefined && count.value > 0',
  },
  effects: [
    // An icon-only button shows its label on hover and keyboard focus, in the Tooltip's bubble
    // (`nameTip`). A disabled one takes neither, so it shows nothing.
    {
      watch: '[iconOnly, disabled, label]',
      run: 'nameTip(control, iconOnly && !disabled ? label : undefined, styles.tip)',
      release: 'ran()',
    },
  ],
  // The spec's `agent` fence. A press is the button's own click (`agentPress`), so a submit
  // button submits its form and a disabled or loading one does nothing, as for a person.
  // `pressed` and `expanded` are `null` on a button without the prop.
  agent: {
    on: 'control',
    state: {
      disabled: 'disabled',
      loading: 'loading',
      pressed: 'pressed ?? null',
      expanded: 'expanded ?? null',
    },
    actions: { press: 'agentPress(control)' },
    destructive: "tone === 'danger'",
  },
  template: el(
    'button',
    {
      part: 'root',
      class: ['button'],
      // The control an agent reads the name of and presses.
      ref: 'control',
      attrs: {
        type: 'type',
        disabled: 'disabled',
        'aria-busy': 'loading ? true : undefined',
        'aria-current': "current ? 'page' : undefined",
        'aria-label': 'ariaLabel ?? (counted ? count?.label : iconOnly ? label : undefined)',
        'aria-labelledby': 'ariaLabelledby',
        'aria-describedby': 'ariaDescribedby',
        'aria-pressed': 'pressed',
        'aria-expanded': 'expanded',
        'aria-controls': 'ariaControls',
        'data-variant': 'variant',
        'data-tone': 'tone',
        'data-size': 'size',
        'data-state': 'dataState',
        'data-disabled': flag('disabled'),
        'data-icon-only': flag('iconOnly'),
        ...identity('Button'),
      },
      // Detached while loading: a keyboard Enter must not fire a command already in flight.
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
        'icon',
        [el('span', { class: ['glyph'] }, [member('Icon', { name: 'icon', size: 'size' })])],
      ),
      cond('!iconOnly', [el('span', { part: 'label', class: ['label'] }, [text('label')])]),
      cond('trailingIcon !== undefined && !iconOnly', [
        el('span', { class: ['glyph'] }, [member('Icon', { name: 'trailingIcon', size: 'size' })]),
      ]),
      // Drawn for the eye. The name says the count in the app's words.
      cond('counted', [
        el('span', { class: ['count'], attrs: { 'aria-hidden': lit('true') } }, [
          member('Badge', { variant: lit('solid'), tone: lit('accent'), count: 'count?.value' }),
        ]),
      ]),
    ],
  ),
  grid: { props: { label: 'Save' } },
  states: [
    {
      name: 'sizes side by side',
      many: {
        within: { member: 'Inline', props: { gap: 3 } },
        each: [
          { props: { size: 'sm', icon: 'add', label: 'sm' } },
          { props: { size: 'md', icon: 'add', label: 'md' } },
          { props: { size: 'lg', icon: 'add', label: 'lg' } },
        ],
      },
    },
    { name: 'size sm', props: { size: 'sm', label: 'Save' }, expect: { 'data-size': 'sm' } },
    { name: 'size md', props: { label: 'Save' }, expect: { 'data-size': 'md' } },
    { name: 'size lg', props: { size: 'lg', label: 'Save' }, expect: { 'data-size': 'lg' } },
    { name: 'leading icon', props: { icon: 'add', label: 'New ticket' } },
    { name: 'trailing icon', props: { trailingIcon: 'next', label: 'Continue' } },
    {
      name: 'icon-only',
      props: { iconOnly: true, icon: 'edit', label: 'Edit' },
      expect: { 'data-icon-only': '', 'aria-label': 'Edit' },
    },
    {
      name: 'icon-only at every size',
      many: {
        within: { member: 'Inline', props: { gap: 3 } },
        each: [
          { props: { size: 'sm', iconOnly: true, icon: 'delete', label: 'Delete (sm)' } },
          { props: { size: 'md', iconOnly: true, icon: 'delete', label: 'Delete (md)' } },
          { props: { size: 'lg', iconOnly: true, icon: 'delete', label: 'Delete (lg)' } },
        ],
      },
    },
    {
      name: 'loading',
      props: { loading: true, label: 'Saving' },
      expect: { 'data-state': 'loading', 'aria-busy': 'true' },
    },
    {
      name: 'loading, with a leading icon it replaces',
      props: { loading: true, icon: 'add', label: 'New ticket' },
    },
    {
      name: 'disabled',
      props: { disabled: true, label: 'Save' },
      expect: { 'data-disabled': '', disabled: '' },
    },
    {
      name: 'loading + disabled',
      props: { loading: true, disabled: true, label: 'Saving' },
      expect: { 'data-state': 'loading', 'data-disabled': '', 'aria-busy': 'true' },
    },
    {
      name: 'pressed on — the active cell, latched',
      props: { variant: 'soft', pressed: true, label: 'Watching' },
      expect: { 'data-state': 'on', 'aria-pressed': 'true' },
    },
    {
      name: 'pressed off — the rest row, still telling the toggle’s truth',
      props: { variant: 'soft', pressed: false, label: 'Watching' },
      expect: { 'data-state': 'off', 'aria-pressed': 'false' },
    },
    {
      name: 'expanded — a disclosure’s trigger while its region shows',
      props: {
        variant: 'ghost',
        tone: 'neutral',
        expanded: true,
        iconOnly: true,
        icon: 'up',
        label: 'Details',
      },
      expect: { 'aria-expanded': 'true' },
    },
    {
      name: 'collapsed — the same trigger while its region is hidden',
      props: {
        variant: 'ghost',
        tone: 'neutral',
        expanded: false,
        iconOnly: true,
        icon: 'down',
        label: 'Details',
      },
      expect: { 'aria-expanded': 'false' },
    },
    {
      name: 'a count on the corner of an icon-only button',
      props: {
        variant: 'ghost',
        tone: 'neutral',
        iconOnly: true,
        icon: 'notification',
        label: 'Notifications',
        count: { value: 3, label: 'Notifications, 3 unread' },
      },
      expect: { 'aria-label': 'Notifications, 3 unread' },
    },
    {
      name: 'a count past its cap',
      props: {
        variant: 'ghost',
        tone: 'neutral',
        iconOnly: true,
        icon: 'notification',
        label: 'Notifications',
        count: { value: 128, label: 'Notifications, 128 unread' },
      },
      expect: { 'aria-label': 'Notifications, 128 unread' },
    },
    {
      name: 'a count of zero',
      props: {
        variant: 'ghost',
        tone: 'neutral',
        iconOnly: true,
        icon: 'notification',
        label: 'Notifications',
        count: { value: 0, label: 'Notifications, 0 unread' },
      },
      expect: { 'aria-label': 'Notifications' },
    },
    {
      name: 'a count beside a label',
      props: {
        variant: 'outline',
        tone: 'neutral',
        label: 'Inbox',
        count: { value: 12, label: 'Inbox, 12 unread' },
      },
      expect: { 'aria-label': 'Inbox, 12 unread' },
    },
    {
      name: 'a count at every size',
      many: {
        within: { member: 'Inline', props: { gap: 3 } },
        each: (['sm', 'md', 'lg'] as const).map((size) => ({
          props: {
            size,
            variant: 'ghost',
            tone: 'neutral',
            iconOnly: true,
            icon: 'notification',
            label: `Notifications (${size})`,
            count: { value: 7, label: `Notifications (${size}), 7 unread` },
          },
        })),
      },
    },
    {
      name: 'every cell, disabled',
      many: {
        within: { member: 'Inline', props: { gap: 3, wrap: true } },
        each: [
          // The danger cells come last, as a danger Button does in any group (`danger-last`).
          { props: { variant: 'solid', tone: 'accent', disabled: true, label: 'solid/accent' } },
          { props: { variant: 'soft', tone: 'accent', disabled: true, label: 'soft/accent' } },
          {
            props: {
              variant: 'outline',
              tone: 'neutral',
              disabled: true,
              label: 'outline/neutral',
            },
          },
          {
            props: { variant: 'outline', tone: 'accent', disabled: true, label: 'outline/accent' },
          },
          { props: { variant: 'ghost', tone: 'neutral', disabled: true, label: 'ghost/neutral' } },
          { props: { variant: 'ghost', tone: 'accent', disabled: true, label: 'ghost/accent' } },
          { props: { variant: 'solid', tone: 'danger', disabled: true, label: 'solid/danger' } },
          { props: { variant: 'soft', tone: 'danger', disabled: true, label: 'soft/danger' } },
          {
            props: { variant: 'outline', tone: 'danger', disabled: true, label: 'outline/danger' },
          },
          { props: { variant: 'ghost', tone: 'danger', disabled: true, label: 'ghost/danger' } },
        ],
      },
    },
  ],
})
