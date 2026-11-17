<script lang="ts">
  /**
   * MultiSelects in one form, for `controls/multi-select.test.ts`: each entry
   * of `fields` is one MultiSelect's props.
   */
  import MultiSelect, { type MultiSelectProps } from '../controls/MultiSelect.svelte'

  let { fields }: { fields: MultiSelectProps[] } = $props()
</script>

<form>
  {#each fields as field, at (at)}
    <MultiSelect {...field} />
  {/each}
</form>
