import { beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import { naming, shapes, type Shape } from './law'

/** The parity law's reading of a document finds what it is there to find (`law.ts`). */

beforeAll(installTestTheme)

describe('the parity law detects a difference', () => {
  it('reads a host as its children, and an id by where it first appears', () => {
    const solid = document.createElement('div')
    solid.innerHTML = '<label for="cl-7">A</label><input id="cl-7">'
    const element = document.createElement('div')
    element.innerHTML = '<label for="cl-9">A</label><input id="cl-9">'
    expect(shapes(element.childNodes, naming())).toEqual(shapes(solid.childNodes, naming()))
    element.innerHTML = '<label for="cl-9">A</label><input id="cl-10">'
    expect(shapes(element.childNodes, naming())).not.toEqual(shapes(solid.childNodes, naming()))
  })

  it('finds a class the element form loses', async () => {
    const mounted = await mount({
      name: 'probe',
      html: '<poly-badge tone="accent">New</poly-badge>',
    })
    const read = shapes(mounted.host.childNodes, naming())
    const badge = read[0] as Exclude<Shape, string>
    expect(badge.tag).toBe('span')
    expect({ ...badge, attributes: { ...badge.attributes, class: '' } }).not.toEqual(badge)
  })
})
