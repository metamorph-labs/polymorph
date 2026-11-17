import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  appendThemeCSS,
  composeTheme,
  DATA_ATTRS,
  emitThemeCSS,
  formatColor,
  pairId,
  parseColor,
  parsePalette,
  parseSystem,
  readThemeValues,
  resolveTheme,
} from '@polymorph/engine'
import { installTestTheme } from '@polymorph/engine/testing'

import petrol from '../../../../design/palettes/petrol.json'
import terminal from '../../../../design/systems/terminal.json'
import { DepotMap, DEPOTS } from './DepotMap'
import { NoteEditor } from './NoteEditor'

/**
 * The two hosted components, in a real browser.
 *
 * Each is another library's component inside a `<ThirdParty>` boundary
 * (`docs/rules.md`). The claims are the route's: the map is drawn in the
 * theme's resolved values and drawn again when the pairing or the mode
 * changes, the editor's text resolves the theme's tokens through the cascade,
 * and neither brings a colour of its own or an accessibility fault.
 */

const root = document.documentElement

/** A second pairing beside the test theme, so a test can switch to it. */
function installSecondPairing(): void {
  const theme = resolveTheme(composeTheme(parseSystem(terminal), parsePalette(petrol)))
  appendThemeCSS(emitThemeCSS(theme), pairId(theme.system, theme.palette))
}

function switchPairing(): void {
  root.setAttribute(DATA_ATTRS.system, 'terminal')
  root.setAttribute(DATA_ATTRS.palette, 'petrol')
}

beforeEach(() => {
  installTestTheme()
  installSecondPairing()
})

afterEach(() => {
  cleanup()
  for (const attribute of Object.values(DATA_ATTRS)) root.removeAttribute(attribute)
})

/** What the page resolves a role to now, in the form the map is given. */
const role = (name: Parameters<ReturnType<typeof readThemeValues>['color']>[0]) =>
  readThemeValues().color(name)

/** The serious and critical faults axe finds in what a test rendered. */
async function faults(container: HTMLElement): Promise<string[]> {
  const result = await axe.run(container, { resultTypes: ['violations'] })
  return result.violations
    .filter(({ impact }) => impact === 'serious' || impact === 'critical')
    .map(({ id }) => id)
}

describe('the hosted map', () => {
  /** The circle Leaflet drew for each depot, in the order it drew them. */
  const markers = (container: HTMLElement) =>
    [...container.querySelectorAll<SVGPathElement>('path.leaflet-interactive')].map((path) => ({
      fill: path.getAttribute('fill'),
      stroke: path.getAttribute('stroke'),
    }))

  it('declares the library it hosts', () => {
    const { container } = render(<DepotMap />)
    const boundary = container.querySelector('[data-third-party]')
    expect(boundary?.getAttribute('data-third-party')).toBe('leaflet')
    expect(boundary?.querySelector('.leaflet-container')).not.toBeNull()
  })

  it('draws its markers in the theme’s resolved colours', async () => {
    const { container } = render(<DepotMap />)
    await vi.waitFor(() => expect(markers(container)).toHaveLength(DEPOTS.length))
    const [chosen, open, closed] = [
      markers(container)[0],
      markers(container)[1],
      markers(container)[2],
    ]
    expect(chosen).toEqual({ fill: role('accent.bg'), stroke: role('bg.surface') })
    expect(open?.fill).toBe(role('success.solid'))
    expect(closed?.fill).toBe(role('text.muted'))
    expect(role('accent.bg')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('draws them again when the mode changes', async () => {
    const { container } = render(<DepotMap />)
    await vi.waitFor(() => expect(markers(container)).toHaveLength(DEPOTS.length))
    const light = markers(container)[0]

    root.setAttribute(DATA_ATTRS.mode, 'dark')
    await vi.waitFor(() => expect(markers(container)[0]).not.toEqual(light))
    expect(markers(container)[0]).toEqual({
      fill: role('accent.bg'),
      stroke: role('bg.surface'),
    })
  })

  it('draws them again when the pairing changes', async () => {
    const { container } = render(<DepotMap />)
    await vi.waitFor(() => expect(markers(container)).toHaveLength(DEPOTS.length))
    const before = markers(container)[0]

    switchPairing()
    await vi.waitFor(() => expect(markers(container)[0]).not.toEqual(before))
    expect(markers(container)[0]).toEqual({
      fill: role('accent.bg'),
      stroke: role('bg.surface'),
    })
  })

  it('sizes a marker from the space scale', async () => {
    const { container } = render(<DepotMap />)
    // A circle's path is two arcs, and each names the radius it was drawn with.
    const radius = (at: number) => {
      const drawn = container.querySelectorAll('path.leaflet-interactive')[at]?.getAttribute('d')
      return Number(/a(\d+(?:\.\d+)?),/.exec(drawn ?? '')?.[1])
    }
    await vi.waitFor(() => expect(radius(1)).toBe(readThemeValues().space(3)))
    expect(radius(0)).toBe(readThemeValues().space(4))
  })

  it('takes its surface from the theme’s tokens, not from the library’s stylesheet', () => {
    const { container } = render(<DepotMap />)
    const map = container.querySelector('.leaflet-container') as HTMLElement
    const surface = () => getComputedStyle(map).backgroundColor
    const light = surface()
    root.setAttribute(DATA_ATTRS.mode, 'dark')
    expect(surface()).not.toBe(light)
  })

  it('is driven by members: the picker selects a depot and the buttons zoom', async () => {
    const { container } = render(<DepotMap />)
    await vi.waitFor(() => expect(markers(container)).toHaveLength(DEPOTS.length))
    screen.getByRole('radio', { name: 'Eastfield' }).click()
    await vi.waitFor(() => expect(markers(container)[2]?.fill).toBe(role('accent.bg')))
    expect(screen.getByText('Eastfield is closed.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy()
    expect(container.querySelector('.leaflet-control-zoom')).toBeNull()
  })

  it('has no accessibility fault', async () => {
    const { container } = render(<DepotMap />)
    await vi.waitFor(() => expect(markers(container)).toHaveLength(DEPOTS.length))
    expect(await faults(container)).toEqual([])
  })
})

describe('the hosted editor', () => {
  const editorOf = (container: HTMLElement) =>
    container.querySelector('[contenteditable="true"]') as HTMLElement

  it('declares the library it hosts', () => {
    const { container } = render(<NoteEditor />)
    const boundary = container.querySelector('[data-third-party]')
    expect(boundary?.getAttribute('data-third-party')).toBe('@tiptap/core')
    expect(boundary?.contains(editorOf(container))).toBe(true)
  })

  it('sets its text in the theme’s type and colour', () => {
    const { container } = render(<NoteEditor />)
    const paragraph = editorOf(container).querySelector('p') as HTMLElement
    const theme = readThemeValues(paragraph)
    const style = getComputedStyle(paragraph)
    expect(Number.parseFloat(style.fontSize)).toBeCloseTo(theme.text('md').size, 1)
    const colour = parseColor(style.color)
    expect(colour && formatColor(colour)).toBe(theme.color('text.primary'))
    const heading = editorOf(container).querySelector('h2') as HTMLElement
    expect(Number.parseFloat(getComputedStyle(heading).fontSize)).toBeCloseTo(
      theme.text('lg').size,
      1,
    )
  })

  it('follows the mode and the pairing with no code of its own', () => {
    const { container } = render(<NoteEditor />)
    const paragraph = editorOf(container).querySelector('p') as HTMLElement
    const read = () => {
      const style = getComputedStyle(paragraph)
      return `${style.color} ${style.fontFamily}`
    }
    const light = read()
    root.setAttribute(DATA_ATTRS.mode, 'dark')
    const dark = read()
    expect(dark).not.toBe(light)
    switchPairing()
    expect(read()).not.toBe(dark)
  })

  it('is edited through members: a button toggles a mark and shows that it holds', async () => {
    const { container } = render(<NoteEditor />)
    const editor = editorOf(container)
    const bold = screen.getByRole('button', { name: 'Bold' })
    expect(bold.getAttribute('aria-pressed')).toBe('false')

    // Select the paragraph's first word, then make it bold.
    const text = editor.querySelector('p')?.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 9)
    editor.focus()
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))

    bold.click()
    await vi.waitFor(() => expect(editor.querySelector('p strong')?.textContent).toBe('Eastfield'))
    await vi.waitFor(() => expect(bold.getAttribute('aria-pressed')).toBe('true'))
  })

  it('names its text box, and has no accessibility fault', async () => {
    const { container } = render(<NoteEditor />)
    expect(screen.getByRole('textbox', { name: 'Shift note' })).toBe(editorOf(container))
    expect(await faults(container)).toEqual([])
  })
})
