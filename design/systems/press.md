# press — rationale

**Direction:** a broadsheet's confidence in product form: bright neutral paper (tint 0.003)
rather than tinted newsprint, near-black ink, one rose-wine accent for actions and live
markers, hairline rules for structure, and serif body and display faces. Bar: **the broadsheet
register**: a serious newspaper's digital edition, dense and typography-led.

press is the only system that uses the `editorial` type personality.

## Axes

| Axis | Value | Why |
| --- | --- | --- |
| geometry | `crisp` | 2/4/8, square rather than round. Newspaper corners are clean-cut but not sharp chrome. |
| depth | `borders` | Rules carry the structure, as in column-set print. Faint shadows only on transient surfaces. |
| density | `standard` | Newspaper density is information density, not cramped chrome. The standard rhythm suits a data page and a reading page alike. |
| contrastTemperament | `stark` | Full-strength secondary text, visible borders, and a page-to-surface spread that reads as print. |
| typePersonality | `editorial` | The reason for the system. Serif fallback stacks, 700 titles, looser small-caps tracking, 1.25 icon stroke (+0.25 stark = 1.5). |
| colorStrategy | `quiet` | Paper and ink. The wine appears only where there is action or liveness. |
| motionTemperament | `standard` | Quick and functional. Standard is fast enough to feel edited. |
| ornament | `minimal` | No texture, because press's paper is bright. Its decoration is the italic masthead. Glows derive (minimal permits them) and look warm under the wine, not neon. |

Divergence: 3 from plain (geometry, temperament, type personality), 4 from flint
and desktop, 5 from pastel, 6 from dew, glassmorphic, pebble, journal and terminal, 7 from
pop, and no shared accent band (356 vs 200/298/75).

## Seeds — `carmine`

press's colour seeds are in `design/palettes/carmine.json`.

- **`accentHue: 356`, `chromaBudget: medium`**: rose-wine, 29° from `danger` (25). At step
  9 the accent renders a warm rose (`accent.bg #ca5a89`) while danger stays clearly
  alarm-red. The vocabulary never places the two treatments adjacently (verified across the
  galleries: status chips and accent fills read as different jobs, not different reds). The
  solid ladder pins fills at L 0.62 for label legibility, so press's wine is a rose rather
  than an oxblood. A deeper burgundy would break the fill-legibility law, and the law takes
  priority.
- **`neutralTint: 0.003`**: the brightest paper in the set. Near-pure neutrals make the ink
  the darkest element and the wine the only warmth.
- **No `gradientHue`**: a broadsheet page has no wash.
- **defaultMode: `light`.** Dark derives a warm-black page with the ink flipped to paper and
  the wine unchanged (mode-pinned solids).

## Fonts — and the italic display slot

| Role | Family (`@fontsource-variable/*`) | Why |
| --- | --- | --- |
| body | **Source Serif 4 Variable** (`source-serif-4`) | A text serif built for screens and UI sizes, so the broadsheet voice can still label a button. The `editorial` personality's serif fallback stacks exist for this, and press is the system that uses them. |
| display | **Fraunces Variable** (`fraunces`) — **`style: "italic"`** | The masthead. Fraunces' high-contrast italic is press's face wherever the display scale is used. |
| mono | **Fira Code Variable** (`fira-code`) | For occasional figures and IDs. |

**The italic slot.** `fonts.display` takes an optional **`style: 'normal' | 'italic'`**. The
property belongs to the family slot, like its fallback class, and only the display
derivation reads it. press sets it. Every display step emits the slot's style
(`--pm-display-*-style`), so `Hero`'s title renders Fraunces italic under press and
Fraunces upright under dew.

## What the shared recipes render as, under press

- ListPage's panel: a crisp ruled region on bright paper, the catalogue's closest match to a
  page of set columns.
- Shell: a paper rail a half-step darker with stark `border.default` edges (borders depth
  uses the flat rule): masthead bar above, columns below.
- Selection: a light rose wash with wine text. The bulk bar uses the same.
- Buttons: wine fills with the borders-depth seat and top light, and serif labels.
- Figures: `tabular-nums` in Source Serif, so market-table columns need no face change.

## Register judgment (side-by-side, home mode)

- **Passes the register:** the inbox reads as a listings page. The serif body handles UI
  text without strain, rules carry the structure, hierarchy is stark, and the wine appears
  only on action and priority. The auth card, titled in the serif body face, looks
  editorial. No other system in the set resembles it.
- **Known gap:** the **double-rule title**, the editorial double hairline under page and
  section titles, is not drawn. A lawful version needs either a fourth exposed axis
  (`typePersonality`, beside depth, geometry and ornament) or a theme-emitted rule-style
  pattern token. That is an engine exposure decision, not a one-system workaround, because a
  recipe never knows which house system it is in. Dark mode is lawful. Light is the primary
  mode and the one judged most closely.
- **"Whose is this?"**: bright neutral paper, a rose-wine that is no brand's red, Fraunces
  italic at the masthead, and rules for structure.
