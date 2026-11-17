import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  appendThemeCSS,
  composeTheme,
  emitThemeCSS,
  exampleQuietSystem,
  exampleVioletPalette,
  resolveTheme,
  type ResolvedTheme,
  type SystemOverrides,
} from '@polymorph/engine'
import { installTestTheme } from '@polymorph/engine/testing'
import focus from '@polymorph/recipes/conventions/focus.module.css'

/**
 * Tests the focus convention on its own, apart from any component that
 * composes it. Every component shares this module, so a bug here appears in
 * all of them.
 */

let theme: ReturnType<typeof installTestTheme>

beforeAll(() => {
  theme = installTestTheme()
})

function focusable(): HTMLButtonElement {
  const { container } = render(
    <button type="button" className={focus.focusRing}>
      Focus me
    </button>,
  )
  const button = container.querySelector('button') as HTMLButtonElement
  document.body.append(container)
  return button
}

describe('the focus ring', () => {
  it('draws nothing until the element is focused', () => {
    expect(getComputedStyle(focusable()).outlineStyle).toBe('none')
  })

  it('takes its width, offset and colour from tokens', async () => {
    const button = focusable()
    // Keyboard focus, not `.focus()` on a mouse path, because the convention
    // targets `:focus-visible`.
    button.focus({ focusVisible: true } as FocusOptions)

    const computed = getComputedStyle(button)
    expect(computed.outlineStyle).toBe('solid')
    expect(computed.outlineWidth).toBe(theme.tokens.focus.width)
    expect(computed.outlineOffset).toBe(theme.tokens.focus.offset)
    expect(computed.outlineColor).not.toBe('rgba(0, 0, 0, 0)')
  })

  it('recolours the border to the ring’s colour, but not when invalid', async () => {
    // The recolor half: the reference shows focus as the border taking the
    // ring's colour, plus the halo. A bordered fixture is checked both ways,
    // because the invalid case protects data: a danger border must survive
    // focus.
    // The rest border comes from a stylesheet, not an inline style, because an
    // inline declaration would outrank the convention and the test would check
    // nothing.
    const probe = document.createElement('style')
    probe.textContent = 'button { border: 1px solid rgb(1, 2, 3) }'
    document.head.append(probe)
    const button = focusable()
    button.focus({ focusVisible: true } as FocusOptions)
    const focused = getComputedStyle(button).borderTopColor
    expect(focused).not.toBe('rgb(1, 2, 3)')
    expect(focused).not.toBe('rgba(0, 0, 0, 0)')

    button.blur()
    button.setAttribute('aria-invalid', 'true')
    button.focus({ focusVisible: true } as FocusOptions)
    // The ring stays, and the border keeps the invalid state's colour.
    expect(getComputedStyle(button).outlineStyle).toBe('solid')
    expect(getComputedStyle(button).borderTopColor).toBe('rgb(1, 2, 3)')
    probe.remove()
  })

  it('exports one class only, so a component cannot pick a variant', () => {
    // One convention means one class. A second class would be a second convention.
    expect(Object.keys(focus)).toEqual(['focusRing'])
  })
})

/**
 * A nested pairing whose system makes the given choices, so a test reads the
 * choice through the cascade and the style query, as an application does.
 */
function pairing(
  name: string,
  overrides: SystemOverrides,
): { host: HTMLElement; theme: ResolvedTheme } {
  const theme = resolveTheme(
    composeTheme({ ...exampleQuietSystem, name, overrides }, exampleVioletPalette),
  )
  appendThemeCSS(emitThemeCSS(theme), theme.name)
  const host = document.createElement('div')
  host.setAttribute('data-system', theme.system)
  host.setAttribute('data-palette', theme.palette)
  host.setAttribute('data-mode', 'light')
  document.body.append(host)
  return { host, theme }
}

/** A property's computed value for `value`, resolved inside `host`'s pairing. */
function resolved(
  host: HTMLElement,
  property: 'outlineColor' | 'boxShadow',
  value: string,
): string {
  const probe = document.createElement('div')
  probe.style[property] = value
  if (property === 'outlineColor') probe.style.outlineStyle = 'solid'
  host.append(probe)
  const computed = getComputedStyle(probe)[property]
  probe.remove()
  return computed
}

describe('the field style', () => {
  it('draws a focused field’s outline inside its edge, in the solid focus colour, over its seat', () => {
    const { host, theme } = pairing('example-field-border', { focus: { field: 'border' } })
    const { container } = render(
      <div className={focus.focusRing}>
        <input aria-label="Name" />
      </div>,
      { container: host.appendChild(document.createElement('div')) },
    )
    const field = container.firstElementChild as HTMLElement
    container.querySelector('input')!.focus({ focusVisible: true } as FocusOptions)

    const computed = getComputedStyle(field)
    // Still an outline at the system's width: the accessibility surface is unchanged.
    expect(computed.outlineStyle).toBe('solid')
    expect(computed.outlineWidth).toBe(theme.tokens.focus.width)
    expect(computed.outlineOffset).toBe(`-${theme.tokens.focus.width}`)
    expect(computed.outlineColor).toBe(
      resolved(host, 'outlineColor', 'var(--pm-border-focus-solid)'),
    )
    expect(computed.boxShadow).toBe(resolved(host, 'boxShadow', 'var(--pm-shadow-seat)'))
  })

  it('applies to a textarea and a combobox trigger, and leaves every other part its ring', () => {
    const { host, theme } = pairing('example-field-parts', { focus: { field: 'border' } })
    const mount = (node: React.ReactElement) =>
      render(node, { container: host.appendChild(document.createElement('div')) }).container
        .firstElementChild as HTMLElement

    const textarea = mount(<textarea className={focus.focusRing} aria-label="Notes" />)
    const trigger = mount(
      <button type="button" role="combobox" aria-expanded="false" className={focus.focusRing}>
        Pick
      </button>,
    )
    const button = mount(
      <button type="button" className={focus.focusRing}>
        Save
      </button>,
    )
    for (const element of [textarea, trigger]) {
      element.focus({ focusVisible: true } as FocusOptions)
      expect(getComputedStyle(element).outlineOffset, element.tagName).toBe(
        `-${theme.tokens.focus.width}`,
      )
    }
    button.focus({ focusVisible: true } as FocusOptions)
    expect(getComputedStyle(button).outlineOffset).toBe(theme.tokens.focus.offset)
  })

  it('keeps the ring on an invalid field, so the danger border stays visible', () => {
    const { host, theme } = pairing('example-field-invalid', { focus: { field: 'border' } })
    const { container } = render(
      <textarea className={focus.focusRing} aria-label="Notes" aria-invalid="true" />,
      { container: host.appendChild(document.createElement('div')) },
    )
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    textarea.focus({ focusVisible: true } as FocusOptions)
    expect(getComputedStyle(textarea).outlineStyle).toBe('solid')
    expect(getComputedStyle(textarea).outlineOffset).toBe(theme.tokens.focus.offset)
  })

  it('draws the ring around a field where the system keeps the default', () => {
    const { host, theme } = pairing('example-field-ring', {})
    const { container } = render(<textarea className={focus.focusRing} aria-label="Notes" />, {
      container: host.appendChild(document.createElement('div')),
    })
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    textarea.focus({ focusVisible: true } as FocusOptions)
    expect(getComputedStyle(textarea).outlineOffset).toBe(theme.tokens.focus.offset)
    expect(getComputedStyle(textarea).outlineColor).toBe(
      resolved(host, 'outlineColor', 'var(--pm-border-focus)'),
    )
  })
})
