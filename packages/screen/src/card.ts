import { DEFAULT_FRAMEWORK } from '@polymorph/registry/frameworks'
import { renderRuntimeCard } from '@polymorph/registry/runtime-card'
import { SPEC_ID } from '@polymorph/spec/schema'

import { allowedMembers, type MemberOptions, type ScreenVocabulary } from './members'
import { ADDRESS_KEYS, ADDRESS_SCHEMES } from './urls'
import { VOCABULARY } from './vocabulary'

/**
 * The run-time card: what a host puts in a model's system prompt so the
 * model writes a screen the host can draw, in one call, with no tool.
 *
 * It has three parts. The opening says what the model is doing. The members
 * section is the registry's (`renderRuntimeCard` in
 * `packages/registry/src/runtime-card.ts`), rendered from the vocabulary
 * table the host installed, for the members the host allows. The output
 * contract says what the answer is: one `polymorph-screen/1` document, and
 * what the host does with each part of it at run time. A host builds its
 * prompt from the version it runs, so the card never names a member the host
 * cannot draw.
 */

export interface CardOptions extends MemberOptions {
  /** The vocabulary to describe. The generated table when absent. */
  vocabulary?: ScreenVocabulary
}

/** `a`, `a and b`, `a, b and c`. */
const listed = (items: readonly string[]): string =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

const code = (text: string) => `\`${text}\``

/** The opening: what the model is asked to do, and what it cannot do. */
const OPENING = [
  '# Writing a screen',
  '',
  'You write one screen as a document that names members of a closed vocabulary, their props and',
  'what they hold. The host draws it at once, in its own theme: every colour, space, size and motion',
  'is the theme’s, so a document has no field for a style, a class or an expression. Choose members',
  'and variants; bind content to the inputs the host hands the screen.',
  '',
].join('\n')

/** The output contract, for the members a host allows. */
export function outputContract(options: CardOptions = {}): string {
  const vocabulary = options.vocabulary ?? VOCABULARY
  const allowed = allowedMembers(vocabulary, options)
  const scopes = vocabulary.exceptions.primitives.filter((primitive) => allowed.has(primitive.name))
  const patched = vocabulary.components
    .filter((member) => allowed.has(member.name))
    .filter((member) => member.props.some((prop) => prop.name === 'patch'))
    .map((member) => code(member.name))
  const rungs = [
    ...scopes.map((primitive) => `${code(primitive.name)} is rung ${primitive.rung}`),
    ...(patched.length === 0 ? [] : [`a ${code('patch')} prop (on ${listed(patched)}) is rung 3`]),
  ]
  const addresses = listed([...ADDRESS_KEYS].map(code))
  const schemes = ADDRESS_SCHEMES.map(code)

  const lines = [
    '## What you write',
    '',
    `Answer with one document in the ${code(SPEC_ID)} format, as JSON in one fenced \`json\``,
    'block. The host draws it while it arrives, so write its keys in this order: `spec`, `name`,',
    '`purpose`, `inputs`, and `root` last.',
    '',
    `- ${code('spec')} is ${code(JSON.stringify(SPEC_ID))}. ${code('name')} is a PascalCase name for the screen that no member has.`,
    `  ${code('purpose')} is one sentence.`,
    '- `inputs` lists what the host hands the screen, each `{ "name": …, "type": … }`. A data input is',
    '  named for a key of the host’s data, and its `type` is a TypeScript type (`string`, `Order[]`);',
    '  an input the host has no value for is empty. An input whose type is a function that returns',
    '  nothing (`(id: string) => void`) is an action: when a member calls it, the host is told its',
    '  name, its arguments and the value of every named control. Bind each callback prop the person',
    '  acts through to an action input of the callback’s type. A function that returns a value',
    '  (`(row: Row) => string`) is answered with an empty answer and the host is never told.',
    '- `root` is an element: `{ "component": …, "props": { … }, "children": [ … ] }`, `props` and',
    '  `children` left out when empty. `component` is a member or a part (`Member.Part`) listed',
    '  above. Every prop goes inside `props`, and a member takes no prop and no child it does not list.',
    '  Write an element’s plain props before its props that hold elements, and `props` before',
    '  `children`: the screen is drawn as it is written, and an element is drawn once its plain',
    '  props are whole.',
    '- A value is a string, a number, a boolean, `null`, an element, a list of values, a binding',
    '  `{ "$": "input" }` or `{ "$": "input.field" }`, or a structured object `{ "$object": { … } }`',
    '  (an option, a column). A binding names a declared input and is never an expression.',
    '- There is no condition and no loop: every element is drawn whenever the screen is. Content that',
    '  is sometimes absent is a prop bound to an input that is empty while there is nothing to show.',
    '- A control with a `name` reports its current value under that name with every action, so name',
    '  each field a person fills in. A name is used once in a screen: two forms on one screen name',
    '  their fields apart (`signInEmail`, `signUpEmail`), because one name holds one value.',
    `- An address (${addresses}) is relative, a fragment, or ${schemes.slice(0, -1).join(', ')} or ${schemes.at(-1) ?? ''}.`,
  ]
  if (rungs.length > 0) {
    lines.push(
      `- A declared exception: ${listed(rungs)}. An element that is one carries`,
      '  `"exception": { "rung": …, "because": "…" }`, the reason in four words or more; no other',
      '  element has `exception`.',
    )
  }
  return `${lines.join('\n')}\n`
}

/**
 * The run-time card for the members a host allows: the opening, the members
 * section and the output contract. Its default is every member the
 * framework draws but those that host another library's code.
 */
export function runtimeCard(options: CardOptions = {}): string {
  const vocabulary = options.vocabulary ?? VOCABULARY
  const members = renderRuntimeCard(vocabulary, {
    framework: options.framework ?? DEFAULT_FRAMEWORK,
    members: allowedMembers(vocabulary, options),
  })
  return `${OPENING}\n${members}\n${outputContract(options)}`
}
