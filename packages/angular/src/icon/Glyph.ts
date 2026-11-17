import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  ViewEncapsulation,
} from '@angular/core'

import type { IconRole } from '@polymorph/engine'

import { Spread } from '../zag/spread'
import { GLYPHS } from './glyphs'

/**
 * Draws a role's glyph inside its `<svg>` (`design/components/icon.md`):
 * `<svg [pmGlyph]="'add'">`.
 *
 * The Angular foundation's icon gateway, the counterpart of the React
 * foundation's `GlyphSvg`. A member names a role and this draws it. It is a
 * component on the `<svg>` element itself, so the member's attributes (`class`,
 * `data-*`, `aria-*`, `role`) are written on the `<svg>` the member's template
 * names, and no element of Angular's own sits around it. The drawing comes
 * from `glyphs.ts`, which `pnpm shells` writes from `design/icons.json`'s roles
 * through the engine's role data, so no icon library runs in the application
 * and a remapped role changes no member. The presentation attributes are the
 * fallback; the Icon recipe's tokens override width, height and stroke width.
 * `focusable="false"` keeps an inline SVG out of an old browser's tab order,
 * as the React gateway writes it.
 */
@Component({
  selector: 'svg[pmGlyph]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [Spread],
  host: {
    xmlns: 'http://www.w3.org/2000/svg',
    width: '24',
    height: '24',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    focusable: 'false',
  },
  // prettier-ignore
  template: `@for (part of drawing(); track $index) {@switch (part[0]) {@case ('circle') {<svg:circle [pmSpread]="part[1]" />}@case ('line') {<svg:line [pmSpread]="part[1]" />}@case ('polyline') {<svg:polyline [pmSpread]="part[1]" />}@case ('polygon') {<svg:polygon [pmSpread]="part[1]" />}@case ('rect') {<svg:rect [pmSpread]="part[1]" />}@case ('ellipse') {<svg:ellipse [pmSpread]="part[1]" />}@default {<svg:path [pmSpread]="part[1]" />}}}`,
})
export class Glyph {
  /** The role to draw. */
  readonly pmGlyph = input.required<IconRole>()
  protected readonly drawing = computed(() => GLYPHS[this.pmGlyph()])
}
