<script lang="ts">
  /**
   * A DataTable in a box `width` wide, for `structure/data-table.test.ts`.
   * Every other prop is passed to the DataTable.
   */
  import DataTable, { type DataTableProps } from '../structure/DataTable.svelte'

  let { width, ...table }: DataTableProps<unknown> & { width: string } = $props()
</script>

<div style:inline-size={width}><DataTable {...table} /></div>
