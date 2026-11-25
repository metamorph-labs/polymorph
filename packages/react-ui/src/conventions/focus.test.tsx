import { render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

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
import { Button } from '../controls/Button'
import { Checkbox } from '../controls/Checkbox'
import { Input } from '../controls/Input'
import { Link } from '../controls/Link'
import { Tabs } from '../overlays/Tabs'

/**
 * Tests the focus convention on its own, apart from any component that
 * composes it, and then on the members whose mark it decides. Every component
 * shares this module, so a bug here appears in all of them.
 */

let theme: ReturnType<typeof installTestTheme>

beforeAll(() => {
  theme = installTestTheme()
})

/** Stylesheets a test adds, removed after it so a rule cannot reach the next test. */
const probes: HTMLStyleElement[] = []
afterEach(() => {
  for (const probe of probes.splice(0)) probe.remove()
})

/**
 * A rule from a stylesheet, not an inline style, because an inline declaration
 * would outrank the convention and the test would check nothing.
 */
function sheet(css: string): void {
  const probe = document.createElement('style')
  probe.textContent = css
  document.head.append(probe)
  probes.push(probe)
}

const px = (value: string) => Number.parseFloat(value)

/** WCAG's contrast ratio between two computed `rgb()` colours, the measure the focus floor uses. */
function ratio(a: string, b: string): number {
  const luminance = (value: string) => {
    const [r, g, bl] = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map((channel) => {
      const c = Number(channel) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0)
  }
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
}

/**
 * A button that composes one placement class (`focusRing` unless another is named) and, after
 * it, the classes a test adds.
 */
function focusable(
  className = '',
  parent: HTMLElement = document.body,
  placement: string | undefined = focus.focusRing,
): HTMLButtonElement {
  const { container } = render(
    <button type="button" className={`${placement} ${className}`}>
      Focus me
    </button>,
    { container: parent.appendChild(document.createElement('div')) },
  )
  return container.querySelector('button') as HTMLButtonElement
}

/** Keyboard focus, not `.focus()` on a mouse path, because the convention targets `:focus-visible`. */
function focusVisibly(element: HTMLElement): CSSStyleDeclaration {
  element.focus({ focusVisible: true } as FocusOptions)
  return getComputedStyle(element)
}

/** A property's computed value for `value`, resolved inside `host`'s pairing. */
function resolved(
  host: HTMLElement,
  property: 'outlineColor' | 'borderTopColor',
  value: string,
): string {
  const probe = document.createElement('div')
  probe.style[property] = value
  probe.style.outlineStyle = 'solid'
  probe.style.borderTopStyle = 'solid'
  host.append(probe)
  const computed = getComputedStyle(probe)[property]
  probe.remove()
  return computed
}

describe('the focus mark', () => {
  it('draws nothing until the element is focused', () => {
    expect(getComputedStyle(focusable()).outlineStyle).toBe('none')
  })

  it('takes its width, offset and colour from tokens', () => {
    const computed = focusVisibly(focusable())
    expect(computed.outlineStyle).toBe('solid')
    expect(computed.outlineWidth).toBe(theme.tokens.focus.width)
    expect(computed.outlineOffset).toBe(theme.tokens.focus.offset)
    expect(computed.outlineColor).toBe(
      resolved(document.body, 'outlineColor', 'var(--pm-border-focus-solid)'),
    )
  })

  it('lies inside the edge by its own width, so nothing is drawn outside the part', () => {
    // An outline at minus its width covers the border box's outer pixels and reaches no further,
    // so a container that clips its content cannot cut it.
    const computed = focusVisibly(focusable())
    expect(px(computed.outlineOffset)).toBe(-px(computed.outlineWidth))
    expect(px(computed.outlineOffset) + px(computed.outlineWidth)).toBe(0)
  })

  it('draws no glow, so forced colours keep the whole of it', () => {
    expect(focusVisibly(focusable()).boxShadow).toBe('none')
  })

  it('leaves the border its own colour while the mark lies inside the edge', () => {
    // The mark covers the border, and a fill's gap shows the fill up to its edge, so the border
    // recolour applies only where a system moves the mark outside (below).
    sheet('.bordered { border: 1px solid rgb(1, 2, 3) }')
    expect(focusVisibly(focusable('bordered')).borderTopColor).toBe('rgb(1, 2, 3)')
  })

  it('moves inside a border that carries state, so the state and the mark both show', () => {
    // An invalid field, a selected cell and a range endpoint draw their state in their border. The
    // mark moves in by the 1px hairline every recipe draws, so the outline ends where the border
    // begins and covers none of it.
    sheet('.bordered { border: 1px solid rgb(1, 2, 3) }')
    for (const [label, value] of [
      ['aria-invalid', 'true'],
      ['data-invalid', ''],
      ['data-selected', ''],
      ['data-range-start', ''],
      ['data-range-end', ''],
    ] as const) {
      const button = focusable('bordered')
      button.setAttribute(label, value)
      const computed = focusVisibly(button)
      expect(computed.outlineOffset, label).toBe(`${px(theme.tokens.focus.offset) - 1}px`)
      expect(-px(computed.outlineOffset), label).toBe(
        px(computed.outlineWidth) + px(computed.borderTopWidth),
      )
      expect(computed.borderTopColor, label).toBe('rgb(1, 2, 3)')
    }
  })

  it('lies inside a fill with a gap, in the label colour, through the hooks its recipe sets', () => {
    // A solid fill can match the focus colour, so a filled part's recipe sets both hooks on its
    // own focused state: the line takes the label colour the fill is held to, and moves in by one
    // more width, so the fill shows on both sides of it and the line never meets the page.
    sheet(
      '.filled { color: rgb(10, 20, 30); background: rgb(200, 210, 220) }' +
        '.filled:focus-visible { --pm-focus-mark: currentcolor; ' +
        '--pm-focus-inset: var(--pm-focus-width) }',
    )
    const computed = focusVisibly(focusable('filled'))
    expect(computed.outlineColor).toBe('rgb(10, 20, 30)')
    expect(computed.outlineOffset).toBe(`${-2 * px(theme.tokens.focus.width)}px`)
  })

  it('adds the state border to the fill’s gap, so a selected filled cell shows both', () => {
    sheet(
      '.filledCell { color: rgb(10, 20, 30); background: rgb(200, 210, 220);' +
        ' border: 1px solid rgb(1, 2, 3) }' +
        '.filledCell:focus-visible { --pm-focus-mark: currentcolor; ' +
        '--pm-focus-inset: var(--pm-focus-width) }',
    )
    const cell = focusable('filledCell')
    cell.setAttribute('data-selected', '')
    const computed = focusVisibly(cell)
    expect(computed.outlineOffset).toBe(`${-2 * px(theme.tokens.focus.width) - 1}px`)
    expect(computed.borderTopColor).toBe('rgb(1, 2, 3)')
  })

  it('keeps a part from taking the hook from a part around it', () => {
    // The hook inherits, so a value set on an ancestor would reach every part inside it. Each part
    // starts without it and takes the focus colour.
    const around = document.body.appendChild(document.createElement('div'))
    around.style.setProperty('--pm-focus-mark', 'rgb(10, 20, 30)')
    expect(focusVisibly(focusable('', around)).outlineColor).toBe(
      resolved(document.body, 'outlineColor', 'var(--pm-border-focus-solid)'),
    )
    around.remove()
  })

  it('exports one class per placement, and a part composes exactly one', () => {
    // A part chooses its placement by its shape, never its own mark: inside the edge, with the
    // fill hooks inside a fill (`focusRing`), or around a part that cannot hold the line, a small
    // control or a text box (`focusAround`). A third class would be a second convention.
    expect(Object.keys(focus).sort()).toEqual(['focusAround', 'focusRing'])
    for (const name of ['focusAround', 'focusRing'] as const) {
      expect(String(focus[name]).split(' '), name).toHaveLength(1)
    }
  })
})

describe('the placements', () => {
  const tokenPx = (name: string) => {
    const probe = document.body.appendChild(document.createElement('div'))
    probe.style.width = `var(${name})`
    const value = px(getComputedStyle(probe).width)
    probe.remove()
    return value
  }

  it('goes around a text box with a gap, so the line touches no letter', () => {
    // A line inside a box that is its text would cross the first and last letters, and a line on
    // its edge would touch them. Around it, `--pm-space-1` out, the letters stand clear.
    const computed = focusVisibly(focusable('', document.body, focus.focusAround))
    expect(px(computed.outlineOffset)).toBe(tokenPx('--pm-space-1'))
    expect(px(computed.outlineOffset)).toBeGreaterThan(0)
    expect(computed.outlineWidth).toBe(theme.tokens.focus.width)
    expect(computed.outlineColor).toBe(
      resolved(document.body, 'outlineColor', 'var(--pm-border-focus-solid)'),
    )
  })

  it('keeps the gap on a text box that carries a state attribute, because no border is drawn there', () => {
    // A tab carries `data-selected`, and the state rule moves only a mark inside the edge.
    const tab = focusable('', document.body, focus.focusAround)
    tab.setAttribute('data-selected', '')
    expect(px(focusVisibly(tab).outlineOffset)).toBe(tokenPx('--pm-space-1'))
  })

  it('goes around a small control with a gap, in the focus colour, in every state', () => {
    // A checked box keeps its accent border and fill; the line sits `--pm-space-1` outside it in
    // the focus colour, whatever hook a filled state would set, so the control does not change
    // placement with its state.
    sheet(
      '.small { border: 1px solid rgb(1, 2, 3); background: rgb(10, 20, 30) }' +
        '.small:focus-visible { --pm-focus-mark: rgb(250, 250, 250); ' +
        '--pm-focus-inset: var(--pm-focus-width) }',
    )
    for (const state of ['unchecked', 'checked']) {
      const box = focusable('small', document.body, focus.focusAround)
      box.setAttribute('data-state', state)
      box.setAttribute('aria-invalid', state === 'checked' ? 'true' : 'false')
      const computed = focusVisibly(box)
      expect(px(computed.outlineOffset), state).toBe(tokenPx('--pm-space-1'))
      expect(computed.outlineColor, state).toBe(
        resolved(document.body, 'outlineColor', 'var(--pm-border-focus-solid)'),
      )
      // The border carries the control's state and keeps its colour.
      expect(computed.borderTopColor, state).toBe('rgb(1, 2, 3)')
    }
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

function mountIn(host: HTMLElement, node: React.ReactElement): HTMLElement {
  return render(node, { container: host.appendChild(document.createElement('div')) }).container
    .firstElementChild as HTMLElement
}

describe('a system that moves the mark outside', () => {
  it('draws it at the system’s offset, in the focus colour, on a filled part too', () => {
    // Outside the edge the mark sits on the surface behind the part, where the fill's label
    // colour says nothing, so neither hook applies.
    const { host, theme } = pairing('example-focus-outside', { focus: { offset: 2 } })
    sheet(
      '.filled { color: rgb(10, 20, 30); background: rgb(200, 210, 220) }' +
        '.filled:focus-visible { --pm-focus-mark: currentcolor; ' +
        '--pm-focus-inset: var(--pm-focus-width) }',
    )
    const computed = focusVisibly(focusable('filled', host))
    expect(theme.tokens.focus.place).toBe('outside')
    expect(computed.outlineOffset).toBe('2px')
    expect(computed.outlineColor).toBe(
      resolved(host, 'outlineColor', 'var(--pm-border-focus-solid)'),
    )
    host.remove()
  })

  it('recolours a border to the focus colour there, but not when invalid', () => {
    // A bordered fixture is checked both ways, because the invalid case protects data: a danger
    // border must survive focus.
    const { host } = pairing('example-focus-outside-recolour', { focus: { offset: 2 } })
    sheet('.bordered { border: 1px solid rgb(1, 2, 3) }')
    const button = focusable('bordered', host)
    expect(focusVisibly(button).borderTopColor).toBe(
      resolved(host, 'borderTopColor', 'var(--pm-border-focus-solid)'),
    )
    button.blur()
    button.setAttribute('aria-invalid', 'true')
    expect(focusVisibly(button).borderTopColor).toBe('rgb(1, 2, 3)')
    host.remove()
  })

  it('keeps the gap around at the system’s offset where it is larger', () => {
    const { host } = pairing('example-focus-outside-placements', { focus: { offset: 4 } })
    expect(focusVisibly(focusable('', host, focus.focusAround)).outlineOffset).toBe('4px')
    host.remove()
  })

  it('leaves a border that carries state uncovered at the system’s offset', () => {
    const { host } = pairing('example-focus-outside-state', { focus: { offset: 0 } })
    const button = focusable('', host)
    button.setAttribute('aria-invalid', 'true')
    expect(focusVisibly(button).outlineOffset).toBe('0px')
    host.remove()
  })
})

describe('the field style', () => {
  it('draws a focused field’s mark inside its edge where the system moves every other mark outside', () => {
    const { host, theme } = pairing('example-field-border', {
      focus: { offset: 0, field: 'border' },
    })
    const inside = `-${theme.tokens.focus.width}`
    const field = mountIn(
      host,
      <div className={focus.focusRing}>
        <input aria-label="Name" />
      </div>,
    )
    field.querySelector('input')!.focus({ focusVisible: true } as FocusOptions)
    const computed = getComputedStyle(field)
    // Still an outline at the system's width: the accessibility surface is unchanged.
    expect(computed.outlineStyle).toBe('solid')
    expect(computed.outlineWidth).toBe(theme.tokens.focus.width)
    expect(computed.outlineOffset).toBe(inside)
    expect(computed.outlineColor).toBe(
      resolved(host, 'outlineColor', 'var(--pm-border-focus-solid)'),
    )

    const textarea = mountIn(host, <textarea className={focus.focusRing} aria-label="Notes" />)
    const trigger = mountIn(
      host,
      <button type="button" role="combobox" aria-expanded="false" className={focus.focusRing}>
        Pick
      </button>,
    )
    for (const element of [textarea, trigger]) {
      expect(focusVisibly(element).outlineOffset, element.tagName).toBe(inside)
    }
    const button = mountIn(
      host,
      <button type="button" className={focus.focusRing}>
        Save
      </button>,
    )
    expect(focusVisibly(button).outlineOffset).toBe('0px')
    host.remove()
  })

  it('draws an invalid field’s mark inside its danger border, so both show', () => {
    const { host, theme } = pairing('example-field-invalid', {
      focus: { offset: 0, field: 'border' },
    })
    const textarea = mountIn(
      host,
      <textarea className={focus.focusRing} aria-label="Notes" aria-invalid="true" />,
    )
    const computed = focusVisibly(textarea)
    expect(computed.outlineStyle).toBe('solid')
    expect(computed.outlineOffset).toBe(`-${px(theme.tokens.focus.width) + 1}px`)
    host.remove()
  })

  it('changes nothing where the system keeps the derived offset', () => {
    const { host, theme } = pairing('example-field-default', { focus: { field: 'border' } })
    const textarea = mountIn(host, <textarea className={focus.focusRing} aria-label="Notes" />)
    const button = mountIn(
      host,
      <button type="button" className={focus.focusRing}>
        Save
      </button>,
    )
    expect(focusVisibly(textarea).outlineOffset).toBe(theme.tokens.focus.offset)
    expect(focusVisibly(button).outlineOffset).toBe(theme.tokens.focus.offset)
    host.remove()
  })
})

/**
 * The members whose mark the convention decides, in the browser's computed
 * style: what a person sees is the outline's width, where it lies against the
 * edge, and its colour against what it is drawn on.
 */
describe('the mark on the members', () => {
  const focusColour = () => resolved(document.body, 'outlineColor', 'var(--pm-border-focus-solid)')
  const pageColour = () => resolved(document.body, 'outlineColor', 'var(--pm-bg-app)')
  /** The gap the around placement leaves: `--pm-space-1`, in px. */
  const gap = () => {
    const probe = document.body.appendChild(document.createElement('div'))
    probe.style.width = 'var(--pm-space-1)'
    const value = px(getComputedStyle(probe).width)
    probe.remove()
    return value
  }

  it('lies on a field’s border and the pixels inside it, in the focus colour', () => {
    const field = render(<Input aria-label="Subject" />).container.firstElementChild as HTMLElement
    field.querySelector('input')!.focus({ focusVisible: true } as FocusOptions)
    const computed = getComputedStyle(field)
    expect(computed.outlineWidth).toBe(theme.tokens.focus.width)
    expect(computed.outlineOffset).toBe(`-${theme.tokens.focus.width}`)
    expect(computed.outlineColor).toBe(focusColour())
    // The border is under the mark: the field reads as its border thickening inward.
    expect(px(computed.outlineWidth)).toBeGreaterThanOrEqual(px(computed.borderTopWidth))
  })

  it('lies just inside an outlined Button’s edge, in the focus colour', () => {
    const button = render(<Button label="Save" variant="outline" tone="neutral" />).container
      .firstElementChild as HTMLButtonElement
    const computed = focusVisibly(button)
    expect(computed.outlineWidth).toBe(theme.tokens.focus.width)
    expect(computed.outlineOffset).toBe(`-${theme.tokens.focus.width}`)
    expect(computed.outlineColor).toBe(focusColour())
  })

  it('lies inside a solid Button’s fill with a gap, in its label colour, clearly against the fill', () => {
    // The label colour is held on the fill, not on the page. At the fill's edge the line sat
    // against the page, where a dark label on a dark page, or a white one on a white page, shows
    // nothing. So the line moves in by one more width: the fill is on both sides of it, and what
    // the line is seen against is the fill, at 3:1 or more.
    for (const tone of ['accent', 'danger'] as const) {
      const button = render(<Button label="Save" variant="solid" tone={tone} />).container
        .firstElementChild as HTMLButtonElement
      const computed = focusVisibly(button)
      const width = px(theme.tokens.focus.width)
      expect(computed.outlineWidth, tone).toBe(theme.tokens.focus.width)
      expect(computed.outlineOffset, tone).toBe(`${-2 * width}px`)
      expect(computed.outlineColor, tone).toBe(computed.color)
      expect(ratio(computed.outlineColor, computed.backgroundColor), tone).toBeGreaterThanOrEqual(3)
    }
  })

  it('goes around a checkbox with a gap, in the focus colour, checked or not', () => {
    for (const defaultChecked of [false, true]) {
      const row = render(<Checkbox label="Email me" defaultChecked={defaultChecked} />).container
      const box = row.querySelector('[role="checkbox"]') as HTMLElement
      const computed = focusVisibly(box)
      expect(px(computed.outlineOffset), String(defaultChecked)).toBeGreaterThan(0)
      expect(computed.outlineColor, String(defaultChecked)).toBe(focusColour())
      // On the page the line is drawn on, the focus colour reaches the focus floor.
      expect(ratio(computed.outlineColor, pageColour())).toBeGreaterThanOrEqual(3)
    }
  })

  it('goes around a tab’s label with a gap, because its box has no inline padding', () => {
    const { container } = render(
      <Tabs
        tabs={[
          { value: 'one', label: 'Overview' },
          { value: 'two', label: 'Activity' },
        ]}
      >
        <Tabs.Content value="one">
          <p>One</p>
        </Tabs.Content>
        <Tabs.Content value="two">
          <p>Two</p>
        </Tabs.Content>
      </Tabs>,
    )
    const tab = container.querySelector('[role="tab"]') as HTMLElement
    const computed = focusVisibly(tab)
    expect(px(computed.outlineOffset)).toBe(gap())
    expect(computed.outlineColor).toBe(focusColour())
  })

  it('keeps an invalid field’s danger border visible, with the mark inside it', () => {
    const field = render(<Input aria-label="Subject" invalid />).container
      .firstElementChild as HTMLElement
    field.querySelector('input')!.focus({ focusVisible: true } as FocusOptions)
    const computed = getComputedStyle(field)
    expect(computed.outlineWidth).toBe(theme.tokens.focus.width)
    expect(computed.outlineOffset).toBe(`-${px(theme.tokens.focus.width) + 1}px`)
    expect(computed.outlineColor).toBe(focusColour())
    // The outline ends where the border begins, so none of the border is under it.
    expect(-px(computed.outlineOffset)).toBe(
      px(computed.outlineWidth) + px(computed.borderTopWidth),
    )
    expect(computed.borderTopColor).toBe(
      resolved(document.body, 'borderTopColor', 'var(--pm-danger-border)'),
    )
  })

  it('goes around a text link’s box with a gap, so the line touches no letter', () => {
    for (const variant of ['inline', 'standalone'] as const) {
      const link = render(
        <Link href="#ticket" variant={variant}>
          Ticket 4182
        </Link>,
      ).container.firstElementChild as HTMLAnchorElement
      const computed = focusVisibly(link)
      expect(computed.outlineStyle, variant).toBe('solid')
      expect(computed.outlineWidth, variant).toBe(theme.tokens.focus.width)
      expect(px(computed.outlineOffset), variant).toBe(gap())
      expect(computed.outlineColor, variant).toBe(focusColour())
    }
  })

  it('keeps Button’s mark inside the edge on a link drawn as a Button', () => {
    const link = render(
      <Link href="#ticket" variant="button" buttonVariant="outline">
        Ticket 4182
      </Link>,
    ).container.firstElementChild as HTMLAnchorElement
    expect(focusVisibly(link).outlineOffset).toBe(`-${theme.tokens.focus.width}`)
  })
})
