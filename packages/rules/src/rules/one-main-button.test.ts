import { oneMainButton } from './one-main-button'
import { APP_FILE, jsxRuleTester } from './rule-tester'

const SECOND =
  'Unexpected second main Button in <Dialog>: a dialog has one solid accent Button, which marks its next step. Make this one `<Button variant="outline" tone="neutral">` (rung 1).'

jsxRuleTester().run('one-main-button', oneMainButton, {
  valid: [
    // One main Button, and the rest are lesser.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Dialog title="Rename" footer={<><Button variant="outline" tone="neutral" label="Cancel" /><Button label="Save" /></>}>
                 <Input />
               </Dialog>
             )`,
    },
    // A page is not a scope: its header's actions are the page's.
    {
      filename: APP_FILE,
      code: `export const A = () => <PageHeader title="Inbox" actions={<><Button label="New" /><Button label="Import" /></>} />`,
    },
    // A dialog's trigger stays on the page, so it is not counted in the dialog.
    {
      filename: APP_FILE,
      code: `export const A = () => <Dialog title="New" trigger={<Button label="New" />} footer={<Button label="Create" />} />`,
    },
    // A Card inside a Dialog is counted apart.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Dialog title="Plans" footer={<Button label="Done" />}>
                 <Card title="Pro"><Button label="Choose Pro" /></Card>
               </Dialog>
             )`,
    },
    // Two branches of one conditional never render together.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Card title="Draft">{saved ? <Button label="Publish" /> : <Button label="Save" />}</Card>
             )`,
    },
    // A computed variant or tone, a spread, and Buttons written by a call are not read.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Card title="Draft">
                 <Button label="Save" />
                 <Button variant={kind} label="Publish" />
                 <Button {...props} label="Share" />
                 {items.map((item) => <Button key={item} label={item} />)}
               </Card>
             )`,
    },
    // A declared zone lifts the rule.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Card title="Compare">
                 <Button label="Choose Basic" />
                 <Bespoke reason="Plan comparison with one action per column"><Button label="Choose Pro" /></Bespoke>
               </Card>
             )`,
    },
  ],

  invalid: [
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Dialog title="Rename" footer={<><Button label="Cancel" /><Button label="Save" /></>}>
                 <Input />
               </Dialog>
             )`,
      errors: [{ message: SECOND, line: 2, column: 74 }],
    },
    // Written out, the defaults count the same. The footer keeps its main action, and the
    // body's is reported.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Drawer title="Filters" footer={<Button variant="solid" tone="accent" label="Apply" />}>
                 <Button label="Reset" />
               </Drawer>
             )`,
      errors: [{ messageId: 'secondMain', line: 3, column: 18 }],
    },
    // The body and the footer are one scope; a section names itself.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Card title="Plan">
                 <Inline><Button label="Upgrade" /><Button label="Compare" /></Inline>
               </Card>
             )`,
      errors: [
        {
          message:
            'Unexpected second main Button in <Card>: a section has one solid accent Button, which marks its next step. Make this one `<Button variant="outline" tone="neutral">` (rung 1).',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Dashboard.Panel title="Usage"><Button label="Export" />{ready && <Button label="Refresh" />}</Dashboard.Panel>
             )`,
      errors: [{ messageId: 'secondMain' }],
    },
    // A Button outside a conditional renders beside either branch; each extra one is reported.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Popover label="Share" trigger={<Button label="Share" />}>
                 {open ? <Button label="Copy" /> : <Button label="Invite" />}
                 <Button label="Send" />
               </Popover>
             )`,
      errors: [{ messageId: 'secondMain', line: 4 }],
    },
    // A scope written inside a call is still read whole.
    {
      filename: APP_FILE,
      code: `export const A = () => plans.map((plan) => <Card title={plan}><Button label="Buy" /><Button label="Try" /></Card>)`,
      errors: [{ messageId: 'secondMain' }],
    },
  ],
})
