import {
  cond,
  describeMember,
  el,
  flag,
  fx,
  identity,
  js,
  lit,
  run,
  slot,
  text,
  when,
  type FixtureChild,
} from '../dsl'
import { NAVIGATES_HERE } from './link'

const noop = js('() => {}')

const PEOPLE = [
  { name: 'Ada Okafor', role: 'Owner · signed in 2 minutes ago', seen: '2m', href: '#ada' },
  { name: 'Bao Tran', role: 'Member · signed in yesterday', seen: '1d', href: '#bao' },
  { name: 'Carmen Ruiz', role: 'Member · invited, not yet signed in', seen: '6d', href: '#carmen' },
]

const LONG_TITLE =
  'ticket-export-2026-eu-west-1-production-customer-support-archive-part-0001-of-0042'

const avatar = (name: string): FixtureChild => fx('Avatar', { name })

/**
 * List (`design/components/list.md`): a column of items of one kind, each
 * read, followed or picked, with `List.Item` as its part.
 *
 * One element takes an item's press: the title's link or button, whose
 * `::after` covers the row in the recipe. A trailing control comes after the
 * title in the document, so it is drawn above that target. An item with an
 * `href` is a link, and a caller that listens for `navigate` gets the clicks
 * that would navigate this tab, with the browser's navigation stopped, as
 * Link's caller does (`link.md` §Routing). An item without one whose caller
 * listens for `select` is a button.
 */
export default describeMember({
  member: 'List',
  dir: 'structure',
  recipe: 'structure/list',
  // The spec's `agent` fence. The items are the caller's children, so the list reads them from
  // its own `<ul>` in the document, by the class of the link or button that takes an item's
  // press, and `choose` presses that element, so `select`, `navigate` or the browser takes it as
  // a person's press.
  agent: {
    on: 'list',
    state: {
      items: 'listItems(list, styles.primary)',
      current: 'currentListItem(list, styles.primary)',
    },
    actions: {
      choose: { argument: 'id', run: 'chooseListItem(list, styles.primary, value)' },
    },
  },
  template: el(
    'ul',
    {
      ref: 'list',
      class: ['list'],
      // Written because a browser drops a list's semantics when its markers are removed.
      attrs: { role: lit('list'), 'aria-label': 'label', ...identity('List') },
    },
    [slot()],
  ),
  parts: [
    {
      name: 'Item',
      public: true,
      purpose:
        'one item: a title, with a leading mark, a description, a meta and a trailing control',
      defaults: { current: 'false' },
      derived: {
        navigatesHere: NAVIGATES_HERE,
        route:
          "(event: MouseEvent): void => { if (href === undefined || !listening.navigate || !navigatesHere(event)) return; event.preventDefault(); emit('navigate', href) }",
      },
      template: el(
        'li',
        {
          class: ['item'],
          attrs: {
            // The same attribute name Table.Row and Card use.
            'data-interactive': flag('href !== undefined || listening.select'),
            // Only on an item with the link or the button that carries `aria-current`.
            'data-current': flag('current && (href !== undefined || listening.select)'),
          },
        },
        [
          cond('slots.leading', [el('span', { class: ['leading'] }, [slot('leading')])]),
          el('span', { class: ['text'] }, [
            cond(
              'href !== undefined',
              [
                el(
                  'a',
                  {
                    part: 'link',
                    class: ['title', 'primary'],
                    attrs: { href: 'href', 'aria-current': when('current', lit('page')) },
                    on: { click: run("(emit('select'), route($event))") },
                  },
                  [text('title')],
                ),
              ],
              'listening.select',
              [
                el(
                  'button',
                  {
                    part: 'button',
                    class: ['title', 'primary'],
                    attrs: { type: lit('button'), 'aria-current': when('current', lit('true')) },
                    on: { click: { emit: 'select' } },
                  },
                  [text('title')],
                ),
              ],
              [el('span', { class: ['title'] }, [text('title')])],
            ),
            cond('description !== undefined', [
              el('span', { class: ['description'] }, [text('description')]),
            ]),
          ]),
          cond('meta !== undefined', [el('span', { class: ['meta'] }, [text('meta')])]),
          // After the title in the document, so it is drawn above the title's stretched target.
          cond('slots.trailing', [el('span', { class: ['trailing'] }, [slot('trailing')])]),
        ],
      ),
    },
  ],
  states: [
    {
      name: 'items that are read',
      props: { label: 'Recent sign-ins' },
      slots: {
        default: PEOPLE.map((person) =>
          fx('ListItem', { title: person.name, description: person.role, meta: person.seen }),
        ),
      },
      expect: { 'aria-label': 'Recent sign-ins' },
    },
    {
      name: 'items that navigate',
      props: { label: 'Members' },
      slots: {
        default: PEOPLE.map((person) =>
          fx(
            'ListItem',
            {
              title: person.name,
              description: person.role,
              meta: person.seen,
              href: person.href,
            },
            { leading: [avatar(person.name)] },
          ),
        ),
      },
    },
    {
      name: 'the item of the open page is current',
      props: { label: 'Members' },
      slots: {
        default: PEOPLE.map((person, index) =>
          fx('ListItem', {
            title: person.name,
            description: person.role,
            href: person.href,
            current: index === 0,
          }),
        ),
      },
    },
    {
      name: 'items that are picked',
      props: { label: 'Accounts' },
      slots: {
        default: PEOPLE.map((person, index) =>
          fx(
            'ListItem',
            {
              title: person.name,
              description: person.role,
              onSelect: noop,
              current: index === 0,
            },
            { leading: [avatar(person.name)] },
          ),
        ),
      },
    },
    {
      name: 'a trailing control — it takes its own press',
      props: { label: 'Invitations' },
      slots: {
        default: [
          fx(
            'ListItem',
            { title: 'Ada Okafor', description: 'Invited as an owner', href: '#ada' },
            {
              trailing: [
                fx('Button', { variant: 'outline', tone: 'neutral', size: 'sm', label: 'Resend' }),
              ],
            },
          ),
          fx(
            'ListItem',
            { title: 'Bao Tran', description: 'Invited as a member', href: '#bao' },
            { trailing: [fx('Badge', { tone: 'warning' }, { default: ['Expired'] })] },
          ),
        ],
      },
    },
    {
      name: 'a long title and description — they wrap, so the list does not widen the page',
      props: { label: 'Exports' },
      slots: {
        default: [
          fx('ListItem', {
            title: LONG_TITLE,
            description: `${LONG_TITLE}.zip, requested by an administrator and kept for thirty days`,
            meta: '4.2 GB',
          }),
        ],
      },
    },
  ],
})
