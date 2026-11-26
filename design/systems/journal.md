# journal — rationale

**Direction:** the writing desk: warm paper, ink, hairline rules, a serif for display. Bar:
**the document register**: reading-first typography, warmth without tint noise, chrome
hidden until needed, and hierarchy drawn with rules and space instead of boxes and shadows.

## Axes

| Axis | Value | Why |
| --- | --- | --- |
| geometry | `soft` | Soft corners suit a paper surface (4/8/14). |
| depth | `borders` | Separation by rules, as in a document. Faint shadows only where a surface actually lifts (menus, dialogs). |
| density | `comfortable` | Reading rhythm: 1.30 type ratio, 1.15 space. A document tool must not crowd its text. |
| contrastTemperament | `soft` | Supporting text recedes. Primary text holds step 12, because the law's floor applies to every system. |
| typePersonality | `humanist` | A warm, unobtrusive text face. The serif is in the display slot, not in paragraphs. |
| colorStrategy | `quiet` | The paper provides the warmth. Chroma appears only for state or action, and journal's action colour is ink. |
| motionTemperament | `subtle` | Pages settle without flourish. |
| ornament | `grain` | The paper texture: sub-perceptual noise on the page surface (ΔL-bounded), a grey speckle that works on light and dark paper. |

Divergence: 6 axes from terminal, 6 from pastel, at least 5 from every designed system, and
no shared accent band (hue 75 vs 200/298).

## Seeds — `umber`, and the `ink` budget

journal's colour seeds are in `design/palettes/umber.json`.

- **`accentHue: 75`, `chromaBudget: ink`**: the accent is ink. At `low`'s 0.09 peak, hue 75
  would be a muted amber close to the harmonized status colours, and at low chroma hue
  distance does not separate meanings. The **`ink` budget (peak 0.035)** gives a warm
  near-neutral far from every status tone. The primary button is a warm ink fill, links are
  underlined (the humanist document convention, since `accent.text` at ink chroma is
  quiet), the focus ring is ink, and selection is a warm paper wash.
- **The status floor**: status chroma floors at `low` (0.09) regardless of budget
  (`STATUS_CHROMA_FLOOR`). Otherwise harmonized status would follow `ink`, and a near-grey
  warning is a defect. Status is information first, so status colours keep a minimum chroma
  instead of turning grey.
- **`neutralTint: 0.008`** at the accent's hue 75 is the paper, so no `neutralHue` is
  needed.
- **No `gradientHue`**: `bg.wash` resolves to the paper and the primary button stays a
  plain ink fill.
- **defaultMode: `system`.** A first visit wears the device's mode and follows it until the
  reader chooses one. Dark re-derives to warm dark surfaces with the same ink logic
  and unchanged status colours.

## Fonts

| Role | Family (`@fontsource-variable/*`) | Why |
| --- | --- | --- |
| body | **Source Sans 3 Variable** (`source-sans-3`) | A humanist text sans for long reading at UI sizes. Warmer and quieter than the geometric families, without Jakarta's roundness competing with the serif. |
| display | **Lora Variable** (`lora`) — `fallback: "serif"` | A contemporary text serif with calligraphic roots, restrained enough for UI. The per-family fallback class exists for this pairing, so a serif display over a sans body falls back to a serif stack, not Arial. |
| mono | **Fira Code Variable** (`fira-code`) | General-purpose. A document tool rarely shows code. |

## The display moment

Lora appears at the display scale. **`Hero` sets its title at `display.lg`** (`display.md`
in a narrow container) with the slot's family, weight, optical tracking and `font-style`,
so every system's display face has a consumer. Page titles inside the product stay on the
text scale. AuthPage's title is deliberately not a display moment: the card's 344px
measure fits about twelve characters at a display step, so it uses `text.2xl`, the same
tier as PageHeader's title.

## What the shared recipes render as, under journal

- ListPage's panel: a **ruled region**: hairline border, soft radius, faint shadow (borders
  depth), on paper.
- Shell: the rail a half-step darker than the paper, with `border.subtle` edges.
- Selection: warm ink wash with ink text. Hover is separate and quieter.
- Buttons: ink fills with the borders-depth seat (1px contact, faint top light). Hover adds
  a *warm* glow (alpha 0.22).
- Figures: `tabular-nums` in Source Sans, never the mono face.

## Register judgment (side-by-side, home mode)

Judged against the document register, on the same screens as every other system (inbox,
new-ticket, settings, auth, both modes):

- **Passes the register:** real warmth in the paper, not tinted noise. Chrome recedes to
  rules and margins. The ink primary cannot be confused with a status. The comfortable
  rhythm suits reading. The display moment is a serif.
- **Known gaps:** dark mode is lawful and warm, but light is the primary mode and the one
  judged most closely. Grain is sub-perceptual by law, so the paper reads mostly through
  neutral warmth, not texture.
- **"Whose is this?"**: an ink-budget accent on hue-75 paper, a Lora display face, and
  hierarchy drawn with rules and margins instead of boxes.
