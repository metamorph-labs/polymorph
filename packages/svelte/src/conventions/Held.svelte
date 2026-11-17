<script lang="ts" generics="Values extends Record<string, unknown>">
  /**
   * A states fixture entry that holds values, as the application component
   * around a controlled member holds them: the entry's snippet reads them and
   * sets them through `held` (Command's `open` belongs to its launcher). With
   * `types`, it types into a field once the field is in the document, through
   * the field's `input` event, as a reader types (Command's query). With
   * `presses`, it presses a control once the control is in the document, as a
   * reader presses it (CursorPagination's "Load more").
   */
  import { onMount, type Snippet } from 'svelte'

  interface Props {
    initial: Values
    types?: { into: string; text: string; frames: number }
    presses?: { at: string; frames: number }
    children: Snippet<[Values]>
  }

  let { initial, types, presses, children }: Props = $props()

  // svelte-ignore state_referenced_locally
  const values = $state<Record<string, unknown>>({ ...initial })

  /** Each held value as a property that reads and sets it here, where the state is. */
  const held = {} as Values
  // svelte-ignore state_referenced_locally
  for (const name of Object.keys(initial)) {
    Object.defineProperty(held, name, {
      enumerable: true,
      get: () => values[name],
      set: (value: unknown) => {
        values[name] = value
      },
    })
  }

  // The frame is cancelled in the mount's cleanup: a server render runs `onDestroy`, and has no
  // `cancelAnimationFrame`.
  onMount(() => {
    const typing = types
    if (typing === undefined) return
    let frame = 0
    let frames = 0
    const type = () => {
      const field = document.querySelector<HTMLInputElement>(typing.into)
      if (field === null) {
        frames += 1
        if (frames < typing.frames) frame = requestAnimationFrame(type)
        return
      }
      field.value = typing.text
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    frame = requestAnimationFrame(type)
    return () => cancelAnimationFrame(frame)
  })

  onMount(() => {
    const pressing = presses
    if (pressing === undefined) return
    let frame = 0
    let frames = 0
    const press = () => {
      const control = document.querySelector<HTMLElement>(pressing.at)
      // A control that is not drawn is one a reader cannot press.
      if (control === null || control.getClientRects().length === 0) {
        frames += 1
        if (frames < pressing.frames) frame = requestAnimationFrame(press)
        return
      }
      control.click()
    }
    frame = requestAnimationFrame(press)
    return () => cancelAnimationFrame(frame)
  })
</script>

{@render children(held)}
