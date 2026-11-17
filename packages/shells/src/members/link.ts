import { cond, describeMember, el, flag, fx, identity, lit, member, run, slot, when } from '../dsl'

/** Attributes both renderings carry: the target and the `rel` that makes a new tab safe. */
const external = {
  'data-external': flag('external'),
  target: when('external', lit('_blank')),
  rel: when('external', lit('noreferrer')),
}

/**
 * Whether a click on a link would navigate this tab (`link.md` §Routing): the
 * primary button, no modifier key, and no other handler has taken it. Every
 * other click opens a tab or a window, or saves the link, and stays the
 * browser's. A link that opens elsewhere (Link's `external`) is the caller's to
 * leave out. AppShell's rows and Breadcrumbs' crumbs read the same test.
 */
export const NAVIGATES_HERE =
  '(event: MouseEvent): boolean => !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey'

/** The routing seam's click: the browser's navigation stopped, and the app's router called. */
const ROUTE = { click: run('route($event)', 'listening.navigate') }

/**
 * Link (`design/components/link.md`): navigation as text, or in Button's
 * costume. The costume sets Button's attributes and composes its class, so
 * Button's recipe styles it; the element stays an `<a>`. A caller that
 * listens for `navigate` gets the clicks that would navigate this tab, with
 * the browser's navigation stopped, and the browser keeps the rest.
 */
export default describeMember({
  member: 'Link',
  dir: 'controls',
  recipe: 'controls/link',
  types: {
    LinkVariant: "NonNullable<LinkProps['variant']>",
    LinkButtonGrid:
      "{ solid: 'accent'; soft: 'accent'; outline: 'accent' | 'neutral'; ghost: 'accent' | 'neutral' }",
  },
  // The costume's defaults; the text variants read none of them.
  defaults: {
    variant: lit('inline'),
    external: 'false',
    buttonVariant: lit('soft'),
    tone: lit('accent'),
    size: lit('md'),
  },
  derived: {
    navigatesHere: NAVIGATES_HERE,
    // An external link opens a new tab, so it is never the router's.
    route:
      "(event: MouseEvent): void => { if (external || !navigatesHere(event)) return; event.preventDefault(); emit('navigate', href) }",
  },
  // The spec's `agent` fence. A press is the link's own click (`agentPress`), so the router gets
  // it through `navigate` as it gets a person's, and without a router the browser follows the
  // link. An external link is refused: a browser opens a new tab only from a person's gesture.
  agent: {
    on: 'control',
    state: { external: 'external' },
    actions: {
      press: `(() => {
        if (external) throw new Error('An external link opens a new tab, which only a person’s press opens.')
        agentPress(control)
      })()`,
    },
  },
  template: cond(
    "variant === 'button'",
    [
      el(
        'a',
        {
          class: ['costume'],
          // The control an agent reads the name of and presses.
          ref: 'control',
          attrs: {
            href: 'href',
            'data-variant': 'buttonVariant',
            'data-tone': 'tone',
            'data-size': 'size',
            ...external,
            ...identity('Link'),
          },
          on: ROUTE,
        },
        [
          el('span', { part: 'label', class: ['costumeLabel'] }, [slot()]),
          // Button's trailing-icon slot. Decorative: `rel` and the copy around it announce the tab.
          cond('external', [
            el('span', { part: 'glyph', class: ['costumeGlyph'] }, [
              member('Icon', { name: lit('open-external'), size: 'size' }),
            ]),
          ]),
        ],
      ),
    ],
    [
      el(
        'a',
        {
          class: ['link'],
          ref: 'control',
          attrs: { href: 'href', 'data-variant': 'variant', ...external, ...identity('Link') },
          on: ROUTE,
        },
        [
          slot(),
          // Decorative, as above: a named glyph would be announced twice.
          cond('external', [member('Icon', { name: lit('open-external'), size: lit('sm') })]),
        ],
      ),
    ],
  ),
  states: [
    {
      // Text is the described paragraph, the closest member to the React entry's `<p>`.
      name: 'inline — underlined inside the sentence it belongs to',
      many: {
        within: { member: 'Text' },
        each: [],
        also: [
          'Retries stop after the first 5xx; the ',
          fx('Link', { href: '#delivery' }, { default: ['delivery log'] }),
          ' has the response bodies.',
        ],
      },
    },
    {
      name: 'standalone — a row, underlined on hover instead',
      props: { href: '#audit', variant: 'standalone' },
      slots: { default: ['Open the audit trail'] },
      expect: { 'data-variant': 'standalone' },
    },
    {
      name: 'external — a new tab, a glyph, and the rel that makes it safe',
      props: { href: 'https://example.com/status', external: true },
      slots: { default: ['Status page'] },
      expect: { 'data-external': '', target: '_blank', rel: 'noreferrer' },
    },
    {
      name: 'external and standalone',
      props: { href: 'https://example.com/docs', variant: 'standalone', external: true },
      slots: { default: ['Webhook documentation'] },
    },
    {
      name: 'inherits the step of the text around it',
      many: {
        within: { member: 'Stack', props: { gap: 3 } },
        each: [],
        also: [
          {
            element: 'p',
            children: [
              'A link in body copy is ',
              fx('Link', { href: '#a' }, { default: ['the same size as the copy'] }),
              '.',
            ],
          },
        ],
      },
    },
    {
      name: 'the costume, default — soft, accent, md; navigation holding rank in a row of Buttons',
      props: { href: '#billing', variant: 'button' },
      slots: { default: ['View billing'] },
      expect: { 'data-variant': 'soft', 'data-tone': 'accent', 'data-size': 'md' },
    },
    {
      name: 'the costume as solid — a claim chosen into, never defaulted',
      props: { href: '#setup', variant: 'button', buttonVariant: 'solid' },
      slots: { default: ['Start setup'] },
      expect: { 'data-variant': 'solid', 'data-tone': 'accent' },
    },
    {
      name: 'the costume as outline neutral',
      props: { href: '#docs', variant: 'button', buttonVariant: 'outline', tone: 'neutral' },
      slots: { default: ['Read the docs'] },
      expect: { 'data-variant': 'outline', 'data-tone': 'neutral' },
    },
    {
      name: 'external in costume — the glyph rides Button’s trailing slot',
      props: {
        href: 'https://example.com/status',
        variant: 'button',
        buttonVariant: 'outline',
        external: true,
      },
      slots: { default: ['Status page'] },
      expect: { 'data-external': '', target: '_blank', rel: 'noreferrer' },
    },
  ],
})
