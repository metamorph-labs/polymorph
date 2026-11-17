<script lang="ts">
  /**
   * A DataTable whose empty state's secondary action is a ghost Button
   * labelled "Clear filters" that calls `onClear`, for
   * `structure/data-table.test.ts`. The Button is written here because an
   * empty state's action is a snippet with no arguments, so it cannot take
   * `onClear` from the test. Every other prop is passed to the DataTable.
   */
  import Button from '../controls/Button.svelte'
  import DataTable, { type DataTableProps } from '../structure/DataTable.svelte'

  let {
    onClear,
    emptyState,
    ...table
  }: DataTableProps<unknown> & { onClear: () => void } = $props()
</script>

{#snippet clearFilters()}<Button variant="ghost" label="Clear filters" onClick={onClear} />{/snippet}

<DataTable {...table} emptyState={{ ...emptyState, secondaryAction: clearFilters }} />
