<script lang="ts">
  /**
   * LineCharts side by side in one element, for a test of a sync group: each
   * entry of `charts` is one chart's props.
   */
  import LineChart, { type LineChartProps } from '../charts/LineChart.svelte'

  let { charts }: { charts: LineChartProps[] } = $props()
</script>

<div>
  {#each charts as chart (chart.label)}
    <LineChart {...chart} />
  {/each}
</div>
