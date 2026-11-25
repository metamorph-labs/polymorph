import { afterEach, describe, expect, it, vi } from 'vitest'

import { readDirection, watchDirection } from './direction'

/**
 * The reading direction of a member's place, or of the document, as every
 * foundation reads it before it hands it to a substrate.
 */

afterEach(() => {
  document.documentElement.removeAttribute('dir')
  document.body.removeAttribute('dir')
})

describe('readDirection reads what the document says', () => {
  it('is left-to-right in a document that says nothing', () => {
    expect(readDirection()).toBe('ltr')
  })

  it('reads `dir` on the root element', () => {
    document.documentElement.setAttribute('dir', 'rtl')
    expect(readDirection()).toBe('rtl')
  })

  it('reads `dir` on the body before the root element', () => {
    document.documentElement.setAttribute('dir', 'rtl')
    document.body.setAttribute('dir', 'ltr')
    expect(readDirection()).toBe('ltr')
    document.documentElement.setAttribute('dir', 'ltr')
    document.body.setAttribute('dir', 'RTL')
    expect(readDirection()).toBe('rtl')
  })

  it('takes `auto` from what the browser resolved', () => {
    document.documentElement.setAttribute('dir', 'auto')
    expect(readDirection()).toBe(getComputedStyle(document.documentElement).direction)
  })

  it('ignores a direction that only an element inside the document says', () => {
    const inner = document.createElement('div')
    inner.dir = 'rtl'
    document.body.append(inner)
    try {
      expect(readDirection()).toBe('ltr')
    } finally {
      inner.remove()
    }
  })
})

describe('readDirection reads the place an element is in', () => {
  function section(dir: string) {
    const outer = document.createElement('section')
    outer.setAttribute('dir', dir)
    const inner = document.createElement('div')
    outer.append(inner)
    document.body.append(outer)
    return { outer, inner }
  }

  it('reads the nearest `dir` around the element', () => {
    const { outer, inner } = section('rtl')
    try {
      expect(readDirection(inner)).toBe('rtl')
      expect(readDirection()).toBe('ltr')
    } finally {
      outer.remove()
    }
  })

  it('passes over the `dir` a Zag machine wrote on its part', () => {
    const { outer, inner } = section('rtl')
    inner.setAttribute('dir', 'ltr')
    inner.setAttribute('data-scope', 'tabs')
    const control = document.createElement('button')
    inner.append(control)
    try {
      expect(readDirection(control)).toBe('rtl')
    } finally {
      outer.remove()
    }
  })

  it("takes a popup's content as the direction of the member that opened it", () => {
    const content = document.createElement('div')
    content.setAttribute('dir', 'rtl')
    content.setAttribute('data-scope', 'menu')
    content.setAttribute('data-part', 'content')
    const row = document.createElement('div')
    row.setAttribute('dir', 'ltr')
    row.setAttribute('data-scope', 'menu')
    row.setAttribute('data-part', 'trigger')
    content.append(row)
    document.body.append(content)
    try {
      expect(readDirection(row)).toBe('rtl')
    } finally {
      content.remove()
    }
  })

  it("reads around a place that is a machine's content part, whose `dir` is the member's own", () => {
    // Calendar's root is its machine's content part. The `dir` on it is the one the member handed
    // its machine, so reading it back would keep the member in the direction it started in.
    const { outer, inner } = section('rtl')
    inner.setAttribute('dir', 'ltr')
    inner.setAttribute('data-scope', 'date-picker')
    inner.setAttribute('data-part', 'content')
    try {
      expect(readDirection(inner)).toBe('rtl')
    } finally {
      outer.remove()
    }
  })

  it('reads the document for an element out of it', () => {
    document.documentElement.setAttribute('dir', 'rtl')
    expect(readDirection(document.createElement('div'))).toBe('rtl')
  })

  it('is left-to-right where nothing around the element says a direction', () => {
    const inner = document.createElement('div')
    document.body.append(inner)
    try {
      expect(readDirection(inner)).toBe('ltr')
    } finally {
      inner.remove()
    }
  })
})

describe('watchDirection follows a section', () => {
  it('calls a listener for sections when `dir` changes on any element, and the others only for the document', async () => {
    const forSections = vi.fn()
    const forDocument = vi.fn()
    const releaseSections = watchDirection(forSections, true)
    const releaseDocument = watchDirection(forDocument)
    const outer = document.createElement('section')
    document.body.append(outer)
    try {
      outer.setAttribute('dir', 'rtl')
      await vi.waitFor(() => expect(forSections).toHaveBeenCalledTimes(1))
      expect(forDocument).not.toHaveBeenCalled()
      document.documentElement.setAttribute('dir', 'rtl')
      await vi.waitFor(() => expect(forSections).toHaveBeenCalledTimes(2))
      expect(forDocument).toHaveBeenCalledTimes(1)
    } finally {
      outer.remove()
      releaseSections()
      releaseDocument()
    }
  })
})

describe('watchDirection follows the document', () => {
  it('calls every listener when `dir` changes on the root element or the body', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const releaseFirst = watchDirection(first)
    const releaseSecond = watchDirection(second)
    try {
      document.documentElement.setAttribute('dir', 'rtl')
      await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1))
      expect(second).toHaveBeenCalledTimes(1)
      expect(readDirection()).toBe('rtl')
      document.body.setAttribute('dir', 'ltr')
      await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(2))
      expect(second).toHaveBeenCalledTimes(2)
    } finally {
      releaseFirst()
      releaseSecond()
    }
  })

  it('stops calling a listener once it is released, and keeps calling the others', async () => {
    const released = vi.fn()
    const kept = vi.fn()
    const release = watchDirection(released)
    const releaseKept = watchDirection(kept)
    release()
    try {
      document.documentElement.setAttribute('dir', 'rtl')
      await vi.waitFor(() => expect(kept).toHaveBeenCalledTimes(1))
      expect(released).not.toHaveBeenCalled()
    } finally {
      releaseKept()
    }
  })

  it('watches again after its last listener was released', async () => {
    watchDirection(() => {})()
    const listener = vi.fn()
    const release = watchDirection(listener)
    try {
      document.documentElement.setAttribute('dir', 'rtl')
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    } finally {
      release()
    }
  })
})
