<script lang="ts">
  /**
   * A control as the one child of a FormField, for the list-name laws
   * (`controls/multi-select-list.test.ts`, `controls/select-list.test.ts`):
   * `label` and `required` are the FormField's, `control` is the member and
   * `field` its props.
   */
  import type { Component } from 'svelte'

  import FormField from '../controls/FormField.svelte'

  let {
    label,
    required,
    control: Control,
    field,
  }: {
    label: string
    required: boolean
    control: Component<Record<string, unknown>>
    field: Record<string, unknown>
  } = $props()
</script>

<FormField {label} {required}><Control {...field} /></FormField>
