import { dangerLast } from './danger-last'
import { APP_FILE, jsxRuleTester } from './rule-tester'

const FIRST =
  'Unexpected <Button tone="danger"> before another Button in its row: the destructive action comes last, so a reader meets the safe one first. Move it after the others (rung 1).'

jsxRuleTester().run('danger-last', dangerLast, {
  valid: [
    {
      filename: APP_FILE,
      code: `export const A = () => <Inline><Button variant="outline" tone="neutral" label="Keep" /><Button tone="danger" label="Delete" /></Inline>`,
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
    {
      filename: APP_FILE,
      code: `export const A = () => <Inline><Button tone="danger" label="Delete" /><Button variant="outline" tone="neutral" label="Cancel" /></Inline>`,
      errors: [{ message: FIRST, column: 32 }],
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
