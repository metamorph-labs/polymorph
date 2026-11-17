<script lang="ts">
  /**
   * A component that follows the theme as data, for
   * `conventions/theme-values.test.ts`: it reports each reading to `seen`,
   * read from the element inside its inverse tone scope when `scoped` is set.
   */
  import { useThemeValues, type ThemeValues } from '@polymorph/svelte'

  let { seen, scoped = false }: { seen: (theme: ThemeValues) => void; scoped?: boolean } = $props()

  let element = $state<HTMLElement | null>(null)
  const theme = useThemeValues(() => (scoped ? element : null))

  $effect(() => {
    // Read after the element is bound, so a scoped reading is the element's.
    void element
    seen(theme.current)
  })
</script>

<div data-tone="inverse"><span bind:this={element}></span></div>
