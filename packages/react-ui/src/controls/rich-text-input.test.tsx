import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { RichTextInput, type RichTextInputProps } from './RichTextInput'

/**
 * DECIDE: what is worth a real browser.
 *
 * This project's component tests run in chromium, so the claims worth writing
 * here are the ones only a browser can settle: computed geometry against a
 * token, a focus order, a state that a substrate — not a prop — produces. Claims
 * the states fixture already makes do not need restating; `laws.test.tsx`
 * renders every entry and audits it.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<RichTextInputProps>(true)
  })
})

describe('RichTextInput', () => {
  it('renders what it was handed', () => {
    render(<RichTextInput label="A rich-text-input" />)
    expect(screen.getByText('A rich-text-input')).toBeTruthy()
  })
})
