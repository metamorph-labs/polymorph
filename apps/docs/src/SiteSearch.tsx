import { Command, type CommandItem } from '@polymorph/react-ui'
import { useEffect, useMemo, useRef, useState } from 'react'

import { navigate } from './router'
import {
  loadMembers,
  loadSections,
  searchIndex,
  SITE_PAGES,
  type SearchEntry,
  type SearchMember,
  type SitePage,
} from './search'

/**
 * The site search: the `Command` palette over `search.ts`'s index.
 *
 * The app owns the palette's open state and the button that opens it
 * (`command.md`: a global shortcut is the app's policy). This component binds
 * the shortcut, ⌘K on Apple platforms and Ctrl+K elsewhere, and `/` outside a
 * text field, because both open the same palette wherever the reader is.
 *
 * Pages and guides are listed at once. Members and guide sections load the
 * first time the palette opens, and the palette shows its loading rows until
 * both have arrived.
 */

export interface SiteSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The site's top-level pages. Defaults to `SITE_PAGES`. */
  pages?: readonly SitePage[]
}

/** Whether the reader's platform labels its command key ⌘. */
function isApple(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
}

/**
 * Goes to an entry's page. A section of the page already shown is a change of
 * fragment, which the browser scrolls to itself. The router changes paths
 * only, so it is used for every other entry, and the guide page scrolls to the
 * fragment once its text is drawn.
 */
export function goTo(href: string): void {
  const target = new URL(href, window.location.href)
  if (target.pathname !== window.location.pathname) {
    navigate(`${target.pathname}${target.hash}`)
    return
  }
  if (target.hash === '') return
  if (target.hash !== window.location.hash) {
    window.location.hash = target.hash
    return
  }
  document.getElementById(decodeURIComponent(target.hash.slice(1)))?.scrollIntoView()
}

export function toCommandItems(entries: readonly SearchEntry[]): CommandItem[] {
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    group: entry.group,
    keywords: entry.keywords,
    onSelect: () => goTo(entry.href),
  }))
}

export function SiteSearch({ open, onOpenChange, pages = SITE_PAGES }: SiteSearchProps) {
  const [members, setMembers] = useState<SearchMember[] | null>(null)
  const [sections, setSections] = useState<SearchEntry[] | null>(null)
  const requested = useRef(false)

  useEffect(() => {
    if (!open || requested.current) return
    requested.current = true
    // A chunk that fails to load leaves its part of the index empty. The
    // pages and guides stay searchable.
    loadMembers().then(setMembers, () => setMembers([]))
    loadSections().then(setSections, () => setSections([]))
  }, [open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) return
      const command = isApple() ? event.metaKey : event.ctrlKey
      if (command && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(!open)
        return
      }
      if (event.key === '/' && !open && !event.metaKey && !event.ctrlKey) {
        if (isTextEntry(event.target)) return
        event.preventDefault()
        onOpenChange(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  const items = useMemo(
    () => toCommandItems(searchIndex({ pages, members: members ?? [], sections: sections ?? [] })),
    [pages, members, sections],
  )

  return (
    <Command
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      label="Search the site"
      placeholder="Search components, guides and pages"
      emptyMessage="Nothing matches that. Try a component name, or a topic like theming."
      loading={open && (members === null || sections === null)}
    />
  )
}
