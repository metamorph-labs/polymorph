<script lang="ts">
  /**
   * A MultiSelect as the control of a FormField, for
   * `controls/multi-select-list.test.ts`: `label` and `required` are the
   * FormField's, and `field` is the MultiSelect's props.
   */
  import FormField from '../controls/FormField.svelte'
  import MultiSelect, { type MultiSelectProps } from '../controls/MultiSelect.svelte'

  let { label, required, field }: { label: string; required: boolean; field: MultiSelectProps } =
    $props()
</script>

<FormField {label} {required}><MultiSelect {...field} /></FormField>
