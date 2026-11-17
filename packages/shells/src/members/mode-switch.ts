import { describeMember, held, hold, js, lit, member, run } from '../dsl'

/**
 * ModeSwitch (`design/components/mode-switch.md`): a SegmentedControl preset
 * for choosing the page's colour mode, Light, Dark or System.
 *
 * It renders a SegmentedControl and lends it its identity, so the track
 * carries `mode-switch`. The document's preference is the foundation's
 * `useMode`. Without a `value` the member shows that preference and applies a
 * choice with the runtime's `setMode`; with one it shows `value` and only
 * reports the choice, so the application applies it.
 */
export default describeMember({
  member: 'ModeSwitch',
  dir: 'controls',
  recipe: null,
  types: {
    // The words the member writes itself, localized by passing every key, so one ModeSwitch
    // never mixes two languages.
    ModeSwitchMessages: `{
      /** The segment that pins the light mode: "Light". */
      light: string
      /** The segment that pins the dark mode: "Dark". */
      dark: string
      /** The segment that follows the operating system's mode: "System". */
      system: string
    }`,
  },
  lends: true,
  defaults: {
    messages: "() => ({ light: 'Light', dark: 'Dark', system: 'System' })",
    size: lit('md'),
    disabled: 'false',
  },
  mode: 'runtime',
  derived: {
    // The three choices in reading order: the two the reader pins, then the one that defers.
    options:
      "[{ value: 'light', label: messages.light, icon: 'mode-light' as const }, { value: 'dark', label: messages.dark, icon: 'mode-dark' as const }, { value: 'system', label: messages.system, icon: 'mode-system' as const }]",
    shown: 'value ?? runtime.preference',
    choose:
      "(next: string): void => { const picked = next === 'light' || next === 'dark' ? next : 'system'; if (value === undefined) setMode(picked); emit('change', picked) }",
  },
  // The spec's `agent` fence. The track is the SegmentedControl's, read through the holder it
  // fills in. It names the switch, and the SegmentedControl on it is this member's own part, so
  // the member registers in its place and withholds it. A choice takes a person's path:
  // uncontrolled, it sets the document's mode, and either way it reports `change`.
  agent: {
    element: 'borrowed.element?.()',
    state: {
      value: 'shown',
      options: 'options.map((option) => ({ id: option.value, label: option.label }))',
      disabled: 'disabled',
    },
    actions: { choose: { argument: 'id', run: 'value !== shown && choose(value)' } },
    withholds: 'borrowed.element?.()',
  },
  template: member(
    'SegmentedControl',
    {
      options: 'options',
      value: 'shown',
      label: 'label',
      size: 'size',
      disabled: 'disabled',
    },
    { on: { change: run('choose($event)') } },
  ),
  states: [
    {
      name: 'uncontrolled — the document’s preference',
      props: { label: 'Appearance' },
      expect: { role: 'radiogroup', 'data-size': 'md' },
    },
    {
      name: 'controlled — the application holds the choice',
      // Typed as the three choices, so the entry's handler takes what the member reports.
      holds: { value: js("'light' as 'light' | 'dark' | 'system'") },
      props: { label: 'Appearance', value: held('value'), onChange: hold('value') },
      expect: { role: 'radiogroup' },
    },
    {
      name: 'sm',
      props: { label: 'Appearance', value: 'dark', size: 'sm' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'disabled — while the application saves the last choice',
      props: { label: 'Appearance', value: 'system', disabled: true },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'localized',
      props: {
        label: 'Apparence',
        value: 'light',
        messages: { light: 'Clair', dark: 'Sombre', system: 'Système' },
      },
    },
  ],
})
