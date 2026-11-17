import {
  describeMember,
  each,
  el,
  fx,
  identity,
  lit,
  cond,
  run,
  text,
  when,
  type FixtureChild,
  type Node,
  type StateEntry,
} from '../dsl'

/** A section of the fixture's page: the item that names it and its one paragraph. */
interface Section {
  id: string
  label: string
  level?: 1 | 2
  text: string
}

const SECTIONS: Section[] = [
  { id: 'overview', label: 'Overview', text: 'What the service does and who runs it.' },
  { id: 'install', label: 'Install', text: 'The packages and the one command.' },
  { id: 'configure', label: 'Configure', text: 'The settings a team changes first.' },
  { id: 'deploy', label: 'Deploy', text: 'Where a release goes, and in what order.' },
  { id: 'troubleshoot', label: 'Troubleshoot', text: 'What a failed deploy says.' },
]

const [OVERVIEW, INSTALL, CONFIGURE, DEPLOY] = SECTIONS as [Section, Section, Section, Section]

const LEVELS: Section[] = [
  OVERVIEW,
  INSTALL,
  { id: 'npm', label: 'With npm', level: 2, text: 'One install, one lockfile.' },
  { id: 'pnpm', label: 'With pnpm', level: 2, text: 'A workspace and its filter.' },
  CONFIGURE,
  { id: 'environment', label: 'Environment', level: 2, text: 'The variables it reads.' },
  DEPLOY,
]

const LONG: Section[] = [
  OVERVIEW,
  {
    id: 'approvals',
    label: 'Delegated administration approvals awaiting a second reviewer in every region',
    text: 'Who approves a delegation, and how long it waits.',
  },
  DEPLOY,
]

/**
 * One fixture entry: the list beside a page of `sections` whose ids carry the
 * entry's word, as the React fixture builds it. Each id is the section's
 * Heading's `id`. `missing` names an item whose
 * section the page lacks, third in the list.
 */
function page(
  name: string,
  entry: string,
  region: string,
  sections: Section[],
  options: { narrow?: boolean; missing?: { id: string; label: string } } = {},
): StateEntry {
  const drawn = sections.map((section) => ({ ...section, id: `${entry}-${section.id}` }))
  const items = drawn.map(({ id, label, level }) =>
    level === 2 ? { id, label, level } : { id, label },
  )
  const listed =
    options.missing === undefined
      ? items
      : [...items.slice(0, 2), options.missing, ...items.slice(2)]
  const content: FixtureChild = {
    element: 'div',
    class: ['harnessPage'],
    attrs: { role: 'region', 'aria-label': region, tabindex: '0' },
    children: drawn.map((section) => ({
      element: 'div',
      class: ['harnessSection'],
      children: [
        fx(
          'Heading',
          { id: section.id, level: section.level === 2 ? 3 : 2 },
          { default: [section.label] },
        ),
        fx('Text', {}, { default: [section.text] }),
      ],
    })),
  }
  return {
    name,
    many: {
      within: { element: 'div', class: [options.narrow === true ? 'harnessNarrow' : 'harness'] },
      each: [{ props: { label: 'On this page', items: listed } }],
      also: [content],
    },
  }
}

/** A link to one entry of the list as drawn: `entry` is a group or one of its children. */
const link = (entry: string): Node =>
  el(
    'a',
    {
      part: 'link',
      class: ['link'],
      attrs: {
        href: `\`#\${${entry}.item.id}\``,
        'aria-current': when(`${entry}.at === currentAt`, lit('location')),
      },
      on: { click: run(`jumpToSection(nav, ${entry}.item.id, $event)`) },
    },
    [text(`${entry}.item.label`)],
  )

/**
 * TableOfContents (`design/components/table-of-contents.md`): the links to the
 * sections of one long page, with the section the reader is in marked.
 *
 * The engine's `watchSections` decides the current section, as it does for the
 * React member, and reports it after each decision; the member holds it and
 * emits `currentChange` when it changes. It runs again when the ids change,
 * after the list renders them. A link's click is `jumpToSection`, which marks
 * the link's section at once, holds the mark and moves focus to the section,
 * and leaves the browser to follow the link.
 */
export default describeMember({
  member: 'TableOfContents',
  dir: 'structure',
  recipe: 'structure/table-of-contents',
  types: {
    TableOfContentsItem: '{ id: string; label: string; level?: 1 | 2 }',
  },
  state: { current: 'null as string | null' },
  derived: {
    labelId: '`${uid}-label`',
    // Each section with the subsections that follow it. A subsection with no section before it
    // is drawn as a section.
    groups:
      'items.reduce((groups, item, at) => { const parent = groups[groups.length - 1]; if (item.level === 2 && parent !== undefined) parent.children.push({ item, at }); else groups.push({ item, at, children: [] }); return groups }, [] as { item: TableOfContentsItem; at: number; children: { item: TableOfContentsItem; at: number }[] }[])',
    // Of two items with one id, the first is marked.
    currentAt: 'items.findIndex((item) => item.id === current)',
  },
  effects: [
    {
      // An id holds no whitespace, so the ids joined by a space change exactly when the list does.
      watch: "items.map((item) => item.id).join(' ')",
      run: "watchSections(nav, items.map((item) => item.id), (id) => { if (id === current) return; current = id; emit('currentChange', id) })",
      release: 'ran()',
    },
  ],
  // The spec's `agent` fence. A section is a choice by its id; the first of two items that share
  // one is the choice. Going to a section presses its link, which marks it, reports it, moves
  // focus to it and lets the browser follow the link, as for a person.
  agent: {
    on: 'nav',
    state: {
      current: 'current',
      items:
        'items.filter((item, at) => items.findIndex((other) => other.id === item.id) === at).map((item) => ({ id: item.id, label: item.label }))',
    },
    actions: {
      choose: {
        argument: 'id',
        run: "agentPress(nav?.querySelectorAll('a')[items.findIndex((item) => item.id === value)])",
      },
    },
  },
  template: el(
    'nav',
    {
      ref: 'nav',
      class: ['nav'],
      attrs: { 'aria-labelledby': 'labelId', ...identity('TableOfContents') },
    },
    [
      el('p', { part: 'label', class: ['label'], attrs: { id: 'labelId' } }, [text('label')]),
      el('ul', { part: 'list', class: ['list'] }, [
        each('groups', 'group', '`${group.at}:${group.item.id}`', [
          el('li', { part: 'item', class: ['item'] }, [
            link('group'),
            cond('group.children.length > 0', [
              el('ul', { part: 'sublist', class: ['sublist'] }, [
                each('group.children', 'child', '`${child.at}:${child.item.id}`', [
                  el('li', { part: 'item', class: ['item'] }, [link('child')]),
                ]),
              ]),
            ]),
          ]),
        ]),
      ]),
    ],
  ),
  states: [
    page(
      'a page of sections — the section at the top of the page is current',
      'page',
      'Guide',
      SECTIONS,
    ),
    page(
      'two levels — subsections one step in, under their section',
      'levels',
      'Guide with subsections',
      LEVELS,
    ),
    page(
      'a long label — it wraps, so the column does not widen',
      'long',
      'Guide with a long heading',
      LONG,
    ),
    page(
      'a phone’s width — the same column, above the page',
      'phone',
      'Guide on a phone',
      SECTIONS,
      {
        narrow: true,
      },
    ),
    page(
      'a missing section — still a link, never current',
      'missing',
      'Guide without its release notes',
      SECTIONS,
      { missing: { id: 'missing-release-notes', label: 'Release notes' } },
    ),
  ],
})
