import { describeMember, each, el, identity, lit, text, run, when } from '../dsl'
import { NAVIGATES_HERE } from './link'

const FOUR = [
  { label: 'Users', href: '#users' },
  { label: 'Groups', href: '#groups' },
  { label: 'Roles', href: '#roles' },
  { label: 'Sessions', href: '#sessions' },
]

const NINE = [
  ...FOUR,
  { label: 'Service accounts', href: '#service-accounts' },
  { label: 'Sign-in policies', href: '#sign-in-policies' },
  { label: 'Identity providers', href: '#identity-providers' },
  { label: 'Delegations', href: '#delegations' },
  { label: 'Recovery', href: '#recovery' },
]

/**
 * SectionNav (`design/components/section-nav.md`): the row of links between
 * the sibling pages of one section, with the page the reader is on marked. The
 * app names the current item by its `href`, which is compared as the page it
 * names, and the item stays a link. A
 * caller that listens for `navigate` routes every item, as Link's caller does
 * (`link.md` §Routing).
 */
export default describeMember({
  member: 'SectionNav',
  dir: 'structure',
  recipe: 'structure/section-nav',
  types: {
    SectionNavItem: '{ label: string; href: string }',
  },
  derived: {
    // The origin an address is written with (`https://app.example.com`), in lower case, or
    // `undefined` for one written without an origin.
    originOf:
      '(href: string): string | undefined => /^(?:[a-z][a-z\\d+.-]*:)?\\/\\/[^/?#]*/iu.exec(href)?.[0].toLowerCase()',
    // The page an `href` names: its path, without an origin, a query, a hash or a trailing
    // slash. An `href` that is only a hash or a query is compared as written, and an origin
    // with nothing after it names the root.
    pageOf:
      "(href: string): string => { if (href.startsWith('#') || href.startsWith('?')) return href; const origin = originOf(href) ?? ''; const path = href.slice(origin.length).replace(/[?#].*$/u, ''); if (path === '') return origin === '' ? '' : '/'; return path.length > 1 ? path.replace(/\\/+$/u, '') : path }",
    // The index of the current item, or -1. An item whose `href` is exactly `current` comes
    // before one that only names the same page, and at most one item is current. `current`
    // is the address of the page being shown, so an item written without an origin is on its
    // origin. An item written with one matches only a `current` written with the same one.
    currentAt:
      '((at: string | undefined): number => { if (at === undefined) return -1; const exact = items.findIndex((item) => item.href === at); if (exact !== -1) return exact; const page = pageOf(at); const origin = originOf(at); return items.findIndex((item) => { const itemOrigin = originOf(item.href); return pageOf(item.href) === page && (itemOrigin === undefined || itemOrigin === origin) }) })(current)',
    navigatesHere: NAVIGATES_HERE,
    // An item's click that would navigate this tab is the app's router's, when it listens.
    route:
      "(event: MouseEvent, href: string): void => { if (!listening.navigate || !navigatesHere(event)) return; event.preventDefault(); emit('navigate', href) }",
  },
  // The spec's `agent` fence. A page is a choice by its `href`; the first of two items that
  // share one is the choice. Following a page presses its link, so the browser goes there or
  // `navigate` routes it, as for a person.
  agent: {
    on: 'root',
    state: {
      current: 'items[currentAt]?.href ?? null',
      items:
        'items.filter((item, at) => items.findIndex((other) => other.href === item.href) === at).map((item) => ({ id: item.href, label: item.label }))',
    },
    actions: {
      choose: {
        argument: 'id',
        run: "agentPress(root?.querySelectorAll('a')[items.findIndex((item) => item.href === value)])",
      },
    },
  },
  template: el(
    'nav',
    {
      ref: 'root',
      class: ['nav'],
      attrs: { 'aria-label': 'label', ...identity('SectionNav') },
    },
    [
      el('ul', { part: 'list', class: ['list'] }, [
        each(
          'items',
          'item',
          // By position as well as `href`: two items may share an `href`.
          '`${index}:${item.href}`',
          [
            el('li', { part: 'item', class: ['item'] }, [
              el(
                'a',
                {
                  class: ['link'],
                  attrs: {
                    href: 'item.href',
                    'aria-current': when('index === currentAt', lit('page')),
                  },
                  on: { click: run('route($event, item.href)') },
                },
                [el('span', { part: 'label', class: ['label'] }, [text('item.label')])],
              ),
            ]),
          ],
          'index',
        ),
      ]),
    ],
  ),
  states: [
    {
      name: 'the first page is current',
      props: { label: 'Identity sections', items: FOUR, current: '#users' },
      expect: { 'aria-label': 'Identity sections' },
    },
    {
      name: 'a later page is current',
      props: { label: 'Identity sections', items: FOUR, current: '#roles' },
    },
    {
      name: 'no page is current — the reader is outside every item',
      props: { label: 'Identity sections', items: FOUR },
    },
    {
      name: 'many pages — the row wraps onto further lines',
      props: { label: 'Identity sections', items: NINE, current: '#delegations' },
    },
    {
      name: 'a long label — clipped, so the row does not widen the page',
      props: {
        label: 'Identity sections',
        items: [
          { label: 'Users', href: '#users' },
          {
            label: 'Delegated administration approvals awaiting a second reviewer in every region',
            href: '#approvals',
          },
        ],
        current: '#users',
      },
    },
  ],
})
