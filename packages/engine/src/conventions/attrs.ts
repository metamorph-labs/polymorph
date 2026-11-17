import { gallerySlug } from './slug'

/**
 * The attribute contract (`design/components/README.md`, attribute contract).
 * Components expose state only as data attributes. CSS selects on them, tests
 * assert them, and there is no class-name API that could diverge.
 *
 * The helpers enforce two rules so components do not have to:
 *  - rest state is the *absence* of `data-state`, never `data-state="rest"`
 *  - present/absent attributes are `""` or gone, never `="false"`
 */

/** Radix-style state names, plus the ones the vocabulary adds. */
export type StateName =
  | 'open'
  | 'closed'
  | 'checked'
  | 'unchecked'
  | 'indeterminate'
  | 'on'
  | 'off'
  | 'loading'
  | 'visible'
  | 'hidden'
  /*
   * The vocabulary emits `dragging` itself. Radix's Slider publishes only
   * `data-orientation` and `data-disabled`, but a held thumb has its own recipe.
   * `at-max` is TagInput's full container. `idle`/`dragover` are FileUpload's
   * zone. It is the one place a rest state is named instead of absent, because
   * `file-upload.md` specifies both states and a fixture asserts
   * `data-state="idle"`.
   */
  | 'dragging'
  | 'at-max'
  | 'idle'
  | 'dragover'
  /*
   * The conversation tier's states. `streaming` marks a surface whose content
   * is still arriving (PromptInput while a reply generates, StreamingText while
   * its text grows). `detached` marks ChatThread when the reader has scrolled
   * up and the thread stops following new content. It is the only state in the
   * tier that the reader causes rather than the model.
   */
  | 'streaming'
  | 'detached'

export interface StateAttributeInput {
  variant?: string | undefined
  size?: string | undefined
  tone?: string | undefined
  /** Omit for rest. */
  state?: StateName | undefined
  disabled?: boolean | undefined
  invalid?: boolean | undefined
}

export type StateAttributes = Record<string, string | undefined>

/** `undefined` drops the attribute; React renders `''` as a bare attribute. */
function flag(present: boolean | undefined): '' | undefined {
  return present === true ? '' : undefined
}

/**
 * Spread onto a component root:
 * `<button {...dataAttrs({ variant, tone, size, state: loading ? 'loading' : undefined })}>`
 */
export function dataAttrs(input: StateAttributeInput): StateAttributes {
  return {
    'data-variant': input.variant,
    'data-size': input.size,
    'data-tone': input.tone,
    'data-state': input.state,
    'data-disabled': flag(input.disabled),
    'data-invalid': flag(input.invalid),
  }
}

/** For the one-off boolean attributes a single component owns (`data-icon-only`). */
export function dataFlag(name: string, present: boolean | undefined): StateAttributes {
  return { [`data-${name}`]: flag(present) }
}

/**
 * The member identity. Every component's root, and every portaled surface,
 * carries `data-member="<slug>"`, the gallery spelling of its name. The slug is
 * derived here so no component writes it by hand.
 *
 * `<button {...dataAttrs({…})} {...memberAttr('Button')}>`
 *
 * Its only reader is the theme emitter's exception blocks, which re-point a
 * class token for one named member inside one pairing. Recipes must not select
 * it (`polymorph/no-member-selectors`), because class tokens replace components
 * branching on their own name. A law checks coverage: every rendered fixture
 * must contain its member's attribute (`laws.test.tsx`).
 */
export function memberAttr(component: string): { 'data-member': string } {
  return { 'data-member': gallerySlug(component) }
}
