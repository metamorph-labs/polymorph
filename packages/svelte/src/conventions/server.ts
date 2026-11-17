import { render } from 'svelte/server'

/**
 * Svelte's server renderer in a server render under Vite, and `undefined`
 * everywhere else.
 *
 * A server render runs once, from the top down, so a member that reads its
 * slot before it renders the slot (FormField lays out its label by its
 * control's kind) renders the slot first into a string of its own with this
 * renderer, and reads what joined it (`slotted.svelte.ts`). Vite replaces
 * `import.meta.env.SSR` with a constant, so a client build drops the branch
 * and the renderer with it. Under another bundler the value is `undefined`,
 * and such a member renders as it does before its slot has been read.
 */
export const serverRender: typeof render | undefined =
  (import.meta as { env?: { SSR?: boolean } }).env?.SSR === true ? render : undefined

/** The text an HTML string holds, as `textContent` reads it once the string is parsed. */
export function htmlText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos|nbsp);/gi, (_, name: string) => {
      const lower = name.toLowerCase()
      if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16))
      if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10))
      return ENTITIES[lower] ?? `&${name};`
    })
}

const ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}
