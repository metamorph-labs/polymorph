import { describe, expect, it } from 'vitest'

import iconSet from '../../../../design/icons.json' with { type: 'json' }
import { APP_FILE, jsxRuleTester } from './rule-tester'
import { TRAILING_ROLES, trailingIcon } from './trailing-icon'

describe('the trailing roles', () => {
  it('are roles the icon set has, and no back arrow', () => {
    for (const role of TRAILING_ROLES) expect(Object.keys(iconSet.roles), role).toContain(role)
    expect(TRAILING_ROLES).not.toContain('back')
    expect(TRAILING_ROLES).not.toContain('previous')
  })
})

jsxRuleTester().run('trailing-icon', trailingIcon, {
  valid: [
    {
      filename: APP_FILE,
      code: `export const A = () => <Button trailingIcon="next" label="Continue" />`,
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <Button trailingIcon="open-external" label="Docs" />`,
    },
    { filename: APP_FILE, code: `export const A = () => <Button icon="delete" label="Delete" />` },
    // A computed role is not read, and a declared zone lifts the rule.
    {
      filename: APP_FILE,
      code: `export const A = () => <Button trailingIcon={role} label="Go" />`,
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <Bespoke reason="Kiosk keypad as the hardware labels it"><Button trailingIcon="delete" label="Del" /></Bespoke>`,
    },
  ],

  invalid: [
    {
      filename: APP_FILE,
      code: `export const A = () => <Button trailingIcon="delete" label="Delete volume" />`,
      output: `export const A = () => <Button icon="delete" label="Delete volume" />`,
      errors: [
        {
          message:
            'Unexpected trailing icon "delete" on <Button>: an icon leads its label. Use `icon="delete"` (rung 1). Only collapse, down, expand, forward, next and open-external follow it.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <Button trailingIcon={'back'} label="Back" />`,
      output: `export const A = () => <Button icon={'back'} label="Back" />`,
      errors: [{ messageId: 'notTrailing' }],
    },
    // With a leading icon too, one of the two has to go, which is a choice.
    {
      filename: APP_FILE,
      code: `export const A = () => <Button icon="add" trailingIcon="user" label="Invite" />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected trailing icon "user" on <Button>: an icon leads its label. Drop it, or use `icon="user"` instead of the other (rung 1).',
        },
      ],
    },
  ],
})
