<script lang="ts">
  /**
   * TagInputs in one form, for `controls/tag-input.test.ts`: each entry of
   * `fields` is one TagInput's props.
   */
  import TagInput, { type TagInputProps } from '../controls/TagInput.svelte'

  let { fields }: { fields: TagInputProps[] } = $props()
</script>

<form>
  {#each fields as field, at (at)}
    <TagInput {...field} />
  {/each}
</form>
