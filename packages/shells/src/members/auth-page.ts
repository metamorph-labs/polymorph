import {
  cond,
  describeMember,
  el,
  fx,
  identity,
  lit,
  member,
  slot,
  text,
  type FixtureChild,
  type Node,
} from '../dsl'

const BRAND = [fx('Badge', { variant: 'solid', tone: 'accent' }, { default: ['Relay'] })]

/** The account line, in the card. Two entries share it, as one product says it one way. */
const SIGN_UP: FixtureChild[] = [
  'Don’t have an account? ',
  fx('Link', { href: '#signup' }, { default: ['Sign up'] }),
]

/** A primary action and its alternative, closer together than two fields, both card-wide. */
const ACTIONS = fx(
  'Stack',
  { gap: 3 },
  {
    default: [
      fx('Button', { label: 'Sign in', type: 'submit' }),
      fx('Button', { variant: 'outline', tone: 'neutral', label: 'Email me a sign-in link' }),
    ],
  },
)

const fields = (error?: string): FixtureChild[] => [
  fx(
    'FormField',
    { label: 'Email' },
    {
      default: [
        fx('Input', { type: 'email', autoComplete: 'email', placeholder: 'you@example.com' }),
      ],
    },
  ),
  fx(
    'FormField',
    { label: 'Password', ...(error === undefined ? {} : { error }) },
    {
      default: [fx('Input', { type: 'password', autoComplete: 'current-password' })],
      labelEnd: [
        fx(
          'Link',
          { href: '#reset', variant: 'standalone' },
          { default: ['Forgot your password?'] },
        ),
      ],
    },
  ),
  ACTIONS,
]

const WELCOME = { title: 'Welcome back' }

const INVITED = ['Enter the address your team invited.']

/** The card: the heading and its back control, the form, and the account line. */
const card: Node = el('div', { part: 'card', class: ['card'] }, [
  // Marked for the illustrated layout's staggered entrance, as a host marks its fields.
  el('div', { part: 'heading', class: ['heading'], attrs: { 'data-auth-enter': lit('') } }, [
    el(
      'div',
      { part: 'titleRow', class: ['titleRow', { name: 'withBack', when: 'slots.backAction' }] },
      [
        cond('slots.backAction', [
          el('div', { part: 'backAction', class: ['backAction'] }, [slot('backAction')]),
        ]),
        el('h1', { part: 'title', class: ['title'] }, [text('title')]),
      ],
    ),
    cond('slots.description', [
      el('p', { part: 'description', class: ['description'] }, [slot('description')]),
    ]),
  ]),
  slot(),
  cond('slots.cardFooter', [
    el('div', { part: 'cardFooter', class: ['cardFooter'] }, [slot('cardFooter')]),
  ]),
])

/**
 * AuthPage (`design/archetypes/auth-page.md`): the page for sign-in, sign-up,
 * a setup step and a whole-page status, the one screen family outside AppShell,
 * so it renders its own `<main>`. The heading sits inside the card with the fields it
 * introduces. The column is the foundation's `PageTransition`, so a new
 * `transitionKey` replays the arrival without remounting the form, and
 * `pending` holds it still; the illustrated layout staggers each
 * `[data-auth-enter]` element's entrance by its order.
 */
export default describeMember({
  member: 'AuthPage',
  dir: 'archetypes',
  recipe: 'archetypes/auth-page',
  recipes: { transitions: 'conventions/page-transitions' },
  defaults: { layout: lit('centered'), pending: 'false' },
  derived: { illustrated: "layout === 'illustrated'" },
  effects: [
    {
      // The visual order of the staggered entrance, set without keying or remounting a field.
      watch: '[illustrated, transitionKey]',
      run: "illustrated && body?.querySelectorAll('[data-auth-enter]').forEach((item, index) => (item as HTMLElement).style.setProperty('--pm-page-enter-order', String(Math.min(index, 9))))",
    },
  ],
  template: el(
    'main',
    {
      part: 'page',
      class: ['page', { name: 'illustrated', when: 'illustrated' }],
      attrs: {
        'aria-busy': 'pending ? true : undefined',
        'data-auth-layout': 'layout',
        ...identity('AuthPage'),
      },
    },
    [
      cond('illustrated && slots.brand', [
        el('div', { part: 'topbar', class: ['topbar'] }, [slot('brand')]),
      ]),
      el('div', { part: 'body', ref: 'body', class: ['body'] }, [
        el(
          { expr: 'PageTransition' },
          {
            part: 'column',
            class: ['column', { name: 'transitions.page', when: 'transitionKey !== undefined' }],
            attrs: {
              as: lit('div'),
              transitionKey: 'transitionKey',
              pending: 'pending',
              ribbon: 'transitions.indicator',
            },
          },
          [
            cond('illustrated && slots.illustration', [
              el(
                'div',
                {
                  part: 'illustration',
                  class: ['illustration'],
                  attrs: { 'aria-hidden': lit('true') },
                },
                [slot('illustration')],
              ),
            ]),
            el('div', { part: 'formColumn', class: ['formColumn'] }, [
              cond('!illustrated && slots.brand', [
                el('div', { part: 'brand', class: ['brand'] }, [slot('brand')]),
              ]),
              cond(
                'illustrated',
                [el('div', { part: 'frame', class: ['frame'] }, [card])],
                [member('Card', {}, { slots: { default: [card] } })],
              ),
              cond('slots.footer', [
                el('div', { part: 'footer', class: ['footer'] }, [slot('footer')]),
              ]),
            ]),
          ],
        ),
      ]),
    ],
  ),
  states: [
    {
      name: 'sign in — the login block’s composition',
      props: WELCOME,
      slots: { brand: BRAND, description: INVITED, cardFooter: SIGN_UP, default: fields() },
    },
    {
      name: 'with a footer below the card — furniture, not the form’s own line',
      props: WELCOME,
      slots: {
        brand: BRAND,
        description: INVITED,
        cardFooter: SIGN_UP,
        footer: [
          fx('Link', { href: '#sso' }, { default: ['Use SSO'] }),
          fx('Link', { href: '#help' }, { default: ['Support'] }),
        ],
        default: fields(),
      },
    },
    {
      name: 'rejected — the error is the field’s, not a banner’s',
      props: { title: 'Welcome back' },
      slots: {
        brand: BRAND,
        cardFooter: SIGN_UP,
        default: fields('That password does not match.'),
      },
    },
    {
      name: 'no brand — the card carries the whole moment',
      props: { title: 'Reset your password' },
      slots: {
        description: ['We will email you a link.'],
        default: [
          fx(
            'FormField',
            { label: 'Email' },
            { default: [fx('Input', { type: 'email', autoComplete: 'email' })] },
          ),
          fx('Button', { label: 'Send the link', type: 'submit' }),
        ],
      },
    },
    {
      name: 'a step of a flow — the way back beside the title',
      props: { title: 'Your team' },
      slots: {
        brand: BRAND,
        description: ['Name it now. You can change it later.'],
        backAction: [
          fx('Button', {
            variant: 'ghost',
            tone: 'neutral',
            size: 'sm',
            icon: 'back',
            iconOnly: true,
            label: 'Back',
          }),
        ],
        default: [
          fx(
            'FormField',
            { label: 'Team name' },
            { default: [fx('Input', { placeholder: 'Northwind' })] },
          ),
          fx('Button', { label: 'Continue', type: 'submit' }),
        ],
      },
    },
    {
      name: 'a status — nothing is at this address, and one way on',
      props: { title: 'Page not found' },
      slots: {
        brand: BRAND,
        description: ['No Relay page exists at this address.'],
        default: [
          fx(
            'Link',
            { href: '#overview', variant: 'button', buttonVariant: 'solid' },
            { default: ['Go to overview'] },
          ),
        ],
      },
    },
    {
      name: 'a status — it failed, with the notice and a retry',
      props: { title: 'Workspace unavailable' },
      slots: {
        brand: BRAND,
        description: ['The workspace could not be loaded. Nothing was changed.'],
        default: [
          fx(
            'Alert',
            { tone: 'danger', title: 'The service did not answer in time' },
            { default: ['Request 7f3a9c'] },
          ),
          fx(
            'Stack',
            { gap: 3 },
            {
              default: [
                fx('Button', { label: 'Try again' }),
                fx('Button', { variant: 'outline', tone: 'neutral', label: 'Sign in again' }),
              ],
            },
          ),
        ],
      },
    },
    {
      name: 'a status — the heading alone, with nothing to do here',
      props: { title: 'This link has expired' },
      slots: { description: ['Open the newest invitation email and follow its link.'] },
    },
  ],
})
