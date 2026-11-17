<script lang="ts">
  /**
   * A MultiSelect followed by a plain button labelled "Elsewhere", for
   * `controls/multi-select.test.ts`, which moves focus out of the member.
   * Every prop is passed to the MultiSelect.
   */
  import MultiSelect, { type MultiSelectProps } from '../controls/MultiSelect.svelte'

  let props: MultiSelectProps = $props()
</script>

<div>
  <MultiSelect {...props} />
  <button type="button">Elsewhere</button>
</div>
