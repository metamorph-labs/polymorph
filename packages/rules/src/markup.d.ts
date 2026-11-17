/**
 * Types for `markup.js`. It is plain JS because the inventory imports it and
 * node runs the inventory directly.
 */

/** One attribute as written. `value` is `null` for a bare name, and `braced` is Svelte's `name={…}`. */
export interface MarkupAttribute {
  name: string
  value: string | null
  braced: boolean
}

/** A start tag or an end tag (`close`), with where it starts and ends in the text. */
export interface MarkupTag {
  name: string
  close: boolean
  selfClosing: boolean
  attributes: MarkupAttribute[]
  start: number
  end: number
}

export declare function markupTags(markup: string): MarkupTag[]

/** The name Vue resolves a template's tag by, against the names its script imports. */
export declare function vueTagName(raw: string, imports: ReadonlySet<string>): string

export declare function writtenAttribute(
  tag: MarkupTag,
  name: string,
  syntax: 'vue' | 'svelte' | 'angular',
): string | null
