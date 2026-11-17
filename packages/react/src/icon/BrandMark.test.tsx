import { installTestTheme } from '@polymorph/engine/testing'
import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '../conventions/props'
import { BRAND_MARKS, BrandMark, type BrandMarkProps, isBrandName } from './BrandMark'

const svg = (container: HTMLElement) => container.querySelector('svg')

// The size check reads a token, so it needs a real theme.
beforeAll(installTestTheme)

describe('BrandMark', () => {
  it('has no style escape hatch and no prop for supplying your own mark', () => {
    assertGoverned<BrandMarkProps>(true)
    // The set is closed: no `src`, no `children`, no `color`.
    const keys: (keyof BrandMarkProps)[] = ['name', 'size', 'label']
    expect(keys).toHaveLength(3)
  })

  it('draws every brand in the closed set', () => {
    for (const name of BRAND_MARKS) {
      const { container, unmount } = render(<BrandMark name={name} />)
      expect(svg(container)?.dataset['brand']).toBe(name)
      expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('is decorative by default and meaningful only when labelled', () => {
    const plain = render(<BrandMark name="google" />)
    expect(svg(plain.container)?.getAttribute('aria-hidden')).toBe('true')
    expect(svg(plain.container)?.getAttribute('role')).toBeNull()

    const labelled = render(<BrandMark name="google" label="Google" />)
    expect(svg(labelled.container)?.getAttribute('role')).toBe('img')
    expect(svg(labelled.container)?.getAttribute('aria-label')).toBe('Google')
    expect(svg(labelled.container)?.getAttribute('aria-hidden')).toBeNull()
  })

  it('uses Icon’s three token sizes', () => {
    const { container } = render(
      <>
        <BrandMark name="microsoft" size="sm" />
        <BrandMark name="microsoft" size="md" />
        <BrandMark name="microsoft" size="lg" />
      </>,
    )
    const root = getComputedStyle(document.documentElement)
    const widths = [...container.querySelectorAll('svg')].map(
      (node) => getComputedStyle(node).width,
    )
    expect(widths).toEqual(
      (['sm', 'md', 'lg'] as const).map((step) =>
        root.getPropertyValue(`--pm-icon-size-${step}`).trim(),
      ),
    )
  })

  it('keeps the providers’ colours regardless of theme, and gives GitHub the text colour', () => {
    // A context whose text colour matches no brand colour.
    const seat = () => {
      const host = document.createElement('div')
      host.style.color = 'rgb(1, 2, 3)'
      document.body.append(host)
      return host
    }

    const google = render(<BrandMark name="google" />, { container: seat() })
    const fills = [...google.container.querySelectorAll('path')].map((path) =>
      path.getAttribute('fill'),
    )
    expect(fills).toEqual(['#EA4335', '#4285F4', '#FBBC05', '#34A853'])

    const github = render(<BrandMark name="github" />, { container: seat() })
    const mark = github.container.querySelector('path')!
    expect(getComputedStyle(mark).fill).toBe('rgb(1, 2, 3)')
  })

  it('recognises its brand names', () => {
    expect(isBrandName('google')).toBe(true)
    expect(isBrandName('gitlab')).toBe(false)
  })
})
