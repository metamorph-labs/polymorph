# EmptyState

The required surface for when there is nothing to show (completeness law: a screen cannot omit
its empty state). It covers first-run, filtered-to-zero and error-empty cases with one layout.

## Anatomy

```
[root]
  [icon well: [Icon]]
  [title]
  [description?]
  [action? + secondaryAction?]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `icon` | `IconRole` | `'inbox'` | |
| `title` | `string` | required | states the situation ("No tickets yet") |
| `description` | `string` | — | what to do about it |
| `action` | `ReactNode` | — | one Button, `soft`/`accent` `md` by convention (the page keeps its single `solid` in PageHeader) |
| `secondaryAction` | `ReactNode` | — | `ghost` Button (e.g. "Clear filters") |

Attributes: none.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| root | column · centered text · `align: center` · padding `--pm-space-8` `--pm-space-6` · gap `--pm-space-4` |
| icon well | `--pm-bg-subtle` circle (`--pm-radius-pill`) · padding `--pm-space-4` · icon `lg` at `--pm-text-muted` |
| title | `text.lg` quartet · `--pm-text-primary` |
| description | `text.sm` · `--pm-text-secondary` · max-width `calc(var(--pm-space-10) * 5)` (measure) |
| actions row | `<Inline gap={3}>` · top gap `--pm-space-2` extra |

The well stays muted (a muted icon on a subtle wash), because an empty state is guidance, not
an alarm. Error-empty cases pass `icon="error"`, and the well recipe does not change. A status
colour would clash with the muted style, and the title states the problem.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| minimal | title only | — |
| standard | icon + title + description | — |
| with action | + action | — |
| with both actions | + secondaryAction | — |
| filtered-dry | `icon="search"` "No results match" + "Clear filters" ghost | — |

`requiredSelectors`: —.

## Motion

Entrance `fade` at `--pm-motion-duration-surface` × `--pm-motion-easing-enter` when it
replaces content (e.g. filter hits zero); none on first paint. At `none`: instant.

## Icons

`icon` prop (decorative, because the title says it in words).

## A11y

Plain content with no live region. The empty state is the result the user navigated to, and
result counts are announced separately, by FilterBar's `resultCount` in a ListPage's filter
flow.
