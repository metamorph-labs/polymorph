/**
 * The CSS contract. Every decision reaches the DOM as a `--pm-*` custom
 * property. This file holds the only token-path-to-name translation, so the
 * emitter, the lint rules and component CSS agree on spelling.
 */

export const PM_PREFIX = '--pm-'

/**
 * `bg.app` -> `--pm-bg-app`, `accent.bgHover` -> `--pm-accent-bg-hover`.
 * camelCase is split because custom properties are case-sensitive and the
 * Stylelint naming law (`^pm-[a-z0-9-]+$`) rejects capitals.
 */
export function cssVarName(tokenPath: string): string {
  const kebab = tokenPath
    .replace(/\./g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
  return `${PM_PREFIX}${kebab}`
}

/** `bg.app` -> `var(--pm-bg-app)`. */
export function cssVar(tokenPath: string, fallback?: string): string {
  const name = cssVarName(tokenPath)
  return fallback === undefined ? `var(${name})` : `var(${name}, ${fallback})`
}

/**
 * Attributes the runtime writes on `<html>` and contextual scopes select on.
 *
 * A pairing is two attributes. A single `data-theme` would be a second way to
 * say the same thing. Blocks are scoped on both, as in
 * `[data-system='pastel'][data-palette='amethyst']`, so a document with only
 * one matches nothing, deliberately.
 */
export const DATA_ATTRS = {
  system: 'data-system',
  palette: 'data-palette',
  mode: 'data-mode',
  density: 'data-density',
  tone: 'data-tone',
  motion: 'data-motion',
} as const

/**
 * The member identity attribute. Every component root and portaled surface has
 * `data-member="<slug>"` (its gallery spelling). Its only lawful selector is
 * the emitter's exception blocks, which re-point a class token for one named
 * member inside one pairing. Recipes must never select it, because a
 * component branching on itself would take a decision from the system.
 * `polymorph/no-member-selectors` enforces this.
 */
export const MEMBER_ATTR = 'data-member'

/**
 * Recipes are theme-neutral, with **deliberate axis exposure.**
 *
 * `[data-system="…"]`, `[data-palette="…"]` and `[data-theme]` are forbidden in
 * `packages/react-ui` (`polymorph/no-theme-selectors`). The lawful alternative:
 * three axes are emitted as **flag tokens**, and a recipe branches with a style
 * query:
 *
 * ```css
 * @container style(--pm-axis-depth: flat) {
 *   .card { border: 1px solid var(--pm-border-default); }
 * }
 * ```
 *
 * The branch is about what kind of system this is, never which, because no
 * name appears.
 *
 * **Why a token, not an attribute.** An attribute would need the runtime to
 * keep a name→axes registry in sync on every switch and on hydration. A flag
 * token is emitted with every other theme value, so it is always correct with
 * no code running. Style queries need no `container-type`: every element is
 * its own style container.
 *
 * **Only three.** The other five axes work through token values, the preferred
 * form: a value is one declaration, visible in the token gallery; a branch is
 * an invisible selector. These three can require structurally different
 * recipes:
 *
 *  - `depth`: shadow and border separation use different properties.
 *  - `geometry`: `sharp` sets every radius to 0, so a rounded-corner detail has
 *    nothing to attach to.
 *  - `ornament`: decoration a system does not permit should not be laid out
 *    and then hidden.
 *
 * A fourth is a separate design decision, so `laws.test.ts` asserts this list.
 */
export const EXPOSED_AXES = ['depth', 'geometry', 'ornament'] as const
export type ExposedAxis = (typeof EXPOSED_AXES)[number]

/** `depth` -> `--pm-axis-depth`, the one spelling the lint rule and emitter share. */
export function axisFlagName(axis: ExposedAxis): string {
  return cssVarName(`axis.${axis}`)
}

/**
 * The media query a reader's request for more contrast matches. Forced colours
 * are included: the browser replaces most colours then, and whatever it leaves
 * (an image layer, an SVG fill) is drawn from the partner.
 *
 * It is here and not in the emitter because the runtime reads it too: a
 * program that holds resolved values re-reads them when the query's answer
 * changes, and the runtime imports no emitter.
 */
export const MORE_CONTRAST_QUERY = '(prefers-contrast: more), (forced-colors: active)'
