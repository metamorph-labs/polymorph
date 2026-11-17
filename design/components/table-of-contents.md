# TableOfContents

A TableOfContents is the list of links to the sections of one long page ("On this page"), with
the section the reader is in marked. It is not SectionNav: a SectionNav item is a link to a page,
and the app's router says which page is current. An item here is a link to a place in the same
page, and the reader's scroll says which is current. It is not Tree, which is a hierarchy a reader
opens level by level and picks from. There is no substrate: a `<nav>` around a list of links, and
the engine's `watchSections`, which every framework's member follows the page with.

## Anatomy

```
[nav aria-labelledby → label]
  [label]
  [ul list]
    [li item] [a link: href="#id" — aria-current="location" on the current one]
              [ul sublist]?
                [li item] [a link]*
```

## API

```ts
interface TableOfContentsProps {
  /** The landmark's name, drawn above the list: "On this page". */
  label: string
  /** One link per section, in the page's order: { id, label, level? }. */
  items: TableOfContentsItem[]
  /** Called with the current section's id, or null, each time it changes. */
  onCurrentChange?: (id: string | null) => void
}
```

<!-- The API section is machine-read (packages/rules/src/spec-api.ts). -->

An item is `{ id: string; label: string; level?: 1 | 2 }`. `id` is the id of the section's
element in the document, and the link's `href` is `#id`. `level: 2` is a subsection of the item
before it, drawn in a nested list one step in. A level-2 item with no item before it is drawn at
the first level. Two levels are drawn, because a third level of indent in a side column leaves
too little width for a label.

`label` has no default, as SectionNav's has none: a page with an AppShell rail already has a
navigation landmark, and a reader tells them apart by name. It is drawn as the list's overline
and names the landmark through `aria-labelledby`, so the name and the words a sighted reader sees
are the same.

Attributes: the current link carries `aria-current="location"`. The member has no `data-*` state
of its own.

## Behaviour

**The app names the sections.** The member draws the items it is passed, and reads no headings of
the document on its own. A server render then draws the same list, and the list holds the
sections the app chose, under the labels the app chose. A section's element is its heading, or
the element that holds the heading and what follows it. An app passes an item's `id` to the
section's Heading (`heading.md`), so it needs no element of its own around the section. A
section whose heading another member draws, such as a Card's `title`, is named by an element
around it.

**The current section.** The page is the nearest ancestor of the first section that scrolls, or
the document when none does. Inside an AppShell that is the content region. The current section
is the last one, in the items' order, whose top edge is at or above a line a quarter of the way
down the page's visible box (`SECTION_LINE`).

- Several sections can be in view. The reader is in the one that has reached the line.
- At the top of a page whose first section starts below the line, no section is current, and no
  link carries `aria-current`.
- When the page is scrolled to its end, the last section in the document is current. The sections
  at the end of a page can be too short for their tops to reach the line, and a reader who
  scrolled to the end is reading the last of them.
- A section that content above it moves across the line is decided again without a scroll.
- An item whose section is not in the document is still a link, and is never current. The member
  looks for it again on each decision and each time the document gains nodes or an `id` changes,
  so a section that mounts later is followed without a scroll.
- Of two items with one id, the first is marked.

**A click.** A click the browser would follow in this tab marks the item at once, moves focus to
the section, and leaves the browser to follow the link. The browser scrolls to the section and
writes the fragment into the address, so the address names the section and Back returns from it.

- The mark is held while the browser scrolls, because the scroll passes the sections between,
  and a short section never reaches the line. The hold ends when the reader acts on the page (a
  wheel, a touch that moves, a key, a pointer press) or when the fragment changes to one that
  names no section of the list. A fragment that names one marks its item and holds it, which is
  what Back, Forward and another link to a section do. The fragment change the click itself
  causes arrives a task later and is not read as a new one.
- Focus moves to the section, because a fragment link alone scrolls without moving it
  (WCAG 2.4.3). A section that cannot take focus is given `tabindex="-1"` while it has focus, so
  it is never a tab stop, and the attribute is taken away when focus leaves it.
- A click with a modifier key or another button stays the browser's, and so does a click on an
  item whose section is not in the document.
- The member does not scroll. Moving focus does not scroll either, so the scroll is the browser's
  and follows the page's CSS: its `scroll-behavior`, which a page sets to `smooth` only under
  `prefers-reduced-motion: no-preference`, and each section's `scroll-margin`. The browser puts
  the section's top at the top of the page's box, and nothing the vocabulary draws covers it
  there: an AppShell's topbar is a row of the frame above its content region, not a layer over
  it. So a Heading takes no `scroll-margin`.
- There is no routing seam. A link to a place in the same page is not the router's.

**Placement.** The member draws a column where it is placed, at any width: every item is on
screen, and a long label wraps. It does not stay in view on its own and does not scroll inside
its own box, because the column that holds it owns both. Beside a long page it goes in
DetailPage's `aside` with `stickyAside` (`design/archetypes/detail-page.md`): the aside stays in
view while the main column scrolls, is never taller than the visible box and scrolls inside
itself when it is longer, and at the width where the page stacks its columns it is under the
main column and scrolls with the page. Elsewhere the app places it, beside the content or above
it, and hides it where the page is too narrow for it.

**On Android**: a link opens `#id` through the composition's URI handler, which the app gives to
scroll its own page to the section, as iOS opens it through the app's open-URL action. The
current link does not follow the scroll on either platform, because the sections are the app's
views, which the member cannot measure: the link the app opens is marked at once and reported
through `onCurrentChange`, a link the app refuses is not, and the mark stays until the reader
goes to another section through the list. Each link reserves the 48dp hit target in the layout
and its shape stays at least `--pm-control-height-sm` tall, so the touch areas of neighbouring
links do not overlap. iOS reserves its 44-point hit target the same way.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| nav | column · gap `--pm-space-2` |
| label | the overline: `text.xs` quartet · uppercase · `--pm-text-muted` · padding-inline `--pm-space-3` |
| list | column · gap `--pm-space-1` · no markers |
| sublist | column · gap `--pm-space-1` · margin-block-start `--pm-space-1` · padding-inline-start `--pm-space-4` |
| link | min-block-size `--pm-control-height-sm` · padding `--pm-space-2` `--pm-space-3` · `text.sm` quartet · `--pm-text-secondary` · radius `--pm-radius-md` · no underline · wraps · the shared focus ring |
| link, hover | `--pm-text-primary` on `--pm-bg-subtle`, not on the current link |
| link, current | `--pm-selection-text` on `--pm-selection-bg`: SectionNav's and the AppShell rail's selection treatment (`README.md`), so a current location looks the same at every level |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| a page of sections | 5 items beside a page that scrolls | the first link `aria-current="location"` |
| two levels | 7 items, 3 at level 2 | a nested list under its section |
| a long label | one 77-character label | it wraps, no sideways scroll |
| a phone's width | 5 items in a 360px column | the list above the page |
| a missing section | 6 items, one naming no element | that link is drawn and never current |

The page's direction is the document's, so no entry is right to left. `requiredSelectors`:
`:hover`, `:focus-visible`, `[aria-current="location"]`.

## Motion

Hover and press use the shared colour feedback (`stateFeedback`, `pressable`). The current mark
does not slide between items: it follows the reader's scroll, and a moving mark beside moving
text draws the eye away from what is read.

## Icons

None.

## A11y

`<nav aria-labelledby>` around a `<ul>`, so a screen reader announces the landmark by its label
and the number of sections. A section's subsections are a nested `<ul>` in its `<li>`, so the
outline is read as one. Each item is a real `<a href="#id">`. The current one carries
`aria-current="location"`, the value for the current place within a page, where SectionNav's
`page` is the current page of a set. It is marked by a filled shape as well as a colour. A click
moves focus to the section (Behaviour).

`watchSections` and its rules are held for every web renderer by the law in
`@polymorph/conformance/table-of-contents`: the mark follows a scroll both ways, the end of the
page, a click's mark and focus, a missing section, and nothing left observing after unmount.

```contract
role root navigation
name root from label
role link link when a page of sections
attr link aria-current=location when a page of sections
key Enter activates on link when a page of sections
```

## Agent

An agent reads the section the reader is in and the sections the list links to, and goes to a
section as a press on its link does: the member marks the section at once, `onCurrentChange`
reports it, focus moves to the section and the browser follows the link. Each section is a
choice whose id is its `id` and whose label is its label, and the current section's id is
`null` while the reader is in none. A link whose section is missing from the page stays a link
and never becomes current, as for a person. Two items that share an id name one section, so
the second is not a choice of its own.

```agent
state current id
state items choices
action choose id sets current calls onCurrentChange
```
