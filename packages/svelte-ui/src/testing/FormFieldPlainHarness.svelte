<script lang="ts">
  /**
   * A FormField labelled "Subject" around a plain `<input>`, for
   * `conventions/slotted.test.ts`. `description`, `required` and `id` are
   * passed to the FormField, and `disabled` to the input, which has an id of
   * its own.
   */
  import FormField from '../controls/FormField.svelte'

  let {
    description,
    required = false,
    disabled = false,
    id,
  }: { description?: string; required?: boolean; disabled?: boolean; id?: string } = $props()
</script>

<FormField label="Subject" {description} {required} {id}><input {disabled} id="own" /></FormField>
