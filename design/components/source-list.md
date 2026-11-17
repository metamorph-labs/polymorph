# SourceList

The numbered list of sources under a reply, which the reply's `[n]` marks point to. It
has no substrate: a labelled section, an ordered list, and an anchor for each row.

SourceList follows Timeline's shape, for pages instead of events. The app orders the
list, and SourceList draws it in that order without sorting. There is one row per
source, numbered to match the Citation marks. It is *not* a bibliography: there is no
citation style or format to choose, and the title, host and passage are the app's data.
It is *not* a list of Cards: a source is one line, and eight boxes under a paragraph would
outweigh the paragraph. An empty list renders nothing (Timeline's rule).

## Anatomy

```
[root <section aria-label>]
  [heading — Icon "cite" + label, aria-hidden]
  [<ol>]
    [<li>]*
      [index — Citation's mark, inert, aria-hidden]
      [body: [title <a> — new tab, open-external glyph] [domain?] [snippet?]]
```

## API

```ts
interface SourceListProps {
  sources: CitationSource[] // in the order the reply numbers them; drawn as handed
  label: string // the list's accessible name — "Sources", in the app's language
}
```

`CitationSource` is Citation's (`citation.md`): `{ title, href, domain?, snippet? }`.

Attributes: none.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | column · gap `--pm-space-3` |
| heading | the overline style (conventions §6): `text.xs` quartet · uppercase · `--pm-text-muted` · Icon `cite` `sm` at gap `--pm-space-1` |
| list | column · gap `--pm-space-3` · no markers (the index column draws them) |
| row | row · gap `--pm-space-3` · aligned to the first line |
| index | Citation's mark: `text.xs` on a square the size of the `text.xs` line box, `--pm-accent-text` on `--pm-accent-subtle`, radius `--pm-radius-detail`. It is inert, because the title is the row's only link |
| body | column · gap `--pm-space-1` · `min-inline-size: 0` |
| title | an `<a target="_blank" rel="noreferrer">` in Link's standalone recipe: `text.sm` quartet · `--pm-accent-text` · no underline at rest, `2px` on hover · the shared focus ring · `overflow-wrap: anywhere`. The recipe is restated instead of using Link, because Link's external style is `nowrap`, which suits a word but not a sentence-length title that must wrap on a phone · Icon `open-external` `sm` after the last word at `--pm-space-1` |
| domain | `text.xs` · `--pm-text-muted` |
| snippet | `text.sm` · `--pm-text-secondary` |

**On Android**: each title is at least the 48dp touch target tall, its text centred in that
line and the index on its first baseline, so the titles' touch areas are their own however
close the rows are. A row whose title is one line is taller than the recipe's by the difference.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| three sources | title, host, passage | `aria-label="Sources"` |
| titles only | no domain, no snippet | — |
| one source | a single row | — |
| empty | `sources={[]}` | renders nothing |

`requiredSelectors`: `:hover`, `:focus-visible`. These are the title link's own states,
which no prop can set.

## Motion

None. The list arrives with the reply, and nothing in it changes state.

## Icons

`cite` (the heading mark, decorative; `label` names the region);
`open-external` after each title (decorative; `rel` and the new tab convey it).

## A11y

A `<section>` named by `label`, holding one `<ol>`. Each `<li>` is a source whose title is
its only link (new tab, `rel="noreferrer"`, as Link does for external links, but on this
member's own anchor so the title can wrap). The drawn index is `aria-hidden`, because an
ordered list already announces its count, and the digit would read the number twice.
Domain and snippet are plain text in reading order after the title.

## Agent

An agent gets nothing from a SourceList. Each title opens its source in a new tab, which a
browser opens only during a person's own gesture and blocks as a popup otherwise, so an agent's
press would be refused, as Link refuses a press on an `external` link. The titles, hosts and
passages are words on the page, which an agent reads there, and an `href` is not read, for
Link's reason. Nothing in the list changes state. Registering would also make this member a
client component in a React Server Components application, which an application that uses no
agent bridge would pay for.
