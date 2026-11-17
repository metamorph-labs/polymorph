import { defineComponent, h, type PropType } from 'vue'

import { BRAND_DRAWINGS, type BrandName } from '@polymorph/engine'

import styles from './icon.module.css'

/**
 * What `BrandMark` takes, as the React foundation's `BrandMark` takes it: the
 * brand, Icon's three sizes, and a label only for a meaningful mark.
 */
export interface BrandMarkProps {
  name: BrandName
  /** Icon's three sizes, so a mark fills the same slot and line box as a glyph. */
  size?: 'sm' | 'md' | 'lg'
  /**
   * Accessible name: set it for a meaningful mark (`role="img"` + `aria-label`), and omit it for
   * a decorative `aria-hidden` one, which is the usual case beside a label naming the provider.
   */
  label?: string
}

/**
 * Draws a third-party brand mark (`design/components/icon.md`, brand marks):
 * the Vue foundation's counterpart of the React foundation's `BrandMark`.
 *
 * A provider's mark is not an icon role. Its geometry and colours belong to
 * the provider, so the theme does not draw it: the marks are the engine's data
 * (`BRAND_DRAWINGS`), in the providers' published colours, and this draws them
 * as they are. The set is closed: there is no `src`, no slot and no colour, so
 * application code names a brand and never draws one. It takes Icon's recipe
 * for its three token sizes and its baseline alignment.
 */
export const BrandMark = defineComponent({
  name: 'BrandMark',
  inheritAttrs: false,
  props: {
    name: { type: String as PropType<BrandName>, required: true },
    size: { type: String as PropType<'sm' | 'md' | 'lg'>, default: 'md' },
    label: { type: String, default: undefined },
  },
  setup(props) {
    return () => {
      const { viewBox, paths } = BRAND_DRAWINGS[props.name]
      const meaningful = props.label !== undefined
      return h(
        'svg',
        {
          class: styles['icon'],
          viewBox,
          'data-size': props.size,
          'data-brand': props.name,
          'aria-hidden': meaningful ? undefined : 'true',
          role: meaningful ? 'img' : undefined,
          'aria-label': props.label,
          focusable: 'false',
        },
        paths.map((path) => h('path', { key: path.fill, d: path.d, fill: path.fill })),
      )
    }
  },
})
