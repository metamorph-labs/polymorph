import { For, splitProps, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import type { IconRole } from '@polymorph/engine'

import { GLYPHS } from './glyphs'

/**
 * SVG's `focusable`, which Solid's element types do not list: an old Internet
 * Explorer attribute that keeps an inline SVG out of the tab order, written
 * as the React and Vue gateways write it so the three draw the same element.
 */
export const UNFOCUSABLE: Readonly<Record<string, string>> = { focusable: 'false' }

/**
 * What `Glyph` takes: the role to draw, and any attribute for the `<svg>`
 * (`class`, `data-*`, `aria-*`, `role`), which the member drawing it decides.
 */
export interface GlyphProps extends JSX.SvgSVGAttributes<SVGSVGElement> {
  glyph: IconRole
  [attribute: `data-${string}`]: string | undefined
}

/**
 * Draws a role's glyph: the `<svg>` around its elements (`design/components/icon.md`).
 *
 * The Solid foundation's icon gateway, the counterpart of the React
 * foundation's `GlyphSvg`. A member names a role and this draws it. The
 * drawing comes from `glyphs.ts`, which `pnpm shells` writes from
 * `design/icons.json`'s roles through the engine's role data, so no icon
 * library runs in the application and a remapped role changes no member. The
 * presentation attributes are the fallback; the Icon recipe's tokens override
 * width, height and stroke width.
 */
export function Glyph(props: GlyphProps): JSX.Element {
  const [own, attributes] = splitProps(props, ['glyph'])
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      {...UNFOCUSABLE}
      {...attributes}
    >
      <For each={GLYPHS[own.glyph]}>
        {([tag, drawing]) => <Dynamic component={tag} {...drawing} />}
      </For>
    </svg>
  )
}
