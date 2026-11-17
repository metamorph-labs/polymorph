'use client'

import { useRef } from 'react'

import { routeClick } from '../controls/navigate'
import { agentPress, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/section-nav.module.css'

/**
 * The links between the sibling pages of one section, with the current page marked
 * (`design/components/section-nav.md`).
 *
 * It is not Tabs. A tab shows a panel of the same page and has no address. An item here is
 * a link to a page, so the browser opens it in a new tab, copies it and goes back from it.
 * From the spec:
 *
 *  - **The app names the current item.** Which paths belong to an item is the router's
 *    knowledge, so the member matches no path below an item's own. It compares `current`
 *    with each `href` as the page each names: a trailing slash, a query and a hash do not
 *    make a different page.
 *  - **The current item stays a link.** `current` may name the item for a page below that
 *    item's own, and the link is the way back to it.
 *  - **The row wraps.** Every item stays on screen at any width, and none is behind a scroll.
 */

export interface SectionNavItem {
  label: string
  href: string
}

export interface SectionNavProps {
  /** The landmark's accessible name, which tells this navigation from the page's others. */
  label: string
  /** One link per sibling page, in the order drawn. */
  items: SectionNavItem[]
  /**
   * The `href` of the item whose page the reader is on; without it no item is current. It
   * is compared as the page it names, so a trailing slash, a query or a hash on either
   * side does not stop the match, and neither does an origin on `current`
   * (`location.href`).
   */
  current?: string
  /**
   * The app's router, for every item (`link.md` §Routing): a click that would navigate this
   * tab calls it in place of the browser.
   */
  onNavigate?: (href: string) => void
}

/** The origin an address is written with (`https://app.example.com`), where it has one. */
const ORIGIN = /^(?:[a-z][a-z\d+.-]*:)?\/\/[^/?#]*/iu

/** An address's origin in lower case, or `undefined` for one written without an origin. */
function originOf(href: string): string | undefined {
  return ORIGIN.exec(href)?.[0].toLowerCase()
}

/**
 * The page an `href` names: its path, without an origin, a query, a hash or a trailing
 * slash. A router's current location often carries one of them where the item's `href`
 * does not. An `href` that is only a hash or a query is compared as written, because
 * there the hash or the query is the whole address.
 */
function pageOf(href: string): string {
  if (href.startsWith('#') || href.startsWith('?')) return href
  const origin = ORIGIN.exec(href)?.[0] ?? ''
  const path = href.slice(origin.length).replace(/[?#].*$/u, '')
  // An origin with nothing after it names the root.
  if (path === '') return origin === '' ? '' : '/'
  return path.length > 1 ? path.replace(/\/+$/u, '') : path
}

/**
 * The index of the current item, or -1. An item whose `href` is exactly `current` comes
 * before one that only names the same page, so items that differ by a query alone can each
 * be current. At most one item is current: the first that matches.
 *
 * `current` is the address of the page being shown, so its origin is the document's. An
 * item written without an origin is on that origin, and matches on its path. An item
 * written with one matches only a `current` written with the same one: with no origin in
 * `current` there is nothing to compare it with, and the member does not read `location`,
 * which a server render has none of.
 */
function currentIndex(items: SectionNavItem[], current: string | undefined): number {
  if (current === undefined) return -1
  const exact = items.findIndex((item) => item.href === current)
  if (exact !== -1) return exact
  const page = pageOf(current)
  const origin = originOf(current)
  return items.findIndex((item) => {
    const itemOrigin = originOf(item.href)
    return pageOf(item.href) === page && (itemOrigin === undefined || itemOrigin === origin)
  })
}

export function SectionNav({ label, items, current, onNavigate }: SectionNavProps) {
  const currentAt = currentIndex(items, current)

  // The spec's `agent` fence. A page is a choice by its `href`; the first of two items that share
  // one is the choice. Following a page presses its link, so the browser goes there or
  // `onNavigate` routes it, as for a person.
  const root = useRef<HTMLElement>(null)
  useAgentMember({
    member: 'SectionNav',
    element: () => root.current,
    state: () => ({
      current: items[currentAt]?.href ?? null,
      items: items
        .filter((item, at) => items.findIndex((other) => other.href === item.href) === at)
        .map((item) => ({ id: item.href, label: item.label })),
    }),
    actions: {
      choose: {
        argument: 'id',
        run: (href) =>
          agentPress(
            root.current?.querySelectorAll('a')[items.findIndex((item) => item.href === href)],
          ),
      },
    },
  })

  return (
    <nav ref={root} className={styles.nav} aria-label={label} {...memberAttr('SectionNav')}>
      <ul className={styles.list}>
        {items.map((item, index) => (
          // Keyed by position as well as `href`: two items may share an `href`, and the
          // list is drawn in the order given.
          <li className={styles.item} key={`${index}:${item.href}`}>
            <a
              className={styles.link}
              href={item.href}
              aria-current={index === currentAt ? 'page' : undefined}
              onClick={routeClick(item.href, onNavigate)}
            >
              <span className={styles.label}>{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
