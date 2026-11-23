import { mount, unmount, type Snippet } from 'svelte'

import Render from './Render.svelte'
import { bindSnippet } from './render'
import { serverRender } from './server'

/**
 * Whether a snippet draws anything for its argument: an element, or text that
 * is not empty. A React render prop that returns `undefined` draws nothing,
 * and the member draws its own content in its place (RichTextContent's entity
 * token where the app's `entity` draws nothing for a kind). A snippet cannot
 * be read without drawing it, so it is drawn into an element outside the
 * document and removed; its effects are not run. A server render under Vite
 * draws it into a string of its own (`server.ts`), so the server's answer is
 * the browser's. A server render under another bundler does not probe, and
 * reads the snippet as drawing nothing, as it reads every slot as empty.
 */
export function slotDraws<Arg>(snippet: Snippet<[Arg]> | undefined, arg: Arg): boolean {
  if (snippet === undefined) return false
  const node = bindSnippet(snippet, arg)
  if (serverRender !== undefined) {
    const html = serverRender(Render, { props: { node } }).body
    return html.replace(/<!--[\s\S]*?-->/g, '') !== ''
  }
  if (typeof document === 'undefined') return false
  const target = document.createElement('div')
  const probe = mount(Render, { target, props: { node } })
  const draws = Array.from(target.childNodes).some(
    (child) =>
      child.nodeType === Node.ELEMENT_NODE ||
      (child.nodeType === Node.TEXT_NODE && (child as Text).data !== ''),
  )
  void unmount(probe)
  return draws
}
