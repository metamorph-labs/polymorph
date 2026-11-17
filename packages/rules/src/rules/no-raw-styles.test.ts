import { noRawStyles } from './no-raw-styles'
import { APP_FILE, jsxRuleTester, TEST_VALUES } from './rule-tester'

/** The rule as a config that passes the theme's values runs it. */
const WITH_VALUES = [{ values: TEST_VALUES }]

jsxRuleTester().run('no-raw-styles', noRawStyles, {
  valid: [
    {
      filename: APP_FILE,
      code: `import { Button } from '@polymorph/react-ui'
             export const A = () => <Button variant="solid" tone="accent">Send</Button>`,
    },
    // Choosing a variant selects an existing decision instead of making a new one.
    { filename: APP_FILE, code: `export const A = () => <Card size="lg" tone="danger" />` },
    // `#root`, `#/route` and version strings are not colours.
    { filename: APP_FILE, code: `const el = document.querySelector('#root')` },
    { filename: APP_FILE, code: `const href = '#/inbox'` },
    { filename: APP_FILE, code: `const v = 'v1.2.0'` },
    // Bare colour names are not flagged in TypeScript, because `'green'` is as
    // likely to be a status key or a label as a colour. The CSS rule flags them,
    // because there the context is unambiguous.
    { filename: APP_FILE, code: `const status = 'green'` },
    // A `className` is governed on a member and on a plain element. Another
    // library's component decides what its own props mean.
    {
      filename: APP_FILE,
      code: `import { Button } from '@other/ui'
             export const A = () => <Button className="x" />`,
    },
    // Rung 4: raw styles are allowed inside a declared zone, and so is a class
    // on a plain element there.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Bespoke reason="campaign hero">
                 <div style={{ padding: '24px' }} className="hero-disc" />
               </Bespoke>
             )`,
    },
  ],

  invalid: [
    {
      filename: APP_FILE,
      code: `export const A = () => <div style={{ color: 'red' }} />`,
      errors: [{ messageId: 'styleProp' }],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <div css={{}} />`,
      errors: [{ messageId: 'styleProp' }],
    },
    // A style has an effect on anything that is not a member.
    {
      filename: APP_FILE,
      code: `export const A = () => <motion.div style={{ opacity: 0 }} />`,
      errors: [
        {
          message:
            'Unexpected `style` on <motion.div>. `opacity` has no member prop, so it belongs in ' +
            'a `<Bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `import { Button } from '@polymorph/react-ui'
             export const A = () => <Button className="mt-4" />`,
      // Fixed by removal. No member accepts a `className`, so the attribute
      // already had no effect.
      output: `import { Button } from '@polymorph/react-ui'
             export const A = () => <Button />`,
      errors: [{ messageId: 'deadProp', data: { prop: 'className', component: 'Button' } }],
    },
    // Renamed on import, but still governed.
    {
      filename: APP_FILE,
      code: `import { Button as Btn } from '@polymorph/react-ui'
             export const A = () => <Btn className="x" />`,
      output: `import { Button as Btn } from '@polymorph/react-ui'
             export const A = () => <Btn />`,
      errors: [{ messageId: 'deadProp', data: { prop: 'className', component: 'Btn' } }],
    },
    // A `style` on a member has no effect, like a `className`, and is removed
    // the same way, with the whitespace before it, wherever it is in the element.
    {
      filename: APP_FILE,
      code: `import { Button, Card } from '@polymorph/react-ui'
             export const A = () => (
               <Card style={{ margin: 0 }}>
                 <Button
                   label="Save"
                   style={{ width: '100%' }}
                   onClick={save}
                 />
               </Card>
             )`,
      output: `import { Button, Card } from '@polymorph/react-ui'
             export const A = () => (
               <Card>
                 <Button
                   label="Save"
                   onClick={save}
                 />
               </Card>
             )`,
      errors: [{ messageId: 'deadProp' }, { messageId: 'deadProp' }],
    },
    // Two ineffective props side by side are two overlapping edits, and ESLint
    // applies overlapping edits one pass apart. This is the first pass. `--fix`
    // runs the second, and `fix.test.ts` checks the final result.
    {
      filename: APP_FILE,
      code: `import { Button } from '@polymorph/react-ui'
             export const A = () => <Button className="wide" style={{ width: '100%' }} label="Save" />`,
      output: `import { Button } from '@polymorph/react-ui'
             export const A = () => <Button style={{ width: '100%' }} label="Save" />`,
      errors: [{ messageId: 'deadProp' }, { messageId: 'deadProp' }],
    },
    // A comment between the attribute and what precedes it is kept. The
    // attribute is removed, and the comment and the space around it stay.
    {
      filename: APP_FILE,
      code: `import { Button } from '@polymorph/react-ui'
             export const A = () => <Button /* was primary */ className="primary" label="Go" />`,
      output: `import { Button } from '@polymorph/react-ui'
             export const A = () => <Button /* was primary */  label="Go" />`,
      errors: [{ messageId: 'deadProp' }],
    },
    // A parameter called `Card` is whatever was passed in, not the member. It
    // is still reported, but its `className`, which may have an effect, is not
    // removed, and the message does not promise a fix.
    {
      filename: APP_FILE,
      code: `import { Card } from '@polymorph/react-ui'
             export function Row({ Card }) { return <Card className="wide" /> }`,
      output: null,
      errors: [
        {
          // A zone never lifts a `className` on a member, so none is offered.
          message:
            'Unexpected `className` on <Card>, a name the vocabulary governs. Members take no ' +
            '`className`: set the member\'s own `variant="…"`, `tone="…"` or `size="…"` (rung 1).',
        },
      ],
    },
    // A `style` there is lifted by a zone, so the zone is offered.
    {
      filename: APP_FILE,
      code: `import { Card } from '@polymorph/react-ui'
             export function Row({ Card }) { return <Card style={{ width: 2 }} /> }`,
      output: null,
      errors: [{ messageId: 'memberProp', data: { prop: 'style', component: 'Card' } }],
    },
    // A `className` on a member stays red inside a zone: the zone styles what it
    // renders, and the member ignores the class wherever it is.
    {
      filename: APP_FILE,
      code: `import { Button } from '@polymorph/react-ui'
             export const A = () => <Bespoke reason="hero"><Button className="x" /></Bespoke>`,
      output: `import { Button } from '@polymorph/react-ui'
             export const A = () => <Bespoke reason="hero"><Button /></Bespoke>`,
      errors: [{ messageId: 'deadProp' }],
    },
    // A zone elsewhere in the file does not cover code outside it.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <>
                 <Bespoke reason="hero"><div style={{}} /></Bespoke>
                 <div style={{}} />
               </>
             )`,
      errors: [{ messageId: 'styleProp' }],
    },
  ],
})

/**
 * What each report says. Every message names the rewrite for what was written:
 * the nearest token by value, the layout primitive and props a `style` reads
 * as, the member a styled element is. None of these is a fix, because each is
 * a decision the author makes, so nothing is rewritten.
 */
jsxRuleTester().run('no-raw-styles — what the report names', noRawStyles, {
  valid: [],
  invalid: [
    /* ---- raw values: the nearest token -------------------------------- */

    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `const brand = '#4087de'`,
      output: null,
      errors: [
        {
          message:
            'Unexpected colour `#4087de`. Its nearest role is `--pm-accent-bg` (#0089ea): set a ' +
            'member\'s `tone="…"` to paint it, or read `var(--pm-accent-bg)` inside `<Bespoke>`.',
        },
      ],
    },
    // The property decides which roles are candidates: white text is a text
    // role, a white background a background role.
    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `export const A = () => <Bespoke reason="x"><i /></Bespoke>; const s = { color: '#fff', background: '#fff' }`,
      output: null,
      errors: [
        {
          message:
            'Unexpected colour `#fff`. Its nearest role is `--pm-accent-contrast` or ' +
            '`--pm-text-inverse` (#ffffff): set a member\'s `tone="…"` to paint it, or read ' +
            '`var(--pm-accent-contrast)` inside `<Bespoke>`.',
        },
        {
          message:
            'Unexpected colour `#fff`. Its nearest role is `--pm-bg-app` or `--pm-bg-surface` ' +
            '(#ffffff): set a member\'s `tone="…"` to paint it, or read `var(--pm-bg-app)` inside ' +
            '`<Bespoke>`.',
        },
      ],
    },
    // A translucent colour is compared with its alpha, so it finds the scrim.
    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: 'const shade = `rgba(0 0 0 / 0.4)`',
      output: null,
      errors: [
        {
          message:
            'Unexpected colour `rgba(0 0 0 / 0.4)`. Its nearest role is `--pm-bg-scrim` ' +
            '(rgb(9 10 11 / 0.4)): set a member\'s `tone="…"` to paint it, or read ' +
            '`var(--pm-bg-scrim)` inside `<Bespoke>`.',
        },
      ],
    },
    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `const gap = '12px'`,
      output: null,
      errors: [
        {
          message:
            'Unexpected length `12px`. It is space step 4 (`--pm-space-4`): write `gap={4}`, ' +
            '`p={4}`, `px={4}` or `py={4}` on `<Stack>`, `<Inline>` or `<Grid>`.',
        },
      ],
    },
    // A value off the ladder names the nearest step and says how far it is.
    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `const s = { paddingTop: '13px' }`,
      output: null,
      errors: [
        {
          message:
            'Unexpected length `13px`. The nearest space step is 4 (`--pm-space-4`, 12px): write ' +
            '`py={4}` on `<Stack>`, `<Inline>` or `<Grid>`.',
        },
      ],
    },
    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `const s = { borderRadius: '6px', fontSize: '15px', width: '320px', height: '36px' }`,
      output: null,
      errors: [
        {
          message:
            'Unexpected length `6px`. It is between `--pm-radius-sm` (4px) and `--pm-radius-md` ' +
            "(8px): a member's radius is the theme's, and `<Card patch={{ radius: 'sm' | 'md' }}>` " +
            're-assigns one (rung 3).',
        },
        {
          message:
            'Unexpected length `15px`. It is between `--pm-text-sm-size` (0.875rem) and ' +
            '`--pm-text-md-size` (1rem): write `<Text size="sm">` or `<Text>` (rung 1).',
        },
        {
          message:
            'Unexpected length `320px`. No token is a fixed size: members size to their content, ' +
            '`<Grid columns={…}>` sets tracks, and a fixed size goes in `<Bespoke>`.',
        },
        {
          message:
            "Unexpected length `36px`. It is `--pm-control-height-md`, which a control's " +
            '`size="md"` sets (rung 1).',
        },
      ],
    },
    // Two steps equally near are both named; a negative length is an overlap,
    // which no layout prop makes; the `font` shorthand carries a type size.
    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `const s = { gap: '10px', margin: '-12px', font: '16px serif' }`,
      output: null,
      errors: [
        {
          message:
            'Unexpected length `10px`. Steps 3 and 4 (`--pm-space-3`, `--pm-space-4`) are equally ' +
            'near: write `gap={3}` or `gap={4}` on `<Stack>`, `<Inline>` or `<Grid>`.',
        },
        {
          message:
            'Unexpected length `-12px`. It is space step 4 negated, an overlap no layout prop ' +
            'makes: read `--pm-space-4` negated inside a `<Bespoke reason="…">` zone (rung 4).',
        },
        {
          message: 'Unexpected length `16px`. It is `--pm-text-md-size`: write `<Text>` (rung 1).',
        },
      ],
    },
    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `const s = { marginTop: '10px' }`,
      output: null,
      errors: [
        {
          message:
            'Unexpected length `10px`. Steps 3 and 4 (`--pm-space-3`, `--pm-space-4`) are equally ' +
            "near: write `gap={3}` or `gap={4}` on the parent's `<Stack>` or `<Inline>`, since a " +
            "margin is the parent's gap.",
        },
      ],
    },
    // Without the theme's values the report still names the family and the
    // props, only not the step.
    {
      filename: APP_FILE,
      code: `const gap = '12px'; const brand = '#4087de'`,
      output: null,
      errors: [
        {
          message:
            'Unexpected length `12px`. Space is a `--pm-space-*` step: write `gap={…}`, `p={…}`, ' +
            '`px={…}` or `py={…}` on `<Stack>`, `<Inline>` or `<Grid>`.',
        },
        {
          message:
            'Unexpected colour `#4087de`. Colours are role tokens (`--pm-text-*`, `--pm-bg-*`, ' +
            '`--pm-accent-*`): set a member\'s `tone="…"`, or read one inside a ' +
            '`<Bespoke reason="…">` zone.',
        },
      ],
    },

    /* ---- a `style` object, read into the primitive that replaces it -------- */

    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `export const A = () => <div style={{ display: 'flex', gap: 12, alignItems: 'center' }} />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `style` on <div>. `display`, `gap` and `alignItems` are ' +
            '`<Inline gap={4} align="center">` (rung 1).',
        },
      ],
    },
    // What has no layout prop is named with what sets it instead.
    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `export const A = () => <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: 'red' }} />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `style` on <div>. `display`, `flexDirection` and `gap` are ' +
            '`<Stack gap={3}>` (rung 1). `color`: a member\'s `tone="…"` or `variant="…"` ' +
            'sets colour (rung 1).',
        },
      ],
    },
    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `export const A = () => <div style={{ border: 0, borderRadius: 8 }} />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `style` on <div>. `border` and `borderRadius` are `<Card>` (rung 1).',
        },
      ],
    },
    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `export const A = () => <div style={{ marginTop: 8 }} />`,
      output: null,
      errors: [
        {
          message:
            "Unexpected `style` on <div>. A margin is the parent's spacing: `<Stack gap={3}>` " +
            'around it.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <div style={{ position: 'absolute' }} />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `style` on <div>. `position` has no member prop, so it belongs in a ' +
            '`<Bespoke reason="…">` zone (rung 4).',
        },
      ],
    },
    // A declaration with no answer on its own gets the general one, never an
    // empty message.
    {
      filename: APP_FILE,
      code: `export const A = () => <div style={{ flexWrap: 'wrap' }} />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `style` on <div>. Compose `<Stack>`, `<Inline>`, `<Grid>` or `<Card>` with ' +
            'their spacing props (rung 1), or declare a `<Bespoke reason="…">` zone.',
        },
      ],
    },
    // An object the rule cannot read names every primitive.
    {
      filename: APP_FILE,
      code: `export const A = () => <div style={styles.row} />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `style` on <div>. Compose `<Stack>`, `<Inline>`, `<Grid>` or `<Card>` with ' +
            'their spacing props (rung 1), or declare a `<Bespoke reason="…">` zone.',
        },
      ],
    },

    /* ---- a `className` on a plain element --------------------------------- */

    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `export const A = () => <div className="flex gap-2 p-4 items-center" />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `className` on <div>. `flex gap-2 p-4 items-center` reads as ' +
            '`<Inline gap={3} p={5} align="center">` (rung 1). One-off styling goes in a ' +
            '`<Bespoke reason="…">` zone.',
        },
      ],
    },
    // A bordered, rounded, raised box is a card.
    {
      filename: APP_FILE,
      options: WITH_VALUES,
      code: `export const A = () => <div className="border rounded-lg shadow" />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `className` on <div>. `border rounded-lg shadow` reads as `<Card>` ' +
            '(rung 1). One-off styling goes in a `<Bespoke reason="…">` zone.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <p className="text-sm text-gray-500" />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `className` on <p>. `text-sm text-gray-500` reads as ' +
            '`<Text size="sm" tone="secondary">` (rung 1).',
        },
      ],
    },
    // A long list is quoted by the classes that were read, at most four.
    {
      filename: APP_FILE,
      code: `export const A = () => <p className="mt-2 max-w-prose text-sm text-gray-500 font-medium leading-6 tracking-tight underline" />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `className` on <p>. `text-sm text-gray-500 font-medium leading-6` reads ' +
            'as `<Text size="sm" tone="secondary">` (rung 1).',
        },
      ],
    },
    // `Text` renders a `<p>`, so a styled `<span>` is inline content of the
    // enclosing `Text`, or a badge when its classes say so.
    {
      filename: APP_FILE,
      code: `export const A = () => <span className="text-sm text-gray-500" />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `className` on <span>. A <span> is inline content: the enclosing ' +
            '`<Text>` sets its size and tone, and emphasis is `<strong>` or `<Code>` inside it ' +
            '(rung 1).',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <span className="badge badge-success" />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `className` on <span>. `badge` reads as `<Badge>` (rung 1); its `tone` ' +
            'and `variant` set the colour.',
        },
      ],
    },
    // The page's root elements are the theme's.
    {
      filename: APP_FILE,
      code: `export const A = () => <html className="h-full"><body className={inter.className} /></html>`,
      output: null,
      errors: [
        {
          message:
            "Unexpected `className` on <html>. The theme styles the page's root: the pairing on " +
            '<html> sets its fonts and colours, and `<AppShell>` frames the app (rung 1), so the ' +
            'class can go.',
        },
        {
          message:
            "Unexpected `className` on <body>. The theme styles the page's root: the pairing on " +
            '<html> sets its fonts and colours, and `<AppShell>` frames the app (rung 1), so the ' +
            'class can go.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <a className="btn btn-primary" href="/x" />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `className` on <a>. `btn` reads as `<Link variant="button" href="…">` ' +
            '(rung 1).',
        },
      ],
    },
    // A class that says nothing readable falls back to the element's role.
    {
      filename: APP_FILE,
      code: `export const A = () => <h2 className={styles.title} />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `className` on <h2>. Compose `<Heading level={2}>` instead (rung 1), or ' +
            'style it inside a `<Bespoke reason="…">` zone.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <div className="inbox-row" />`,
      output: null,
      errors: [
        {
          message:
            'Unexpected `className` on <div>. Compose `<Stack>`, `<Inline>`, `<Grid>` or `<Card>` ' +
            'instead (rung 1), or style it inside a `<Bespoke reason="…">` zone.',
        },
      ],
    },
  ],
})
