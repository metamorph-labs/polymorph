import { FRAMEWORKS, type Registry } from '@polymorph/registry'

import { DEFAULT_SYSTEM } from './plan'

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
  const body = `
# Build a screen with polymorph

Polymorph is a closed vocabulary of interface components, called members, and a set of lint rules,
the red rules, that keep design decisions out of application code. The theme decides every colour,
size, font and motion. A screen composes members, sets their props and binds content to them.

You reach the tools from a shell. Every command in this skill starts with the same words:

${commands(run, 'card')}

If the session also has an MCP server named \`polymorph\`, its tools give the same answers:
\`get_system_card\` for \`card\`, \`search_components\` for \`search\`, \`get_component\` for
\`component\`, \`validate\`, \`emit_screen\` for \`emit\` and \`render_screen\` for \`render\`. Use
whichever you have.

## 1. Find the framework and how the app writes screens

Read \`package.json\` and \`polymorph.json\` at the project root. A package may be listed under its
published name, \`@metamorph-labs/polymorph-<name>\`.

${frameworkTable()}

A project that vendors members has their source under the \`dir\` that \`polymorph.json\` names,
usually \`src/polymorph/\`, and imports them from there. Those files are the vocabulary: do not edit
them to make a screen work.

Then look for screen specs: JSON files with \`"spec": "polymorph-screen/1"\`, usually in
\`src/screens/\`, each beside the component emitted from it. If the app has them, write the new
screen as a spec (step 4). Otherwise write it in the framework's own code (step 5).

## 2. Read the card

${commands(run, 'card --framework vue')}

Name the app's framework. The card lists every member with its props, the variants and tones each
takes, its compound parts (\`Card.Header\`), the icon roles, the token families, the red rules and
the exception ladder. \`polymorph/system-card.md\` holds the card as it was when the project was set
up. The command answers for the release the command names.

A member or a prop that is not in the card does not exist. Do not invent one, and do not bring in
components from another interface library.

## 3. Choose the members

${commands(run, 'search date picker --framework vue', 'component DatePicker --framework vue')}

\`search\` takes plain words and finds members by name, purpose, prop or variant. With no words it
lists every member. \`component\` prints one member: each prop with its type and default, the
lawful variant and tone pairs, its states, its parts and what it depends on. A wrong name is
answered with suggestions and exit code 1.

- Lay out with \`Stack\`, \`Inline\` and \`Grid\` and their spacing props (\`gap\`, \`p\`, \`px\`,
  \`py\`), which take steps of the space scale, never lengths.
- Start a page from a page archetype or from \`PageHeader\` when the card lists one that fits.
- Show an icon with \`Icon\` and a role from the card's icon roles.
- Put text in \`Heading\` and \`Text\`. Their \`tone\` and \`size\` props take the place of a colour or
  a font size.

## 4. Write a spec, then emit it

The format is in [references/screen-spec.md](references/screen-spec.md). Check the spec, then
compile it into a component:

${commands(run, 'validate src/screens/inbox.json', 'emit src/screens/inbox.json src/screens/Inbox.tsx')}

\`validate\` lists each fault at its path, such as \`$.root.children[1]\`, with suggestions for a
wrong name, and exits 0 when the spec is lawful. \`emit\` validates again, compiles the spec, checks
the output against the red rules, and writes nothing when either fails. The output path decides the
framework: \`.tsx\` for React, \`.vue\`, \`.svelte\`, and \`.ts\` for an Angular standalone component.
Add \`--framework solid\` for Solid's TSX.

The emitted component holds no state and no logic. A container you write renders it, owns the
state, and passes the data and the callbacks the spec declares as \`inputs\`. Never edit an emitted
file: change the spec and emit it again.

## 5. Or write the screen in code

Import members from the framework's vocabulary package, or from the vendored directory in a project
that vendors. Then check the file:

${commands(run, 'validate src/pages/Settings.tsx')}

\`validate\` takes several files. For a whole directory, use \`check\`:

${commands(run, 'check src')}

The red rules do not read an HTML page. In an \`elements\` project, check a page by reading it
against the card.

## 6. Fix every violation

Each violation is a line with the file, the position, the rule and its message. Under it are the
lawful answers:

- \`fix\`: a rewrite with exactly one lawful answer. The \`fix\` command below applies them.
- \`use\`: the members, props or tokens the message names. A colour, size or spacing becomes a prop
  of a member (\`tone\`, \`size\`, \`gap\`). A clickable \`<div>\` becomes a \`Button\`. A glyph from
  an icon set becomes \`Icon\` with a role.
- \`climb\`: the rungs of the exception ladder that answer the rule. When no member, variant or prop
  fits, follow the \`polymorph-rules\` skill.

Apply every rewrite that has one answer, then work through what is left:

${commands(run, 'fix src/pages/Settings.tsx')}

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
| \`sideways-scroll\` | Something is wider than the window. Let an \`Inline\` wrap, move actions into a menu, or use a member built to scroll. |
| \`clipped-text\` | Text does not fit its box. Shorten it, or give its container room. |
| \`small-target\` | Controls are too small or too close together. Use a larger \`size\` or more \`gap\`. |
| \`cut-off\` | Content lies where nothing scrolls to it. Change the composition. |
| \`no-gap\` | Two members touch. Put them in a \`Stack\` or \`Inline\` with a \`gap\`. |
| \`unseen-focus\` | A control's focus mark is hidden. Do not put the control in a box that clips it. |

Change the composition or a prop to fix a fault, never a style. \`--system\` names a shipped system:
the one the app's theme starts from, or \`${DEFAULT_SYSTEM}\`. \`axes\` lists them. The first \`render\`
on a machine may answer that its browser is missing, with the command that downloads it. Run that
command once, then render again.

\`render\` draws specs only. For a screen written in code, run the app and look at it in a browser
when the session can.

## 8. Run the project's own checks

Run the project's lint and typecheck, as \`package.json\` names them (\`npm run lint\`). The red rules
run inside its ESLint and Stylelint configs, so a clean lint is the last word.

## What application code may not contain

- CSS files, \`<style>\` blocks, CSS-in-JS, or a stylesheet import other than a font package's.
- \`style\`, \`className\`, \`class\` or \`css\` on a member.
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
one of its parts (\`Card.Header\`), as the card lists them for the app's framework.

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
allowed when they are declared: a declared exception names its reason, and the project can list
every one. A silenced rule is not allowed. Never add \`eslint-disable\`, \`eslint-disable-next-line\`
or \`stylelint-disable\` for a polymorph rule, and never change a lint config to turn one off.

Every command in this skill starts with the same words, the polymorph tools run from a shell. An
MCP server named \`polymorph\` gives the same answers through \`validate\`, \`fix\` and
\`get_component\`.

## 1. Read what the rule says

${commands(run, 'validate src/App.tsx')}

Each violation is a line with the file, the position, the rule and its message. Under it:

- \`fix\`: a rewrite with exactly one lawful answer.
- \`use\`: the members, props and tokens the message names, each with its rung.
- \`climb\`: every rung of the ladder that answers this rule.

## 2. Take the rewrite when there is one

${commands(run, 'fix src/App.tsx --dry-run', 'fix src/App.tsx')}

The first prints the fixed code, and the second writes it. The project's own \`eslint --fix\`
applies the same rewrites. A violation left after the fix is a decision: take the next step.

## 3. Climb the exception ladder

Take the first rung that works. Each rung is more governed than the next.

${ladder}

[references/ladder.md](references/ladder.md) has each rung's procedure, with code.

## 4. Which rungs answer which rule

| Rule | What it keeps out | Rungs |
| --- | --- | --- |
${rules.join('\n')}

Common cases:

- A colour, length or style on a member: find the prop that decides it (\`tone\`, \`variant\`,
  \`size\`, \`gap\`) with \`component <Name>\`. A spacing the scale lacks for one instance is a
  \`patch\` (rung 3). A one-off illustration is a \`Bespoke\` zone (rung 4).
- A raw control, or a click handler on a plain element: the member that is that control (\`Button\`,
  \`Checkbox\`, \`Select\`, \`TextField\`). \`search\` finds it by what it does.
- An icon set or an inline \`<svg>\`: \`Icon\` with a role from the card. A glyph no role names is a
  \`Bespoke\` zone until the vocabulary adds a role.
- A chart library: the chart members. A chart they cannot draw goes in a \`Bespoke\` zone.
- A motion library: members animate their own states. Motion the vocabulary has no member for goes
  in a \`Bespoke\` zone.
- A stylesheet import: delete it. Another library's own stylesheet is imported in the file that
  hosts the library inside \`ThirdParty\`.
- Another library's component, such as a map, an editor or a data grid: \`ThirdParty\` (rung 4).

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
    { path: 'polymorph-rules/references/ladder.md', contents: ladderReference(run) },
  ]
}

/** Each rung's procedure, which does not change with the vocabulary. */
function ladderReference(run: string): string {
  return `# The exception ladder, rung by rung

The examples are React. In Vue, Svelte and Solid the members have the same names and props. In
Angular a member is written by its selector (\`<pm-bespoke>\`, \`<pm-third-party>\`), and in a page
with no build as an element (\`<poly-bespoke>\`). A project that vendors members imports these from
its vendored directory and adds one with \`add\` (\`add bespoke\`, \`add third-party\`,
\`add density-scope\`, \`add tone-scope\`).

## Rung 1: variant selection

Every member exposes its range as typed props: \`variant\`, \`tone\`, \`size\` and the spacing steps.
A value off the scale is a type error. Read the member first:

${commands(run, 'component Button')}

The answer lists each prop's values and the variant and tone pairs that are lawful. Most needs end
here: a quieter button is \`variant="ghost"\`, a warning is \`tone="warning"\`, more room is a larger
\`gap\`.

## Rung 2: \`DensityScope\` and \`ToneScope\`

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

- \`DensityScope\` takes \`compact\`, \`standard\` or \`comfortable\`. It changes space and the size of
  controls, never the type scale.
- \`ToneScope\` takes \`inverse\`: the surface, text and border roles of the opposite mode.
- \`as\` is \`div\` (the default), \`section\` or \`span\`. A scope draws nothing of its own.

## Rung 3: an instance patch

One instance re-assigns token steps. The keys are the spacing props the member already has, and the
values are steps of the scale, never lengths.

\`\`\`tsx
<Stack gap={6} patch={{ gap: 2 }}>…</Stack>
<Card patch={{ p: 4, radius: 'sm' }}>…</Card>
\`\`\`

\`Stack\`, \`Inline\` and \`Grid\` take \`gap\`, \`p\`, \`px\` and \`py\`. \`Card\` takes \`p\`, \`px\`, \`py\` and
\`radius\`.

## Rung 4: a \`Bespoke\` zone or a \`ThirdParty\` boundary

\`Bespoke\` declares a one-off composition the vocabulary has no member for. Its \`reason\` is
required and is read by whoever reviews the code. Inside it the application rules are lifted:
\`style\`, raw values, raw controls and inline \`<svg>\` are allowed. It draws nothing itself, and the
theme's tokens reach inside it, so write values as \`var(--pm-…)\`.

\`\`\`tsx
import { Bespoke } from '@polymorph/react-ui'

<Bespoke reason="Promo illustration: overlapping discs the vocabulary has no shape for.">
  <div style={{ padding: 'var(--pm-space-4)', background: 'var(--pm-accent-subtle)' }}>…</div>
</Bespoke>
\`\`\`

\`ThirdParty\` hosts a component another library draws, such as a map, a rich-text editor or a data
grid. The file that declares it may import that library and its stylesheet, and what it holds may
take a \`style\`. Give the library the theme as \`var(--pm-…)\`, or as values from \`useThemeValues()\`
in the framework's foundation package. Controls and icons around it stay members.

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
  const frameworks = FRAMEWORKS.map((framework) => `\`${framework}\``).join(', ')
  const systems = registry.theme.systems.map((system) => `\`${system.name}\``).join(', ')
  const body = `
# Set up polymorph

Polymorph is a design system: a closed vocabulary of interface components for ${frameworks} (custom
elements for an HTML page with no build), a theme engine, and lint rules (the red rules) that keep
design decisions out of application code. Its tools are one npm package, \`@metamorph-labs/polymorph\`,
which every command here runs. Always run that scoped name: the unscoped \`polymorph\` package on npm
is someone else's.

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
installs the packages with the package manager that ran it. \`--framework\` takes ${frameworks}.
\`--framework elements\` writes a page with no build that loads the elements from copied files, and
installs nothing.

## An existing app: vendoring

${commands(run, 'plan button dialog theme:pastel', 'add button dialog theme:pastel', 'diff', 'update')}

\`plan\` prints what \`add\` would copy and install, and writes nothing. \`add\` copies the members you
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

${commands(run, 'check src', 'card --framework react')}

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
  const pairings = registry.theme.systems
    .slice(0, 3)
    .map((system) => `\`${system.name}/${system.defaultPalette}\``)
    .join(', ')
  const plain = registry.theme.systems.find((system) => system.name === DEFAULT_SYSTEM)
  const basis = `${DEFAULT_SYSTEM}/${plain?.defaultPalette ?? ''}`.replace(/\/$/, '')
  const body = `
# Change the theme

In polymorph, how an app looks is two JSON documents. A **system** decides how the product is
built: eight design axes (density, shape, type, motion and the rest), three font slots and their
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
- A page with no build: \`public/polymorph/theme.css\`, compiled from a catalogue system.

## 2. See what can move

${commands(run, 'axes', 'axes --values')}

\`axes\` lists the axes and their values, the shipped systems and palettes, the colour roles and the
scales. \`--values\` adds each system's token values with its own palette.

## 3. Propose a theme from words

${commands(run, 'theme propose "calmer, warmer paper, more editorial"', `theme propose "denser and cooler" --based-on ${basis}`, 'theme propose "denser and cooler" --save --dir design')}

The answer lists what each word moved, the words the table does not know, and the verdict of the
theme's laws (contrast, legibility, the scales). \`--based-on\` starts from a shipped pairing, such
as ${pairings}; either half may be left out. \`--save\` writes the two documents into
\`<dir>/systems/\` and \`<dir>/palettes/\` (the directory \`design\` when \`--dir\` is left out), and
\`--overwrite\` replaces files already saved under the same names. Then point the app at them: in an
app \`init\` wrote, name the two files in \`polymorphTheme\` in \`vite.config\`.

Words the table does not know move nothing. Say what should change in the words of the axes \`axes\`
lists, such as denser, rounder, quieter motion, or a warmer accent.

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
  uses \`DensityScope\` or \`ToneScope\` (the \`polymorph-rules\` skill).
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
