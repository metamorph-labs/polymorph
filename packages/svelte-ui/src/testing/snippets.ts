import { createRawSnippet, type Snippet } from 'svelte'

/**
 * Static markup as a snippet, for a test that fills a member's slot with plain
 * elements (`html('<p>thread</p>')`). The markup is one element, as a raw
 * snippet requires.
 */
export function html(markup: string): Snippet {
  return createRawSnippet(() => ({ render: () => markup }))
}
