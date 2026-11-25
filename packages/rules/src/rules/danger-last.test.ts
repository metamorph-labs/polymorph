import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DANGER_ORDER } from '../usage'
import { dangerLast } from './danger-last'
import { APP_FILE, jsxRuleTester } from './rule-tester'

const FIRST =
  'Unexpected <Button tone="danger"> before another Button in its group: the destructive one comes last, so the safe one is met first. Move it last, or into a group of its own (rung 1).'

jsxRuleTester().run('danger-last', dangerLast, {
  valid: [
    // Last in one group.
    {
      filename: APP_FILE,
      code: `export const A = () => <Inline><Button variant="outline" tone="neutral" label="Keep" /><Button tone="danger" label="Delete" /></Inline>`,
    },
    // Alone in a group of its own, before the group that holds the main Button: a page's
    // tertiary action at the start of its actions.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Inline justify="between">
                 <Button variant="ghost" tone="danger" label="Delete ticket" />
                 <Inline gap={3}><Button variant="outline" tone="neutral" label="Cancel" /><Button label="Save" /></Inline>
               </Inline>
             )`,
    },
    // FormPage's `leadingAction` is a prop of its own, so the action there is a group of its own.
    {
      filename: APP_FILE,
      code: `export const A = () => <FormPage title="Edit" leadingAction={<Button variant="ghost" tone="danger" label="Delete" />} actions={<><Button variant="outline" tone="neutral" label="Cancel" /><Button label="Save" /></>} />`,
    },
    // A Separator between Buttons of one element divides them into two groups.
    {
      filename: APP_FILE,
      code: `export const A = () => <Inline><Button variant="ghost" tone="danger" label="Clear" /><Separator orientation="vertical" /><Button label="Save" /></Inline>`,
    },
    // Two danger Buttons in a row, and Buttons in different rows.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Stack>
                 <Inline><Button tone="danger" label="Delete" /><Button variant="ghost" tone="danger" label="Archive" /></Inline>
                 <Inline><Button label="Save" /></Inline>
               </Stack>
             )`,
    },
    // A computed tone is neither, and a Link is not a Button.
    {
      filename: APP_FILE,
      code: `export const A = () => <Inline><Button tone="danger" label="Delete" /><Button tone={tone} label="Undo" /><Link href="/help">Help</Link></Inline>`,
    },
    // Buttons written by a call are not places in the row.
    {
      filename: APP_FILE,
      code: `export const A = () => <Inline><Button tone="danger" label="Delete" />{extra.map((x) => <Button key={x} label={x} />)}</Inline>`,
    },
    // Two JSX expressions are two trees, never one row.
    {
      filename: APP_FILE,
      code: `export const A = () => confirm(<Button tone="danger" label="Delete" />)
             export const B = () => <Button label="Save" />`,
    },
    // A declared zone lifts the rule.
    {
      filename: APP_FILE,
      code: `export const A = () => <Bespoke reason="Legacy toolbar kept as it shipped"><Button tone="danger" label="Delete" /><Button label="Save" /></Bespoke>`,
    },
  ],

  invalid: [
    // First in one group.
    {
      filename: APP_FILE,
      code: `export const A = () => <Inline><Button tone="danger" label="Delete" /><Button variant="outline" tone="neutral" label="Cancel" /></Inline>`,
      errors: [{ message: FIRST, column: 32 }],
    },
    // Passed beside the others in one prop, it is in their group.
    {
      filename: APP_FILE,
      code: `export const A = () => <FormPage title="Edit" actions={<><Button variant="ghost" tone="danger" label="Delete" /><Button variant="outline" tone="neutral" label="Cancel" /><Button label="Save" /></>} />`,
      errors: [{ messageId: 'dangerFirst' }],
    },
    // A prop that holds a row, and a Button with no tone, which is accent.
    {
      filename: APP_FILE,
      code: `export const A = () => <Dialog title="Delete?" footer={<><Button tone="danger" label="Delete" /><Button label="Keep" /></>} />`,
      errors: [{ messageId: 'dangerFirst' }],
    },
    // A conditional that picks one Button is a place; a fragment's Buttons are in the row.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Inline>
                 {owner ? <Button tone="danger" label="Delete" /> : <Button tone="danger" label="Leave" />}
                 {editing && <><Button label="Save" /></>}
               </Inline>
             )`,
      errors: [{ messageId: 'dangerFirst' }, { messageId: 'dangerFirst' }],
    },
  ],
})

describe('the rule, in the words every place that states it uses', () => {
  const flat = (path: string) =>
    readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\s+/g, ' ')
  const lower = DANGER_ORDER.charAt(0).toLowerCase() + DANGER_ORDER.slice(1)

  for (const path of [
    'docs/rules.md',
    'design/components/button.md',
    'design/archetypes/form-page.md',
  ]) {
    it(path, () => {
      const text = flat(path)
      expect(text.includes(DANGER_ORDER) || text.includes(lower), path).toBe(true)
    })
  }
})
