import { cond, describeMember, each, el, identity, js, lit, member, run, text } from '../dsl'
import { NAVIGATES_HERE } from './link'

const TWO = [{ label: 'Tickets', href: '#tickets' }, { label: 'Ticket #4182' }]

const FOUR = [
  { label: 'Home', href: '#home' },
  { label: 'Workspaces', href: '#workspaces' },
  { label: 'Support', href: '#support' },
  { label: 'Ticket #4182' },
]

const SIX = [
  { label: 'Home', href: '#home' },
  { label: 'Workspaces', href: '#workspaces' },
  { label: 'Northwind', href: '#northwind' },
  { label: 'Support', href: '#support' },
  { label: 'Escalations', href: '#escalations' },
  { label: 'Ticket #4182' },
]

/**
 * Breadcrumbs (`design/components/breadcrumbs.md`): the trail of links from
 * the root to the current page. It never wraps: above `maxItems` the middle
 * collapses into a Menu, keeping the first crumb and the last two. The last
 * crumb is the current page, text marked `aria-current`, never a link. A
 * caller that listens for `navigate` routes every crumb with an `href`, as
 * Link's caller does (`link.md` §Routing).
 */
export default describeMember({
  member: 'Breadcrumbs',
  dir: 'structure',
  recipe: 'structure/breadcrumbs',
  types: {
    // `onSelect` is for a crumb with no `href` that routes in JavaScript; it also fires on every
    // click of a crumb with an `href`, so a router uses `onNavigate` (`link.md` §Routing).
    BreadcrumbItem: '{ label: string; href?: string; onSelect?: () => void }',
  },
  defaults: { maxItems: '4', label: lit('Breadcrumb'), overflowLabel: lit('Show path') },
  derived: {
    collapsed: 'items.length > maxItems',
    // The trail as drawn; `null` holds the overflow's place.
    row: 'collapsed ? [...items.slice(0, 1), null, ...items.slice(1).slice(-2)] : items',
    last: 'row.length - 1',
    // A hidden crumb as a menu command: the item's `onSelect`, else the app's router, else a
    // navigation like an `<a href>`, so the vocabulary needs no router. A menu item is a
    // command, not a link, so there is no modified click to leave to the browser.
    hidden:
      "collapsed ? items.slice(1, -2).map((item) => ({ label: item.label, onSelect: () => { if (item.onSelect) item.onSelect(); else if (item.href !== undefined) { if (listening.navigate) emit('navigate', item.href); else window.location.assign(item.href) } } })) : []",
    navigatesHere: NAVIGATES_HERE,
    // A crumb's click that would navigate this tab is the app's router's, when it listens.
    route:
      "(event: MouseEvent, href: string | undefined): void => { if (href === undefined || !listening.navigate || !navigatesHere(event)) return; event.preventDefault(); emit('navigate', href) }",
  },
  // The spec's `agent` fence. A crumb is a choice by its label, the first of two that share one.
  // A crumb on the trail is pressed, and a hidden one runs as its overflow entry does, so the
  // overflow Button and its Menu, the trail's own parts, are withheld. The overflow is always
  // the second rung.
  agent: {
    on: 'root',
    state: {
      items:
        'items.filter((item, at) => items.findIndex((other) => other.label === item.label) === at).map((item) => ({ id: item.label, label: item.label, ...(item === items[items.length - 1] || (item.href === undefined && item.onSelect === undefined) ? { disabled: true } : {}) }))',
    },
    actions: {
      choose: {
        argument: 'id',
        run: `(() => {
          const item = items.find((candidate) => candidate.label === value)
          if (item === undefined) return
          const shown = row.indexOf(item)
          if (shown === -1) hidden.find((entry) => entry.label === value)?.onSelect()
          else agentPress(root?.querySelectorAll(':scope > ol > li')[shown]?.querySelector('a, button'))
        })()`,
      },
    },
    withholds: "hidden.length === 0 ? null : root?.querySelectorAll(':scope > ol > li')[1]",
  },
  template: el(
    'nav',
    {
      ref: 'root',
      class: ['nav'],
      attrs: { 'aria-label': 'label', ...identity('Breadcrumbs') },
    },
    [
      el('ol', { part: 'list', class: ['list'] }, [
        each(
          'row',
          'rung',
          "rung === null ? 'overflow' : `${at}-${rung.label}`",
          [
            el('li', { part: 'item', class: ['item'] }, [
              cond(
                'rung === null',
                [
                  member(
                    'Menu',
                    { defaultOpen: 'defaultOpen', items: 'hidden' },
                    {
                      slots: {
                        trigger: [
                          member('Button', {
                            variant: lit('ghost'),
                            tone: lit('neutral'),
                            size: lit('sm'),
                            iconOnly: 'true',
                            icon: lit('overflow'),
                            label: 'overflowLabel',
                          }),
                        ],
                      },
                    },
                  ),
                ],
                'at === last',
                [
                  // The current page: text, never a link to itself.
                  el('span', { class: ['crumb'], attrs: { 'aria-current': lit('page') } }, [
                    text('rung.label'),
                  ]),
                ],
                'rung.href !== undefined',
                [
                  el(
                    'a',
                    {
                      class: ['crumb'],
                      attrs: { href: 'rung.href' },
                      on: { click: run('(rung.onSelect?.(), route($event, rung.href))') },
                    },
                    [text('rung.label')],
                  ),
                ],
                'rung.onSelect !== undefined',
                [
                  el(
                    'button',
                    {
                      class: ['crumb'],
                      attrs: { type: lit('button') },
                      on: { click: run('rung.onSelect?.()') },
                    },
                    [text('rung.label')],
                  ),
                ],
                // A crumb with no destination is still part of the path, so it is drawn as text.
                [el('span', { class: ['crumb'] }, [text('rung.label')])],
              ),
              cond('at !== last', [
                el('span', { part: 'separator', class: ['separator'] }, [
                  member('Icon', { name: lit('next'), size: lit('sm') }),
                ]),
              ]),
            ]),
          ],
          'at',
        ),
      ]),
    ],
  ),
  states: [
    { name: 'two levels', props: { items: TWO }, expect: { 'aria-label': 'Breadcrumb' } },
    { name: 'four levels — no overflow yet', props: { items: FOUR } },
    { name: 'collapsed — the first crumb, the overflow, and the last two', props: { items: SIX } },
    {
      name: 'overflow open — the hidden crumbs, in order',
      props: { items: SIX, defaultOpen: true },
    },
    {
      name: 'collapsing disabled — the whole path, however long',
      props: { items: SIX, maxItems: js('Infinity') },
    },
    {
      name: 'long labels — clipped, so the trail stays one line',
      props: {
        items: [
          { label: 'Home', href: '#home' },
          { label: 'Refund not received for order 88-2401 placed in March', href: '#thread' },
          { label: 'Ticket #4182' },
        ],
      },
    },
  ],
})
