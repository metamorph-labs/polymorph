import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for Progress's two shapes (`design/components/progress.md`), which
 * every web shell's Progress test calls with a mount of its own: a Progress
 * that passes no `shape` is the bar it always was, the ring says what the bar
 * says, its arc is the part done, its box is Spinner's, and in a right-to-left
 * page the bar fills from the right while the ring does not turn.
 */

/** The props the law mounts a Progress with. */
export interface ProgressRingLawProps {
  value: number
  label: string
  tone?: 'accent' | 'danger'
  shape?: 'bar' | 'ring'
  size?: 'sm' | 'md' | 'lg'
}

export interface ProgressRingLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts one Progress with these props, after any the test mounted before
   * it. A prop the law leaves out is not passed.
   */
  mount(props: ProgressRingLawProps): Promise<unknown>
}

/** The Progress mounted last: a test mounts several, and each mount is added at the end of the body. */
const root = (): HTMLElement => {
  const element = [...document.querySelectorAll<HTMLElement>('[data-member="progress"]')].at(-1)
  if (element === undefined) throw new Error('the Progress rendered nothing')
  return element
}

/** The ring's two circles: the groove under the arc, then the arc. */
const circle = (at: 0 | 1): SVGCircleElement => {
  const circles = root().querySelectorAll<SVGCircleElement>('circle')
  if (circles.length !== 2) throw new Error(`the ring draws ${circles.length} circles, not 2`)
  return circles[at] as SVGCircleElement
}

const groove = () => circle(0)
const arc = () => circle(1)

/** A token's computed length, read through an element that is sized by it. */
function tokenLength(name: string): string {
  const probe = document.createElement('div')
  probe.style.height = `var(${name})`
  document.body.append(probe)
  const length = getComputedStyle(probe).height
  probe.remove()
  return length
}

/** A token's computed colour, read through an element that is painted with it. */
function tokenColor(name: string): string {
  const probe = document.createElement('div')
  probe.style.backgroundColor = `var(${name})`
  document.body.append(probe)
  const colour = getComputedStyle(probe).backgroundColor
  probe.remove()
  return colour
}

export function progressRingLaw({ shell, mount }: ProgressRingLaw): void {
  describe(`${shell} Progress — the bar and the ring`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      document.documentElement.removeAttribute('dir')
    })

    it('is the bar it always was when no shape is passed', async () => {
      await mount({ value: 40, label: 'Import' })

      expect(root().getAttribute('role')).toBe('progressbar')
      expect(root().hasAttribute('data-shape')).toBe(false)
      expect(root().hasAttribute('data-size')).toBe(false)
      expect(root().querySelector('svg')).toBeNull()
      expect((root().firstElementChild as HTMLElement).style.transform).toBe('scaleX(0.4)')
    })

    it('says what the bar says as a ring', async () => {
      await mount({ value: 60, label: 'Uploading report.pdf', shape: 'ring' })

      expect(root().getAttribute('role')).toBe('progressbar')
      expect(root().getAttribute('aria-label')).toBe('Uploading report.pdf')
      expect(root().getAttribute('aria-valuenow')).toBe('60')
      expect(root().getAttribute('aria-valuemin')).toBe('0')
      expect(root().getAttribute('aria-valuemax')).toBe('100')
      expect(root().getAttribute('data-shape')).toBe('ring')
      expect(root().getAttribute('data-size')).toBe('md')
      expect(root().getAttribute('data-tone')).toBe('accent')
      // The dial is drawing, not content, and the ring writes no text.
      expect(root().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
      expect(root().textContent).toBe('')
    })

    it('leaves the part not done as the arc’s dash offset, clamped', async () => {
      await mount({ value: 60, label: 'Upload', shape: 'ring' })
      expect(arc().getAttribute('pathLength')).toBe('100')
      expect(parseFloat(getComputedStyle(arc()).strokeDashoffset)).toBe(40)

      await mount({ value: 140, label: 'Upload', shape: 'ring' })
      expect(root().getAttribute('aria-valuenow')).toBe('100')
      expect(parseFloat(getComputedStyle(arc()).strokeDashoffset)).toBe(0)

      await mount({ value: -20, label: 'Upload', shape: 'ring' })
      expect(parseFloat(getComputedStyle(arc()).strokeDashoffset)).toBe(100)
    })

    it('is a square at Spinner’s size for each size', async () => {
      for (const size of ['sm', 'md', 'lg'] as const) {
        await mount({ value: 50, label: 'Upload', shape: 'ring', size })
        const box = root().getBoundingClientRect()
        expect(`${box.width}px`, size).toBe(tokenLength(`--pm-icon-size-${size}`))
        expect(box.height, size).toBe(box.width)
      }
    })

    it('strokes the arc in the accent, or the danger solid', async () => {
      await mount({ value: 50, label: 'Upload', shape: 'ring' })
      expect(getComputedStyle(arc()).stroke).toBe(tokenColor('--pm-accent-bg'))

      await mount({ value: 50, label: 'Upload failed', shape: 'ring', tone: 'danger' })
      expect(getComputedStyle(arc()).stroke).toBe(tokenColor('--pm-danger-solid'))
    })

    it('strokes the groove in the border role, which is seen on every surface', async () => {
      // The groove is a line two pixels wide around a dial an icon's size. The
      // contrast law holds `border.default` a hairline's lightness from every
      // surface in every pairing; the bar's wash, `bg.subtle`, is not held there
      // and all but vanishes as a line that thin on a dark page.
      await mount({ value: 50, label: 'Upload', shape: 'ring' })
      expect(getComputedStyle(groove()).stroke).toBe(tokenColor('--pm-border-default'))

      await mount({ value: 50, label: 'Upload failed', shape: 'ring', tone: 'danger' })
      expect(getComputedStyle(groove()).stroke).toBe(tokenColor('--pm-border-default'))
    })

    it('eases the arc as the bar eases its fill', async () => {
      await mount({ value: 50, label: 'Upload', shape: 'ring' })
      expect(getComputedStyle(arc()).transitionProperty).toBe('stroke-dashoffset')
    })

    it('fills the bar from the right in a right-to-left page, and does not turn the ring', async () => {
      await mount({ value: 50, label: 'Upload', shape: 'ring' })
      const dial = getComputedStyle(root().querySelector('svg') as SVGSVGElement).transform

      document.documentElement.setAttribute('dir', 'rtl')
      await mount({ value: 50, label: 'Upload', shape: 'ring' })
      expect(getComputedStyle(root().querySelector('svg') as SVGSVGElement).transform).toBe(dial)

      await mount({ value: 50, label: 'Import' })
      const fill = root().firstElementChild as HTMLElement
      // The fill's own width, before its scale.
      const width = getComputedStyle(fill).width
      expect(parseFloat(width)).toBeGreaterThan(0)
      expect(getComputedStyle(fill).transformOrigin.startsWith(width)).toBe(true)
    })
  })
}
