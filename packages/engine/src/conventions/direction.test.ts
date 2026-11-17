import { afterEach, describe, expect, it, vi } from 'vitest'

import { readDirection, watchDirection } from './direction'

/**
 * The document's reading direction, as every foundation reads it before it
 * hands it to a substrate.
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
