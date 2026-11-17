import { noRawInteractive } from './no-raw-interactive'
import { APP_FILE, jsxRuleTester } from './rule-tester'

jsxRuleTester().run('no-raw-interactive', noRawInteractive, {
  valid: [
    { filename: APP_FILE, code: `export const A = () => <Button onClick={send}>Send</Button>` },
    // Non-interactive markup is still allowed for binding content.
    { filename: APP_FILE, code: `export const A = () => <div><span>{ticket.title}</span></div>` },
    { filename: APP_FILE, code: `export const A = () => <a href="/inbox">Inbox</a>` },
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Bespoke reason="campaign hero"><button onClick={go}>Go</button></Bespoke>
             )`,
    },
  ],

  invalid: [
    {
      filename: APP_FILE,
      code: `export const A = () => <button onClick={send}>Send</button>`,
      errors: [
        {
          message:
            'Unexpected <button>. Use `<Button label="Send" />` (rung 1): it carries every state, ' +
            'its keyboard path and its motion.',
        },
      ],
    },
    // A glyph inside the button is the member's `icon`.
    {
      filename: APP_FILE,
      code: `export const A = () => <button onClick={send}><Icon name="send" /> Send</button>`,
      errors: [
        {
          message:
            'Unexpected <button>. Use `<Button icon="send" label="Send" />` (rung 1): it carries ' +
            'every state, its keyboard path and its motion.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <button onClick={close}><Icon name="close" /></button>`,
      errors: [
        {
          message:
            'Unexpected <button>. Use `<Button iconOnly icon="close" label="…" />` (rung 1): it ' +
            'carries every state, its keyboard path and its motion.',
        },
      ],
    },
    // An `<input>` is named by its `type`.
    {
      filename: APP_FILE,
      code: `export const A = () => <input value={q} onChange={setQ} />`,
      errors: [
        {
          message:
            "Unexpected <input>. Use `<Input>` (rung 1): it carries the field's states, its label " +
            'wiring and its keyboard path.',
        },
      ],
    },
    ...(
      [
        ['search', '`<SearchInput>`'],
        ['password', '`<PasswordInput toggleLabel="…">`'],
        ['number', '`<NumberInput>`'],
        ['date', '`<DatePicker>`'],
        ['color', '`<ColorInput pickerLabel="…">`'],
        ['file', '`<FileUpload>`'],
        ['range', '`<Slider>`'],
        ['email', '`<Input type="email">`'],
        ['tel', '`<Input type="tel">`'],
        ['url', '`<Input type="url">`'],
      ] as const
    ).map(([type, member]) => ({
      filename: APP_FILE,
      code: `export const A = () => <input type="${type}" />`,
      errors: [
        {
          message:
            `Unexpected <input type="${type}">. Use ${member} (rung 1): it carries the field's ` +
            'states, its label wiring and its keyboard path.',
        },
      ],
    })),
    {
      filename: APP_FILE,
      code: `export const A = () => <input type="checkbox" />`,
      errors: [
        {
          message:
            'Unexpected <input type="checkbox">. Use `<Checkbox label="…">` (rung 1); it draws its ' +
            'own label row, so a wrapping <label> goes too.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <input type="radio" name="plan" />`,
      errors: [
        {
          message:
            'Unexpected <input type="radio">. One `<RadioGroup options={…}>` replaces the set of ' +
            'radios and their labels (rung 1).',
        },
      ],
    },
    // No member picks a whole month or week, so none is named for one.
    ...(['month', 'week'] as const).map((type) => ({
      filename: APP_FILE,
      code: `export const A = () => <input type="${type}" />`,
      errors: [
        {
          message:
            `Unexpected <input type="${type}">. No member picks a whole ${type} (DatePicker picks ` +
            `a day, an hour or a minute), so a ${type} picker goes in a \`<Bespoke reason="…">\` ` +
            'zone (rung 4).',
        },
      ],
    })),
    // A type that is a name on every object is still a type no member has.
    {
      filename: APP_FILE,
      code: `export const A = () => <input type="constructor" />`,
      errors: [
        {
          message:
            'Unexpected <input type="constructor">. Use the field member for its type (rung 1): ' +
            '`<Input>`, `<Checkbox label="…">`, `<DatePicker>` or `<Slider>`.',
        },
      ],
    },
    // A type the rule cannot read names the common fields.
    {
      filename: APP_FILE,
      code: `export const A = () => <input type={kind} />`,
      errors: [
        {
          message:
            'Unexpected <input>. Use the field member for its type (rung 1): `<Input>`, ' +
            '`<Checkbox label="…">`, `<DatePicker>` or `<Slider>`.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <select><option>a</option></select>`,
      errors: [
        {
          message:
            'Unexpected <select>. Use `<Select options={…}>` (rung 1); options are data, not ' +
            'elements.',
        },
        { messageId: 'rawOption', data: { element: 'option' } },
      ],
    },
    // A long list is one a reader would rather filter.
    {
      filename: APP_FILE,
      code: `export const A = () => <select>${'<option>x</option>'.repeat(12)}</select>`,
      errors: [
        {
          message:
            'Unexpected <select>. With 12 options, use `<Combobox options={…}>` so the reader can ' +
            'type to filter (rung 1). A short list is `<Select options={…}>`.',
        },
        ...Array.from({ length: 12 }, () => ({ messageId: 'rawOption' })),
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <select multiple name="tags" />`,
      errors: [
        {
          message:
            'Unexpected <select>. Use `<MultiSelect options={…}>` (rung 1); options are data, not ' +
            'elements.',
        },
      ],
    },
    // A clickable div is a control without a control's states or keyboard path.
    {
      filename: APP_FILE,
      code: `export const A = () => <div onClick={open}>Open</div>`,
      errors: [
        {
          message:
            "Unexpected `onClick` on <div>. A clickable <div> has no control's states or keyboard " +
            'path: use `<Button variant="ghost" label="…">` (rung 1), or a `<Bespoke reason="…">` zone.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <a onClick={open}>Open</a>`,
      errors: [
        {
          message:
            "Unexpected `onClick` on <a>. A clickable <a> has no control's states or keyboard " +
            'path: use `<Button variant="ghost" label="…">` (rung 1), or a `<Bespoke reason="…">` zone.',
        },
      ],
    },
    // With somewhere to go, it is a link.
    {
      filename: APP_FILE,
      code: `export const A = () => <a href="/inbox" onClick={track}>Inbox</a>`,
      errors: [
        {
          message:
            'Unexpected `onClick` on <a>. A link that also runs code is still `<Link href="…">` ' +
            '(rung 1); work that changes data is a `<Button>`.',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => <tr onKeyDown={go} />`,
      errors: [
        {
          message:
            'Unexpected `onKeyDown` on <tr>. A clickable row is `<Table.Row interactive>` with its ' +
            '`onClick` (rung 1).',
        },
      ],
    },
  ],
})

/**
 * The fix: a `<button>` whose whole content is text becomes the member, with
 * that text as its `label`.
 *
 * It runs only when the config names the module members are imported from. The
 * cases that are not fixed share one reason. The element holds something the
 * rewrite cannot keep (a prop the member has no equivalent for, content that is
 * not text, a comment), and a fix keeps everything or does not run.
 */
const FIXES = [{ vocabulary: '@polymorph/react-ui' }]
const raw = { messageId: 'rawButton' } as const

/** A `<button>` in a file that already imports the member, to keep cases short. */
const button = (element: string) => `import { Button } from '@polymorph/react-ui'
export const A = () => ${element}`

const unfixed = (code: string) => ({
  filename: APP_FILE,
  options: FIXES,
  code,
  output: null,
  errors: [raw],
})

jsxRuleTester().run('no-raw-interactive — the fix', noRawInteractive, {
  valid: [],
  invalid: [
    // No option, no fix. The rule groups leave the option out, because they are
    // also used in repositories with no single module to import `Button` from.
    {
      filename: APP_FILE,
      code: `export const A = () => <button type="button" onClick={send}>Send</button>`,
      output: null,
      errors: [raw],
    },

    /* ---- what is kept ---------------------------------------------------- */

    // Declared a plain button, which is the member's default, so no `type` is written.
    {
      filename: APP_FILE,
      options: FIXES,
      code: button(
        '<button type="button" key="open" aria-label="Open menu" disabled={busy} onClick={open}>Menu</button>',
      ),
      output: button(
        '<Button label="Menu" key="open" aria-label="Open menu" disabled={busy} onClick={open} />',
      ),
      errors: [raw],
    },
    // A `<button>` with no `type` is a submit button, and the member's default
    // is not. This file cannot tell whether a form encloses it, because the form
    // may be a member or a parent elsewhere. The fix writes `submit` explicitly
    // instead of changing what a click does.
    {
      filename: APP_FILE,
      options: FIXES,
      code: button('<FormPage onSubmit={save}><button onClick={track}>Save</button></FormPage>'),
      output: button(
        '<FormPage onSubmit={save}><Button label="Save" onClick={track} type="submit" /></FormPage>',
      ),
      errors: [raw],
    },
    {
      filename: APP_FILE,
      options: FIXES,
      code: button(`<button type="submit" aria-describedby="hint">{'Save'}</button>`),
      output: button(`<Button label={'Save'} aria-describedby="hint" type="submit" />`),
      errors: [raw],
    },
    // The text is read as JSX reads it: lines trimmed and joined, and space
    // inside a line kept. A non-breaking space is content, not whitespace.
    {
      filename: APP_FILE,
      options: FIXES,
      code: button(`(
  <button type="button" onClick={save}>
    Save\u00a0all
    changes
  </button>
)`),
      output: button(`(
  <Button label="Save\u00a0all changes" onClick={save} />
)`),
      errors: [raw],
    },

    /* ---- where the import goes ------------------------------------------- */

    // The file imports other members from the vocabulary, so `Button` is added to them.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `import { Stack } from '@polymorph/react-ui'
export const A = () => <Stack gap={2}><button type="button" onClick={go}>Go</button></Stack>`,
      output: `import { Stack, Button } from '@polymorph/react-ui'
export const A = () => <Stack gap={2}><Button label="Go" onClick={go} /></Stack>`,
      errors: [raw],
    },
    // The file imports other modules: a new line goes after the last import's
    // whole line, so a comment trailing that import stays where it was.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `import { useState } from 'react'
import legacy from 'untyped' // the build this one comes from is not typed

export const A = () => <button type="button" onClick={go}>Go</button>`,
      output: `import { useState } from 'react'
import legacy from 'untyped' // the build this one comes from is not typed
import { Button } from '@polymorph/react-ui'

export const A = () => <Button label="Go" onClick={go} />`,
      errors: [raw],
    },
    // The new line uses the file's own line endings.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `import { useState } from 'react'\r\n\r\nexport const A = () => <button type="button" onClick={go}>Go</button>\r\n`,
      output: `import { useState } from 'react'\r\nimport { Button } from '@polymorph/react-ui'\r\n\r\nexport const A = () => <Button label="Go" onClick={go} />\r\n`,
      errors: [raw],
    },
    // The file imports nothing: the import goes at the top.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `export const A = () => <button type="button" onClick={go}>Go</button>`,
      output: `import { Button } from '@polymorph/react-ui'

export const A = () => <Button label="Go" onClick={go} />`,
      errors: [raw],
    },
    // But it goes below a directive, which stops being a directive if anything
    // comes before it.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `'use client'

export const A = () => <button type="button" onClick={go}>Go</button>`,
      output: `'use client'

import { Button } from '@polymorph/react-ui'

export const A = () => <Button label="Go" onClick={go} />`,
      errors: [raw],
    },

    // A comment above a directive does not block the fix. The import goes below
    // the directive, and the comment stays where it was.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `// @ts-nocheck
'use client'

export const A = () => <button type="button" onClick={go}>Go</button>`,
      output: `// @ts-nocheck
'use client'

import { Button } from '@polymorph/react-ui'

export const A = () => <Button label="Go" onClick={go} />`,
      errors: [raw],
    },

    /* ---- what stops the fix ---------------------------------------------- */

    // Code shares a line with the last import and continues onto the next, so a
    // line inserted at that line break would land inside the function body. The
    // same applies to a directive, and to a comment that does not end on the line.
    unfixed(`import { useState } from 'react'; export default function App() {
  return <button type="button" onClick={go}>Go</button>
}`),
    unfixed(`'use client'; export default function App() {
  return <button type="button" onClick={go}>Go</button>
}`),
    unfixed(`import { useState } from 'react' /* kept for the
  legacy page */
export const A = () => <button type="button" onClick={go}>Go</button>`),

    // A file that opens with a comment and has no imports: a pragma that must
    // stay first, or the doc comment of the first declaration. The fix does not
    // guess which side of it the import belongs on.
    unfixed(`// @ts-nocheck
export const A = () => <button type="button" onClick={go}>Go</button>`),
    // Already styled: choosing the intended variant is a decision.
    unfixed(button('<button className="btn btn-primary" onClick={go}>Go</button>')),
    unfixed(
      button(`<button style={{ display: open ? 'block' : 'none' }} onClick={go}>Go</button>`),
    ),
    // Content that is more than text, such as an icon or a binding. `Button` has
    // props for both, and the author decides which one is meant.
    unfixed(button('<button onClick={send}><Icon name="send" /> Send</button>')),
    unfixed(button('<button onClick={send}>{label}</button>')),
    unfixed(button('<button onClick={send}>Say "hi"</button>')),
    // Props the member has no equivalent for. Dropping an `id` a test uses to
    // find the button, or the `name` a form posts, would break the code.
    unfixed(button('<button id="save" onClick={send}>Send</button>')),
    unfixed(button('<button {...rest}>Send</button>')),
    unfixed(button('<button type="reset">Clear</button>')),
    unfixed(button('<button type={kind}>Send</button>')),
    // A comment is inside the element the rewrite would replace.
    unfixed(button('<button /* primary */ onClick={send}>Send</button>')),
    // `Button` already means something else in this file.
    unfixed(`import { Button } from './legacy'
export const A = () => <><Button /><button onClick={send}>Send</button></>`),
    // Or it means something else only where the element is: inside `Bar`, `Button` is the prop.
    unfixed(`import { Button } from '@polymorph/react-ui'
export function Bar({ Button }) { return <div><Button /><button onClick={go}>Go</button></div> }`),
    // A text field has no single rewrite, with or without the option: the
    // member needs a label the input does not have.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `export const A = () => <input value={q} onChange={setQ} />`,
      output: null,
      errors: [{ messageId: 'rawInput' }],
    },
  ],
})

/**
 * The fix: a checkbox and the label beside it become one `Checkbox`.
 *
 * The member draws the box and then its label, as a row that is its own hit
 * target, which is what a `<label>` around an input does. Both shapes the
 * label can take are rewritten. What stops the fix is what stops every fix: a
 * prop the member has no place for, label content that is not text, or a
 * handler whose meaning would change.
 */
const checkbox = { messageId: 'rawInput' } as const

jsxRuleTester().run('no-raw-interactive — the checkbox fix', noRawInteractive, {
  valid: [],
  invalid: [
    // The input inside its label, the text after it.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `import { Stack } from '@polymorph/react-ui'
export const A = () => <Stack><label><input type="checkbox" name="terms" defaultChecked /> Accept terms</label></Stack>`,
      output: `import { Stack, Checkbox } from '@polymorph/react-ui'
export const A = () => <Stack><Checkbox label="Accept terms" name="terms" defaultChecked /></Stack>`,
      errors: [checkbox],
    },
    // The input, then a label naming its `id`. A handler that takes no
    // arguments does the same whatever it is called with.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `import { Checkbox } from '@polymorph/react-ui'
export const A = () => (
  <div>
    <input type="checkbox" id="terms" checked={on} onChange={() => setOn(!on)} />
    <label htmlFor="terms">Accept terms</label>
  </div>
)`,
      output: `import { Checkbox } from '@polymorph/react-ui'
export const A = () => (
  <div>
    <Checkbox label="Accept terms" id="terms" checked={on} onCheckedChange={() => setOn(!on)} />
  </div>
)`,
      errors: [checkbox],
    },
    // A `function` that takes nothing and never reads `arguments` is as blind
    // to what it is called with as an arrow.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `import { Checkbox } from '@polymorph/react-ui'
export const A = () => <label><input type="checkbox" onChange={function () { toggle() }} /> Done</label>`,
      output: `import { Checkbox } from '@polymorph/react-ui'
export const A = () => <Checkbox label="Done" onCheckedChange={function () { toggle() }} />`,
      errors: [checkbox],
    },

    /* ---- what stops it ---------------------------------------------------- */

    // A handler that reads its event would be called with the checked state.
    unfixedCheckbox(
      '<label><input type="checkbox" onChange={(e) => setOn(e.target.checked)} /> Done</label>',
    ),
    unfixedCheckbox('<label><input type="checkbox" onChange={toggle} /> Done</label>'),
    // So would one that takes no parameters and reads its event through
    // `arguments`, directly or from an arrow inside it.
    unfixedCheckbox(
      '<label><input type="checkbox" onChange={function () { setOn(arguments[0].target.checked) }} /> Done</label>',
    ),
    unfixedCheckbox(
      '<label><input type="checkbox" onChange={function () { later(() => arguments[0]) }} /> Done</label>',
    ),
    // A prop `Checkbox` has no place for.
    unfixedCheckbox('<label><input type="checkbox" required /> Done</label>'),
    unfixedCheckbox('<label className="row"><input type="checkbox" /> Done</label>'),
    // The text before the box: the member draws the box first.
    unfixedCheckbox('<label>Done <input type="checkbox" /></label>'),
    // Label content that is not plain text.
    unfixedCheckbox('<label><input type="checkbox" /> <strong>Done</strong></label>'),
    unfixedCheckbox('<label><input type="checkbox" /> {label}</label>'),
    // A label that names another input, or that sits on the same line, where
    // the space between them renders.
    unfixedCheckbox('<div><input type="checkbox" id="a" /><label htmlFor="b">Done</label></div>'),
    unfixedCheckbox('<div><input type="checkbox" id="a" /> <label htmlFor="a">Done</label></div>'),
    // No label at all: the member's row needs one.
    unfixedCheckbox('<div><input type="checkbox" /></div>'),
    // A comment the rewrite would delete.
    unfixedCheckbox('<label><input type="checkbox" /* the legal box */ /> Done</label>'),
    // No option, no fix.
    {
      filename: APP_FILE,
      code: `export const A = () => <label><input type="checkbox" /> Done</label>`,
      output: null,
      errors: [checkbox],
    },
  ],
})

function unfixedCheckbox(element: string) {
  return {
    filename: APP_FILE,
    options: FIXES,
    code: `import { Checkbox } from '@polymorph/react-ui'\nexport const A = () => ${element}`,
    output: null,
    errors: [checkbox],
  }
}

/**
 * The fix: a `<textarea>` becomes `Textarea`.
 *
 * The member calls `onChange` with the value first and the event second, so a
 * handler that reads only `event.target.value` is rewritten to take the value,
 * and any other handler stops the fix.
 */
const textarea = { messageId: 'rawTextarea' } as const

jsxRuleTester().run('no-raw-interactive — the textarea fix', noRawInteractive, {
  valid: [],
  invalid: [
    {
      filename: APP_FILE,
      options: FIXES,
      code: `export const A = () => <textarea value={note} onChange={(e) => setNote(e.target.value)} />`,
      output: `import { Textarea } from '@polymorph/react-ui'

export const A = () => <Textarea value={note} onChange={(value) => setNote(value)} />`,
      errors: [textarea],
    },
    // Every use of the event is its value, so each becomes the value.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `import { Stack } from '@polymorph/react-ui'
export const A = () => (
  <textarea
    name="note"
    rows={6}
    value={note}
    onChange={function (event) {
      if (event.currentTarget.value.length < 500) setNote(event.currentTarget.value)
    }}
  />
)`,
      output: `import { Stack, Textarea } from '@polymorph/react-ui'
export const A = () => (
  <Textarea name="note" rows={6} value={note} onChange={function (value) {
      if (value.length < 500) setNote(value)
    }} />
)`,
      errors: [textarea],
    },
    // A handler that takes nothing is kept as written.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `import { Textarea } from '@polymorph/react-ui'
export const A = () => <textarea value={note} onChange={() => setDirty(true)} />`,
      output: `import { Textarea } from '@polymorph/react-ui'
export const A = () => <Textarea value={note} onChange={() => setDirty(true)} />`,
      errors: [textarea],
    },
    {
      filename: APP_FILE,
      options: FIXES,
      code: `import { Textarea } from '@polymorph/react-ui'
export const A = () => <textarea value={note} onChange={function () { setDirty(true) }} />`,
      output: `import { Textarea } from '@polymorph/react-ui'
export const A = () => <Textarea value={note} onChange={function () { setDirty(true) }} />`,
      errors: [textarea],
    },
    // An arrow's `arguments` is the enclosing function's, which the rewrite
    // does not touch.
    {
      filename: APP_FILE,
      options: FIXES,
      code: `import { Textarea } from '@polymorph/react-ui'
export function A() {
  return <textarea onChange={(e) => track(arguments.length, e.target.value)} />
}`,
      output: `import { Textarea } from '@polymorph/react-ui'
export function A() {
  return <Textarea onChange={(value) => track(arguments.length, value)} />
}`,
      errors: [textarea],
    },

    /* ---- what stops it ---------------------------------------------------- */

    // A handler the rule cannot see into, or that uses the event for more
    // than its value.
    unfixedTextarea('<textarea value={note} onChange={handleChange} />'),
    unfixedTextarea('<textarea value={note} onChange={(e) => save(e)} />'),
    unfixedTextarea('<textarea onChange={(e) => setNote(e.target.value.trim(), e.timeStamp)} />'),
    // A typed parameter: the type says it is an event.
    unfixedTextarea(
      '<textarea onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)} />',
    ),
    // `value` already means something inside the handler.
    unfixedTextarea('<textarea onChange={(e) => setNote(e.target.value || value)} />'),
    // A `function` that reads `arguments` would see the value where it read the
    // event, whatever its parameters become.
    unfixedTextarea(
      '<textarea onChange={function (e) { setNote(e.target.value, arguments.length) }} />',
    ),
    unfixedTextarea('<textarea onChange={function () { setNote(arguments[0].target.value) }} />'),
    // The value written to, not read: a parameter cannot take the write.
    unfixedTextarea('<textarea onChange={(e) => e.target.value++} />'),
    unfixedTextarea('<textarea onChange={(e) => { [e.target.value] = parts }} />'),
    unfixedTextarea('<textarea onChange={(e) => { ({ text: e.target.value } = draft) }} />'),
    unfixedTextarea('<textarea onChange={(e) => { for (e.target.value of lines) send() }} />'),
    unfixedTextarea('<textarea onChange={(e) => { e.target.value! = trim(note) }} />'),
    // A prop the member has no place for, and content React would not render.
    unfixedTextarea('<textarea className="note" value={note} />'),
    unfixedTextarea('<textarea defaultValue="Hi" />'),
    unfixedTextarea('<textarea>Hi</textarea>'),
  ],
})

function unfixedTextarea(element: string) {
  return {
    filename: APP_FILE,
    options: FIXES,
    code: `import { Textarea } from '@polymorph/react-ui'\nexport const A = () => ${element}`,
    output: null,
    errors: [textarea],
  }
}
