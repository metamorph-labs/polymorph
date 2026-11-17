'use client'

import { useRef, type ReactNode } from 'react'

import {
  chooseListItem,
  currentListItem,
  dataFlag,
  listItems,
  memberAttr,
  useAgentMember,
} from '@polymorph/react'
import { routeClick } from '../controls/navigate'
import styles from '@polymorph/recipes/structure/list.module.css'

/**
 * List's root and its item. Both need a browser's React: the root registers
 * with the agent registry, and the item routes a link's click. `List.tsx` is
 * the member: it attaches the parts to the root in a module a server can
 * evaluate.
 */

export interface ListProps {
  /** Names the list for a reader: "Notifications", not "List". */
  label: string
  /** `List.Item`s. */
  children?: ReactNode
}

export function ListRoot({ label, children }: ListProps) {
  // The spec's `agent` fence. The items are the application's children, so the
  // list reads them from its own `<ul>` in the document, by the class of the
  // link or button that takes an item's press, and `choose` presses that
  // element, so `onSelect`, `onNavigate` or the browser takes it as a person's
  // press.
  const list = useRef<HTMLUListElement>(null)
  useAgentMember({
    member: 'List',
    element: () => list.current,
    state: () => ({
      items: listItems(list.current, styles.primary),
      current: currentListItem(list.current, styles.primary),
    }),
    actions: {
      choose: { argument: 'id', run: (id) => chooseListItem(list.current, styles.primary, id) },
    },
  })

  return (
    // The role is written because a browser drops a list's semantics when its
    // markers are removed, and this list draws none.
    <ul ref={list} className={styles.list} role="list" aria-label={label} {...memberAttr('List')}>
      {children}
    </ul>
  )
}

export interface ListItemProps {
  /** The item's name, and the accessible name of its link or button. */
  title: string
  /** One supporting line under the title. It wraps and is never clipped. */
  description?: string
  /** A short trailing fact the application has already formatted: a time, a count. */
  meta?: string
  /** The item navigates: the title is a link whose target covers the row. */
  href?: string
  /**
   * The app's router, on an item with an `href`, as on Link (`link.md` §Routing): a click
   * that would navigate this tab calls it in place of the browser.
   */
  onNavigate?: (href: string) => void
  /**
   * The item is picked. Without an `href` the title is a button whose target covers the
   * row. With one it is also called on every click of the link, one that opens a new tab
   * included, so a router uses `onNavigate` there.
   */
  onSelect?: () => void
  /**
   * The item whose page or detail is open. At most one per list. It has no effect on
   * an item that is only read, which has no link or button to say it to a screen reader.
   */
  current?: boolean
  /** One mark before the text: an Avatar, an Icon or an Image. Not a control. */
  leading?: ReactNode
  /**
   * One governed member after the text: a Badge, a Button, a Menu or a Switch. A control
   * takes its own press. A press on anything else in it is a press on the row.
   */
  trailing?: ReactNode
}

export function ListItem({
  title,
  description,
  meta,
  href,
  onNavigate,
  onSelect,
  current = false,
  leading,
  trailing,
}: ListItemProps) {
  const route = href === undefined ? undefined : routeClick(href, onNavigate)
  const interactive = href !== undefined || onSelect !== undefined

  // The title is the one element that takes the row's press. Its `::after`
  // covers the row, so the row is one tab stop with one name.
  const heading =
    href !== undefined ? (
      <a
        className={`${styles.title} ${styles.primary}`}
        href={href}
        aria-current={current ? 'page' : undefined}
        onClick={(event) => {
          onSelect?.()
          route?.(event)
        }}
      >
        {title}
      </a>
    ) : onSelect !== undefined ? (
      <button
        type="button"
        className={`${styles.title} ${styles.primary}`}
        aria-current={current ? 'true' : undefined}
        onClick={onSelect}
      >
        {title}
      </button>
    ) : (
      <span className={styles.title}>{title}</span>
    )

  return (
    <li
      className={styles.item}
      {...dataFlag('interactive', interactive)}
      // Only with the link or the button that carries `aria-current`: the fill
      // must not say to the eye what nothing says to a screen reader.
      {...dataFlag('current', current && interactive)}
    >
      {leading === undefined ? null : <span className={styles.leading}>{leading}</span>}
      <span className={styles.text}>
        {heading}
        {description === undefined ? null : (
          <span className={styles.description}>{description}</span>
        )}
      </span>
      {meta === undefined ? null : <span className={styles.meta}>{meta}</span>}
      {/* After the title in the document, so it is drawn above the title's stretched target. */}
      {trailing === undefined ? null : <span className={styles.trailing}>{trailing}</span>}
    </li>
  )
}
