import { getRoles, queryAllByRole } from '@testing-library/dom'
import { page, userEvent } from 'vitest/browser'
import { vi } from 'vitest'

import type { Harness } from './run'

/**
 * The harness every shell's conformance law hands the runner: a real keyboard
 * and pointer from Vitest's browser mode, and DOM Testing Library's reading of
 * roles and accessible names. One harness for every shell, so two shells are
 * never judged by two readings of the same DOM.
 */

/** The role DOM Testing Library computes: the explicit one, else the element's native role. */
export function roleOf(element: Element): string | null {
  const explicit = element.getAttribute('role')
  if (explicit !== null) return explicit.split(' ')[0] ?? null
  // A shallow clone keeps the tag and the attributes the native role reads,
  // and costs one element instead of the subtree.
  const roles = (getRoles as unknown as (node: Element, options: { hidden: boolean }) => object)(
    element.cloneNode(false) as Element,
    { hidden: true },
  )
  return Object.keys(roles)[0] ?? null
}

export const harness: Harness = {
  keyboard: (keys) => userEvent.keyboard(keys),
  click: (element) => userEvent.click(element),
  // Forced, because a modal's scrim may cover the corner the runner rests in.
  hover: (element) => userEvent.hover(element, { force: true }),
  roleOf,
  nameOf(element) {
    const role = roleOf(element)
    const container = element.parentElement
    if (role === null || container === null) return ''
    let name = ''
    queryAllByRole(container as HTMLElement, role, {
      hidden: true,
      name: (computed, node) => {
        if (node === element) name = computed
        return false
      },
    })
    return name
  },
  waitFor: (check, timeout) => vi.waitFor(check, { timeout, interval: 25 }),
  viewport: (width, height) => page.viewport(width, height),
}
