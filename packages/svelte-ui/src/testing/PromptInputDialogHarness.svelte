<script lang="ts">
  /**
   * A PromptInput with triggers inside an open Dialog titled "Compose", which
   * stays open until it reports `false`, for `ai/prompt-input.test.ts`.
   */
  import Dialog from '../overlays/Dialog.svelte'
  import PromptInput, { type PromptTrigger } from '../ai/PromptInput.svelte'

  let {
    triggers,
    onOpenChange,
  }: { triggers: PromptTrigger[]; onOpenChange: (open: boolean) => void } = $props()

  let open = $state(true)
</script>

<Dialog
  title="Compose"
  {open}
  onOpenChange={(next: boolean) => {
    onOpenChange(next)
    open = next
  }}
>
  <PromptInput label="Message" {triggers} onSubmit={() => {}} />
</Dialog>
