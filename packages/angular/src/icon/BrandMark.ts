import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  ViewEncapsulation,
} from '@angular/core'

import { BRAND_DRAWINGS, type BrandName } from '@polymorph/engine'

import styles from './icon.module.css'

/**
 * Draws a third-party brand mark (`design/components/icon.md`, brand marks)
 * on its `<svg>`: `<svg [pmBrandMark]="'google'">`, the Angular foundation's
 * counterpart of the React foundation's `BrandMark`.
 *
 * A provider's mark is not an icon role. Its geometry and colours belong to
 * the provider, so the theme does not draw it: the marks are the engine's data
 * (`BRAND_DRAWINGS`), in the providers' published colours, and this draws them
 * as they are. The set is closed: there is no `src`, no slot and no colour, so
 * application code names a brand and never draws one. It takes Icon's recipe
 * for its three token sizes and its baseline alignment.
 */
@Component({
  selector: 'svg[pmBrandMark]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    focusable: 'false',
    '[attr.class]': 'className',
    '[attr.viewBox]': 'drawing().viewBox',
    '[attr.data-size]': 'size()',
    '[attr.data-brand]': 'pmBrandMark()',
    '[attr.aria-hidden]': "label() === undefined ? 'true' : null",
    '[attr.role]': "label() === undefined ? null : 'img'",
    '[attr.aria-label]': 'label() ?? null',
  },
  // prettier-ignore
  template: `@for (path of drawing().paths; track $index) {<svg:path [attr.d]="path.d" [attr.fill]="path.fill" />}`,
})
export class BrandMark {
  /** The brand. */
  readonly pmBrandMark = input.required<BrandName>()
  /** Icon's three sizes, so a mark fills the same slot and line box as a glyph. */
  readonly size = input<'sm' | 'md' | 'lg', 'sm' | 'md' | 'lg' | undefined>('md', {
    transform: (size) => size ?? 'md',
  })
  /**
   * Accessible name: set it for a meaningful mark (`role="img"` + `aria-label`), and omit it for
   * a decorative `aria-hidden` one, which is the usual case beside a label naming the provider.
   */
  readonly label = input<string | undefined>(undefined)
  protected readonly className = styles['icon']
  protected readonly drawing = computed(() => BRAND_DRAWINGS[this.pmBrandMark()])
}
