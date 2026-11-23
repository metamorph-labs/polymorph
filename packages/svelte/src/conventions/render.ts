import type { Snippet } from 'svelte'

/**
 * A node a caller passes inside a structured prop, as a description's
 * `render` draws it: a snippet (`EmptyStateProps.action`), or a snippet with
 * the arguments it is drawn with (a DataTable column's `cell`, bound to its
 * row). A description calls a function that returns a node (`column.cell(row)`)
 * where Svelte draws a snippet with arguments, so the renderer writes the call
 * as `bindSnippet(column.cell, row)`, and `Render` draws it.
 */
export interface BoundSnippet {
  readonly snippet: Snippet<never[]>
  readonly args: readonly unknown[]
}

export type RenderNode = Snippet | BoundSnippet

export function bindSnippet<Args extends unknown[]>(
  snippet: Snippet<Args>,
  ...args: Args
): BoundSnippet
/** A snippet a caller may not have passed: nothing to draw without one (a member's own render prop). */
export function bindSnippet<Args extends unknown[]>(
  snippet: Snippet<Args> | undefined,
  ...args: Args
): BoundSnippet | undefined
export function bindSnippet<Args extends unknown[]>(
  snippet: Snippet<Args> | undefined,
  ...args: Args
): BoundSnippet | undefined {
  return snippet === undefined
    ? undefined
    : { snippet: snippet as unknown as Snippet<never[]>, args }
}

export function isBound(node: unknown): node is BoundSnippet {
  return node !== null && typeof node === 'object' && 'snippet' in node && 'args' in node
}
