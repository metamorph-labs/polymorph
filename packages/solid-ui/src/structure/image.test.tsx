import { describe, expect, it, vi } from 'vitest'

import { mount } from '../mount'
import Image from './Image'

/**
 * Image's two outcomes in the Solid shell, each from the picture's own event:
 * `load` ends the loading state, and `error` replaces the element with the
 * fallback. The contract reaches the failed state through an empty `src`,
 * which fires no event, so the handlers are held here. Each picture is a data
 * URI the browser has not decoded before, because a decoded one is complete
 * at once.
 */

let pictures = 0

function picture(): string {
  pictures += 1
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" id="solid-${pictures}"/>`,
    )
  )
}

function broken(): string {
  pictures += 1
  return `data:image/png;base64,${btoa(`not a picture ${pictures}`)}`
}

const frameIn = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-member="image"]')!

describe('Image', () => {
  it('leaves the loading state when the picture loads', async () => {
    // Made once: a Solid prop is read each time it is used, and each read here would be a new picture.
    const src = picture()
    const { host } = await mount(() => <Image src={src} alt="A harbour" width={320} height={200} />)
    const frame = frameIn(host)
    await vi.waitFor(() => expect(frame.hasAttribute('data-state')).toBe(false))
    expect(frame.children.length).toBe(1)
    expect(frame.querySelector('img')?.getAttribute('alt')).toBe('A harbour')
  })

  it('replaces the element with the named fallback when the picture fails', async () => {
    const src = broken()
    const { host } = await mount(() => <Image src={src} alt="A harbour" width={320} height={200} />)
    const frame = frameIn(host)
    await vi.waitFor(() => expect(frame.getAttribute('data-state')).toBe('failed'))
    expect(frame.querySelector('img')).toBeNull()
    const fallback = frame.querySelector('[data-image-part="fallback"]')
    expect(fallback?.getAttribute('role')).toBe('img')
    expect(fallback?.getAttribute('aria-label')).toBe('A harbour')
  })
})
