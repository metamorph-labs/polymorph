import {
  cond,
  describeMember,
  el,
  fx,
  identity,
  js,
  member,
  slot,
  text,
  type FixtureValue,
} from '../dsl'

const DESCRIPTION = 'Everything customers have asked for, oldest first.'

const noop = js('() => {}')

/** The app's InlineEdit of the title: its value is the title, at the `lg` step. */
const RENAME = (props: Record<string, FixtureValue> = {}) =>
  fx('InlineEdit', { label: 'Queue name', value: 'Tickets', size: 'lg', onCommit: noop, ...props })

const ACTIONS = [
  fx('Button', { variant: 'ghost', tone: 'neutral', icon: 'download', label: 'Export' }),
  fx('Button', { icon: 'add', label: 'New ticket' }),
]

/** The page's `<h1>`, in both forms of the header. */
const heading = el('h1', { part: 'title', class: ['title'] }, [text('title')])

/**
 * PageHeader (`design/components/page-header.md`): the title, description and
 * actions at the top of a working page. The title is the page's only `<h1>`.
 *
 * `titleEdit` is an InlineEdit beside the `<h1>`, never inside it, because a
 * control inside a heading joins the heading's name. The header hands it
 * `valueHidden`, because the `<h1>` draws the value. The recipe keeps the
 * `<h1>`, visually hidden, while the field is open, so the page's title is
 * still found among its headings.
 */
export default describeMember({
  member: 'PageHeader',
  dir: 'structure',
  recipe: 'structure/page-header',
  template: el('header', { class: ['header'], attrs: { ...identity('PageHeader') } }, [
    el('div', { part: 'text', class: ['text'] }, [
      cond(
        'slots.titleEdit',
        [
          el('div', { part: 'titleRow', class: ['titleRow'] }, [
            heading,
            el('div', { part: 'titleEdit', class: ['titleEdit'] }, [
              slot('titleEdit', { pass: { valueHidden: 'true' } }),
            ]),
          ]),
        ],
        [heading],
      ),
      cond('description !== undefined', [
        el('p', { part: 'description', class: ['description'] }, [text('description')]),
      ]),
    ]),
    cond('slots.actions', [
      member('Inline', { gap: '3', wrap: 'true' }, { slots: { default: [slot('actions')] } }),
    ]),
  ]),
  states: [
    { name: 'title only', props: { title: 'Tickets' } },
    { name: 'with a description', props: { title: 'Tickets', description: DESCRIPTION } },
    {
      name: 'with actions — one primary, and it is the rightmost',
      props: { title: 'Tickets' },
      slots: { actions: ACTIONS },
    },
    {
      name: 'full',
      props: { title: 'Tickets', description: DESCRIPTION },
      slots: { actions: ACTIONS },
    },
    {
      name: 'a long title, with the actions holding their ground',
      props: {
        title:
          'Tickets, escalations and everything else the support queue has collected this quarter',
        description: 'The title wraps; the actions do not shrink.',
      },
      slots: { actions: ACTIONS },
    },
    {
      name: 'a title edited in place — the edit control beside the h1, outside it',
      props: { title: 'Tickets', description: DESCRIPTION },
      slots: { titleEdit: [RENAME()], actions: ACTIONS },
    },
    {
      name: 'renaming — the field in the title’s place, the h1 kept for assistive technology',
      props: { title: 'Tickets', description: DESCRIPTION },
      slots: { titleEdit: [RENAME({ defaultEditing: true })], actions: ACTIONS },
    },
  ],
})
