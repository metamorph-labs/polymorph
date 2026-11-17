import { installTestTheme } from '@polymorph/engine/testing'
import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '../conventions/props'
import { Icon, type IconProps } from './Icon'

const svg = (container: HTMLElement) => container.querySelector('svg')

// The size and stroke checks read tokens, so they resolve through a real theme
// instead of comparing against a hardcoded pixel value.
beforeAll(installTestTheme)

describe('Icon', () => {
  it('has no style escape hatch in its public props', () => {
    // Fails at `pnpm typecheck`, before any call site tries to use one.
    assertGoverned<IconProps>(true)
  })

  it('is decorative by default and meaningful only when labelled', () => {
    const plain = render(<Icon name="add" />)
    expect(svg(plain.container)?.getAttribute('aria-hidden')).toBe('true')
    expect(svg(plain.container)?.getAttribute('role')).toBeNull()

    const labelled = render(<Icon name="warning" label="Warning" />)
    expect(svg(labelled.container)?.getAttribute('role')).toBe('img')
    expect(svg(labelled.container)?.getAttribute('aria-label')).toBe('Warning')
    expect(svg(labelled.container)?.getAttribute('aria-hidden')).toBeNull()
  })

  it('takes its size from the token, not from lucide’s 24px attribute', () => {
    const { container } = render(
      <>
        <Icon name="add" size="sm" />
        <Icon name="add" size="md" />
        <Icon name="add" size="lg" />
      </>,
    )
    const [sm, md, lg] = [...container.querySelectorAll('svg')].map(
      (node) => getComputedStyle(node).width,
    )
    expect(sm).not.toBe('24px')
    expect(parseFloat(sm ?? '0')).toBeLessThan(parseFloat(md ?? '0'))
    expect(parseFloat(md ?? '0')).toBeLessThan(parseFloat(lg ?? '0'))
  })

  it('takes its stroke width from the token, overriding the presentation attribute', () => {
    const { container } = render(<Icon name="add" />)
    const node = svg(container)
    expect(node?.getAttribute('stroke-width')).toBe('2')
    expect(getComputedStyle(node as Element).strokeWidth).not.toBe('2')
  })

  it('inherits currentColor from its context instead of setting a colour', () => {
    const host = document.createElement('div')
    host.style.color = 'rgb(1, 2, 3)'
    document.body.append(host)
    render(<Icon name="error" label="Error" />, { container: host })

    const node = host.querySelector('svg') as SVGElement
    expect(node.getAttribute('stroke')).toBe('currentColor')
    expect(getComputedStyle(node).stroke).toBe('rgb(1, 2, 3)')

    host.remove()
  })

  it('is not focusable', () => {
    const { container } = render(<Icon name="add" />)
    expect(svg(container)?.getAttribute('focusable')).toBe('false')
  })

  it('records the rendered role in data-icon, for the gallery and for tests', () => {
    const { container } = render(<Icon name="sort-desc" />)
    expect(svg(container)?.getAttribute('data-icon')).toBe('sort-desc')
  })
})
