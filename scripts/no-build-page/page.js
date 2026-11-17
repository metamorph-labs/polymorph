/**
 * The page's own module script: what a page with no build imports from
 * `polymorph.js`, and a morphing swap as htmx's idiomorph and Turbo's morph
 * make one, for the static-page check (`scripts/gate-no-build.mjs`).
 */
import { loadAgentBridge, restore, toast } from '/polymorph/polymorph.js'

const { document } = globalThis

/**
 * Morphs `element` into the markup `html` names: the element stays, an
 * attribute the markup does not name is removed, every other is set, and the
 * children become the markup's when they differ.
 */
function morph(element, html) {
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  const next = template.content.firstElementChild
  for (const { name } of [...element.attributes]) {
    if (!next.hasAttribute(name)) element.removeAttribute(name)
  }
  for (const { name, value } of [...next.attributes]) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value)
  }
  if (element.innerHTML !== next.innerHTML) element.replaceChildren(...next.childNodes)
}

globalThis.polymorphPage = { restore, toast, loadAgentBridge, morph }
