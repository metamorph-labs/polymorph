<script lang="ts">
  /**
   * Two reads of the theme as data that no `$effect` of the component makes,
   * for `conventions/theme-values.test.ts`: a `style:` directive on an element
   * that `open` draws and removes, and a handler, which reports its reading to
   * `read`.
   */
  import { useThemeValues, type ThemeValues } from '@polymorph/svelte'

  let { open = false, read }: { open?: boolean; read?: (theme: ThemeValues) => void } = $props()

  const theme = useThemeValues()
</script>

{#if open}
  <div data-drawn style:border-color={theme.current.color('border.subtle')}></div>
{/if}
<button type="button" onclick={() => read?.(theme.current)}>Read</button>
