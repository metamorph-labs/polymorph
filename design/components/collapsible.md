# Collapsible

Collapsible is a single disclosure, such as "Advanced options" under a form or the
raw payload at the bottom of an aside: one trigger and one region, open or closed.
`@radix-ui/react-collapsible` supplies the behaviour (a direct dependency of
`@polymorph/react-ui`).

Collapsible is *not* an Accordion of one. Accordion is document structure: a
**list** of sections with real `<h3>` headings, ruled borders top and bottom, and
a one-or-many state machine across items (`accordion.md`). Wrapping a single
disclosure in list semantics makes a screen reader announce "list, 1 item" and
adds a heading level the page did not intend. Collapsible is an inline control: it
fits its label, draws no rules and takes no place in the outline. If a second
section appears beside it, the content needs an Accordion, so use that member
instead.

## Anatomy

```
[root]
  [trigger <button>: [label] [chevron: Icon "down"]]
  [content]
    [inner: padding-top — children]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | required | the trigger's text — what is being disclosed, in the product's words |
| `defaultOpen` | `boolean` | `false` | closed by default, because a disclosure that starts open hides nothing |
| `open` / `onOpenChange(open)` | `boolean` | — | controlled pair, Radix contract |
| `keepMounted` | `boolean` | `false` | the closed region's content stays in the document and `hidden` (Radix `forceMount`), so a page's server markup carries it for a reader or crawler that runs no script, and state inside the region survives a close. The default leaves closed content out, as Accordion's does. The generated members keep closed content in the document, `hidden`, in every case, so the prop changes nothing there |
| `children` | `ReactNode` | required | bare strings take the content recipe; slotted components keep their own type (Accordion's rule) |

Attributes come from Radix with no translation layer: root, trigger and content
carry `data-state="open|closed"`.

## Recipes (exact tokens)

The trigger fits its label. A full-width trigger is Accordion's document grammar,
and stretching this one would make it look like an Accordion.

| Part | Tokens |
| --- | --- |
| trigger | inline row · min-height `--pm-control-height-sm` (target floor, conventions §2) · gap `--pm-space-2` · `text.sm` quartet · `--pm-text-secondary` · bg transparent · no horizontal padding, so it sits flush with the content it discloses |
| chevron | Icon `down` · `sm` · `--pm-text-muted` · trailing |
| trigger hover | label `--pm-accent-text` · chevron `--pm-text-secondary`. Colour only, no wash. This is Accordion's exact hover, because one disclosure grammar should look the same in both members, and a flush trigger has no box to wash |
| trigger open | chevron rotated 180° |
| focus | the shared focus ring (conventions §4) on the trigger |
| content inner | padding-top `--pm-space-3` (inside the animated region, so the gap collapses with the content) · bare strings `text.sm` · `--pm-text-secondary` |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| closed | `label="Advanced options"` | `data-state="closed"`, `aria-expanded="false"`; content not reachable |
| open | `defaultOpen` | `data-state="open"`, `aria-expanded="true"` |
| controlled | `open` + `onOpenChange` | state follows the prop |
| long content | several paragraphs | trigger width unchanged, because the label sizes it, not the region |
| kept mounted | `keepMounted` | `data-state="closed"`; the region in the DOM with its content, and `hidden`, so still not reachable |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="open"]`,
`[data-state="closed"]`.

## Motion

`collapsible.content`: **`collapse`**, persistent mode, `surface` class. This is
`accordion.content`'s binding verbatim (`design/motion/motion.md` §9). The Radix
measured height `--radix-collapsible-content-height` is the input; never write the
keyframe by hand. The chevron rotates over `--pm-motion-duration-control` ×
`--pm-motion-easing-standard`. At `none`: instant open and close, static chevron.
Reduced motion: `collapse`'s projection, so the size changes instantly and the
content still fades. With `keepMounted`, the closing region is hidden when its close
keyframes end, and at once when none run (reduced motion, `none`).

## Icons

`down` (trigger chevron, decorative; `aria-expanded` announces the state). It uses
the same glyph and rotation as Accordion, so the system has one disclosure
chevron.

## A11y

Radix collapsible semantics: the trigger is a real
`<button aria-expanded aria-controls>`. No heading wraps it, on purpose. Heading
structure belongs to the page, and an "Advanced options" toggle inside a form is
not an outline entry (the opposite of Accordion's `<h3>` decision, for the
opposite use). Nothing inside a closed region takes focus or is announced. By
default Radix unmounts closed content. With `keepMounted` the region is in the
document and `hidden`, which takes it out of the focus order and the
accessibility tree. The label carries the disclosure's
meaning, and the chevron is never the only signal. Enter and Space toggle it, as
they press any button.

```contract
role trigger button
name trigger from label when closed
attr trigger aria-expanded=false when closed
attr trigger aria-controls when open
key Enter opens on trigger when closed
key Space opens on trigger when closed
key Enter closes on trigger when open
```

## Agent

An agent reads whether the region is open and opens and closes it, as a press on the trigger
does. The change goes through the member's own open state, so `onOpenChange` reports it as it
reports a person's, whether or not the caller controls it. The trigger names the member, so an
agent finds it by its label.

```agent
state open boolean as trigger aria-expanded
action open sets open calls onOpenChange
action close sets open calls onOpenChange
```
