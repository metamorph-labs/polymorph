import { render } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { ImageEditor, type ImageEditorProps } from './ImageEditor'

/**
 * ImageEditor, in a real browser. Chromium is needed for the gestures: pointer-capture panning, a
 * wheel that zooms instead of scrolling, keyboard support equal to the pointer, and an export that
 * is a real decodable file of the requested size.
 */

const TEST_CARD =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
      <rect width="640" height="480" fill="#4e6fae"/>
    </svg>`,
  )

beforeAll(installTestTheme)

function mount(props: Partial<ImageEditorProps> = {}) {
  const { container } = render(
    <div style={{ width: 320 }}>
      <ImageEditor src={TEST_CARD} onConfirm={() => {}} {...props} />
    </div>,
  )
  return container.firstElementChild?.firstElementChild as HTMLElement
}

const stage = (root: HTMLElement) => root.querySelector('[role="application"]') as HTMLElement
const image = (root: HTMLElement) => root.querySelector('img') as HTMLImageElement

async function loaded(root: HTMLElement) {
  await vi.waitFor(() => {
    expect(image(root).style.visibility).not.toBe('hidden')
  })
}

/**
 * A synthesized pointer drag. vitest's userEvent has no pointer gesture, so the drag is dispatched
 * as the PointerEvents the browser would send. The component cannot capture an untracked pointer,
 * so it pans without capture, which is its documented fallback.
 */
function drag(target: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) {
  const options = { bubbles: true, pointerId: 7, isPrimary: true }
  target.dispatchEvent(
    new PointerEvent('pointerdown', { ...options, clientX: from.x, clientY: from.y }),
  )
  target.dispatchEvent(
    new PointerEvent('pointermove', { ...options, clientX: to.x, clientY: to.y }),
  )
  target.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: to.x, clientY: to.y }))
}

/** The transform's translate, read back from the image's inline style. */
function translateOf(root: HTMLElement): { x: number; y: number } {
  const match = image(root).style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)
  if (!match) throw new Error(`no translate in ${image(root).style.transform}`)
  return { x: Number(match[1]), y: Number(match[2]) }
}

/**
 * Whether a command set the transition flag. `data-animate` lasts exactly as long as the command's
 * transition, and under full-suite load an awaited click can return after a control-length
 * transition has already finished. So the flag is observed from before the press rather than read
 * after it. A record whose old value is null means the attribute was added.
 */
function tweenRaised(root: HTMLElement): () => boolean {
  let raised = false
  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.oldValue === null)) raised = true
  })
  observer.observe(image(root), {
    attributes: true,
    attributeFilter: ['data-animate'],
    attributeOldValue: true,
  })
  return () => {
    observer.disconnect()
    return raised || image(root).dataset['animate'] === ''
  }
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ImageEditorProps>(true)
  })
})

describe('the empty state', () => {
  it('shows the dropzone, and adopting a file replaces it with the stage', async () => {
    const root = mount({ src: undefined })
    expect(root.dataset['empty']).toBe('')
    expect(stage(root)).toBeNull()

    const input = root.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([await (await fetch(TEST_CARD)).blob()], 'card.svg', {
      type: 'image/svg+xml',
    })
    await userEvent.upload(input, file)
    await vi.waitFor(() => expect(stage(root)).not.toBeNull())
    expect(root.dataset['empty']).toBeUndefined()
  })

  it('localizes through the messages prop', () => {
    const root = mount({
      src: undefined,
      messages: { title: 'Añadir una imagen', browse: 'Examinar' },
    })
    expect(root.textContent).toContain('Añadir una imagen')
    expect(root.textContent).toContain('Examinar')
  })

  it('recovers from declared image bytes the browser cannot decode', async () => {
    const root = mount({ src: undefined, messages: { loadError: 'Choose a readable image.' } })
    const input = root.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['not an image'], 'broken.png', { type: 'image/png' }))

    await vi.waitFor(() => expect(root.textContent).toContain('Choose a readable image.'))
    expect(stage(root)).toBeNull()
    expect(root.querySelector('input[type="file"]')).not.toBeNull()
    // Focus moves in the commit that shows the dropzone again, in the component's effect, which
    // runs after the error paints. So the test waits for it rather than reading it in the same tick
    // as the message. A move on the next animation frame would race: under a loaded runner that
    // frame can run before the dropzone exists, the focus call does nothing and the user stays on
    // `<body>`.
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(root.querySelector('[role="alert"]')?.parentElement),
    )
  })

  it('announces a caller src it cannot decode without taking focus', async () => {
    const root = mount({
      src: 'data:image/png;base64,bm90IGFuIGltYWdl',
      messages: { loadError: 'Choose a readable image.' },
    })
    await vi.waitFor(() => expect(root.textContent).toContain('Choose a readable image.'))
    expect(root.querySelector('[role="alert"]')).not.toBeNull()
    // Any focus move would happen in the commit's effects, so let those flush before reading. The
    // user adopted nothing. A broken `src` is the page's failure, and focus stays where it was.
    await new Promise((settle) => setTimeout(settle, 50))
    expect(document.activeElement).toBe(document.body)
  })
})

describe('the frame', () => {
  it('opens at minimum zoom, centred, and the crop never extends past the image', async () => {
    const root = mount()
    await loaded(root)
    const view = stage(root).getBoundingClientRect()
    // 640×480 in a square viewport: the height sets the cover scale and the width overhangs.
    const scale = view.height / 480
    const t = translateOf(root)
    expect(t.x).toBeCloseTo(view.width / 2 - 640 / 2, 0)
    expect(t.y).toBeCloseTo(view.height / 2 - 480 / 2, 0)
    // CSSOM shortens serialized numbers, so the scale is parsed, not matched.
    const painted = Number(image(root).style.transform.match(/scale\(([\d.-]+)[,)]/)?.[1])
    expect(painted).toBeCloseTo(scale, 4)
  })

  it('pans by pointer capture and clamps at the edge', async () => {
    const root = mount()
    await loaded(root)
    const surface = stage(root)
    const box = surface.getBoundingClientRect()
    const before = translateOf(root)

    // Drag right past any lawful bound. The clamp keeps the edge covered. Continuous-priority
    // updates commit after the dispatch finishes.
    drag(surface, { x: box.x + 50, y: box.y + 50 }, { x: box.x + 3000, y: box.y + 50 })
    await vi.waitFor(() => expect(translateOf(root).x).toBeGreaterThan(before.x))
    const after = translateOf(root)
    // The image's left edge may reach the crop's left edge and no further.
    expect(after.x).toBeLessThanOrEqual(0.5)
    // The vertical axis is exactly covered, so the drag must not move it.
    expect(after.y).toBeCloseTo(before.y, 0)
  })

  it('responds to the keyboard as it does to the pointer (WCAG 2.1.1)', async () => {
    const root = mount()
    await loaded(root)
    stage(root).focus()
    const before = translateOf(root)
    await userEvent.keyboard('{ArrowLeft}')
    expect(translateOf(root).x).toBeCloseTo(before.x - 8, 0)
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    expect(translateOf(root).x).toBeCloseTo(before.x + 24, 0)

    // Zoom from the same keys; the slider readout follows in percent.
    await userEvent.keyboard('+')
    expect(root.textContent).toContain('105%')
  })

  it('rotates in quarter turns, with an animated transition', async () => {
    const root = mount()
    await loaded(root)
    const raised = tweenRaised(root)
    await userEvent.click(root.querySelector('[aria-label="Rotate 90 degrees"]') as HTMLElement)
    expect(image(root).style.transform).toContain('rotate(90deg)')
    expect(raised(), 'the turn carries the tween').toBe(true)
    // A gesture during the rotation clears the transition flag.
    const surface = stage(root)
    const box = surface.getBoundingClientRect()
    drag(surface, { x: box.x + 50, y: box.y + 50 }, { x: box.x + 51, y: box.y + 50 })
    await vi.waitFor(() => expect(image(root).dataset['animate']).toBeUndefined())
  })
})

describe('the offered controls', () => {
  it('mirrors on flip, in image space and composed with turns, and the export matches', async () => {
    const received: Blob[] = []
    const root = mount({
      flip: true,
      exportSize: 64,
      onConfirm: (blob) => void received.push(blob),
    })
    await loaded(root)
    const raised = tweenRaised(root)
    await userEvent.click(root.querySelector('[aria-label="Flip horizontally"]') as HTMLElement)
    expect(image(root).style.transform).toMatch(/scale\(-/)
    expect(image(root).dataset['mirrored']).toBe('')
    expect(raised(), 'the mirror carries the tween').toBe(true)

    await userEvent.click(root.querySelector('[data-variant="solid"]') as HTMLElement)
    await vi.waitFor(() => expect(received).toHaveLength(1))
    const bitmap = await createImageBitmap(received[0] as Blob)
    expect(bitmap.width).toBe(64)
  })

  it('reset returns to minimum zoom: cover, centred, unrotated, unmirrored', async () => {
    const root = mount({ flip: true, reset: true })
    await loaded(root)
    const home = translateOf(root)

    stage(root).focus()
    await userEvent.keyboard('++{ArrowRight}{ArrowRight}')
    await userEvent.click(root.querySelector('[aria-label="Flip horizontally"]') as HTMLElement)
    await userEvent.click(root.querySelector('[aria-label="Rotate 90 degrees"]') as HTMLElement)
    expect(root.textContent).toContain('110%')

    await userEvent.click(root.querySelector('[aria-label="Reset framing"]') as HTMLElement)
    expect(root.textContent).toContain('100%')
    expect(image(root).style.transform).toContain('rotate(0deg)')
    expect(image(root).dataset['mirrored']).toBeUndefined()
    await vi.waitFor(() => {
      const t = translateOf(root)
      expect(t.x).toBeCloseTo(home.x, 0)
      expect(t.y).toBeCloseTo(home.y, 0)
    })
  })

  it('shows the thirds grid only while panning', async () => {
    const root = mount({ grid: true })
    await loaded(root)
    const lines = stage(root).lastElementChild as HTMLElement
    expect(getComputedStyle(lines).visibility).toBe('hidden')

    const box = stage(root).getBoundingClientRect()
    const opts = { bubbles: true, pointerId: 9, isPrimary: true }
    stage(root).dispatchEvent(
      new PointerEvent('pointerdown', { ...opts, clientX: box.x + 60, clientY: box.y + 60 }),
    )
    await vi.waitFor(() => expect(getComputedStyle(lines).visibility).toBe('visible'))
    stage(root).dispatchEvent(new PointerEvent('pointerup', { ...opts }))
    await vi.waitFor(() => expect(getComputedStyle(lines).visibility).toBe('hidden'))
  })

  it('the maximum zoom follows maxZoom, clamped to the allowed range', async () => {
    const root = mount({ maxZoom: 2 })
    await loaded(root)
    const slider = root.querySelector('[role="slider"]') as HTMLElement
    expect(slider.getAttribute('aria-valuemax')).toBe('200')
  })

  it('rounded mask sets its data attribute', async () => {
    const root = mount({ mask: 'rounded' })
    await loaded(root)
    expect(root.dataset['mask']).toBe('rounded')
  })
})

describe('the export', () => {
  it('returns a decodable file at the requested size, and is busy while a promise settles', async () => {
    let resolveConfirm: () => void = () => {}
    const received: Blob[] = []
    const root = mount({
      exportSize: 128,
      onConfirm: (blob) => {
        received.push(blob)
        return new Promise<void>((resolve) => {
          resolveConfirm = resolve
        })
      },
    })
    await loaded(root)
    await userEvent.click(root.querySelector('[data-variant="solid"]') as HTMLElement)

    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(root.dataset['busy']).toBe('')
    resolveConfirm()
    await vi.waitFor(() => expect(root.dataset['busy']).toBeUndefined())

    const bitmap = await createImageBitmap(received[0] as Blob)
    expect(bitmap.width).toBe(128)
    expect(bitmap.height).toBe(128)
    expect((received[0] as Blob).type).toBe('image/png')
  })
})

/**
 * An agent reads the editor and runs nothing, as the spec's `agent` fence declares
 * (`design/components/image-editor.md`, Agent): its Buttons and its zoom Slider are withheld.
 */
describe('an agent', () => {
  it('reads whether an image is loaded, and reaches none of the editor’s controls', async () => {
    const bridge = createAgentBridge()
    try {
      const onConfirm = vi.fn()
      const root = mount({ onConfirm, onCancel: () => {} })
      await loaded(root)
      const { members } = bridge.snapshot()
      expect(members).toHaveLength(1)
      expect(members[0]).toMatchObject({
        member: 'ImageEditor',
        state: { empty: false, busy: false, disabled: false },
        actions: [],
      })
      const { results } = await bridge.act([
        { target: { member: 'Button', name: 'Confirm' }, action: 'press' },
      ])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'unknown-member' } })
      expect(onConfirm).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})
