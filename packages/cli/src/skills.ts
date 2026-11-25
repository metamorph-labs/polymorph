import { FRAMEWORKS, type Registry } from '@polymorph/registry'

import { DEFAULT_SYSTEM, ELEMENTS_DIR, ELEMENTS_THEME_SHEET } from './plan'

/**
 * The texts of the four agent skills, in the Agent Skills format
 * (agentskills.io): a directory per skill with a `SKILL.md` whose front
 * matter holds `name` and `description`, and a `references/` directory for
 * what a model reads only when a step sends it there.
 *
 * Each text is a function of the registry and of `run`, the command that
 * reaches the tools (`npx -y @metamorph-labs/polymorph@^<version>`, or a
 * checkout's bin), so a skill always names the release that wrote it. The
 * ladder's rungs and the application rules are read from the registry, not
 * copied into the text. What does not change with the vocabulary (the spec
 * format's outline, each rung's procedure) is in `references/`.
 *
 * The texts are written for a model that has never seen polymorph and has a
 * shell. `agents.test.ts` holds every command they name to the verb list, and
 * each skill to the format's limits.
 */

/** A skill names a member, a prop, a part or a value the registry does not have. */
export class SkillFactError extends Error {
  constructor(message: string) {
    super(`skills: ${message}`)
    this.name = 'SkillFactError'
  }
}

/**
 * What the texts say about members, read from the registry. Every member,
 * prop, part and value a sentence names comes through here, and one the
 * registry lacks throws, so a renamed prop stops the texts from being written
 * rather than reaching a model.
 */
class Facts {
  constructor(private readonly registry: Registry) {}

  private member(name: string) {
    const found = [...this.registry.components, ...this.registry.exceptions.primitives].find(
      (member) => member.name === name,
    )
    if (found === undefined) throw new SkillFactError(`no member called ${name}`)
    return found
  }

  /** `name` in code font, once the registry has the member. */
  m(name: string): string {
    this.member(name)
    return `\`${name}\``
  }

  /** The type of a member's prop, which must exist. */
  private type(member: string, prop: string): string {
    const found = this.member(member).props.find((entry) => entry.name === prop)
    if (found === undefined) throw new SkillFactError(`${member} has no prop ${prop}`)
    return found.type
  }

  /** `prop` in code font, once `member` has it. */
  p(member: string, prop: string): string {
    this.type(member, prop)
    return `\`${prop}\``
  }

  /** The string values a prop's type allows, in its order. */
  values(member: string, prop: string): string[] {
    return [...this.type(member, prop).matchAll(/"([^"]+)"/g)].map((match) => match[1] as string)
  }

  /** `prop="value"` in code font, once the prop takes the value. */
  v(member: string, prop: string, value: string): string {
    if (!this.values(member, prop).includes(value)) {
      throw new SkillFactError(`${member}'s ${prop} takes no "${value}"`)
    }
    return `\`${prop}="${value}"\``
  }

  /** `Member.Part` in code font, once the member has the part. */
  part(member: string, part: string): string {
    const parts = (this.member(member) as { parts?: unknown }).parts
    if (!Array.isArray(parts) || !parts.some((entry: { name?: string }) => entry.name === part)) {
      throw new SkillFactError(`${member} has no part ${part}`)
    }
    return `\`${member}.${part}\``
  }

  /** The props every one of `members` has, among `wanted`, in code font. */
  shared(members: string[], wanted: string[]): string[] {
    const found = wanted.filter((prop) =>
      members.every((member) => this.member(member).props.some((entry) => entry.name === prop)),
    )
    if (found.length === 0)
      throw new SkillFactError(`${members.join(', ')} share none of ${wanted}`)
    return found.map((prop) => `\`${prop}\``)
  }

  /** The prop of `member` whose type lists the icon roles. */
  roleProp(member: string): string {
    const role = this.registry.icons.roles[0]?.name
    const found = this.member(member).props.find((entry) => entry.type.includes(`"${role}"`))
    if (role === undefined || found === undefined) {
      throw new SkillFactError(`${member} has no prop that takes an icon role`)
    }
    return `\`${found.name}\``
  }

  /** Each type a member's `patch` takes, with the members that take it and its keys. */
  patches(): { type: string; members: string[]; keys: string[] }[] {
    const byType = new Map<string, string[]>()
    for (const member of this.registry.components) {
      const patch = member.props.find((entry) => entry.name === 'patch')
      if (patch === undefined) continue
      const type = patch.type.split('|')[0]?.trim() ?? ''
      byType.set(type, [...(byType.get(type) ?? []), member.name])
    }
    return [...byType].map(([type, members]) => {
      const declared = this.registry.dataTypes.find((entry) => entry.name === type)
      if (declared === undefined) throw new SkillFactError(`no data type called ${type}`)
      return { type, members, keys: declared.fields.map((field) => field.name) }
    })
  }

  /** The names of the theme's design axes. */
  axes(): string[] {
    return this.registry.theme.axes.map((axis) => axis.name)
  }

  /** The members of a tier, in the registry's order. */
  tier(name: string): string[] {
    return this.registry.components.filter((member) => member.tier === name).map((m) => m.name)
  }
}

/** Words in code font in a sentence: `a`, `a and b`, `a, b and c`. */
function all(words: readonly string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

/** One file of a skill, at its path below the skills directory. */
export interface SkillFile {
  path: string
  contents: string
}

/** The skills, in the order the always-loaded text names them. */
export const SKILL_NAMES = [
  'polymorph-screen',
  'polymorph-rules',
  'polymorph-setup',
  'polymorph-theme',
] as const
export type SkillName = (typeof SKILL_NAMES)[number]

/** A fenced shell block of commands, each starting with `run`. */
function commands(run: string, ...lines: string[]): string {
  return ['```sh', ...lines.map((line) => `${run} ${line}`), '```'].join('\n')
}

/** Words in a sentence as alternatives: `a`, `a or b`, `a, b or c`. */
function either(words: readonly string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`
}

/** Front matter and body, as one `SKILL.md`. */
function skill(name: SkillName, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body.trim()}\n`
}

/** The table that tells a framework from the packages a project depends on. */
function frameworkTable(): string {
  const rows = FRAMEWORKS.filter((framework) => framework !== 'elements').map(
    (framework) => `| \`@polymorph/${framework}-ui\` | \`${framework}\` |`,
  )
  return [
    '| The project has | The framework |',
    '| --- | --- |',
    ...rows,
    '| `"framework": "elements"` in `polymorph.json` | `elements`: `<poly-*>` custom elements in HTML pages with no build |',
  ].join('\n')
}

/* -------------------------------------------------------------------------- */
/* polymorph-screen                                                           */
/* -------------------------------------------------------------------------- */

function screenSkill(registry: Registry, run: string): SkillFile[] {
  const f = new Facts(registry)
  const spacing = all(f.shared(['Stack', 'Inline', 'Grid'], ['gap', 'p', 'px', 'py']))
  const pages = f
    .tier('archetypes')
    .slice(0, 3)
    .map((name) => f.m(name))
  const body = `
# Build a screen with polymorph

Polymorph is a closed vocabulary of interface components, called members, and a set of lint rules,
the red rules, that keep design decisions out of application code. The theme decides every colour,
size, font and motion. A screen composes members, sets their props and binds content to them.

You reach the tools from a shell. Every command in this skill starts with the same words:

${commands(run, 'card --framework <framework>')}

If the session also has an MCP server named \`polymorph\`, its tools do the same jobs:
\`get_system_card\` for \`card\`, \`search_components\` for \`search\`, \`get_component\` for
\`component\`, \`validate\`, \`fix\`, \`emit_screen\` for \`emit\` and \`render_screen\` for \`render\`.
Pass the app's framework as \`framework\` to every one that takes it. A server started for no
project, as a plugin's is, cannot read the framework from the project, and reads code as React's.

## 1. Find the framework and how the app writes screens

Read \`package.json\` and \`polymorph.json\` at the project root. A package may be listed under its
published name, \`@metamorph-labs/polymorph-<name>\`.

${frameworkTable()}

That is \`<framework>\` in every command below. A project that vendors members has their source under
the \`dir\` that \`polymorph.json\` names, usually \`src/polymorph/\`, and imports them from there.
Those files are the vocabulary: do not edit them to make a screen work.

Then look for screen specs: JSON files with \`"spec": "polymorph-screen/1"\`, usually in
\`src/screens/\`, each beside the component emitted from it. If the app has them, write the new
screen as a spec (step 4). Otherwise write it in the framework's own code (step 5).

## 2. Read the card

${commands(run, 'card --framework <framework>')}

The card lists every member with its props, the variants and tones each takes, its compound parts
(such as ${f.part('Table', 'Row')}), the icon roles, the token families, the red rules and the
exception ladder. \`polymorph/system-card.md\` holds the card as it was when the project was set up.
The command answers for the release it names.

A member or a prop that is not in the card does not exist. Do not invent one, and do not bring in
components from another interface library.

## 3. Choose the members

${commands(run, 'search date picker --framework <framework>', 'component DatePicker --framework <framework>')}

\`search\` takes plain words and finds members by name, purpose, prop or variant. With no words it
lists every member. \`component\` prints one member: each prop with its type and default, the
lawful variant and tone pairs, its states, its parts and what it depends on. A wrong name is
answered with suggestions and exit code 1.

- Lay out with ${f.m('Stack')}, ${f.m('Inline')} and ${f.m('Grid')} and their spacing props
  (${spacing}), which take steps of the space scale, never lengths.
- Start a page from a page archetype (${all(pages)} and the others the card lists) or from
  ${f.m('PageHeader')}.
- Show an icon with ${f.m('Icon')}, its ${f.roleProp('Icon')} one of the card's icon roles.
- Put text in ${f.m('Text')}, whose ${f.p('Text', 'tone')} and ${f.p('Text', 'size')} take the
  place of a colour or a font size, and a heading in ${f.m('Heading')}, whose
  ${f.p('Heading', 'level')} sets its rank.

## 4. Write a spec, then emit it

The format is in [references/screen-spec.md](references/screen-spec.md). Check the spec, then
compile it into a component:

${commands(run, 'validate src/screens/inbox.json --framework <framework>', 'emit src/screens/inbox.json <out> --framework <framework>')}

\`validate\` lists each fault at its path, such as \`$.root.children[1]\`, with suggestions for a
wrong name, and exits 0 when the spec is lawful. \`emit\` validates again, compiles the spec, checks
the output against the red rules, and writes nothing when either fails. \`<out>\` is the component
to write, with the framework's extension: \`.tsx\` for React and Solid, \`.vue\`, \`.svelte\`, and
\`.ts\` for an Angular standalone component.

The emitted component holds no state and no logic. A container you write renders it, owns the
state, and passes the data and the callbacks the spec declares as \`inputs\`. Never edit an emitted
file: change the spec and emit it again.

## 5. Or write the screen in code

Import members from the framework's vocabulary package, or from the vendored directory in a project
that vendors. Then check the file:

${commands(run, 'validate src/pages/Settings.tsx --framework <framework>')}

\`validate\` takes several files. For a whole directory, use \`check\`, which reads each file in its
own framework:

${commands(run, 'check src')}

The red rules do not read an HTML page. In an \`elements\` project, check a page by reading it
against the card.

## 6. Fix every violation

Each violation is a line with the file, the position, the rule and its message. Under it are the
lawful answers:

- \`fix\`: a rewrite with exactly one lawful answer. The \`fix\` command below applies them.
- \`use\`: the members, props or tokens the message names. A colour, size or spacing becomes a prop
  of a member, as \`component\` lists them. A clickable \`<div>\` becomes a ${f.m('Button')}. A
  glyph from an icon set becomes ${f.m('Icon')} with a role as its ${f.roleProp('Icon')}.
- \`climb\`: the rungs of the exception ladder that answer the rule. When no member, variant or prop
  fits, follow the \`polymorph-rules\` skill.

Apply every rewrite that has one answer, then work through what is left:

${commands(run, 'fix src/pages/Settings.tsx --framework <framework>')}

With \`--dry-run\`, \`fix\` prints the fixed code and writes nothing. Never add an \`eslint-disable\`
comment for a polymorph rule. Run \`validate\` again until it exits 0.

## 7. Look at the screen

${commands(run, `render src/screens/inbox.json --system ${DEFAULT_SYSTEM}`)}

\`render\` draws a spec in a browser at a phone width (375 by 812) and a desktop width (1440 by
900), writes the pictures beside the spec (\`src/screens/inbox.render/sampled-phone.png\`), and lists
the layout faults it measured in each. Open the pictures and look at them. With no data, each input
is sampled from its type, so the pictures show where content goes. \`--data <file>\` draws the screen
with a JSON value for each input, and \`--empty <file>\` adds a second drawing with its values laid
over those.

| Fault | What to change |
| --- | --- |
| \`sideways-scroll\` | Something is wider than the window. Let an ${f.m('Inline')} wrap (${f.p('Inline', 'wrap')}), move actions into a menu, or use a member built to scroll. |
| \`clipped-text\` | Text does not fit its box. Shorten it, or give its container room. |
| \`small-target\` | Controls are too small or too close together. Use a larger size or more space between them. |
| \`cut-off\` | Content lies where nothing scrolls to it. Change the composition. |
| \`no-gap\` | Two members touch. Put them in a ${f.m('Stack')} or ${f.m('Inline')} with a ${f.p('Stack', 'gap')}. |
| \`unseen-focus\` | A control's focus mark is hidden. Do not put the control in a box that clips it. |

Change the composition or a prop to fix a fault, never a style. \`--system\` names a shipped system:
the one the app's theme starts from, or \`${DEFAULT_SYSTEM}\`. \`axes\` lists them. The first \`render\`
on a machine may answer that its browser is missing, with the command that downloads it. Run that
command once, then render again.

\`render\` draws specs only. For a screen written in code, run the app and look at it in a browser
when the session can.

## 8. Run the checks

${commands(run, 'check src')}

\`check\` runs the red rules over the directory whatever the project's lint config holds, and exits 1
on any violation. Then run the project's own lint and typecheck, as \`package.json\` names them. Its
lint runs the red rules too only when its ESLint config loads them: it imports \`@polymorph/rules\`
or spreads the fragment \`polymorph.eslint.js\` that \`init\` and \`add\` write.

## What application code may not contain

- CSS files, \`<style>\` blocks, CSS-in-JS, or a stylesheet import other than a font package's.
- A \`style\`, \`className\` or \`css\` prop, on a member or a plain element, and a \`class\` on either
  in a framework that writes one. A declared zone lifts this for a plain element (the
  \`polymorph-rules\` skill).
- A colour (\`#7c3aed\`, \`rgb()\`, \`oklch()\`) or a length (\`12px\`, \`1.5rem\`) in a string.
- A raw \`<button>\`, \`<input>\`, \`<select>\`, \`<textarea>\` or \`<option>\`, or a click, key or pointer
  handler on a \`<div>\`, \`<span>\`, \`<li>\` or \`<a>\`.
- An import from an icon set, a motion library or a chart library, or an inline \`<svg>\`.
- A \`--pm-*\` custom property declared by the app.
- An \`eslint-disable\` comment for a polymorph rule.
`
  return [
    {
      path: 'polymorph-screen/SKILL.md',
      contents: skill(
        'polymorph-screen',
        'Build or change a screen, page, form, dialog or layout in an app that uses the polymorph ' +
          'design system, in React, Vue, Svelte, Solid, Angular or an HTML page. Use for any UI ' +
          'work in a repository whose package.json depends on a @polymorph/* or ' +
          '@metamorph-labs/polymorph-* package, or that has a polymorph.json or ' +
          'polymorph/system-card.md. Covers reading the system card, choosing members, writing a ' +
          'screen spec or framework code, validating it against the red rules, fixing violations, ' +
          'emitting a spec, and rendering it at phone and desktop width to read its layout faults.',
        body,
      ),
    },
    { path: 'polymorph-screen/references/screen-spec.md', contents: specReference(registry) },
  ]
}

/** The spec format's outline, which does not change with the vocabulary. */
function specReference(registry: Registry): string {
  const rungs = registry.exceptions.ladder
    .filter((rung) => rung.declaredAs !== null && rung.declaredAs !== 'patch')
    .map((rung) => rung.rung)
  return `# The screen spec: \`polymorph-screen/1\`

A screen spec is a JSON document that describes one screen: which members it composes, the value of
each prop, and the inputs its content is bound to. It has no field for a style and no expression
language. \`validate\` checks it against the vocabulary, and \`emit\` compiles it for the app's
framework.

\`\`\`json
{
  "spec": "polymorph-screen/1",
  "name": "KeysView",
  "purpose": "The API keys an integration uses, with a way to make another.",
  "inputs": [
    { "name": "count", "type": "string", "doc": "How many keys exist, already formatted." },
    { "name": "onCreate", "type": "() => void" }
  ],
  "root": {
    "component": "Stack",
    "props": { "gap": 5 },
    "children": [
      { "component": "Heading", "children": ["API keys"] },
      { "component": "Text", "props": { "tone": "secondary" }, "children": [{ "$": "count" }] },
      {
        "component": "Button",
        "props": { "variant": "solid", "tone": "accent", "label": "Create key", "onClick": { "$": "onCreate" } }
      }
    ]
  }
}
\`\`\`

## Fields

| Field | Meaning |
| --- | --- |
| \`spec\` | Always \`polymorph-screen/1\`. |
| \`name\` | PascalCase: the name of the component \`emit\` writes. |
| \`purpose\` | One sentence. It becomes the emitted file's doc comment. |
| \`inputs\` | What the screen is handed: \`{ "name", "type", "doc"? }\`. \`type\` is one TypeScript type, such as \`string\`, \`Ticket[]\` or \`(id: string) => void\`. Every binding names one of these, a callback included. |
| \`types\` | Optional. A module mapped to the type names the inputs use, emitted as \`import type\` lines. |
| \`root\` | One element: the screen's tree. Write it last. |

## Elements and values

An element is \`{ "component", "props"?, "children"?, "exception"? }\`. \`component\` is a member or
one of its parts (such as ${new Facts(registry).part('Table', 'Row')}), as the card lists them for the
app's framework.

A value, as a prop or a child, is a string, a number, a boolean, \`null\`, an element, a list, a
binding \`{ "$": "inputName" }\`, or a structured object \`{ "$object": { … } }\` for data a prop
takes.

A binding names a declared input, or a dotted path into one (\`draft.subject\`). It is never an
expression: no call, operator or index. A value the screen needs computed, such as a count or a
filtered list, is computed by the container and passed in as an input of its own.

A spec has no condition. Every element is rendered whenever the screen is. Content that is
sometimes absent is a prop bound to an input that is empty while there is nothing to show, on a
member that draws nothing when it is given nothing.

## Exceptions

An element may declare a rung of the exception ladder (rungs ${rungs.join(' and ')} on a
primitive, and rung 3 as a \`patch\` prop) with the reason:

\`\`\`json
{
  "component": "DensityScope",
  "props": { "value": "compact" },
  "exception": { "rung": 2, "because": "A queue is scanned, so more rows per screen is worth more here." },
  "children": []
}
\`\`\`

## The loop

1. Write the spec from the card and the members \`component\` describes.
2. \`validate\` it. Each fault names its path and, for a wrong name, the nearest real ones.
3. Correct and validate again until it is lawful.
4. \`render\` it and read the pictures and the layout faults. Correct the composition and render
   again.
5. \`emit\` it into the app, and write or update the container that renders it.
`
}

/* -------------------------------------------------------------------------- */
/* polymorph-rules                                                            */
/* -------------------------------------------------------------------------- */

function rulesSkill(registry: Registry, run: string): SkillFile[] {
  const f = new Facts(registry)
  const ladder = registry.exceptions.ladder
    .map((rung) => {
      const declared =
        rung.declaredAs === null
          ? ''
          : ` (${rung.declaredAs
              .split('|')
              .map((name) => `\`${name.trim()}\``)
              .join(', ')})`
      return `${rung.rung}. **${rung.name}**${declared}: ${rung.summary}.`
    })
    .join('\n')
  const rules = registry.laws
    .filter((law) => law.applies === 'application')
    .map(
      (law) =>
        `| \`${law.name}\` | ${law.summary} | ${law.climb.length === 0 ? 'none' : law.climb.join(', ')} |`,
    )
  const body = `
# Answer a red rule

The red rules are lint rules that keep design decisions out of application code. Exceptions are
allowed when they are declared: a declared exception names its reason, where a reviewer can read
it. A silenced rule is not allowed. Never add \`eslint-disable\`, \`eslint-disable-next-line\`
or \`stylelint-disable\` for a polymorph rule, and never change a lint config to turn one off.

Every command in this skill starts with the same words, the polymorph tools run from a shell.
\`<framework>\` is the app's: the \`polymorph-screen\` skill says how to tell it. An MCP server
named \`polymorph\` does the same jobs through \`validate\`, \`fix\` and \`get_component\`, given
the framework as \`framework\`.

## 1. Read what the rule says

${commands(run, 'validate src/App.tsx --framework <framework>')}

Each violation is a line with the file, the position, the rule and its message. Under it:

- \`fix\`: a rewrite with exactly one lawful answer.
- \`use\`: the members, props and tokens the message names, each with its rung.
- \`climb\`: every rung of the ladder that answers this rule.

## 2. Take the rewrite when there is one

${commands(run, 'fix src/App.tsx --dry-run --framework <framework>', 'fix src/App.tsx --framework <framework>')}

The first prints the fixed code, and the second writes it. The project's own \`eslint --fix\`
applies the same rewrites. A violation left after the fix is a decision: take the next step.

## 3. Climb the exception ladder

Take the first rung that works. Each rung is more governed than the next.

${ladder}

[references/ladder.md](references/ladder.md) has each rung's procedure, with code.

## 4. Which rungs answer which rule

| Rule | What it holds | Rungs |
| --- | --- | --- |
${rules.join('\n')}

Common cases:

- A colour, length or style on a member: find the prop that decides it with \`component <Name>\`,
  such as ${f.m('Button')}'s ${f.p('Button', 'variant')} and ${f.p('Button', 'tone')} or
  ${f.m('Stack')}'s ${f.p('Stack', 'gap')}. A spacing the scale lacks for one instance is a
  \`patch\` (rung 3). A one-off illustration is a ${f.m('Bespoke')} zone (rung 4).
- A raw control, or a click handler on a plain element: the member that is that control, such as
  ${all(['Button', 'Checkbox', 'Select', 'Input', 'Textarea'].map((name) => f.m(name)))}.
  \`search\` finds it by what it does.
- An icon set or an inline \`<svg>\`: ${f.m('Icon')} with a role from the card as its
  ${f.roleProp('Icon')}. A glyph no role names is a ${f.m('Bespoke')} zone until the vocabulary adds
  a role.
- A chart library: the chart members. A chart they cannot draw goes in a ${f.m('Bespoke')} zone.
- A motion library: members animate their own states. Motion the vocabulary has no member for goes
  in a ${f.m('Bespoke')} zone.
- A stylesheet import: delete it. Another library's own stylesheet is imported in the file that
  hosts the library inside ${f.m('ThirdParty')}.
- Another library's component, such as a map, an editor or a data grid: ${f.m('ThirdParty')}
  (rung 4).

## 5. When the same exception keeps coming back

A patch or a zone that recurs is promoted into the vocabulary or deleted (rung 5). That is a
decision for whoever owns the design system: tell the person you are working for, with the zones
and their reasons. Do not build a private copy of a member.
`
  return [
    {
      path: 'polymorph-rules/SKILL.md',
      contents: skill(
        'polymorph-rules',
        'Resolve a polymorph red-rule violation, a lint error whose rule starts with polymorph/ ' +
          'such as polymorph/no-raw-styles, polymorph/no-raw-interactive or polymorph/no-app-css, ' +
          'or a design need the polymorph vocabulary does not seem to cover. Use when ESLint, ' +
          'Stylelint, polymorph validate or polymorph check reports a polymorph/ rule, before ' +
          'adding any eslint-disable comment, and when a screen needs a style, a control, an ' +
          "icon, a chart, motion or another library's component that no member provides. Walks " +
          'the exception ladder rung by rung.',
        body,
      ),
    },
    { path: 'polymorph-rules/references/ladder.md', contents: ladderReference(registry, run) },
  ]
}

/**
 * Each rung's procedure. The procedure does not change with the vocabulary;
 * the members, props and values it names are read from the registry.
 */
function ladderReference(registry: Registry, run: string): string {
  const f = new Facts(registry)
  const values = (member: string, prop: string) =>
    either(f.values(member, prop).map((value) => `\`${value}\``))
  const patches = f
    .patches()
    .map(
      ({ members, keys }) =>
        `${all(members.map((name) => f.m(name)))} take ${all(keys.map((key) => `\`${key}\``))}.`,
    )
    .join(' ')
  return `# The exception ladder, rung by rung

The examples are React. In Vue, Svelte and Solid the members have the same names and props. In
Angular a member is written by its selector (\`<pm-bespoke>\`, \`<pm-third-party>\`), and in a page
with no build as an element (\`<poly-bespoke>\`). A project that vendors members imports these from
its vendored directory and adds one with \`add\` (\`add bespoke\`, \`add third-party\`,
\`add density-scope\`, \`add tone-scope\`).

## Rung 1: variant selection

Every member exposes its range as typed props, such as a variant, a tone, a size and the spacing
steps. A value off the scale is a type error. Read the member first:

${commands(run, 'component Button --framework <framework>')}

The answer lists each prop's values and the variant and tone pairs that are lawful. Most needs end
here: a quieter button is ${f.v('Button', 'variant', 'ghost')}, a destructive one
${f.v('Button', 'tone', 'danger')}, and more room is a larger ${f.p('Stack', 'gap')}.

## Rung 2: ${f.m('DensityScope')} and ${f.m('ToneScope')}

A subtree re-assigns a decision the theme already makes for the whole page. Every value still comes
from the theme.

\`\`\`tsx
import { DensityScope, ToneScope } from '@polymorph/react-ui'

<DensityScope value="compact" as="section">
  <DataTable … />
</DensityScope>

<ToneScope value="inverse">
  …
</ToneScope>
\`\`\`

- ${f.m('DensityScope')}'s ${f.p('DensityScope', 'value')} is ${values('DensityScope', 'value')}.
  It changes space and the size of controls, never the type scale.
- ${f.m('ToneScope')}'s ${f.p('ToneScope', 'value')} is ${values('ToneScope', 'value')}: the
  surface, text and border roles of the opposite mode.
- ${f.p('DensityScope', 'as')} is ${values('DensityScope', 'as')}. A scope draws nothing of its own.

## Rung 3: an instance patch

One instance re-assigns token steps through its ${f.p('Stack', 'patch')} prop. Each value is a step
of a scale, never a length.

\`\`\`tsx
<Stack gap={6} patch={{ gap: 2 }}>…</Stack>
<Card patch={{ p: 4, radius: 'sm' }}>…</Card>
\`\`\`

${patches}

## Rung 4: a ${f.m('Bespoke')} zone or a ${f.m('ThirdParty')} boundary

${f.m('Bespoke')} declares a one-off composition the vocabulary has no member for. Its
${f.p('Bespoke', 'reason')} is required and is read by whoever reviews the code. Inside it the
application rules are lifted for plain elements: \`style\`, a \`className\`, raw values, raw controls
and inline \`<svg>\` are allowed there. A member inside it still takes no \`className\`. It draws
nothing itself, and the theme's tokens reach inside it, so write values as \`var(--pm-…)\`.

\`\`\`tsx
import { Bespoke } from '@polymorph/react-ui'

<Bespoke reason="Promo illustration: overlapping discs the vocabulary has no shape for.">
  <div style={{ padding: 'var(--pm-space-4)', background: 'var(--pm-accent-subtle)' }}>…</div>
</Bespoke>
\`\`\`

${f.m('ThirdParty')} hosts a component another library draws, such as a map, a rich-text editor or
a data grid. It takes ${f.p('ThirdParty', 'library')} and ${f.p('ThirdParty', 'reason')}. The file
that declares it may import that library and its stylesheet, and what it holds may take a
\`style\`. Give the library the theme as \`var(--pm-…)\`, or as values from \`useThemeValues()\` in
the framework's foundation package. Controls and icons around it stay members.

\`\`\`tsx
import { ThirdParty } from '@polymorph/react-ui'
import { MapView } from 'some-map-library'

<ThirdParty library="some-map-library" reason="Store finder map: no member draws a map.">
  <MapView center={center} />
</ThirdParty>
\`\`\`

Accessibility is never suspended, in a zone or anywhere else: a control in a zone still needs a name,
a role and a keyboard path.

## Rung 5: promotion

A patch or a zone that recurs is promoted into the vocabulary as a variant or a member, or it is
deleted. A one-off occurs once. Promotion is the design system owner's decision. Report the
recurring exception with its reasons, and keep each instance declared until then.
`
}

/* -------------------------------------------------------------------------- */
/* polymorph-setup                                                            */
/* -------------------------------------------------------------------------- */

function setupSkill(registry: Registry, run: string): SkillFile[] {
  const frameworks = either(FRAMEWORKS.map((framework) => `\`${framework}\``))
  const systems = registry.theme.systems.map((system) => `\`${system.name}\``).join(', ')
  const body = `
# Set up polymorph

Polymorph is a design system: a closed vocabulary of interface components for React, Vue, Svelte,
Solid and Angular, and as custom elements for an HTML page with no build, with a theme engine and
lint rules (the red rules) that keep design decisions out of application code. Its tools are one
npm package, \`@metamorph-labs/polymorph\`, which every command here runs. Always run that scoped
name: the unscoped \`polymorph\` package on npm is someone else's.

## Which route the repository is on

| You find | The route |
| --- | --- |
| No app yet | A new app: \`init\` |
| \`@polymorph/*\` packages in \`package.json\`, often as npm aliases of \`@metamorph-labs/polymorph-*\` | Packages: the app installs the vocabulary |
| \`polymorph.json\` with \`files\`, and member source under its \`dir\` (\`src/polymorph/\`) | Vendoring: the members are copied into the repository as source the team owns |
| \`polymorph.json\` with \`"framework": "elements"\` | A page with no build: the elements are copied into a static directory |
| An app with none of these | An existing app without polymorph: vendoring is one command; the packages route is a few manual steps |

## A new app

${commands(run, 'init my-app', 'init my-app --framework vue', `init my-app --system ${DEFAULT_SYSTEM} --no-install`, 'init my-site --framework elements')}

\`init\` writes a new Vite app into an empty directory: the packages, a theme from a catalogue system
(${systems}), the red rules wired into ESLint and Stylelint, a first screen written as a spec and
emitted, the agent files (\`AGENTS.md\`, the skills, the MCP entries) and the system card. Then it
installs the packages with the package manager that ran it. \`--framework\` takes
${frameworks}. \`--framework elements\` writes a page with no build that loads the elements from copied files, and
installs nothing.

## An existing app: vendoring

${commands(run, 'plan button dialog theme:pastel --framework <framework>', 'add button dialog theme:pastel', 'diff', 'update')}

\`<framework>\` is the framework the project's members are in (\`react\` unless \`polymorph.json\`
records another). \`plan\` prints what \`add\` would copy and install, and writes nothing. \`add\` copies the members you
name, and every member they need, as source into \`src/polymorph/\` (\`--dir\` changes it), installs a
theme (\`theme:<system>\`, or \`palette:<name>\` for a palette alone), adds the packages the members
import to \`package.json\`, and links the red rules into the project's ESLint and Stylelint configs.
Install the new dependencies afterwards with the project's package manager. \`--framework\` vendors
another framework's members. \`polymorph.json\` records each file with a hash of what was written.

\`diff\` lists the files you have edited and the files that changed upstream. \`update\` copies again
the files you have not edited and keeps the ones you have; \`--force\` takes upstream's copy.

## An existing app: packages

The packages route installs \`@polymorph/engine\`, the framework's foundation and vocabulary, and
\`@polymorph/rules\` as npm aliases of their published names, adds the theme plugin to
\`vite.config\`, and spreads the red rules into the lint configs. The steps, with the exact lines, are
in https://github.com/metamorph-labs/polymorph/blob/main/docs/consuming.md. \`init\` writes the same
files for a new app, so an app it wrote is a working example.

## The agent's files

${commands(run, 'agents', 'agents --harness claude,codex', 'agents --dry-run')}

\`agents\` writes what a coding agent reads in this repository: a marked block in \`AGENTS.md\` (and a
\`CLAUDE.md\` that includes it), these skills in \`.claude/skills/\` and \`.agents/skills/\`, the MCP
server's entry for each harness (\`.mcp.json\`, \`.cursor/mcp.json\`, \`.codex/config.toml\`), and the
system card in \`polymorph/system-card.md\`. \`--harness\` takes \`claude\`, \`codex\`, \`cursor\`,
\`generic\` or \`all\`. It records what it wrote in \`polymorph/agents.json\`. Run it again at any
time: a file it wrote and nobody edited is brought up to date, a file someone edited is kept and
named, and text outside its block in \`AGENTS.md\` and other servers in an MCP config are left as
they are. \`--force\` overwrites edited files.

## Moving to a newer release

Every command in this skill names the release it runs. To move to a newer one, run the same
commands with the newer version in place of this one's. In every project, \`agents\` rewrites the
agent files and the card for that release. In a vendoring project, \`update\` copies the new
members. In a packages project, raise the ranges of the \`@polymorph/*\` aliases and of
\`@metamorph-labs/polymorph\` in \`package.json\`, and install.

## Check the setup

${commands(run, 'check src', 'card --framework <framework>')}

\`check\` runs the red rules over a directory with no lint config and exits 1 on any violation. The
card should list the members the app uses.
`
  return [
    {
      path: 'polymorph-setup/SKILL.md',
      contents: skill(
        'polymorph-setup',
        'Add the polymorph design system to a project, or set up the files a coding agent reads ' +
          'to work with it. Use when asked to start a new app with polymorph, add polymorph to an ' +
          'existing React, Vue, Svelte, Solid or Angular app or to an HTML page, vendor polymorph ' +
          'components into a repository, move to a newer polymorph release, or write the ' +
          'AGENTS.md block, skills and MCP configuration for Claude Code, Codex, Cursor or another ' +
          'agent. It tells a new app, the packages route and the vendoring route apart.',
        body,
      ),
    },
  ]
}

/* -------------------------------------------------------------------------- */
/* polymorph-theme                                                            */
/* -------------------------------------------------------------------------- */

function themeSkill(registry: Registry, run: string): SkillFile[] {
  const f = new Facts(registry)
  const pairings = registry.theme.systems
    .slice(0, 3)
    .map((system) => `\`${system.name}/${system.defaultPalette}\``)
    .join(', ')
  const plain = registry.theme.systems.find((system) => system.name === DEFAULT_SYSTEM)
  const basis = `${DEFAULT_SYSTEM}/${plain?.defaultPalette ?? ''}`.replace(/\/$/, '')
  const body = `
# Change the theme

In polymorph, how an app looks is two JSON documents. A **system** decides how the product is
built: its design axes (${all(f.axes().map((axis) => `\`${axis}\``))}), its fonts and its
defaults. A **palette** decides its colours, in a light and a dark mode. One system worn with one
palette is a **pairing**, chosen by \`data-system\` and \`data-palette\` on \`<html>\`. The members
read every value from the theme as \`--pm-*\` tokens, so the look changes when the documents change
and in no other way. Application code never writes a colour, a length, a font or a duration.

Every command in this skill starts with the same words, the polymorph tools run from a shell. An
MCP server named \`polymorph\` gives the same answers through \`get_theme_axes\`, \`propose_theme\`
and \`save_theme\`.

## 1. Find the app's theme

- An app \`init\` wrote: \`src/theme/<system>.json\` and \`src/theme/<palette>.json\`, named in
  \`vite.config\` by \`polymorphTheme({ systems, palettes })\`, which compiles them when the app
  builds.
- A vendoring project: \`src/polymorph/themes/systems/\` and \`src/polymorph/themes/palettes/\`,
  compiled by \`add\` into the sheets beside them.
- A page with no build: \`${ELEMENTS_DIR}/${ELEMENTS_THEME_SHEET}\`, compiled from a catalogue
  system.

## 2. See what can move

${commands(run, 'axes', 'axes --values')}

\`axes\` lists the axes and their values, the shipped systems and palettes, the colour roles and the
scales. \`--values\` adds each system's token values with its own palette.

## 3. Propose a theme from words

${commands(run, 'theme propose "calmer, warmer paper, more editorial"', `theme propose "denser and cooler" --based-on ${basis}`, 'theme propose "denser and cooler" --save --dir design')}

The answer lists what each word moved, the words the table does not know, and the verdict of the
theme's laws. \`--based-on\` starts from a shipped pairing, such
as ${pairings}; either half may be left out. \`--save\` writes the two documents into
\`<dir>/systems/\` and \`<dir>/palettes/\` (the directory \`design\` when \`--dir\` is left out), and
\`--overwrite\` replaces files already saved under the same names. Then point the app at them: in an
app \`init\` wrote, name the two files in \`polymorphTheme\` in \`vite.config\`.

Words the table does not know move nothing. Say what should change in the words of the axes \`axes\`
lists, such as denser, rounder, calmer or warmer.

## 4. Edit a document by hand, then check it

${commands(run, 'theme validate src/theme/system.json src/theme/palette.json', 'theme schema system --out system.schema.json')}

\`theme validate\` admits a system and a palette under the same laws as the shipped ones, and names
each law a pairing breaks. \`theme schema\` writes the JSON Schema of a system or a palette, for an
editor.

## 5. Wear a shipped theme

${commands(run, 'add theme:pastel', 'add palette:orchid')}

In a vendoring project, \`add theme:<system>\` installs a shipped system with its own palette and
its fonts, and \`add palette:<name>\` a palette alone, which any installed system can wear. In a page
with no build, \`add theme:<system>\` compiles it into the theme sheet.

An app that compiles its theme with the Vite plugin wears the documents \`vite.config\` names. To
wear a shipped pairing there, save it as two documents of the app's own: words the table does not
know move nothing, so the proposal is the shipped pairing as it is. Then name the two saved files in
\`polymorphTheme\`.

${commands(run, 'theme propose "as shipped" --based-on journal/umber --save --dir src/theme')}

## What not to do

- No colour, length, font or duration in application code, and no \`--pm-*\` property declared by
  the app. A value the theme does not derive belongs in the system or palette document.
- No stylesheet that overrides a member. A member's look is the theme's.
- No branching on which theme is active. A subtree that needs another density or the inverse tone
  uses ${f.m('DensityScope')} or ${f.m('ToneScope')} (the \`polymorph-rules\` skill).
`
  return [
    {
      path: 'polymorph-theme/SKILL.md',
      contents: skill(
        'polymorph-theme',
        'Change how an app built with polymorph looks, its colours, type, density, shape, motion ' +
          'or overall feel. Use when asked to restyle or rebrand a polymorph app, to make it ' +
          'calmer, denser, warmer, darker or more editorial, to pick or adjust a theme, system or ' +
          'palette, or when tempted to write a colour, font or length in application code. ' +
          'Proposes a theme from plain words, checks it against the theme laws and saves it.',
        body,
      ),
    },
  ]
}

/**
 * Every file of every skill, at its path below a skills directory
 * (`polymorph-screen/SKILL.md`), in the order of `SKILL_NAMES`.
 */
export function skillFiles(registry: Registry, run: string): SkillFile[] {
  return [
    ...screenSkill(registry, run),
    ...rulesSkill(registry, run),
    ...setupSkill(registry, run),
    ...themeSkill(registry, run),
  ]
}
