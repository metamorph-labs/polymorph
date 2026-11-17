<script lang="ts">
  /**
   * A SplitPane in a 400px by 400px box, with one paragraph in each pane, for
   * `layout/split-pane.test.ts`. Every prop is passed to the SplitPane.
   */
  import SplitPane, { type SplitPaneProps } from '../layout/SplitPane.svelte'

  let props: Omit<SplitPaneProps, 'start' | 'end'> = $props()
</script>

<div style:inline-size="400px" style:block-size="400px">
  <SplitPane {...props}>
    {#snippet start()}<p>navigator</p>{/snippet}
    {#snippet end()}<p>canvas</p>{/snippet}
  </SplitPane>
</div>
