'use client'

import { useEffect, useId, useRef, useState } from 'react'

import {
  agentPress,
  jumpToSection,
  memberAttr,
  useAgentMember,
  watchSections,
} from '@polymorph/react'
import styles from '@polymorph/recipes/structure/table-of-contents.module.css'

/**
 * Links to a page's sections, the current marked
 * (`design/components/table-of-contents.md`).
 *
 * The list of links to the sections of one long page, with the section the
 * reader is in marked.
 *
 * It is not SectionNav. A SectionNav item is a link to a page, and the app's
 * router says which page is current. An item here is a link to a place in this
 * page, and the reader's scroll says which is current. From the spec:
 *
 *  - **The app names the sections.** Each item names the id of an element in
 *    the document. The member reads no headings of its own accord, so the list
 *    is the same on a server render and holds only the sections the app chose.
 *  - **The scroll names the current item.** The engine's `watchSections`
 *    decides it, in every framework by one rule: the last section whose top is
 *    at or above a line a quarter of the way down the page, or the last section
 *    at the page's end.
 *  - **A click marks at once and moves focus.** The browser follows the link
 *    and scrolls. The member marks the item before the scroll starts, holds the
 *    mark until the reader scrolls, and moves focus to the section.
 */

export interface TableOfContentsItem {
  /** The id of the section's element in the document: its heading, or the element around it. */
  id: string
  label: string
  /** 2 for a subsection of the item before it, drawn one step in. Default 1. */
  level?: 1 | 2
}

export interface TableOfContentsProps {
  /** The landmark's name, drawn above the list ("On this page"). */
  label: string
  /** One link per section, in the page's order. */
  items: TableOfContentsItem[]
  /** Called with the current section's id, or `null`, each time it changes. */
  onCurrentChange?: (id: string | null) => void
}

interface Entry {
  item: TableOfContentsItem
  /** The item's index in `items`, which keys it and decides which of two equal ids is marked. */
  at: number
}

/**
 * The items as the list draws them: each section with the subsections that
 * follow it. A subsection with no section before it is drawn as a section.
 */
function grouped(items: TableOfContentsItem[]): (Entry & { children: Entry[] })[] {
  const groups: (Entry & { children: Entry[] })[] = []
  items.forEach((item, at) => {
    const parent = groups.at(-1)
    if (item.level === 2 && parent !== undefined) parent.children.push({ item, at })
    else groups.push({ item, at, children: [] })
  })
  return groups
}

export function TableOfContents({ label, items, onCurrentChange }: TableOfContentsProps) {
  const root = useRef<HTMLElement>(null)
  const labelId = useId()
  const [current, setCurrent] = useState<string | null>(null)

  const onCurrentChangeRef = useRef(onCurrentChange)
  useEffect(() => {
    // Updated in an effect, not during render. The watch calls it after a commit.
    onCurrentChangeRef.current = onCurrentChange
  })

  // An id holds no whitespace, so the ids joined by a space change exactly when the list does.
  const ids = items.map((item) => item.id).join(' ')
  const reported = useRef<string | null>(null)
  useEffect(
    () =>
      watchSections(root.current, ids === '' ? [] : ids.split(' '), (id) => {
        setCurrent(id)
        if (id === reported.current) return
        reported.current = id
        onCurrentChangeRef.current?.(id)
      }),
    [ids],
  )

  // Of two items with one id, the first is marked.
  const currentAt = items.findIndex((item) => item.id === current)

  // The spec's `agent` fence. A section is a choice by its id; the first of two items that share
  // one is the choice. Going to a section presses its link, which marks it, reports it, moves
  // focus to it and lets the browser follow the link, as for a person.
  useAgentMember({
    member: 'TableOfContents',
    element: () => root.current,
    // The section as it was last reported, which holds before React draws it: the first is
    // reported while the member mounts.
    state: () => ({
      current: reported.current,
      items: items
        .filter((item, at) => items.findIndex((other) => other.id === item.id) === at)
        .map((item) => ({ id: item.id, label: item.label })),
    }),
    actions: {
      choose: {
        argument: 'id',
        run: (id) =>
          agentPress(
            root.current?.querySelectorAll('a')[items.findIndex((item) => item.id === id)],
          ),
      },
    },
  })

  const link = ({ item, at }: Entry) => (
    <a
      className={styles.link}
      href={`#${item.id}`}
      aria-current={at === currentAt ? 'location' : undefined}
      onClick={(event) => jumpToSection(root.current, item.id, event.nativeEvent)}
    >
      {item.label}
    </a>
  )

  return (
    <nav
      ref={root}
      className={styles.nav}
      aria-labelledby={labelId}
      {...memberAttr('TableOfContents')}
    >
      <p className={styles.label} id={labelId}>
        {label}
      </p>
      <ul className={styles.list}>
        {grouped(items).map((group) => (
          // Keyed by position as well as id: two items may share an id.
          <li className={styles.item} key={`${group.at}:${group.item.id}`}>
            {link(group)}
            {group.children.length === 0 ? null : (
              <ul className={styles.sublist}>
                {group.children.map((child) => (
                  <li className={styles.item} key={`${child.at}:${child.item.id}`}>
                    {link(child)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
