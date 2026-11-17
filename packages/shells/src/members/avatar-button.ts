import { cond, describeMember, el, emit, flag, identity, lit, member } from '../dsl'

/**
 * A portrait as a data URI, as Avatar's fixture has, so the image entry
 * renders the same without a network request.
 */
const PORTRAIT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" fill="#557"/>' +
      '<circle cx="32" cy="24" r="12" fill="#bbd"/>' +
      '<circle cx="32" cy="62" r="22" fill="#bbd"/>' +
      '</svg>',
  )

const ADA = { name: 'Ada Lovelace', label: 'Account menu' }

/**
 * AvatarButton (`design/components/avatar-button.md`): a Button preset whose
 * face is an Avatar, such as the trigger of an account menu. The face is the
 * `Avatar` member at the button's size, decorative, because `label` names the
 * action and never the person. The appearance is fixed at Button's
 * `ghost`/`neutral`: the element sets Button's attributes and its recipe
 * composes Button's. Loading keeps focus and the name, hides the face behind
 * the spinner and ignores presses; the face stays rendered so the box keeps
 * its size.
 */
export default describeMember({
  member: 'AvatarButton',
  dir: 'controls',
  recipe: 'controls/avatar-button',
  defaults: { size: lit('md'), disabled: 'false', loading: 'false', current: 'false' },
  derived: {
    // Loading takes precedence over the toggle in `data-state`; `aria-pressed` still reports it.
    // Not named `state`: Svelte reads `$state` as a store of a value of that name.
    dataState: "loading ? 'loading' : pressed === undefined ? undefined : pressed ? 'on' : 'off'",
  },
  // The spec's `agent` fence. A press is the button's own click (`agentPress`), as Button's is,
  // so a disabled or loading button does nothing, and as a Menu's trigger it opens the menu.
  agent: {
    on: 'control',
    state: { disabled: 'disabled', loading: 'loading' },
    actions: { press: 'agentPress(control)' },
  },
  template: el(
    'button',
    {
      part: 'root',
      class: ['button'],
      // The control an agent reads the name of and presses.
      ref: 'control',
      attrs: {
        type: lit('button'),
        disabled: 'disabled',
        // The face shows no text, so the name is set here, as on an icon-only Button.
        'aria-label': 'label',
        'aria-busy': 'loading ? true : undefined',
        'aria-current': "current ? 'page' : undefined",
        'aria-pressed': 'pressed',
        'data-variant': lit('ghost'),
        'data-tone': lit('neutral'),
        'data-size': 'size',
        'data-state': 'dataState',
        'data-disabled': flag('disabled'),
        ...identity('AvatarButton'),
      },
      // Loading is not disabled, so this stops an Enter from running a command already in flight.
      on: { click: emit('click', { args: ['$event'], when: '!loading' }) },
    },
    [
      // Decorative: an Avatar without a `label` is hidden from assistive technology.
      el('span', { part: 'face', class: ['face'] }, [
        member('Avatar', { name: 'name', src: 'src', size: 'size' }),
      ]),
      cond('loading', [
        el('span', { part: 'spinner', class: ['spinner'] }, [
          member('Icon', { name: lit('loading'), size: 'size' }),
        ]),
      ]),
    ],
  ),
  states: [
    {
      name: 'initials — named by the action, not the person',
      props: ADA,
      expect: {
        'data-variant': 'ghost',
        'data-tone': 'neutral',
        'data-size': 'md',
        'aria-label': 'Account menu',
        'data-state': null,
      },
    },
    { name: 'an image, over the initials it replaces', props: { ...ADA, src: PORTRAIT } },
    { name: 'no name — the user glyph', props: { name: '', label: 'Sign in' } },
    { name: 'small', props: { ...ADA, size: 'sm' }, expect: { 'data-size': 'sm' } },
    {
      name: 'large — the box follows the face',
      props: { ...ADA, size: 'lg' },
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'three sizes',
      many: {
        within: { member: 'Inline', props: { gap: 3, align: 'center' } },
        each: (['sm', 'md', 'lg'] as const).map((size) => ({
          props: { name: 'Ada Lovelace', label: `Account menu (${size})`, size },
        })),
      },
    },
    {
      name: 'loading',
      props: { ...ADA, loading: true },
      expect: { 'data-state': 'loading', 'aria-busy': 'true' },
    },
    {
      name: 'disabled',
      props: { ...ADA, disabled: true },
      expect: { 'data-disabled': '', disabled: '' },
    },
    {
      name: 'pressed on — the active cell, latched',
      props: { name: 'Ada Lovelace', label: 'Show my tickets', pressed: true },
      expect: { 'data-state': 'on', 'aria-pressed': 'true' },
    },
    {
      name: 'pressed off — the rest cell',
      props: { name: 'Ada Lovelace', label: 'Show my tickets', pressed: false },
      expect: { 'data-state': 'off', 'aria-pressed': 'false' },
    },
    {
      name: 'current',
      props: { name: 'Ada Lovelace', label: 'Your profile', current: true },
      expect: { 'aria-current': 'page' },
    },
  ],
})
