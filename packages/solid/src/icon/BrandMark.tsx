import { For, mergeProps, type JSX } from 'solid-js'

import { BRAND_DRAWINGS, type BrandName } from '@polymorph/engine'

import { UNFOCUSABLE } from './Glyph'
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
 * the Solid foundation's counterpart of the React foundation's `BrandMark`.
 *
 * A provider's mark is not an icon role. Its geometry and colours belong to
 * the provider, so the theme does not draw it: the marks are the engine's data
 * (`BRAND_DRAWINGS`), in the providers' published colours, and this draws them
 * as they are. The set is closed: there is no `src`, no slot and no colour, so
 * application code names a brand and never draws one. It takes Icon's recipe
 * for its three token sizes and its baseline alignment.
 */
export function BrandMark(given: BrandMarkProps): JSX.Element {
  const props = mergeProps({ size: 'md' as const }, given)
  const drawing = () => BRAND_DRAWINGS[props.name]
  const meaningful = () => props.label !== undefined
  return (
    <svg
      class={styles['icon']}
      viewBox={drawing().viewBox}
      data-size={props.size}
      data-brand={props.name}
      aria-hidden={meaningful() ? undefined : 'true'}
      role={meaningful() ? 'img' : undefined}
      aria-label={props.label}
      {...UNFOCUSABLE}
    >
      <For each={drawing().paths}>{(path) => <path d={path.d} fill={path.fill} />}</For>
    </svg>
  )
}
