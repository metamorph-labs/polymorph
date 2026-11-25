---
'@polymorph/engine': patch
'@polymorph/theme': patch
---

**A system file can set its heading weights.** `overrides.type.titleWeight` replaces the type
personality's title weight on `text.2xl` and `text.3xl`, and `overrides.type.displayWeight` its
display weight on the display steps. Each takes 300 to 700 in hundreds. Body text, the working
sizes and `text.xl` keep their weights, and no size changes. `display.lg` still takes 50 off the
display weight, and never goes under 300.

```json
{ "overrides": { "type": { "titleWeight": 300, "displayWeight": 300 } } }
```

The schema holds each heading step's weight to the size it needs to read at Lc 75, the floor
`text.primary` is held to, from the Lc 75 row of APCA's font lookup table
(`BODY_TEXT_MIN_SIZE_PX`, `minSizeForWeight`): 24px at 300, 18px at 400, 16px at 500. It judges
the size the step derives from the merged base and ratio, so a title weight of 300 under a small
base or a flat ratio is refused with the step, its size and the size the weight needs. A system
that sets neither key derives exactly as before. `HEADING_WEIGHT_RANGE` exports the range.

An application loads its own fonts, so an application that admits a system setting a light
heading weight must load that weight of the family: the 300 file of a static fontsource package,
or a variable family whose weight axis reaches 300.
