import { render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { Image, type ImageProps } from './Image'

/**
 * Checks that need a browser: the picture's own `load` and `error` events, the
 * box the frame holds before either, and what assistive technology is told in
 * each state. Every picture is a data URI, so no test waits on the network.
 */

beforeAll(installTestTheme)

/**
 * A 320 by 200 picture that carries its own size, as a `src` no test has
 * requested before. The browser keeps a decoded picture, and a kept one is
 * complete as soon as its element exists, so a test that reads the loading
 * state needs a picture the browser has not seen.
 */
let pictures = 0
function picture(): string {
  pictures += 1
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200" id="picture-${pictures}">` +
        '<rect width="320" height="200" fill="#2f4a6b"/></svg>',
    )
  )
}

/** Bytes that are not a picture, so the element fires `error`. A new `src` each call, as above. */
function broken(): string {
  pictures += 1
  return `data:image/png;base64,${btoa(`not a picture ${pictures}`)}`
}

const hosts: HTMLElement[] = []

/** A container of a known width, because the frame is bounded by its container. */
function hostOf(width: number): HTMLElement {
  const host = document.createElement('div')
  host.style.width = `${width}px`
  document.body.append(host)
  hosts.push(host)
  return host
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove()
})

const frameIn = (container: Element) =>
  container.querySelector<HTMLElement>('[data-member="image"]')!

/** Resolves once the frame has left the loading state for the rest state. */
const loaded = (frame: HTMLElement) =>
  vi.waitFor(() => expect(frame.hasAttribute('data-state')).toBe(false))

const failed = (frame: HTMLElement) =>
  vi.waitFor(() => expect(frame.getAttribute('data-state')).toBe('failed'))

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ImageProps>(true)
  })
})

describe('loading', () => {
  it('holds the box before the picture arrives and keeps it after', async () => {
    const { container } = render(
      <Image src={picture()} alt="A harbour" width={320} height={200} />,
      {
        container: hostOf(600),
      },
    )
    const frame = frameIn(container)

    expect(frame.getAttribute('data-state')).toBe('loading')
    expect(frame.querySelector('[aria-hidden="true"]')).not.toBeNull()
    const before = frame.getBoundingClientRect()
    expect(before.width).toBeCloseTo(320, 0)
    expect(before.height).toBeCloseTo(200, 0)

    await loaded(frame)

    const after = frame.getBoundingClientRect()
    expect(after.width).toBeCloseTo(before.width, 0)
    expect(after.height).toBeCloseTo(before.height, 0)
    // The placeholder leaves with the state, so nothing is painted behind a
    // picture with transparent parts.
    expect(frame.children.length).toBe(1)
    expect(frame.firstElementChild?.tagName).toBe('IMG')
  })

  it('is never wider than its container, and keeps its ratio there', async () => {
    const { container } = render(
      <Image src={picture()} alt="A harbour" width={320} height={200} />,
      {
        container: hostOf(160),
      },
    )
    const box = frameIn(container).getBoundingClientRect()
    expect(box.width).toBeCloseTo(160, 0)
    expect(box.height).toBeCloseTo(100, 0)
  })

  it('keeps its size in a row, beside text that would squeeze a box with no minimum', () => {
    const host = hostOf(240)
    host.style.display = 'flex'
    render(
      <>
        <Image src={picture()} alt="Relay" width={32} height={32} />
        <span>{'a sentence long enough to fill the row several times over '.repeat(8)}</span>
      </>,
      { container: host },
    )
    expect(frameIn(host).getBoundingClientRect().width).toBe(32)
  })

  it('ignores an `aspectRatio` that is not a finite number', () => {
    const { container } = render(<Image src={picture()} alt="A harbour" aspectRatio={1 / 0} />)
    expect(frameIn(container).hasAttribute('data-sized')).toBe(false)
  })

  it('takes its container’s width at `aspectRatio` alone', () => {
    const { container } = render(<Image src={picture()} alt="A harbour" aspectRatio={1.5} />, {
      container: hostOf(300),
    })
    const box = frameIn(container).getBoundingClientRect()
    expect(box.width).toBeCloseTo(300, 0)
    expect(box.height).toBeCloseTo(200, 0)
  })

  it('takes `aspectRatio` over the ratio of `width` and `height`', () => {
    const { container } = render(
      <Image src={picture()} alt="A harbour" width={240} height={150} aspectRatio={1} />,
      { container: hostOf(600) },
    )
    const box = frameIn(container).getBoundingClientRect()
    expect(box.width).toBeCloseTo(240, 0)
    expect(box.height).toBeCloseTo(240, 0)
  })

  it('contains the picture by default and covers the frame when asked', () => {
    const contained = render(<Image src={picture()} alt="A harbour" aspectRatio={1} />, {
      container: hostOf(200),
    })
    expect(getComputedStyle(contained.container.querySelector('img')!).objectFit).toBe('contain')

    const covering = render(<Image src={picture()} alt="A harbour" aspectRatio={1} fit="cover" />, {
      container: hostOf(200),
    })
    expect(getComputedStyle(covering.container.querySelector('img')!).objectFit).toBe('cover')
  })

  it('with no size given, reserves nothing and then draws the natural size', async () => {
    const { container } = render(<Image src={picture()} alt="A harbour" />, {
      container: hostOf(600),
    })
    const frame = frameIn(container)
    expect(frame.hasAttribute('data-sized')).toBe(false)
    expect(frame.getBoundingClientRect().height).toBe(0)

    await loaded(frame)
    const box = frame.getBoundingClientRect()
    expect(box.width).toBeCloseTo(320, 0)
    expect(box.height).toBeCloseTo(200, 0)
  })

  it('with no size given, a picture wider than its container shrinks to it', async () => {
    const { container } = render(<Image src={picture()} alt="A harbour" />, {
      container: hostOf(160),
    })
    const frame = frameIn(container)
    await loaded(frame)
    const box = frame.getBoundingClientRect()
    expect(box.width).toBeCloseTo(160, 0)
    expect(box.height).toBeCloseTo(100, 0)
  })

  it('warns in development when `width` comes without `height`', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<Image src={picture()} alt="A harbour" width={320} />)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('`width` and `height`'))
    expect(frameIn(container).hasAttribute('data-sized')).toBe(false)
    warn.mockRestore()
  })
})

describe('failed', () => {
  it('replaces the element with a fallback of the same box, named by `alt`', async () => {
    const { container } = render(
      <Image src={broken()} alt="Sales by region" width={320} height={200} />,
      { container: hostOf(600) },
    )
    const frame = frameIn(container)
    expect(frame.getAttribute('data-state')).toBe('loading')

    await failed(frame)

    // No element is left for the browser to draw its broken-image glyph in.
    expect(frame.querySelector('img')).toBeNull()
    const fallback = screen.getByRole('img', { name: 'Sales by region' })
    expect(fallback.tagName).toBe('SPAN')
    expect(fallback.querySelector('[data-icon="error"]')).not.toBeNull()
    const box = frame.getBoundingClientRect()
    expect(box.width).toBeCloseTo(320, 0)
    expect(box.height).toBeCloseTo(200, 0)
    const filled = fallback.getBoundingClientRect()
    expect(filled.width).toBeCloseTo(box.width, 0)
    expect(filled.height).toBeCloseTo(box.height, 0)
  })

  it('keeps a decorative picture hidden when it fails', async () => {
    const { container } = render(<Image src={broken()} alt="" width={320} height={200} />)
    const frame = frameIn(container)
    await failed(frame)
    expect(screen.queryByRole('img')).toBeNull()
    expect(frame.querySelector('[data-image-part="fallback"]')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
  })

  it('is failed from the first render for an empty `src`, with nothing requested', () => {
    const { container } = render(<Image src="" alt="A harbour" width={320} height={200} />)
    const frame = frameIn(container)
    expect(frame.getAttribute('data-state')).toBe('failed')
    expect(frame.querySelector('img')).toBeNull()
  })

  it('gives an unsized fallback a size of its own, from the space scale', async () => {
    const { container } = render(<Image src={broken()} alt="A harbour" />, {
      container: hostOf(600),
    })
    const frame = frameIn(container)
    await failed(frame)
    const space8 = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--pm-space-8'),
    )
    const box = frame.getBoundingClientRect()
    expect(box.width).toBeCloseTo(space8, 0)
    expect(box.height).toBeCloseTo(space8, 0)
  })

  it('requests a new `src` after a failure and draws it', async () => {
    const { container, rerender } = render(
      <Image src={broken()} alt="A harbour" width={320} height={200} />,
    )
    const frame = frameIn(container)
    await failed(frame)

    rerender(<Image src={picture()} alt="A harbour" width={320} height={200} />)
    expect(frame.getAttribute('data-state')).toBe('loading')
    await loaded(frame)
    expect(screen.getByRole('img', { name: 'A harbour' }).tagName).toBe('IMG')
  })

  it('asks again for a URL that failed, once the `src` has been somewhere else', async () => {
    const first = broken()
    const { container, rerender } = render(
      <Image src={first} alt="A harbour" width={320} height={200} />,
    )
    const frame = frameIn(container)
    await failed(frame)

    rerender(<Image src={picture()} alt="A harbour" width={320} height={200} />)
    await loaded(frame)

    // The failure is not kept, so the element is back and the URL is requested again.
    rerender(<Image src={first} alt="A harbour" width={320} height={200} />)
    expect(frame.getAttribute('data-state')).toBe('loading')
    expect(frame.querySelector('img')).not.toBeNull()
    await failed(frame)
  })

  it('is failed at once for an empty `src` that follows another failure', async () => {
    const { container, rerender } = render(
      <Image src={broken()} alt="A harbour" width={320} height={200} />,
    )
    const frame = frameIn(container)
    await failed(frame)

    rerender(<Image src="" alt="A harbour" width={320} height={200} />)
    expect(frame.getAttribute('data-state')).toBe('failed')
    expect(frame.querySelector('img')).toBeNull()
  })

  it('returns to loading when a loaded picture’s `src` changes', async () => {
    const { container, rerender } = render(
      <Image src={picture()} alt="A harbour" width={320} height={200} />,
    )
    const frame = frameIn(container)
    await loaded(frame)

    rerender(<Image src={picture()} alt="A harbour" width={320} height={200} />)
    expect(frame.getAttribute('data-state')).toBe('loading')
    await loaded(frame)
  })

  it('asks again when the set changes after a failure, with the `src` unchanged', async () => {
    // The set's one file is what the element requests, so the `src` is never asked for.
    const src = picture()
    const { container, rerender } = render(
      <Image src={src} srcSet={`${broken()} 1x`} alt="A harbour" width={320} height={200} />,
    )
    const frame = frameIn(container)
    await failed(frame)

    rerender(
      <Image src={src} srcSet={`${picture()} 1x`} alt="A harbour" width={320} height={200} />,
    )
    expect(frame.getAttribute('data-state')).toBe('loading')
    await loaded(frame)
    expect(screen.getByRole('img', { name: 'A harbour' }).tagName).toBe('IMG')
  })

  it('returns to loading when a loaded picture’s set changes', async () => {
    const src = picture()
    const { container, rerender } = render(
      <Image src={src} srcSet={`${picture()} 1x`} alt="A harbour" width={320} height={200} />,
    )
    const frame = frameIn(container)
    await loaded(frame)

    rerender(
      <Image src={src} srcSet={`${picture()} 1x`} alt="A harbour" width={320} height={200} />,
    )
    expect(frame.getAttribute('data-state')).toBe('loading')
    await loaded(frame)
  })
})

describe('what assistive technology is told', () => {
  it('names a meaningful picture by its `alt`, on the image element itself', () => {
    render(<Image src={picture()} alt="A harbour at dusk" width={320} height={200} />)
    expect(screen.getByRole('img', { name: 'A harbour at dusk' }).tagName).toBe('IMG')
  })

  it('exposes nothing for a decorative picture, while it loads and after', async () => {
    const { container } = render(<Image src={picture()} alt="" width={320} height={200} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
    await loaded(frameIn(container))
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('the element’s own attributes', () => {
  it('fetches lazily unless asked to fetch at once', () => {
    const lazy = render(<Image src={picture()} alt="A harbour" />)
    expect(lazy.container.querySelector('img')?.getAttribute('loading')).toBe('lazy')
    const eager = render(<Image src={picture()} alt="A harbour" loading="eager" />)
    expect(eager.container.querySelector('img')?.getAttribute('loading')).toBe('eager')
  })

  it('passes `crossOrigin` and `referrerPolicy` through, and writes neither when absent', () => {
    const plain = render(<Image src={picture()} alt="A harbour" />)
    const bare = plain.container.querySelector('img')!
    expect(bare.hasAttribute('crossorigin')).toBe(false)
    expect(bare.hasAttribute('referrerpolicy')).toBe(false)

    const set = render(
      <Image src={picture()} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" />,
    )
    const element = set.container.querySelector('img')!
    expect(element.crossOrigin).toBe('anonymous')
    expect(element.referrerPolicy).toBe('no-referrer')
  })

  it('passes `srcSet` and `fetchPriority` through, and writes neither when absent', async () => {
    const plain = render(<Image src={picture()} alt="A harbour" />)
    const bare = plain.container.querySelector('img')!
    expect(bare.hasAttribute('srcset')).toBe(false)
    expect(bare.hasAttribute('sizes')).toBe(false)
    expect(bare.hasAttribute('fetchpriority')).toBe(false)

    const wide = picture()
    const set = render(
      <Image
        src={picture()}
        srcSet={`${wide} 320w`}
        alt="A harbour"
        width={320}
        height={200}
        loading="eager"
        fetchPriority="high"
      />,
    )
    const element = set.container.querySelector('img')!
    expect(element.getAttribute('srcset')).toBe(`${wide} 320w`)
    expect(element.getAttribute('fetchpriority')).toBe('high')

    // The browser reads the set: the file it drew is the set's, not the `src`.
    await loaded(frameIn(set.container))
    expect(element.currentSrc).toBe(wide)
  })
})

describe('the `sizes` the member writes for a set that gives widths', () => {
  const sizesOf = (props: Partial<ImageProps>) =>
    render(<Image src={picture()} alt="A harbour" {...props} />)
      .container.querySelector('img')!
      .getAttribute('sizes')

  it('is the frame’s width and never more than the viewport’s, for a boxed frame', () => {
    const set = `${picture()} 320w, ${picture()} 640w`
    expect(sizesOf({ srcSet: set, width: 320, height: 200, loading: 'eager' })).toBe(
      '(max-width: 320px) 100vw, 320px',
    )
  })

  it('asks for the frame’s own width first when the picture is lazy', () => {
    const set = `${picture()} 320w, ${picture()} 640w`
    expect(sizesOf({ srcSet: set, width: 320, height: 200 })).toBe(
      'auto, (max-width: 320px) 100vw, 320px',
    )
    expect(sizesOf({ srcSet: set, aspectRatio: 1.6 })).toBe('auto, 100vw')
  })

  it('is absent where the element’s own assumption is right, or nothing is known', () => {
    const set = `${picture()} 320w, ${picture()} 640w`
    // A frame as wide as its container, fetched at once: at most the viewport's width.
    expect(sizesOf({ srcSet: set, aspectRatio: 1.6, loading: 'eager' })).toBeNull()
    // No box: the picture's own size is not known before it is requested.
    expect(sizesOf({ srcSet: set })).toBeNull()
  })

  it('is absent for a set that gives densities, which needs none', () => {
    expect(
      sizesOf({ srcSet: `${picture()} 1x, ${picture()} 2x`, width: 320, height: 200 }),
    ).toBeNull()
  })
})

describe('a picture that settled before its listeners existed', () => {
  /**
   * Markup from a server reaches the browser before the script does, so a
   * picture can load or fail with nothing listening. The first render's markup
   * stands in for the server's here: it is put in the page, left to settle, and
   * then hydrated.
   *
   * The picture is fetched at once, because a lazy one settles only after the
   * browser has measured it.
   * No size is given, so the markup holds no inline style for the browser to
   * write back in another form than React's.
   */
  async function hydrateSettled(src: string): Promise<HTMLElement> {
    const props: ImageProps = { src, alt: 'A harbour', loading: 'eager' }
    const first = render(<Image {...props} />)
    const markup = first.container.innerHTML
    first.unmount()
    expect(markup).toContain('data-state="loading"')

    const host = hostOf(600)
    host.innerHTML = markup
    const element = host.querySelector('img')!
    await vi.waitFor(() => expect(element.complete).toBe(true))

    const mismatch = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<Image {...props} />, { container: host, hydrate: true })
    expect(mismatch).not.toHaveBeenCalled()
    mismatch.mockRestore()
    return frameIn(host)
  }

  it('reads a picture that had already loaded as loaded', async () => {
    const frame = await hydrateSettled(picture())
    await loaded(frame)
    expect(frame.querySelector('img')).not.toBeNull()
  })

  it('reads a picture that had already failed as failed', async () => {
    const frame = await hydrateSettled(broken())
    await failed(frame)
    expect(frame.querySelector('img')).toBeNull()
  })
})
