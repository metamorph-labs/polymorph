# DetailPage (archetype)

One entity in full: a ticket, a customer, a deployment. Back control, identity header,
optional tabbed sections, and a main column with an aside. A detail read beside the list it was
picked from is a MasterDetailPage's (`master-detail-page.md`), not a DetailPage.

## Anatomy & API

```
[root — inside AppShell content]
  [back — ghost/neutral/sm Button icon="back" label from prop]
  [header row: [title + meta] ......... [actions]]
    title: the <h1>, or with `titleEdit` a title row: [<h1>] [the app's InlineEdit]
    meta: Inline gap 3 of Badges / Avatar+name / text.sm secondary items
  [tabs? — Tabs spanning full width]
  [body — grid: main | aside?]
```

| Prop | Type | Notes |
| --- | --- | --- |
| `backLabel` / `onBack` | `string` / `() => void` | required, because a detail page is always reached from somewhere. Renders the back Button |
| `title` | `string` required | the entity's name, rendered as `<h1>` |
| `titleEdit` | `ReactNode` | an InlineEdit of the entity's name, drawn beside the `<h1>`, so the reader renames the entity in its title (§The name edited in place) |
| `meta` | `ReactNode` | the identity row: Badges, Avatar, timestamps |
| `actions` | `ReactNode` | PageHeader's law: at most one solid. Entity deletion goes behind Menu `overflow` + ConfirmDialog |
| `tabs` / `children` | Tabs props / content | tabbed or plain body |
| `aside` | `ReactNode` | Stat/meta Cards column |
| `stickyAside` | `boolean` | default `false`. With an `aside`, keeps it in view while the main column scrolls (§The aside that stays in view). A TableOfContents for a long main column goes in an aside with it |

## Pattern tokens (declared on root)

| Token | Value | (std/compact/comfortable) |
| --- | --- | --- |
| `--pm-page-padding-x` | `var(--pm-space-7)` | 32 / 28 / 36 |
| `--pm-page-padding-y` | `var(--pm-space-6)` | 24 / 20 / 28 |
| `--pm-page-max-width` | `calc(var(--pm-space-10) * 11)` | 1056 / 902 / 1210 |
| `--pm-content-gutter` | `var(--pm-space-6)` | vertical rhythm between regions |
| `--pm-page-aside-width` | `calc(var(--pm-space-10) * 3)` | 288 / 246 / 330. This archetype's own token, because the aside's width is its one structural decision |

## Recipe

| Part | Tokens |
| --- | --- |
| back | Button ghost/neutral/sm, margin-bottom `--pm-space-2` |
| title | `text.2xl` quartet · `--pm-text-primary`; meta row below at gap `--pm-space-2`, items `text.sm` `--pm-text-secondary` |
| header row | title and meta at the start, actions at the end, column-gap `--pm-space-6`. The row wraps: the identity column grows from a basis of `calc(var(--pm-space-10) * 3)`, and actions that cannot share the line with that basis move under the title, at the start of their own line, row-gap `--pm-space-4`. The actions are at most the page's width and wrap among themselves *(the actions never shrink, so on a phone-width page a row that kept them beside the title would leave the title less width than one of its words. On a wide page a long title still wraps beside the actions)* |
| body grid | `minmax(0, 1fr) var(--pm-page-aside-width)` · column-gap `--pm-content-gutter`; no aside ⇒ single column |
| body grid, narrow page | single column below a `44rem` page, row-gap `--pm-content-gutter` *(two columns follow Grid's rule for N=2: `ceil(2/2)` is 1. This is the one archetype where not adapting breaks the layout rather than just crowding it. The aside's width is fixed by a token, so on a narrow page it would take almost the whole row and squeeze the main column, the page's actual subject, to a sliver. The aside moves under what it supports, with the same content in the same order. Adaptation changes the composition, never the content (`docs/layout.md`))* *(the row-gap matters: with `column-gap` alone, once the two tracks become two rows there is nothing between them. Main and aside sit 0px apart, and the supporting column looks like a continuation of the article above it. The stacked gutter is the page's own, because every other region here is already separated by it)* |
| aside | Stack gap `--pm-space-4` of Cards (Stat, meta lists) |
| aside, in view (`stickyAside`, two columns) | `position: sticky` · inset-block-start `--pm-page-padding-y` · `align-self: start` · max-block-size `calc(100cqb - var(--pm-page-padding-y) * 2)` · `overflow-y: auto` *(§The aside that stays in view)* |
| title row, title, titleEdit (`titleEdit`) | PageHeader's rows for them, verbatim (`page-header.md` §Recipe). The identity column already grows from its basis, so the field takes the width the column has and the actions keep their place |

Container-first responsiveness (`docs/layout.md`): the root declares
`container-type: inline-size` and steps `--pm-page-padding-x` / `-y` one space token
down below a `40rem` region. The rule and its reasoning are stated once in
`list-page.md` §In a narrow region.

## The aside that stays in view

DetailPage owns the page's two columns, so it owns the choice that keeps one of them in view.
With `stickyAside`, the aside stays in view while the main column scrolls past it. A long main
column, such as a runbook or a record with many sections, keeps its TableOfContents or its key
facts beside the part being read. Without the prop the aside scrolls with the page, and every
page that does not pass it is unchanged.

- **Where it stops.** The aside stops `--pm-page-padding-y` below the top of the box that
  scrolls, the inset the page keeps above its own first line. Nothing sticky is above it there.
  In an AppShell the content region is the box that scrolls, and the topbar and the banner are
  rows of the frame above that region, not layers over it. When the document scrolls, nothing
  of the vocabulary is drawn over the page's top.
- **It is never taller than the visible box.** Its block size is at most the visible box less
  the inset above and below it. `100cqb` is that box's height: AppShell's content region is a
  size container for that reason, and with no size container above the page `cqb` is the
  window's small viewport height. An aside longer than that scrolls inside itself. A sticky box
  taller than the visible box shows only its top while the page scrolls, and its end only when
  the end of the main column pushes it up, so the links at the end of a long TableOfContents
  would be out of reach for most of the page. Scrolling inside itself keeps every part of it
  reachable at every scroll position. Its controls are reached by Tab, which scrolls each into
  view.
- **Nothing changes at the stacked width.** Below a `44rem` page the aside is under the main
  column (§Recipe), and there it has nothing to stay beside. The prop changes nothing there:
  the aside scrolls with the page at its full height.
- Without an `aside` the prop does nothing. The body carries `data-sticky-aside` while there is
  an aside and the prop holds, and the recipe keys on it. The aside's children keep their own
  height (`flex-shrink: 0`), so a child that scrolls on its own, such as a CodeBlock, is not
  squeezed to fit and the aside scrolls instead.

The native renderings take the prop and draw nothing for it (`packages/native/src/undrawn.ts`).
Each draws the aside beside the main column inside the page's one scroll view, where SwiftUI
pins only a lazy stack's section header and Compose only a lazy list's sticky header.
They take `titleEdit` and draw nothing for it either, for PageHeader's reason (`page-header.md`).

## The name edited in place

An entity's name is the page's title, and the reader renames it there with `titleEdit`: an
InlineEdit the app writes with `title` as its `value`, `size="lg"`, its `label` and handlers,
and for a save that waits for a server its `editing`, `pending` and `error`. DetailPage draws it
as PageHeader draws one and hands it `valueHidden` (`page-header.md` §A title edited in place).
The page keeps one `<h1>` whose text is the saved title: beside the edit control in the reading
state, and visually hidden while the field is open in its place. The meta row stays under the
title row in both forms.

A rename that needs a second field or an explanation of what it changes stays a Dialog behind
an action.

## States

Entries: full (back+meta+actions+tabs+aside), no tabs, no aside, minimal
(back+title+children), an aside that stays in view (`stickyAside`, a TableOfContents and a
Card beside a runbook whose sections are Headings with ids), a name edited in place
(`titleEdit` with meta and actions). `requiredSelectors`: —.

## Motion — Tabs' own; nothing archetype-level. Icons — `back`, plus composed.
A11y — back is a real button before the `<h1>` in DOM (first tab stop after the
skip target); tabs own the section outline below the h1.
