import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import iconSet from '../../../../design/icons.json' with { type: 'json' }
import { apiSection, fenceProps, parseSpecApi } from '../spec-api'
import { SLUG_NAMES } from '../stylelint/index.js'
import { verifyCode, verifyCss } from '../verify'
import type { MemberCall } from './advice'
import { BOX_MEMBERS, ELEMENT_MEMBERS } from './layout'
import { CHART_MEMBERS } from './no-external-dataviz'
import { MOTION_MEMBERS } from './no-external-motion'
import {
  BUTTON_CARRIES,
  BUTTON_TYPES,
  CHECKBOX_CARRIES,
  HANDLED_MEMBERS,
  INPUT_MEMBERS,
  TEXTAREA_CARRIES,
} from './no-raw-interactive'
import { TYPE_MEMBERS } from './no-raw-styles'
import { PAGE_ARCHETYPES } from './one-opener'

/**
 * Checks the fixes that write a member against that member's spec.
 *
 * A red rule is syntactic and knows nothing about the vocabulary, except where
 * a fix rewrites code to use it. `no-raw-interactive` turns a `<button>` into a
 * `Button`, and `no-external-icons` turns a glyph into an `Icon`. Each needs to
 * know a few of the member's props, and that knowledge is a copy that can
 * drift. If `Button` renamed `label`, the fix would keep writing the old name
 * into other people's files and nothing would catch it. The copies are
 * therefore compared with `design/components/`, which the spec-staleness law
 * already checks against the code.
 */

const ROOT = process.cwd()

function specOf(member: string, file: string) {
  const markdown = readFileSync(resolve(ROOT, 'design/components', file), 'utf8')
  const section = apiSection(markdown)
  if (section === null) throw new Error(`${file} has no API section`)
  return { markdown, props: parseSpecApi(section, member).byLabel.get(member) ?? new Set<string>() }
}

describe('the `<button>` fix writes props `Button` has', () => {
  const { markdown, props } = specOf('Button', 'button.md')

  it('keeps only props the member declares, under the same names', () => {
    expect(props.size).toBeGreaterThan(5)
    for (const prop of BUTTON_CARRIES) expect(props, prop).toContain(prop)
    // The prop the content becomes, and the prop the fix sets on a button with no type.
    expect(props).toContain('label')
    expect(props).toContain('type')
  })

  it('matches the `type` values the member accepts', () => {
    const row = markdown.split('\n').find((line) => line.startsWith('| `type` |')) ?? ''
    // Escaped pipes are a union inside a cell, not a column.
    const [, type, initial] = row
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((cell) => cell.trim())

    const values = [...(type ?? '').matchAll(/'([a-z]+)'/g)].map((match) => match[1])
    expect(values.sort()).toEqual([...BUTTON_TYPES].sort())
    // The default is the value the fix omits.
    expect(initial).toBe("`'button'`")
  })

  it('has no style props, which is why a styled `<button>` is left unchanged', () => {
    // The fix keeps every prop or does not run. `className` and `style` have no
    // place on the member, so either one stops the fix.
    expect(props).not.toContain('className')
    expect(props).not.toContain('style')
  })
})

describe('the glyph fix writes props `Icon` has', () => {
  const { props } = specOf('Icon', 'icon.md')

  it('writes the role and the label with `Icon`’s own prop names', () => {
    expect(props).toContain('name')
    expect(props).toContain('label')
    // `Icon`'s `size` is a token step and it has no colour prop, so a glyph with
    // a pixel size or a colour has no single rewrite and is left unchanged.
    expect(props).toContain('size')
    expect(props).not.toContain('color')
    expect(props).not.toContain('className')
  })

  it('reads a role map whose glyph names are the set’s component names', () => {
    // `trash-2` -> `Trash2` is the fix's only assumption about the set. The map
    // file imports every glyph under exactly that spelling, and its own test
    // checks each against the set's exports.
    const map = readFileSync(resolve(ROOT, 'packages/react/src/icon/map.tsx'), 'utf8')
    const imported = new Set(map.slice(0, map.indexOf("} from 'lucide'")).match(/\b[A-Z]\w*/g))

    const roles = Object.values(iconSet.roles)
    expect(roles.length).toBeGreaterThan(50)
    for (const { glyph } of roles) {
      const component = glyph
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('')
      expect(imported, glyph).toContain(component)
    }
  })
})

describe('the checkbox fix writes props `Checkbox` has', () => {
  const { props } = specOf('Checkbox', 'checkbox.md')

  it('keeps only props the member declares, under the same names', () => {
    for (const prop of CHECKBOX_CARRIES) expect(props, prop).toContain(prop)
    // The label beside the box becomes `label`, and a handler `onCheckedChange`.
    expect(props).toContain('label')
    expect(props).toContain('onCheckedChange')
    expect(props).not.toContain('onChange')
  })
})

describe('the textarea fix writes props `Textarea` has', () => {
  const { props } = specOf('Textarea', 'textarea.md')

  it('keeps only props the member declares, under the same names', () => {
    for (const prop of TEXTAREA_CARRIES) expect(props, prop).toContain(prop)
    expect(props).toContain('onChange')
  })

  it('calls `onChange` with the value first, which is why a handler is rewritten', () => {
    // Textarea's change handler is "as Input", and Input's passes the value
    // before the event. A fix that carried an event handler across unchanged
    // would hand it a string.
    const input = readFileSync(resolve(ROOT, 'design/components/input.md'), 'utf8')
    expect(input).toContain('`onChange(value: string, event)`')
  })
})

/* -------------------------------------------------------------------------- */
/* Every member a report names                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every member the specs declare -> its props, or `null` where the spec's API
 * is not a table or a named interface the parser reads. Part names such as
 * `Table.Row` are members too.
 */
function vocabulary(): Map<string, Set<string> | null> {
  const found = new Map<string, Set<string> | null>()
  for (const dir of ['design/components', 'design/archetypes']) {
    for (const file of readdirSync(resolve(ROOT, dir))) {
      if (!file.endsWith('.md') || file.startsWith('README')) continue
      const markdown = readFileSync(resolve(ROOT, dir, file), 'utf8')
      const heading = /^# (.+)$/m.exec(markdown)?.[1] ?? ''
      const names = [...heading.matchAll(/[A-Z][A-Za-z]*/g)].map((match) => match[0])
      const section = apiSection(markdown) ?? []
      for (const name of names) {
        const parsed = parseSpecApi(section, name)
        const fenced = fenceProps(parsed.fences, `${name}Props`)
        const props = new Set([
          ...(parsed.byLabel.get(name) ?? []),
          ...fenced.named,
          ...fenced.loose,
        ])
        found.set(name, props.size > 0 ? props : null)
        for (const [label, own] of parsed.byLabel) if (label !== name) found.set(label, own)
      }
    }
  }
  return found
}

const VOCABULARY = vocabulary()

// The ladder's own primitives have no spec in `design/components/`: the rung
// table in `docs/rules.md` is theirs, and their source is the API.
for (const [member, file] of [
  ['Bespoke', 'Bespoke.tsx'],
  ['DensityScope', 'Scopes.tsx'],
  ['ToneScope', 'Scopes.tsx'],
] as const) {
  const source = readFileSync(resolve(ROOT, 'packages/react-ui/src/exceptions', file), 'utf8')
  VOCABULARY.set(
    member,
    new Set([...source.matchAll(/^\s+(\w+)\??:/gm)].map((match) => match[1] as string)),
  )
}

/** Each `<Member prop=…>` span in a piece of message text. */
function spans(text: string): MemberCall[] {
  return [...text.matchAll(/`<([A-Z][\w.]*)([^`>]*)>`/g)].map(([, member, rest]) => ({
    member: member as string,
    attributes: Object.fromEntries(
      [...(rest ?? '').matchAll(/\b([a-zA-Z][\w-]*)(?==|\s|$)/g)].map((match) => [match[1], '']),
    ),
  }))
}

function expectInVocabulary({ member, attributes = {} }: MemberCall): void {
  expect(VOCABULARY.has(member), `${member} is not a member`).toBe(true)
  const props = VOCABULARY.get(member)
  if (!props) return
  for (const prop of Object.keys(attributes)) {
    expect(props, `${member} has no prop ${prop}`).toContain(prop)
  }
}

describe('every member a report names is in the vocabulary', () => {
  it('reads the vocabulary from the specs', () => {
    expect(VOCABULARY.size).toBeGreaterThan(80)
    expect(VOCABULARY.get('Table.Row')).toContain('interactive')
  })

  it('names fields, controls and charts the specs declare, with their props', () => {
    for (const call of [
      ...Object.values(INPUT_MEMBERS),
      ...Object.values(HANDLED_MEMBERS),
      ...CHART_MEMBERS.map(([, call]) => call),
    ]) {
      expectInVocabulary(call)
    }
  })

  it('names members for styled elements, type steps and motion that exist', () => {
    const text = [...Object.values(ELEMENT_MEMBERS), ...Object.values(TYPE_MEMBERS), BOX_MEMBERS]
    for (const call of text.flatMap(spans)) expectInVocabulary(call)
    for (const { members } of Object.values(MOTION_MEMBERS)) {
      for (const member of members) expectInVocabulary({ member })
    }
  })

  it('knows the page archetypes, each of which takes the title it renders', () => {
    for (const archetype of Object.keys(PAGE_ARCHETYPES)) {
      expectInVocabulary({ member: archetype, attributes: { title: '' } })
    }
  })

  it('reads every member name back from its `data-member` slug', () => {
    // The CSS motion rule names the member a `[data-member="…"]` selector
    // picks, by capitalising the slug's words, except for the names listed.
    const slug = (name: string) =>
      name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase()
    for (const name of VOCABULARY.keys()) {
      if (name.includes('.')) continue
      const read =
        SLUG_NAMES[slug(name)] ??
        slug(name).replace(/(^|-)([a-z0-9])/g, (_, __, letter: string) => letter.toUpperCase())
      expect(read, name).toBe(name)
    }
  })

  it('names only members and props that exist, in every report the rules make', () => {
    // The tables above are the data; this is what the messages render from it.
    // Every attribute in every member span is checked, not only the first one
    // the structured alternative carries: `<Grid columns={3} gap={3}>` names two.
    const reports = [
      `export const A = () => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, justifyContent: 'center', alignItems: 'center' }} />`,
      `export const A = () => <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }} />`,
      `export const A = () => <div className="flex flex-wrap gap-2 px-4 py-2 items-center justify-between border" />`,
      `export const A = () => <><span className="badge badge-success" /><span className="text-sm text-gray-500" /><body className="font-sans" /></>`,
      `const s = { borderRadius: '6px', fontSize: '15px', height: '36px', width: '16px', margin: '10px', font: '14px serif' }`,
      `export const A = () => <><input type="checkbox" /><input type="hidden" /><input type="month" /><select multiple /><textarea /><div onClick={a} /><tr onClick={a} /><a href="/" onClick={a} /></>`,
      `export const A = () => <button><Icon name="close" /></button>`,
      `import { motion } from 'framer-motion'\nexport const A = () => <motion.button whileTap={{ scale: 0.9 }} />`,
      `export { AnimatePresence } from 'framer-motion'\nexport { BarChart } from 'recharts'`,
      `export const A = () => <><Hero title="a" /><PageHeader title="b" /></>`,
    ].flatMap((code) => verifyCode(code).diagnostics)
    expect(reports.length).toBeGreaterThan(10)
    let checked = 0
    for (const report of reports) {
      for (const call of spans(report.message)) {
        expectInVocabulary(call)
        checked += Object.keys(call.attributes ?? {}).length
      }
    }
    expect(checked).toBeGreaterThan(10)
  })

  it('names only members and props that exist, in every report about application CSS', async () => {
    // The scopes, the patches and the member a `[data-member]` selector names.
    const css =
      ':root {\n  font-size: 81.25%;\n  --pm-accent-bg: red;\n  --pm-space-2: 1px;\n  --pm-radius-sm: 0;\n}\n' +
      '[data-mode="dark"] .a,\n[data-density="compact"] .b,\n[data-member="button"] .c {\n  color: red;\n}\n'
    const reports = (await verifyCss(css)).diagnostics
    expect(reports.length).toBeGreaterThan(6)
    const calls = reports.flatMap((report) => spans(report.message))
    for (const call of calls) expectInVocabulary(call)
    expect(calls.map((call) => call.member).sort()).toEqual(
      expect.arrayContaining(['Button', 'Card', 'DensityScope', 'Stack', 'ToneScope']),
    )
  })
})
