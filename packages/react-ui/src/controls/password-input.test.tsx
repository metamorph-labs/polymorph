import { render, screen } from '@testing-library/react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { FormField } from './FormField'
import { Input } from './Input'
import { PasswordInput, type PasswordInputProps } from './PasswordInput'
import { tokenLength } from './token-probe'

/**
 * PasswordInput, in a real browser.
 *
 * The main check is the toggle: reveal changes the same node's `type` in place, and the
 * node keeps its value, caret and autocomplete wiring. The other tests check that a
 * revealed password is still treated as a secret, and that the toggle uses
 * `aria-pressed` with a constant name.
 */

beforeAll(installTestTheme)

const field = () => document.querySelector('input') as HTMLInputElement
const toggle = () => screen.getByRole('button', { name: 'Show password' })
const root = () => document.querySelector('[data-state]') as HTMLElement

function mount(overrides: Partial<PasswordInputProps> = {}) {
  return render(<PasswordInput toggleLabel="Show password" aria-label="Password" {...overrides} />)
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<PasswordInputProps>(true)
  })
})

describe('toggling never remounts the input', () => {
  it('keeps the same node, its value and its wiring across reveal and re-mask', async () => {
    mount({ defaultValue: 'hunter2', autoComplete: 'new-password' })
    const node = field()
    expect(node.type).toBe('password')

    await userEvent.click(toggle())
    expect(field()).toBe(node)
    expect(node.type).toBe('text')
    expect(node.value).toBe('hunter2')
    expect(node.getAttribute('autocomplete')).toBe('new-password')

    await userEvent.click(toggle())
    expect(field()).toBe(node)
    expect(node.type).toBe('password')
    expect(node.value).toBe('hunter2')
  })

  it('keeps the caret where the user left it', async () => {
    mount({ defaultValue: 'hunter2' })
    const node = field()
    node.focus()
    node.setSelectionRange(3, 3)

    await userEvent.click(toggle())
    expect(node.selectionStart).toBe(3)
    expect(node.selectionEnd).toBe(3)
  })

  it('reports the state on the root: hidden, then visible', async () => {
    mount()
    expect(root().dataset['state']).toBe('hidden')
    await userEvent.click(toggle())
    expect(root().dataset['state']).toBe('visible')
  })
})

describe('a revealed password is still a secret', () => {
  it('never lets the value reach a spellcheck or correction service', async () => {
    mount({ defaultValue: 'hunter2' })
    await userEvent.click(toggle())
    const node = field()
    expect(node.type).toBe('text')
    expect(node.spellcheck).toBe(false)
    expect(node.getAttribute('autocapitalize')).toBe('off')
    expect(node.getAttribute('autocorrect')).toBe('off')
  })

  it('identifies itself to managers as a password field by default', () => {
    mount()
    expect(field().getAttribute('autocomplete')).toBe('current-password')
  })
})

describe('the toggle', () => {
  it('is a real pressed-state button whose name never changes', async () => {
    mount()
    expect(toggle().getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(toggle())
    // The name stays the same. Changing it to "Hide password" while
    // `aria-pressed="true"` would announce the state twice.
    expect(screen.getByRole('button', { name: 'Show password' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('renders on an empty field', () => {
    mount()
    expect(toggle()).toBeTruthy()
  })

  it('is disabled with the field, and the frame keeps its shape', () => {
    mount({ disabled: true })
    expect((toggle() as HTMLButtonElement).disabled).toBe(true)
    expect(root().hasAttribute('data-disabled')).toBe(true)
  })

  it('stays enabled on a readOnly field, where a generated password needs revealing', async () => {
    mount({ readOnly: true, defaultValue: 'k9!vX2#mQ8' })
    expect((toggle() as HTMLButtonElement).disabled).toBe(false)
    await userEvent.click(toggle())
    expect(field().type).toBe('text')
  })
})

describe('the field wiring', () => {
  it('reaches the input through FormField: label, description, required', () => {
    render(
      <FormField label="Password" description="At least 12 characters." required id="pw">
        <PasswordInput toggleLabel="Show password" />
      </FormField>,
    )
    const node = field()
    expect(node.id).toBe('pw')
    expect(screen.getByText('Password').closest('label')?.htmlFor).toBe('pw')
    expect(node.getAttribute('aria-describedby')).toBe('pw-description')
    expect(node.getAttribute('aria-required')).toBe('true')
  })

  it('marks invalid on the frame and the input, never on the toggle', () => {
    mount({ invalid: true })
    expect(root().hasAttribute('data-invalid')).toBe(true)
    expect(field().getAttribute('aria-invalid')).toBe('true')
    expect(toggle().hasAttribute('aria-invalid')).toBe(false)
  })

  it('reports change through the composed Input', async () => {
    const onChange = vi.fn()
    mount({ onChange })
    await userEvent.click(field())
    await userEvent.keyboard('s3cret')
    expect(onChange).toHaveBeenLastCalledWith('s3cret', expect.anything())
    expect(field().value).toBe('s3cret')
  })
})

/**
 * The width of the inner Input, which would otherwise not fill the wrapper (visible on
 * AuthPage).
 *
 * This is `form-field.test.tsx`'s check, one level down. A column-labelled FormField
 * stretches this member's root, because flex items are blockified, but not the child.
 * The Input inside is a flex item of that root at `flex: 0 1 auto`, so without the grow
 * rule it sizes to its content and the password field is narrower than the email Input
 * above it. So every assertion below is on the Input's frame, which users see as the
 * field. The root always has the right width.
 *
 * The fixture alone cannot catch this. It places a PasswordInput in a stretched column,
 * but a gallery only shows the width and does not assert it.
 */
describe('it fills the width it is given', () => {
  const WIDE = 640

  /** The harness from `form-field.test.tsx`: the container is sized and the field is not. */
  function inWideColumn(node: React.ReactElement): HTMLElement {
    const { container } = render(node)
    ;(container as HTMLElement).style.inlineSize = `${WIDE}px`
    return container.firstElementChild as HTMLElement
  }

  /** The Input's bordered frame, not the bare `<input>`, because the frame is the field. */
  const frame = () => field().parentElement as HTMLElement

  it('stretches the composed Input to the width of a column-labelled field', () => {
    const column = inWideColumn(
      <FormField label="Password">
        <PasswordInput toggleLabel="Show password" />
      </FormField>,
    )
    expect(column.getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
    expect(frame().getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
  })

  it('matches the width of the Input next to it, as on AuthPage', () => {
    // An email Input and a password field in one card. Users notice when two fields
    // of the same form have different widths.
    const { container } = render(
      <>
        <FormField label="Email">
          <Input type="email" />
        </FormField>
        <FormField label="Password">
          <PasswordInput toggleLabel="Show password" />
        </FormField>
      </>,
    )
    ;(container as HTMLElement).style.inlineSize = `${WIDE}px`

    const [email, password] = [...container.querySelectorAll('input')].map(
      (node) => node.parentElement as HTMLElement,
    )
    expect(email?.getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
    expect(password?.getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
  })

  it('keeps its own width when nothing stretches it', () => {
    // The rule uses grow rather than `inline-size: 100%`. An unstretched
    // PasswordInput is as wide as its content, like an Input, not as wide as the page.
    // The root and the field inside it share the same edges in both cases.
    const root = inWideColumn(<PasswordInput toggleLabel="Show password" aria-label="Password" />)
    const width = root.getBoundingClientRect().width
    expect(width).toBeLessThan(WIDE)
    expect(frame().getBoundingClientRect().width).toBeCloseTo(width, 0)
  })
})

describe('the focus-zoom floor, below 30rem, through composition', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('comes from the composed Input, which sets the input to the text-entry floor’s size', async () => {
    await page.viewport(420, 800)
    mount()

    // The spec refers to Input's rule instead of restating it (`password-input.md`).
    // The floor belongs to Input, and rendering Input applies it. SearchInput uses the
    // same composition, so testing one member covers both.
    await vi.waitFor(() => {
      expect(getComputedStyle(field()).fontSize).toBe(tokenLength('--pm-text-entry-size'))
    })
  })
})
