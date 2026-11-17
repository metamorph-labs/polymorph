<script lang="ts">
  /**
   * Draws a third-party brand mark (`design/components/icon.md`, brand marks):
   * the Svelte foundation's counterpart of the React foundation's `BrandMark`.
   *
   * A provider's mark is not an icon role. Its geometry and colours belong to
   * the provider, so the theme does not draw it: the marks are the engine's
   * data (`BRAND_DRAWINGS`), in the providers' published colours, and this
   * draws them as they are. The set is closed: there is no `src`, no slot and
   * no colour, so application code names a brand and never draws one. It takes
   * Icon's recipe for its three token sizes and its baseline alignment.
   */
  import { BRAND_DRAWINGS, type BrandName } from '@polymorph/engine'

  import styles from './icon.module.css'

  interface Props {
    name: BrandName
    /** Icon's three sizes, so a mark fills the same slot and line box as a glyph. */
    size?: 'sm' | 'md' | 'lg'
    /**
     * Accessible name: set it for a meaningful mark (`role="img"` + `aria-label`), and omit it
     * for a decorative `aria-hidden` one, which is the usual case beside a label naming the
     * provider.
     */
    label?: string
  }

  let { name, size = 'md', label }: Props = $props()

  const drawing = $derived(BRAND_DRAWINGS[name])
  const meaningful = $derived(label !== undefined)
</script>

<svg
  class={styles['icon']}
  viewBox={drawing.viewBox}
  data-size={size}
  data-brand={name}
  aria-hidden={meaningful ? undefined : 'true'}
  role={meaningful ? 'img' : undefined}
  aria-label={label}
  focusable="false"
  >{#each drawing.paths as path (path.fill)}<path d={path.d} fill={path.fill}></path>{/each}</svg
>
