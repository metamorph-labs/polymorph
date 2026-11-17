<script lang="ts">
  /**
   * A component that follows the toast store, for `overlays/toast-store.test.ts`:
   * one list item per record, holding the record's title.
   */
  import { useToasts } from '@polymorph/svelte'

  const records = useToasts()
</script>

<ol>{#each records.current as record (record.id)}<li>{record.title}</li>{/each}</ol>
