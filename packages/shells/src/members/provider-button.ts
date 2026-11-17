import { cond, describeMember, el, emit, flag, identity, lit, member, text } from '../dsl'

const GOOGLE = { provider: 'google', label: 'Continue with Google' }

/**
 * ProviderButton (`design/components/provider-button.md`): a Button preset for
 * signing in with an identity provider, with the provider's mark and the app's
 * label. The mark is the foundation's `BrandMark`, drawn from the engine's
 * brand data in the provider's own colours, so it is never an icon the theme
 * recolours. The appearance is fixed at Button's `outline`/`neutral`: the
 * element sets Button's attributes and its recipe composes Button's. Loading
 * keeps focus, colours and the name, and ignores presses.
 */
export default describeMember({
  member: 'ProviderButton',
  dir: 'controls',
  recipe: 'controls/provider-button',
  types: {
    ProviderButtonProvider: "ProviderButtonProps['provider']",
  },
  defaults: { size: lit('md'), loading: 'false', disabled: 'false', type: lit('button') },
  // The spec's `agent` fence. A press is the button's own click (`agentPress`), as Button's is,
  // so a disabled or loading button does nothing. The press starts the sign-in, and the person
  // completes it with the provider.
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
        type: 'type',
        disabled: 'disabled',
        'aria-busy': 'loading ? true : undefined',
        'aria-describedby': 'ariaDescribedby',
        'data-variant': lit('outline'),
        'data-tone': lit('neutral'),
        'data-size': 'size',
        'data-state': "loading ? 'loading' : undefined",
        'data-disabled': flag('disabled'),
        'data-provider': 'provider',
        ...identity('ProviderButton'),
      },
      // Loading is not disabled, so this stops an Enter from starting a sign-in already under way.
      on: { click: emit('click', { args: ['$event'], when: '!loading' }) },
    },
    [
      cond(
        'loading',
        [
          el('span', { part: 'spinner', class: ['spinner'] }, [
            member('Icon', { name: lit('loading'), size: 'size' }),
          ]),
        ],
        [
          // Decorative: the label names the provider, and a named mark would be read twice.
          el('span', { part: 'mark', class: ['mark'] }, [
            el({ expr: 'BrandMark' }, { attrs: { name: 'provider', size: 'size' } }),
          ]),
        ],
      ),
      el('span', { part: 'label', class: ['label'] }, [text('label')]),
    ],
  ),
  states: [
    {
      name: 'google',
      props: GOOGLE,
      expect: {
        'data-provider': 'google',
        'data-variant': 'outline',
        'data-tone': 'neutral',
        'data-size': 'md',
      },
    },
    {
      name: 'microsoft',
      props: { provider: 'microsoft', label: 'Continue with Microsoft' },
      expect: { 'data-provider': 'microsoft' },
    },
    {
      name: 'github — the one mark that takes the text colour',
      props: { provider: 'github', label: 'Continue with GitHub' },
      expect: { 'data-provider': 'github' },
    },
    { name: 'small', props: { ...GOOGLE, size: 'sm' }, expect: { 'data-size': 'sm' } },
    { name: 'large', props: { ...GOOGLE, size: 'lg' }, expect: { 'data-size': 'lg' } },
    {
      name: 'loading — the ceremony has started',
      props: { ...GOOGLE, loading: true },
      expect: { 'data-state': 'loading', 'aria-busy': 'true' },
    },
    {
      name: 'disabled',
      props: { provider: 'microsoft', label: 'Continue with Microsoft', disabled: true },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'a chooser — the card is the measure, so the column stretches them',
      many: {
        within: { member: 'Stack', props: { gap: 3 } },
        each: [
          { props: GOOGLE },
          { props: { provider: 'microsoft', label: 'Continue with Microsoft' } },
          { props: { provider: 'github', label: 'Continue with GitHub' } },
        ],
      },
    },
    { name: 'localized', props: { provider: 'google', label: 'Mit Google fortfahren' } },
  ],
})
