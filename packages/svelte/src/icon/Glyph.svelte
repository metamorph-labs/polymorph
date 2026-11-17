<script lang="ts">
  /**
   * Draws a role's glyph: the `<svg>` around its elements
   * (`design/components/icon.md`).
   *
   * The Svelte foundation's icon gateway, the counterpart of the React
   * foundation's `GlyphSvg`. A member names a role and this draws it. The
   * drawing comes from `glyphs.ts`, which `pnpm shells` writes from
   * `design/icons.json`'s roles through the engine's role data, so no icon
   * library runs in the application and a remapped role changes no member. The
   * presentation attributes are the fallback; the Icon recipe's tokens override
   * width, height and stroke width. Every other attribute (`class`, `data-*`,
   * `aria-*`, `role`) is the member's that draws it, set on the `<svg>`.
   */
  import type { IconRole } from '@polymorph/engine'

  import { GLYPHS } from './glyphs'

  let { glyph, ...rest }: { glyph: IconRole; [attribute: string]: unknown } = $props()
</script>

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
  focusable="false"
  {...rest}
  >{#each GLYPHS[glyph] as [tag, attributes], at (at)
    }<svelte:element this={tag} xmlns="http://www.w3.org/2000/svg" {...attributes}
    ></svelte:element
  >{/each
}</svg>
