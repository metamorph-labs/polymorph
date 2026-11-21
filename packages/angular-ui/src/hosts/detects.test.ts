import { afterEach, describe, expect, it } from 'vitest'

import { boxes, unwrapped } from '../conformance/hosts'

/** The host law's reading of a mount finds what it is there to find (`src/conformance/hosts.ts`). */

const added: Element[] = []

afterEach(() => {
  for (const element of added.splice(0)) element.remove()
})

function place(html: string): HTMLElement {
  const element = document.createElement('div')
  element.style.width = '1000px'
  element.innerHTML = html
  document.body.append(element)
  added.push(element)
  return element
}

describe('the host law detects a host that changes a box', () => {
  it('finds a child rule that a host stops from reaching the member', () => {
    const sheet = place(
      '<style>.probe-grid { display: grid; grid-template-columns: repeat(12, 1fr) } .probe-grid > * { grid-column: span 6 }</style>',
    )
    expect(sheet).toBeDefined()
    const mount = place(
      '<div class="probe-grid"><pm-probe style="display: contents"><div data-member="cell">a</div></pm-probe></div>',
    )
    const copy = place('')
    copy.append(...unwrapped(mount.childNodes))

    expect(copy.querySelector('pm-probe')).toBeNull()
    expect(boxes([mount])).not.toEqual(boxes([copy]))
  })

  it('keeps a host that draws a box', () => {
    const mount = place('<pm-probe><div data-member="cell">a</div></pm-probe>')
    expect(unwrapped(mount.childNodes)[0]).toBeInstanceOf(HTMLElement)
    expect((unwrapped(mount.childNodes)[0] as Element).localName).toBe('pm-probe')
  })
})
