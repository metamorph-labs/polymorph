import { type ComponentStates } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/table-of-contents.module.css'
import { Heading } from './Heading'
import { TableOfContents, type TableOfContentsItem } from './TableOfContents'
import { Text } from './Text'

/**
 * States fixture, from `design/components/table-of-contents.md`'s States table.
 *
 * Each entry draws the list beside a page that scrolls, built from the
 * recipe's fixture boxes: the sections the items name, each a heading and a
 * paragraph. Each item's id is its section's Heading's `id`, so the page has
 * no element that only carries an id. The page is the region the list
 * follows, so scrolling it in the gallery moves the mark. The ids carry the
 * entry's name, because a gallery shows every entry on one page and an id
 * names one element.
 *
 * The page's direction is the document's, so no entry is right to left. The
 * indent is a logical property, and the member's test turns the document right
 * to left.
 */

interface Section {
  item: TableOfContentsItem
  /** The section's one paragraph. */
  text: string
}

const SECTIONS: Section[] = [
  { item: { id: 'overview', label: 'Overview' }, text: 'What the service does and who runs it.' },
  { item: { id: 'install', label: 'Install' }, text: 'The packages and the one command.' },
  { item: { id: 'configure', label: 'Configure' }, text: 'The settings a team changes first.' },
  { item: { id: 'deploy', label: 'Deploy' }, text: 'Where a release goes, and in what order.' },
  { item: { id: 'troubleshoot', label: 'Troubleshoot' }, text: 'What a failed deploy says.' },
]

const LEVELS: Section[] = [
  SECTIONS[0] as Section,
  SECTIONS[1] as Section,
  { item: { id: 'npm', label: 'With npm', level: 2 }, text: 'One install, one lockfile.' },
  { item: { id: 'pnpm', label: 'With pnpm', level: 2 }, text: 'A workspace and its filter.' },
  SECTIONS[2] as Section,
  { item: { id: 'environment', label: 'Environment', level: 2 }, text: 'The variables it reads.' },
  SECTIONS[3] as Section,
]

const LONG: Section[] = [
  SECTIONS[0] as Section,
  {
    item: {
      id: 'approvals',
      label: 'Delegated administration approvals awaiting a second reviewer in every region',
    },
    text: 'Who approves a delegation, and how long it waits.',
  },
  SECTIONS[3] as Section,
]

/** The ids of an entry's sections, prefixed with the entry's own word. */
function prefixed(entry: string, sections: Section[]): Section[] {
  return sections.map(({ item, text }) => ({ item: { ...item, id: `${entry}-${item.id}` }, text }))
}

/**
 * The list beside a page of `sections`; `missing` names an item whose section
 * the page lacks. A function and not a component, so the conformance adapter
 * finds the list in the tree an entry returns.
 */
function page({
  entry,
  name,
  sections,
  narrow = false,
  missing,
}: {
  entry: string
  name: string
  sections: Section[]
  narrow?: boolean
  missing?: TableOfContentsItem
}) {
  const drawn = prefixed(entry, sections)
  const items = drawn.map((section) => section.item)
  return (
    // Keyed, because the conformance adapter sets the list's props by cloning its parent's
    // children as an array.
    <div className={narrow ? styles.harnessNarrow : styles.harness}>
      <TableOfContents
        key="list"
        label="On this page"
        items={missing === undefined ? items : [...items.slice(0, 2), missing, ...items.slice(2)]}
      />
      <div className={styles.harnessPage} role="region" aria-label={name} tabIndex={0} key="page">
        {drawn.map(({ item, text }) => (
          <div className={styles.harnessSection} key={item.id}>
            <Heading id={item.id} level={item.level === 2 ? 3 : 2}>
              {item.label}
            </Heading>
            <Text>{text}</Text>
          </div>
        ))}
      </div>
    </div>
  )
}

export const states: ComponentStates = {
  component: 'TableOfContents',

  entries: [
    {
      name: 'a page of sections — the section at the top of the page is current',
      render: () => page({ entry: 'page', name: 'Guide', sections: SECTIONS }),
    },
    {
      name: 'two levels — subsections one step in, under their section',
      render: () => page({ entry: 'levels', name: 'Guide with subsections', sections: LEVELS }),
    },
    {
      name: 'a long label — it wraps, so the column does not widen',
      render: () => page({ entry: 'long', name: 'Guide with a long heading', sections: LONG }),
    },
    {
      name: 'a phone’s width — the same column, above the page',
      render: () =>
        page({ entry: 'phone', name: 'Guide on a phone', sections: SECTIONS, narrow: true }),
    },
    {
      name: 'a missing section — still a link, never current',
      render: () =>
        page({
          entry: 'missing',
          name: 'Guide without its release notes',
          sections: SECTIONS,
          missing: { id: 'missing-release-notes', label: 'Release notes' },
        }),
    },
  ],

  requiredSelectors: [':hover', ':focus-visible', '[aria-current="location"]'],
}
