<script lang="ts">
  /**
   * A FormPage titled "New ticket" with a "Create" submit Button and one Card
   * of FormFields, each around an Input, for `archetypes/form-page.test.ts`.
   * A field with an `error` is invalid.
   */
  import Button from '../controls/Button.svelte'
  import FormField from '../controls/FormField.svelte'
  import Input from '../controls/Input.svelte'
  import FormPage from '../archetypes/FormPage.svelte'
  import Card from '../structure/Card.svelte'

  let {
    onSubmit,
    fields,
  }: { onSubmit: () => void; fields: { label: string; error?: string }[] } = $props()
</script>

<FormPage title="New ticket" {onSubmit}>
  {#snippet actions()}<Button label="Create" type="submit" />{/snippet}
  <Card>
    {#each fields as field, at (at)}
      <FormField label={field.label} error={field.error}><Input /></FormField>
    {/each}
  </Card>
</FormPage>
