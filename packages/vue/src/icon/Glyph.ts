import { h, type FunctionalComponent } from 'vue'

import type { IconRole } from '@polymorph/engine'

import { GLYPHS } from './glyphs'

/**
 * What `Glyph` takes: the role to draw, and any attribute for the `<svg>`
 * (`class`, `data-*`, `aria-*`, `role`), which the member drawing it decides.
 */
export interface GlyphProps {
  glyph: IconRole
  [attribute: string]: unknown
}

/**
 * Draws a role's glyph: the `<svg>` around its elements (`design/components/icon.md`).
 *
 * The Vue foundation's icon gateway, the counterpart of the React foundation's
 * `GlyphSvg`. A member names a role and this draws it. The drawing comes from
 * `glyphs.ts`, which `pnpm shells` writes from `design/icons.json`'s roles
 * through the engine's role data, so no icon library runs in the application
 * and a remapped role changes no member. The presentation attributes are the
 * fallback; the Icon recipe's tokens override width, height and stroke width.
 */
export const Glyph: FunctionalComponent<GlyphProps> = ({ glyph }, { attrs }) =>
  h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: 24,
      height: 24,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      focusable: 'false',
      ...attrs,
    },
    GLYPHS[glyph].map(([tag, attributes]) => h(tag, attributes)),
  )

Glyph.props = ['glyph']
Glyph.inheritAttrs = false
