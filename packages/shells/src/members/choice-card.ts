import {
  cond,
  describeMember,
  each,
  el,
  flag,
  identity,
  lit,
  member,
  run,
  text,
  when,
  type Node,
} from '../dsl'

const PLANS = [
  { value: 'starter', label: 'Starter', description: 'For side projects and solo queues' },
  { value: 'team', label: 'Team', description: 'Shared inboxes for up to 20 agents' },
  { value: 'scale', label: 'Scale', description: 'SSO, audit log, unlimited agents' },
]

const CHANNELS = [
  {
    value: 'email',
    label: 'Email',
    icon: 'inbox',
    description: 'Every public reply, in your inbox',
  },
  {
    value: 'inapp',
    label: 'In-app',
    icon: 'notification',
    description: 'Badges in the sidebar as it happens',
  },
  {
    value: 'chat',
    label: 'Chat',
    icon: 'comment',
    description: 'Mirror threads to your chat tool',
  },
  {
    value: 'webhook',
    label: 'Webhook',
    icon: 'link',
    description: 'POST every event to your endpoint',
  },
]

const CHECKED = 'isChecked(option.value)'
const OFF = 'disabled || option.disabled === true'
const LABEL_ID = '`${uid}-option-${index}-label`'
const DESCRIPTION_ID = '`${uid}-option-${index}-description`'

/**
 * One card: the whole surface is a `<label>` for its control, so the entire
 * card toggles. The control is visually hidden but real, a button with the
 * mode's role, named by the label line alone so the description stays in
 * `aria-describedby`.
 */
const card = (control: Node): Node =>
  el(
    'label',
    {
      part: 'option',
      class: ['option'],
      attrs: {
        'data-state': `(${CHECKED}) ? 'checked' : 'unchecked'`,
        'data-disabled': flag(OFF),
      },
    },
    [
      control,
      cond('option.icon !== undefined', [
        el('span', { class: ['icon'] }, [member('Icon', { name: 'option.icon', size: lit('md') })]),
      ]),
      el('span', { class: ['label'], attrs: { id: LABEL_ID } }, [text('option.label')]),
      cond('option.description !== undefined', [
        el('span', { class: ['description'], attrs: { id: DESCRIPTION_ID } }, [
          text('option.description'),
        ]),
      ]),
      // Selection is never colour alone: the glyph carries it, in space the copy always reserves.
      cond(CHECKED, [
        el('span', { class: ['glyph'] }, [
          member('Icon', { name: lit('confirm'), size: lit('md') }),
        ]),
      ]),
    ],
  )

/** The control's attributes both modes share. */
const control = (role: string) => ({
  type: lit('button'),
  role: lit(role),
  value: 'option.value',
  'aria-checked': CHECKED,
  disabled: OFF,
  'aria-labelledby': LABEL_ID,
  'aria-describedby': when('option.description !== undefined', DESCRIPTION_ID),
  'data-state': `(${CHECKED}) ? 'checked' : 'unchecked'`,
  'data-disabled': flag(OFF),
})

/**
 * ChoiceCard (`design/components/choice-card.md`): radio or checkbox
 * semantics on a card with room for an icon, a label and a line of copy.
 *
 * `mode: 'single'` is a radiogroup with one tab stop (the chosen card, or the
 * first enabled one), where arrow keys move focus and selection through
 * `roveRadio`. `mode: 'multiple'` is a group of checkboxes, every one a tab
 * stop, where arrow keys do nothing and `change` reports values in options
 * order, as CheckboxGroup does. Each control is a `<button>` with its role, as
 * Radix renders it, so neither mode needs a machine: the member holds the
 * value while the caller does not control it.
 */
export default describeMember({
  member: 'ChoiceCard',
  dir: 'controls',
  recipe: 'controls/choice-card',
  types: {
    ChoiceCardOption:
      '{ value: string; label: string; description?: string; icon?: IconRole; disabled?: boolean }',
  },
  defaults: { columns: '1', disabled: 'false' },
  state: {
    singleMirror: "mode === 'single' ? (defaultValue as string | undefined) : undefined",
    multipleMirror: "mode === 'multiple' ? ((defaultValue as string[] | undefined) ?? []) : []",
  },
  derived: {
    chosen: "mode === 'single' ? ((value as string | undefined) ?? singleMirror) : undefined",
    checkedValues:
      "mode === 'multiple' ? ((value as string[] | undefined) ?? multipleMirror) : ([] as string[])",
    isChecked:
      "(optionValue: string) => (mode === 'single' ? chosen === optionValue : checkedValues.includes(optionValue))",
    // The single mode's one tab stop.
    stop: 'chosen ?? options.find((option) => !(disabled || option.disabled === true))?.value',
    // A radio reports only a change, as Radix's group does.
    select:
      "(next: string) => next !== chosen && (singleMirror = next, emit('change', next), true)",
    toggle:
      "(optionValue: string, checked: boolean) => ((next: string[]) => (multipleMirror = next, emit('change', next)))(options.filter((option) => (option.value === optionValue ? checked : checkedValues.includes(option.value))).map((option) => option.value))",
    // An agent's choice in the multiple mode: the whole selection of the enabled options, in
    // options order. A disabled option keeps what it holds, because a person cannot change it.
    chooseAll:
      "(chosen: readonly string[]) => ((next: string[]) => next.length === checkedValues.length && next.every((each) => checkedValues.includes(each)) ? undefined : (multipleMirror = next, emit('change', next)))(options.filter((option) => (disabled || option.disabled === true ? checkedValues.includes(option.value) : chosen.includes(option.value))).map((option) => option.value))",
  },
  // The spec's `agent` fence. The value is a list of ids in both modes. The single mode takes
  // exactly one, because its choice cannot be cleared, and reports it as a press does; the
  // multiple mode sets the whole selection, as CheckboxGroup's does.
  agent: {
    on: 'grid',
    state: {
      value: "mode === 'single' ? (chosen === undefined ? [] : [chosen]) : checkedValues",
      options:
        'options.map((option) => ({ id: option.value, label: option.label, ...(option.disabled === true ? { disabled: true } : {}) }))',
      mode: 'mode',
      disabled: 'disabled',
    },
    actions: {
      choose: {
        argument: 'ids',
        run: `(() => {
          if (mode === 'multiple') return chooseAll(value)
          const [only] = value
          if (only === undefined || value.length !== 1) throw new Error('A single-choice ChoiceCard takes exactly one id.')
          select(only)
        })()`,
      },
    },
  },
  template: cond(
    "mode === 'single'",
    [
      el(
        'div',
        {
          part: 'root',
          class: ['grid'],
          // The group an agent reads the name of.
          ref: 'grid',
          attrs: {
            role: lit('radiogroup'),
            'aria-label': 'label',
            'data-columns': 'String(columns)',
            'data-disabled': flag('disabled'),
            ...identity('ChoiceCard'),
          },
        },
        [
          each(
            'options',
            'option',
            'option.value',
            [
              card(
                el('button', {
                  part: 'card',
                  class: ['control'],
                  attrs: {
                    ...control('radio'),
                    tabindex: 'option.value === stop ? 0 : -1',
                  },
                  on: {
                    click: run('select(option.value)'),
                    // Enter does nothing in a radio group (WAI-ARIA); arrows move and select.
                    keydown: run(
                      "$event.key === 'Enter' ? $event.preventDefault() : roveRadio($event, (next) => select(next))",
                    ),
                  },
                }),
              ),
            ],
            'index',
          ),
        ],
      ),
    ],
    [
      el(
        'div',
        {
          part: 'root',
          class: ['grid'],
          ref: 'grid',
          attrs: {
            role: lit('group'),
            'aria-label': 'label',
            'data-columns': 'String(columns)',
            'data-disabled': flag('disabled'),
            ...identity('ChoiceCard'),
          },
        },
        [
          each(
            'options',
            'option',
            'option.value',
            [
              card(
                el('button', {
                  part: 'card',
                  class: ['control'],
                  attrs: control('checkbox'),
                  on: {
                    click: run(`toggle(option.value, !(${CHECKED}))`),
                    // A checkbox toggles on Space only (WAI-ARIA); Enter is a form's key.
                    keydown: run('$event.preventDefault()', "$event.key === 'Enter'"),
                  },
                }),
              ),
            ],
            'index',
          ),
        ],
      ),
    ],
  ),
  states: [
    {
      name: 'single 3-up — plan tiers',
      props: { mode: 'single', options: PLANS, columns: 3, defaultValue: 'team', label: 'Plan' },
      expect: { role: 'radiogroup', 'data-columns': '3' },
    },
    {
      name: 'multiple, 2 selected — notification channels',
      props: {
        mode: 'multiple',
        options: CHANNELS,
        defaultValue: ['email', 'inapp'],
        label: 'Notification channels',
      },
      expect: { role: 'group' },
    },
    {
      name: 'descriptions + icons — icon top, two-line copy',
      props: { mode: 'multiple', options: CHANNELS, label: 'Notification channels' },
    },
    {
      name: 'disabled option — available on Scale',
      props: {
        mode: 'multiple',
        options: [...CHANNELS.slice(0, 3), { ...CHANNELS[3], disabled: true }],
        label: 'Notification channels',
      },
    },
    {
      name: 'disabled',
      props: {
        mode: 'single',
        options: PLANS,
        defaultValue: 'team',
        disabled: true,
        label: 'Plan',
      },
      expect: { 'data-disabled': '' },
    },
    {
      name: '2-column — the ceiling, container-resolved',
      props: { mode: 'single', options: PLANS, columns: 2, defaultValue: 'starter', label: 'Plan' },
      expect: { 'data-columns': '2' },
    },
  ],
})
