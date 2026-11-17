# Hero

A page-opening block with a display-size title, a lede and the primary actions. Use it at the
top of a page that introduces something; working screens use PageHeader.

The docs site's Overview opens with one (`apps/docs/src/pages/HomePage.tsx`).

## The one-h1 pair

Hero renders the page's `<h1>`. The one-h1 law counts both members: a page uses **exactly one
of PageHeader or Hero**, PageHeader on working screens and Hero on opening pages. Rendering
both on one page breaks the law in the same way as a second PageHeader.

## Anatomy & API

```
[section]
  [h1 title]      — display.lg, the display family speaking at page scale
  [p lede]?       — text.lg, secondary
  [actions row]?  — Buttons; the page's primary lives here when a Hero opens it
```

```ts
interface HeroProps {
  title: string
  lede?: string
  /** Buttons. */
  actions?: ReactNode
  align?: 'start' | 'center' // default 'start'
}
```

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| root | column · gap `--pm-space-5` · padding-block `--pm-space-8` `--pm-space-7` *(the stage license, following AuthPage's card, which adds its own padding because a stage is not a list row. A display block needs its own space, and the page's padding is the frame around it, not part of it)* · `align='center'` centres text and actions · `container-type: inline-size` *(the box the title measures against. A Hero in a page column and a Hero in a narrow rail have different widths at the same moment, and only the container knows which. Members adapt to their container, never to the viewport (`docs/layout.md`))* |
| title | `display.lg` quartet + `--pm-display-lg-style` · `--pm-text-primary` · margin 0 · `overflow-wrap: break-word` *(layout mechanics, not governed by a token. At the top of the scale one long word can be wider than a phone, and the default is to **clip** it: a Press hero measured a 326px box against 417px for "vocabulary". Adaptation degrades composition, never content (`docs/layout.md`), and a clipped word is lost content)* |
| title, narrow container | switches to the `display.md` quartet + `--pm-display-md-style` / `-tracking` below a `26rem` container *(container-first. `26rem` is a rem literal because a breakpoint is geometry, not theme. The whole step changes, not only the size, because an `md` size with `lg`'s tracking exists in no theme. Measured at a `24rem` host in `hero.test.tsx`, and captured by the phone lane's `phone-hero` scene)* |
| lede | `text.lg` quartet · `--pm-text-secondary` · margin 0 |
| actions | `<Inline gap={3} wrap>` (centered under `align='center'`) |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| opening moment | title + lede + one solid Button | h1 role, display.lg size |
| centered | `align="center"` | centered text and actions |
| title alone | title only | h1, no empty slots rendered |

`requiredSelectors`: —.

## Motion — none (a hero performs by standing still). Icons — composed only.
A11y — the `<h1>`; actions are real Buttons.
