import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned, DATA_ATTRS } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { QRCode, type QRCodeProps } from './QRCode'

/**
 * Checks that need a browser: the symbol is dark on light in *both* modes, the
 * quiet zone is present, and the size comes from space tokens.
 * The engine's `qr/encode.test.ts` checks that the modules are correct.
 */

beforeAll(installTestTheme)

const ENROLMENT = 'otpauth://totp/Relay:rowan@relay.test?secret=JBSWY3DPEHPK3PXP&issuer=Relay'

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<QRCodeProps>(true)
  })
})

/** Relative luminance, from a computed `rgb()`/`color()` fill — enough to order two colours. */
function luminance(element: Element): number {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d')!
  context.fillStyle = getComputedStyle(element).fill
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

describe('QRCode', () => {
  it('is a named image, and the name is not the secret', () => {
    render(<QRCode value={ENROLMENT} label="Authenticator setup code" />)
    const symbol = screen.getByRole('img', { name: 'Authenticator setup code' })
    expect(symbol.textContent).toBe('')
    expect(symbol.outerHTML).not.toContain('JBSWY3DPEHPK3PXP')
  })

  it('keeps four clear modules on every side', () => {
    render(<QRCode value="polymorph" label="A symbol" />)
    const symbol = screen.getByRole('img')
    // Version 1 is 21 modules; the quiet zone makes the field 29.
    expect(symbol.getAttribute('viewBox')).toBe('0 0 29 29')
    expect(symbol.querySelector('path')?.getAttribute('d')?.startsWith('M4 4')).toBe(true)
  })

  it('is dark on light in light mode', () => {
    document.documentElement.setAttribute(DATA_ATTRS.mode, 'light')
    render(<QRCode value="polymorph" label="A symbol" />)
    const symbol = screen.getByRole('img')
    expect(luminance(symbol.querySelector('path')!)).toBeLessThan(
      luminance(symbol.querySelector('rect')!),
    )
  })

  it('is still dark on light in dark mode, because scanners ignore themes', () => {
    document.documentElement.setAttribute(DATA_ATTRS.mode, 'dark')
    try {
      render(<QRCode value="polymorph" label="A symbol" />)
      const symbol = screen.getByRole('img')
      const ink = luminance(symbol.querySelector('path')!)
      const paper = luminance(symbol.querySelector('rect')!)
      expect(ink).toBeLessThan(paper)
      // By a wide margin. A symbol needs strong contrast, which is why it uses
      // the theme's text-on-surface pair rather than inventing one.
      expect(paper - ink).toBeGreaterThan(120)
    } finally {
      document.documentElement.setAttribute(DATA_ATTRS.mode, 'light')
    }
  })

  it('sizes from space tokens, as a square', () => {
    render(<QRCode value="polymorph" label="A symbol" />)
    const symbol = screen.getByRole('img')
    const space10 = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--pm-space-10'),
    )
    const box = symbol.getBoundingClientRect()
    expect(box.width).toBeCloseTo(space10 * 2, 0)
    expect(box.height).toBeCloseTo(box.width, 0)
  })

  it('shrinks in a narrow container rather than clipping a finder', () => {
    const host = document.createElement('div')
    host.style.width = '120px'
    document.body.append(host)
    render(<QRCode value="polymorph" label="A symbol" size="lg" />, { container: host })
    const box = screen.getByRole('img').getBoundingClientRect()
    expect(box.width).toBeLessThanOrEqual(120)
    expect(box.height).toBeCloseTo(box.width, 0)
    host.remove()
  })

  it('renders nothing for a payload too large for any symbol, and warns in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<QRCode value={'x'.repeat(3000)} label="Too much" />)
    expect(container.innerHTML).toBe('')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('does not fit a QR symbol'))
    warn.mockRestore()
  })
})
