import { memberAttr, type SpaceStep, type TextStep } from '@polymorph/react'

import styles from '@polymorph/recipes/structure/skeleton.module.css'

/**
 * Loading placeholder that holds the layout while content arrives
 * (`design/components/skeleton.md`).
 *
 * Sizes come from the scale, not measurements: a `text` skeleton is exactly the
 * line box of its text step, so nothing jumps when the text arrives. No
 * `width="240px"`, on purpose.
 *
 * At `none` and under reduced motion the sweep stops and the fill remains,
 * because the placeholder itself is the loading signal.
 */

export type SkeletonShape = 'text' | 'rect' | 'circle'

interface Common {
  /**
   * Set when the skeleton stands for a named region; makes the root a
   * `role="status"` with this name. Otherwise it is hidden, because a grey box
   * means nothing to a screen reader.
   */
  label?: string
}

/**
 * A union, because `size` gives a rect or circle its height, and a circle
 * without one would be full width and zero height. So
 * `<Skeleton shape="circle" />` is a type error.
 */
export type SkeletonProps = Common &
  (
    | {
        shape?: 'text'
        /** The step whose line box this stands in for. */
        textStep?: TextStep
        /** A space step, or the full width of whatever holds it. */
        width?: SpaceStep | 'full'
      }
    | { shape: 'rect'; size: SpaceStep; width?: SpaceStep | 'full' }
    | { shape: 'circle'; size: SpaceStep }
  )

export function Skeleton(props: SkeletonProps) {
  const { shape = 'text', label } = props
  const named = label !== undefined

  // The `in` guard narrows the union for *access*, but the `md` default must
  // apply outside it, or a Skeleton with no props would paint nothing.
  const textStep =
    shape === 'text' ? ('textStep' in props ? (props.textStep ?? 'md') : 'md') : undefined
  const width =
    shape === 'circle' ? undefined : (('width' in props ? props.width : undefined) ?? 'full')
  const size = 'size' in props ? props.size : undefined

  return (
    <div
      className={styles.skeleton}
      data-shape={shape}
      data-text-step={textStep}
      data-width={width}
      data-size={size === undefined ? undefined : String(size)}
      role={named ? 'status' : undefined}
      aria-label={label}
      aria-hidden={named ? undefined : true}
      {...memberAttr('Skeleton')}
    />
  )
}
