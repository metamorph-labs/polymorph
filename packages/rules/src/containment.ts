/**
 * Where a borrowed dependency may be imported.
 *
 * These are paths, so they live next to the rules that read them instead of in
 * the ESLint config. A boundary defined only in a config file is easy to miss
 * when someone moves the file it protects. A `repo-laws.test.ts` assertion
 * checks that the paths still exist, so a rename fails the law instead of
 * silently disabling it.
 */

/**
 * The only file that may import the icon set: the role-to-glyph map. Icons are
 * referenced by meaning, so a remap changes no call site. It ships in the React
 * foundation, `@polymorph/react`.
 */
export const ICON_MAP_FILE = 'packages/react/src/icon/map.tsx'

/** The map's own test, which checks each role against the set's export of that name. */
export const ICON_MAP_TEST = 'packages/react/src/icon/map.test.ts'

/** The motion internals, the only place the engine may be imported. */
export const MOTION_INTERNALS = ['packages/engine/src/motion/**']

/**
 * The chart engine, the only place the borrowed scale maths may be imported.
 *
 * It has the same single-entry shape as the two above, for the same reason. The
 * borrowed code is arithmetic (`d3-scale`, `d3-shape`, `d3-array`: no DOM, no
 * styles, no animation), and it stays replaceable only while nothing outside the
 * engine depends on it. A member that imported `scaleLinear` directly would be
 * making layout decisions in a chart library's terms.
 *
 * One directory: `@polymorph/engine/charts`, which has no framework in it and
 * which every framework's chart members draw with.
 */
export const CHART_ENGINE = ['packages/engine/src/charts/**']

/**
 * The chart tier, the one place an inline `<svg>` is lawful.
 *
 * A chart is SVG. Every mark in it is geometry the component computed from a
 * scale, not a named glyph, so the icon rule's inline-`<svg>` clause does not
 * fit it. The rule's other clause still applies: the tier may not import a
 * glyph set, because a chart that needs a picture needs an icon, and icons come
 * through `Icon`.
 *
 * That is why this is a `drawIn` option and not an `allowIn` entry. `allowIn`
 * exempts a file from the whole rule, which would also lift the icon-set import
 * ban that this exemption keeps.
 */
export const CHART_TIER = ['packages/react-ui/src/charts/**']

/**
 * The files outside the chart tier that draw SVG.
 *
 * Each gets `CHART_TIER`'s exemption for the same reason. None is a glob,
 * because a directory can gain a file nobody reviewed and a named file cannot.
 *
 *  - `BrandMark.tsx` is the second icon component. A provider's mark is not a
 *    role the theme draws, because its geometry and colours belong to the
 *    provider. It cannot come through the glyph map, and it must not be drawn at
 *    a call site either. One file draws the closed set, and all other code names
 *    a brand.
 *  - `QRCode.tsx` draws a symbol: geometry the component computed from a string,
 *    not a named glyph. This is the chart tier's reason.
 *  - `Progress.tsx` draws its ring: an arc whose length is the value, not a
 *    named glyph. This is the chart tier's reason too.
 *
 * As with the chart tier, this is `drawIn`, not `allowIn`. Only the
 * inline-`<svg>` clause is lifted. No file here may import a glyph set.
 */
export const SYMBOL_DRAWERS = [
  'packages/react/src/icon/BrandMark.tsx',
  'packages/react-ui/src/structure/QRCode.tsx',
  'packages/react-ui/src/structure/Progress.tsx',
]
