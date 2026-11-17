<script lang="ts">
  /**
   * A component that draws the document's colour mode, for
   * `conventions/mode.test.ts`.
   */
  import { useMode } from '@polymorph/svelte'

  const reading = useMode()
</script>

<output data-preference={reading.current.preference} data-applied={reading.current.mode}></output>
