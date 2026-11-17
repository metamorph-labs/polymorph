import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { StreamingText, type StreamingTextProps } from './StreamingText'

/**
 * StreamingText, in a real browser.
 *
 * These browser tests cover what a reader is told. A paragraph still arriving
 * reports it in one attribute. The caret is visual only and never text. An
 * empty arrival is one line tall instead of collapsing to nothing and shifting
 * when the first word arrives.
 */

beforeAll(installTestTheme)

const root = () => document.querySelector('[data-member="streaming-text"]') as HTMLElement

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<StreamingTextProps>(true)
  })
})

describe('arriving', () => {
  it('reports the arrival once, on the root, and keeps the caret out of the text', () => {
    render(<StreamingText streaming>Half a sentence</StreamingText>)
    expect(root().dataset['state']).toBe('streaming')
    expect(root().getAttribute('aria-busy')).toBe('true')
    const caret = root().querySelector('span') as HTMLElement
    expect(caret.getAttribute('aria-hidden')).toBe('true')
    expect(caret.textContent).toBe('')
    expect(screen.getByText('Half a sentence').textContent).toBe('Half a sentence')
  })

  it('draws the caret in the accent fill, one step tall, and never blinks', () => {
    render(<StreamingText streaming>Half a sentence</StreamingText>)
    const caret = root().querySelector('span') as HTMLElement
    const style = getComputedStyle(caret)
    expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(style.animationName).toBe('none')
    expect(Number.parseFloat(style.height)).toBeGreaterThan(8)
  })

  it('is one line tall while nothing has arrived', () => {
    render(<StreamingText streaming>{''}</StreamingText>)
    expect(root().hasAttribute('data-pending')).toBe(true)
    expect(root().getBoundingClientRect().height).toBeGreaterThan(12)
    // The bar is a visual placeholder and is hidden from assistive technology.
    expect(root().querySelector('[data-member="skeleton"]')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
  })
})

describe('complete', () => {
  it('is a plain paragraph with no state, no busy flag and no caret', () => {
    render(<StreamingText>Done.</StreamingText>)
    expect(root().hasAttribute('data-state')).toBe(false)
    expect(root().hasAttribute('aria-busy')).toBe(false)
    expect(root().querySelector('span')).toBeNull()
  })

  it('keeps whitespace as content', () => {
    render(<StreamingText>{'one\ntwo'}</StreamingText>)
    const text = root().querySelector('p') as HTMLElement
    expect(getComputedStyle(text).whiteSpace).toBe('pre-wrap')
    expect(text.textContent).toBe('one\ntwo')
  })
})
