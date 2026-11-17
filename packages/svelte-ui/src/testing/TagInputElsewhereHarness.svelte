<script lang="ts">
  /**
   * A TagInput followed by a plain button labelled "Elsewhere", for
   * `controls/tag-input.test.ts`, which moves focus out of the member. Every
   * prop is passed to the TagInput.
   */
  import TagInput, { type TagInputProps } from '../controls/TagInput.svelte'

  let props: TagInputProps = $props()
</script>

<div>
  <TagInput {...props} />
  <button type="button">Elsewhere</button>
</div>
