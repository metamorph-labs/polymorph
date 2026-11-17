'use client'

import { useRef } from 'react'

import { Button } from '../controls/Button'
import { routeClick } from '../controls/navigate'
import { agentPress, Icon, memberAttr, useAgentMember } from '@polymorph/react'
import { Menu, type MenuEntry } from '../overlays/Menu'
import styles from '@polymorph/recipes/structure/breadcrumbs.module.css'

/**
 * Trail of links from the root to the current page (`design/components/breadcrumbs.md`).
 *
 * No substrate: an `<ol>` of links with chevrons, and a Menu for the middle when
 * the trail is too long. From the spec:
 *
 *  - **It never wraps.** A long trail collapses, because two lines read as two
 *    paths.
 *  - **The last crumb is not a link.** It is the current page.
 *  - **Collapsing is layout policy, not state**, so there is no `data-*` for
 *    screens to key off.
 */

export interface BreadcrumbItem {
  label: string
  href?: string
  /**
   * For a crumb with no `href` that routes in JavaScript: the crumb is a
   * button that calls it. It also fires on every click of a crumb with an
   * `href`, one that opens a new tab included, and in place of `onNavigate`
   * for a crumb chosen from the overflow, so a router uses `onNavigate`.
   */
  onSelect?: () => void
}

export interface BreadcrumbsProps {
  /** The last item is the current page; its `href`/`onSelect` are ignored. */
  items: BreadcrumbItem[]
  /**
   * The app's router, for every crumb with an `href` (`link.md` §Routing): a
   * click that would navigate this tab, and a crumb chosen from the overflow,
   * call it in place of the browser.
   */
  onNavigate?: (href: string) => void
  /** Above this count, shows the first crumb, overflow and last two; `Infinity` disables it. */
  maxItems?: number
  /** Opens the overflow on mount, for galleries and tests only. */
  defaultOpen?: boolean
  /** The landmark's accessible name, default `Breadcrumb`; localized hosts pass their own. */
  label?: string
  /** The overflow control's accessible name, default `Show path`. */
  overflowLabel?: string
}

/** Placeholder for the overflow position while the row is built. */
const OVERFLOW = Symbol('overflow')

type Rung = BreadcrumbItem | typeof OVERFLOW

/**
 * The trail as drawn: every crumb, or the first, the overflow and the last two,
 * so both ends of the path stay visible.
 */
function rungs(
  items: BreadcrumbItem[],
  maxItems: number,
): { row: Rung[]; hidden: BreadcrumbItem[] } {
  if (items.length <= maxItems) return { row: items, hidden: [] }
  const [first, ...rest] = items
  return {
    row: [...(first ? [first] : []), OVERFLOW, ...rest.slice(-2)],
    hidden: rest.slice(0, -2),
  }
}

/**
 * A hidden crumb as a menu command: the item's own `onSelect` when it has one,
 * else the app's router, else a navigation like an `<a href>`, so the
 * vocabulary needs no router. A menu item is a command, not a link, so there is
 * no modified click to leave to the browser.
 */
function command(item: BreadcrumbItem, onNavigate?: (href: string) => void): MenuEntry {
  return {
    label: item.label,
    onSelect: () => {
      if (item.onSelect) {
        item.onSelect()
        return
      }
      if (item.href === undefined) return
      if (onNavigate) onNavigate(item.href)
      else window.location.assign(item.href)
    },
  }
}

function Crumb({
  item,
  onNavigate,
}: {
  item: BreadcrumbItem
  onNavigate: ((href: string) => void) | undefined
}) {
  if (item.href !== undefined) {
    const route = routeClick(item.href, onNavigate)
    return (
      <a
        className={styles.crumb}
        href={item.href}
        onClick={(event) => {
          item.onSelect?.()
          route?.(event)
        }}
      >
        {item.label}
      </a>
    )
  }

  if (item.onSelect) {
    return (
      <button type="button" className={styles.crumb} onClick={item.onSelect}>
        {item.label}
      </button>
    )
  }

  // A crumb with no destination is still part of the path, for example a section
  // without its own page. This is common, so it is drawn as text, not omitted.
  return <span className={styles.crumb}>{item.label}</span>
}

export function Breadcrumbs({
  items,
  onNavigate,
  maxItems = 4,
  defaultOpen,
  label = 'Breadcrumb',
  overflowLabel = 'Show path',
}: BreadcrumbsProps) {
  const { row, hidden } = rungs(items, maxItems)
  const last = row.length - 1

  // The spec's `agent` fence. A crumb is a choice by its label, the first of two that share one.
  // A crumb on the trail is pressed, and a hidden one runs as its overflow entry does, so the
  // overflow Button and its Menu, the trail's own parts, are withheld. The overflow is always
  // the second rung.
  const root = useRef<HTMLElement>(null)
  const rungsOf = () => root.current?.querySelectorAll(':scope > ol > li')
  useAgentMember({
    member: 'Breadcrumbs',
    element: () => root.current,
    state: () => ({
      items: items
        .filter((item, at) => items.findIndex((other) => other.label === item.label) === at)
        .map((item) => ({
          id: item.label,
          label: item.label,
          ...(item === items[items.length - 1] ||
          (item.href === undefined && item.onSelect === undefined)
            ? { disabled: true }
            : {}),
        })),
    }),
    actions: {
      choose: {
        argument: 'id',
        run: (id) => {
          const item = items.find((candidate) => candidate.label === id)
          if (item === undefined) return
          const shown = row.indexOf(item)
          if (shown !== -1) {
            agentPress(rungsOf()?.[shown]?.querySelector('a, button'))
            return
          }
          const entry = command(item, onNavigate)
          if ('onSelect' in entry) entry.onSelect?.()
        },
      },
    },
    withholds: () => (hidden.length === 0 ? null : rungsOf()?.[1]),
  })

  return (
    <nav ref={root} className={styles.nav} aria-label={label} {...memberAttr('Breadcrumbs')}>
      <ol className={styles.list}>
        {row.map((rung, index) => (
          <li
            className={styles.item}
            key={rung === OVERFLOW ? 'overflow' : `${index}-${rung.label}`}
          >
            {rung === OVERFLOW ? (
              <Menu
                {...(defaultOpen === undefined ? {} : { defaultOpen })}
                trigger={
                  <Button
                    variant="ghost"
                    tone="neutral"
                    size="sm"
                    iconOnly
                    icon="overflow"
                    label={overflowLabel}
                  />
                }
                items={hidden.map((item) => command(item, onNavigate))}
              />
            ) : index === last ? (
              // Plain text marked with `aria-current`, never a link to itself.
              <span className={styles.crumb} aria-current="page">
                {rung.label}
              </span>
            ) : (
              <Crumb item={rung} onNavigate={onNavigate} />
            )}

            {index === last ? null : (
              <span className={styles.separator}>
                <Icon name="next" size="sm" />
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
