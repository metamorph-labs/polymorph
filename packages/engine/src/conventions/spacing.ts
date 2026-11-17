import type { SpaceStep } from '@polymorph/theme'

/**
 * The spacing props Stack, Inline and Grid share, in every framework.
 * `design/components/inline.md` and `grid.md` are written as differences from
 * `stack.md`, and the code follows the same structure.
 */

/**
 * An instance patch, rung 3 of the exception ladder (`docs/rules.md`). Keys are
 * the spacing props the member already exposes, and values are token steps,
 * never lengths. A patch re-assigns a named decision and does not introduce a
 * new value. `pnpm inventory` lists every use, so every exception is visible.
 */
export interface LayoutPatch {
  gap?: SpaceStep
  p?: SpaceStep
  px?: SpaceStep
  py?: SpaceStep
}

export interface SpacingProps {
  gap?: SpaceStep
  p?: SpaceStep
  px?: SpaceStep
  py?: SpaceStep
  patch?: LayoutPatch
}

/**
 * Spacing attributes for the root, with any patch applied last.
 *
 * `undefined` drops the attribute, so "no padding declared" stays distinct
 * from `p={0}`, which is a deliberate reset. A patch key set to `undefined`
 * leaves the base prop, so `patch={{ gap: undefined }}` erases nothing.
 */
export function spacingAttrs(props: SpacingProps): Record<string, string | undefined> {
  const pick = (key: keyof LayoutPatch) => props.patch?.[key] ?? props[key]
  const step = (value: SpaceStep | undefined) => (value === undefined ? undefined : String(value))
  return {
    'data-gap': step(pick('gap')),
    'data-p': step(pick('p')),
    'data-px': step(pick('px')),
    'data-py': step(pick('py')),
  }
}
