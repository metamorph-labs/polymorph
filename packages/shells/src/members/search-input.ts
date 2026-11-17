import { describeMember, el, flag, identity, lit, member, run, text } from '../dsl'

/**
 * SearchInput (`design/components/search-input.md`): an Input preset for
 * searching. The `search` glyph, `clearable` and `type="search"` are set here
 * and not exposed, so every search box is the same.
 *
 * The shortcut hint gives way to the clear button: it shows only while the
 * field is empty, unfocused and enabled. The value is mirrored while the
 * caller does not control it, so the hint knows when the field holds text.
 * The hint is Input's `trailing` slot, passed only while it shows, because
 * Input draws its trailing box whenever the slot is passed, as React's Input
 * does when `trailing` is not `undefined`.
 */
export default describeMember({
  member: 'SearchInput',
  dir: 'controls',
  recipe: 'controls/search-input',
  defaults: { placeholder: lit('Search…'), size: lit('md'), disabled: 'false' },
  state: { focused: 'false', mirror: "defaultValue ?? ''" },
  derived: {
    current: 'value ?? mirror',
    showShortcut: "shortcut !== undefined && current === '' && !focused && !disabled",
  },
  // The spec's `agent` fence. One search box is one member: this one registers and withholds
  // the Input it draws, whose field it reads through the frame. An agent writes through the
  // field as typing does (`agentFill`), so the Input's change path runs and `change` is emitted.
  agent: {
    on: 'frame',
    element: "frame?.querySelector('input')",
    state: { value: 'current', disabled: 'disabled' },
    actions: {
      fill: { argument: 'text', run: "agentFill(frame?.querySelector('input'), value)" },
      clear: "agentFill(frame?.querySelector('input'), '')",
    },
    withholds: 'frame',
  },
  template: el(
    'span',
    {
      class: ['search'],
      ref: 'frame',
      attrs: { 'data-shortcut': flag('showShortcut'), ...identity('SearchInput') },
      // Focus anywhere inside, the clear button included, hides the hint.
      on: { focusin: run('focused = true'), focusout: run('focused = false') },
    },
    [
      member(
        'Input',
        {
          type: lit('search'),
          icon: lit('search'),
          clearable: 'true',
          clearLabel: 'clearLabel',
          size: 'size',
          disabled: 'disabled',
          value: 'value',
          defaultValue: 'defaultValue',
          placeholder: 'placeholder',
          'aria-label': 'ariaLabel',
          'aria-labelledby': 'ariaLabelledby',
          'aria-describedby': 'ariaDescribedby',
          id: 'id',
          name: 'name',
        },
        {
          on: { change: run("(mirror = $event, emit('change', $event))") },
          slots: {
            trailing: [
              // Decorative: if the app binds the shortcut, the app's own help announces it.
              el('span', { class: ['hint'], attrs: { 'aria-hidden': lit('true') } }, [
                member('Kbd', {}, { slots: { default: [text('shortcut')] } }),
              ]),
            ],
          },
          slotWhen: { trailing: 'showShortcut' },
        },
      ),
    ],
  ),
  states: [
    {
      name: 'empty, offering the shortcut that reaches it',
      props: { shortcut: '⌘K', 'aria-label': 'Search tickets' },
      expect: { 'data-shortcut': '' },
    },
    {
      name: 'with a value — the hint yields to the clear button',
      props: { defaultValue: 'webhook', shortcut: '⌘K', 'aria-label': 'Search tickets' },
      expect: { 'data-shortcut': null },
    },
    {
      name: 'no shortcut at all',
      props: { 'aria-label': 'Search tickets' },
      expect: { 'data-shortcut': null },
    },
    {
      name: 'small — the size a filter row uses',
      props: { size: 'sm', shortcut: '⌘K', 'aria-label': 'Search tickets' },
    },
    {
      name: 'disabled — nothing to reach, so nothing to hint at',
      props: { disabled: true, shortcut: '⌘K', 'aria-label': 'Search tickets' },
      expect: { 'data-shortcut': null },
    },
    {
      // Every other entry renders at its own width, where a stretched root and a field that
      // fills it look the same. This one shows whether the Input inside fills the root.
      name: 'in a column that stretches it — the field is as wide as it is given',
      many: {
        within: { member: 'FormField', props: { label: 'Search accounts' } },
        each: [{ props: { placeholder: 'Search accounts…' } }],
      },
      expect: { 'data-kind': 'field' },
    },
  ],
})
