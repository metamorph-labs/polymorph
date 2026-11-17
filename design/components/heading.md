# Heading

Section headings, h2 to h4, on a working screen. It is a member because it recurred: the
workbench and the docs site each built it independently, and members are admitted on
recurrence (`docs/concepts.md`).

The one-h1 law applies: PageHeader owns the page's `<h1>`, and Heading cannot render one. A
second h1 breaks the hierarchy, so the API makes it impossible instead of leaving it to review.

## Anatomy & API

```
<h2|h3|h4> — the heading element itself; nothing else.
```

```ts
interface HeadingProps {
  /** 2 renders <h2>, 3 <h3>, 4 <h4>. Never 1 — PageHeader owns the page title. */
  level?: 2 | 3 | 4 // default 2
  /** The heading element's id, which a fragment link (`#id`) names. */
  id?: string
  children: string
}
```

`id` names the section the heading opens. A link to `#id`, and a TableOfContents item with that
`id`, go to the heading, so an app names a section without an element of its own around it.
The id is on the heading element and not on a box around the section, for two reasons. A link
puts the heading at the top of the page's box, where a reader starts the section. A
TableOfContents moves focus to the element the id names, and a screen reader announces a
focused heading by its name and level, where a focused box is read as all of its text or as
nothing.

Nothing the vocabulary draws covers the top of the page's box, so a heading takes no
`scroll-margin`. In an AppShell the content region is the box that scrolls, and the topbar and
the banner are rows of the frame above it, not layers over it. Table's sticky header stays
inside its own table, and DetailPage's aside that stays in view is beside the main column, not
over it.

The id means nothing on a native screen, where no link names a view by id. SwiftUI and Compose
take it and draw nothing for it (`packages/native/src/undrawn.ts`).

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| level 2 | `text.xl` quartet · `--pm-text-primary` · margin 0 (Stack owns rhythm) |
| level 3 | `text.lg` quartet · `--pm-text-primary` · margin 0 |
| level 4 | `text.md` sized, weight `--pm-text-xl-weight` (Text's `strong` cell). Below `text.lg` the sizes are body sizes, so weight marks the level, and the type scale owns the token (as conventions §6's law requires) · `--pm-text-primary` · margin 0. The one-h1 law still holds: levels are added downward only, and Heading still cannot render an `<h1>` |

No margins and no note slot. A caption under a heading is a `Text` beside it in a Stack, which
is composition, not API (the docs SectionTitle's note becomes exactly that pairing).

## States

| Entry | Render | Expect |
| --- | --- | --- |
| section heading | `<Heading>Members</Heading>` | role heading level 2, text.xl size |
| subsection | `<Heading level={3}>Invited</Heading>` | role heading level 3, text.lg size |
| sub-subsection | `<Heading level={4}>By email</Heading>` | role heading level 4, text.md size, xl weight |
| with an id | `<Heading id="heading-members">Members</Heading>` | the `<h2>` carries `id="heading-members"` |

`requiredSelectors`: — (static text; no interactive states).

## Motion — none. Icons — none. A11y — real heading elements; level is the only
API, so the outline always matches the DOM.
