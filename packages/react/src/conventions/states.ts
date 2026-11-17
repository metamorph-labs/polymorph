import type { ReactNode } from 'react'

/**
 * The states fixture: a member's `*.states.tsx`.
 *
 * Every component has one, derived directly from its spec's States table
 * (`design/components/README.md`, fixture derivation). It has three consumers:
 *
 *  - the workbench's gallery harness renders `entries` as a grid, so a designer
 *    sees every state at once under any theme × mode × density × temperament
 *  - the completeness law (`packages/react-ui/src/laws.test.tsx`) renders each entry
 *    in a real browser and asserts its `expect` attributes
 *  - a source test (`packages/react-ui/src/selectors.test.ts`) greps the component's
 *    CSS for every `requiredSelectors` string. Hover, focus and active are
 *    checked only this way, because no prop can produce them.
 */

export interface StateEntry {
  /** Matches the spec's States row, so a failure names a row you can find. */
  name: string
  render: () => ReactNode
  /**
   * Attributes the rendered root must carry. `''` asserts a bare attribute is
   * present. `null` asserts it is absent, which makes "rest state has no
   * `data-state`" checkable.
   */
  expect?: Record<string, string | null>
  /**
   * The entry intentionally renders nothing. Example: Pagination with fewer
   * than two pages, where a disabled pair of arrows would be useless chrome.
   *
   * This is declared, not inferred, and checked both ways: an entry that sets it
   * and renders something also fails. Without it, the completeness law treats
   * "rendered nothing" as a bug, which it usually is.
   */
  rendersNothing?: true
}

export interface ComponentStates {
  /** The exported component name, e.g. `Button`. Slugged for the gallery route. */
  component: string
  entries: StateEntry[]
  /**
   * **The states a prop cannot reach**, copied verbatim from the spec: hover,
   * focus, active, and attribute states a library sets itself. `entries` cannot
   * render them, so the source test greps the stylesheet for them instead. That
   * is all this field means. A component whose every state is reachable by a
   * prop leaves it empty and is complete.
   *
   * It is **not** the component's published attribute contract, and deriving
   * the contract from it would be wrong. Timeline's marks and tones are both
   * props, so its list here is correctly empty. Deriving from it would publish
   * `dataAttributes: []` for a component whose stylesheet selects on seven
   * selectors. The registry reads the contract from the stylesheet. A fixture
   * does not define it in either direction.
   */
  requiredSelectors: string[]
}
