import type { Registry } from '@polymorph/registry'

import { DEFAULT_SYSTEM } from '../plan'
import { chartsReference } from './screen-charts'
import { chatReference } from './screen-chat'
import { appReference, codeReference } from './screen-code'
import { richTextReference } from './screen-rich-text'
import { all, commands, either, Facts, frameworkTable, skill, type SkillFile } from './facts'

export function screenSkill(registry: Registry, run: string): SkillFile[] {
  const f = new Facts(registry)
  const spacing = all(f.shared(['Stack', 'Inline', 'Grid'], ['gap', 'p', 'px', 'py']))
  const pages = f
    .tier('archetypes')
    .filter((name) => name.endsWith('Page'))
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
Pass the app's framework as \`framework\` to every one that takes it. \`--json\` on a verb prints the
tool's answer as JSON and nothing else, for a script that reads it. A server started for no
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
The command answers for the release it names. Read it once when the work starts. For one member
after that, \`component\` is shorter and has more.

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
- Start a page from a page archetype, such as ${either(pages)}, or from ${f.m('PageHeader')}.
- Show an icon with ${f.m('Icon')}, its ${f.roleProp('Icon')} one of the card's icon roles.
- Put text in ${f.m('Text')}, whose ${f.p('Text', 'tone')} and ${f.p('Text', 'size')} take the
  place of a colour or a font size, and a heading in ${f.m('Heading')}, whose
  ${f.p('Heading', 'level')} sets its rank.

Some screens have a procedure of their own. Read its file before you write the screen:

| The screen | Read |
| --- | --- |
| Is written in code, or is the container of an emitted spec | [references/code.md](references/code.md) |
| Needs the app around it: the root's providers, the router, the mode, a form, a toast, a dialog, navigation | [references/app.md](references/app.md) |
| Holds a conversation with a model | [references/chat.md](references/chat.md) |
| Draws a chart | [references/charts.md](references/charts.md) |
| Takes or shows formatted text, mentions or comments on words | [references/rich-text.md](references/rich-text.md) |

Three jobs are another skill's: a screen a model writes while the product runs
(\`polymorph-runtime-screen\`), an agent on the page that reads and operates the members
(\`polymorph-agent-bridge\`), and a SwiftUI or Compose screen (\`polymorph-native\`).

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
state, and passes the data and the callbacks the spec declares as \`inputs\`.
[references/code.md](references/code.md) shows one. Never edit an emitted
file: change the spec and emit it again.

## 5. Or write the screen in code

Import members from the framework's vocabulary package, or from the vendored directory in a project
that vendors. [references/code.md](references/code.md) has the import line for each framework and
a worked screen, and [references/app.md](references/app.md) what the app wires around it. Then
check the file:

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

${commands(run, `render src/screens/inbox.json --system ${DEFAULT_SYSTEM}`, `render src/screens/inbox.json --system ${DEFAULT_SYSTEM} --data src/screens/inbox.data.json`)}

\`render\` draws a spec in a browser at a phone width (375 by 812) and a desktop width (1440 by
900), and lists the layout faults it measured in each. It writes the pictures into a directory
beside the spec, \`src/screens/inbox.render/\`, named for what it drew and the width:

| Drawn | Pictures |
| --- | --- |
| No data: each input sampled from its type, a list as empty | \`sampled-phone.png\`, \`sampled-desktop.png\` |
| \`--data <file>\`: the file's value for each input | \`populated-phone.png\`, \`populated-desktop.png\` |
| \`--empty <file>\`: its values laid over \`--data\`'s, a second drawing | \`empty-phone.png\`, \`empty-desktop.png\` |

The \`--data\` file is sample data for the pictures, which the app never reads: a JSON object keyed
by input name, kept beside the spec (\`src/screens/inbox.data.json\`). A callback input takes no
value there, because the page stubs it.

\`render\` draws with the shipped themes only. \`--system\` names a shipped system, \`--palette\` a
shipped palette (the system's own when left out) and \`--mode\` \`light\` or \`dark\` (the system's
default when left out); \`axes\` lists them. It reads no theme document of the app's and not
\`vite.config\`. Name the shipped pair the app's theme started from: \`init\` copies them into
\`src/theme/\` under their shipped names. A change the app made to its theme does not reach the
pictures.

Open the pictures and look at them, then read the faults:

| Fault | What to change |
| --- | --- |
| \`sideways-scroll\` | Something is wider than the window. Let an ${f.m('Inline')} wrap (${f.p('Inline', 'wrap')}), move actions into a menu, or use a member built to scroll. |
| \`clipped-text\` | Text does not fit its box. Shorten it, or give its container room. |
| \`small-target\` | Controls are too small or too close together. Use a larger size or more space between them. |
| \`cut-off\` | Content lies where nothing scrolls to it. Change the composition. |
| \`no-gap\` | Two members touch. Put them in a ${f.m('Stack')} or ${f.m('Inline')} with a ${f.p('Stack', 'gap')}. |
| \`unseen-focus\` | A control's focus mark is hidden. Do not put the control in a box that clips it. |

Change the composition or a prop to fix a fault, never a style. The first \`render\` on a machine
may answer that its browser is missing, with the command that downloads it. Run that command once,
then render again.

\`render\` draws specs only. For a screen written in code, run the app and look at it in a browser
when the session can.

## 8. Run the checks

${commands(run, 'check src')}

\`check\` runs the red rules over the directory whatever the project's lint config holds, and exits 1
on any violation. \`check\` and \`validate\` read the red rules and not a prop's type: a value no
member takes, such as a tone it does not have, passes both and fails the typecheck. So run the
project's own lint and typecheck, as \`package.json\` names them. Its lint runs the red rules too
only when its ESLint config loads them: it imports \`@polymorph/rules\` or spreads the fragment
\`polymorph.eslint.js\` that \`init\` and \`add\` write.

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
          'emitting a spec, and rendering it at phone and desktop width to read its layout faults. ' +
          'Its references cover a screen written in code and its container, an AI chat or ' +
          'assistant screen, charts and dashboards, and rich text with mentions and comments.',
        body,
      ),
    },
    { path: 'polymorph-screen/references/screen-spec.md', contents: specReference(registry) },
    { path: 'polymorph-screen/references/code.md', contents: codeReference(registry, run) },
    { path: 'polymorph-screen/references/app.md', contents: appReference(registry, run) },
    { path: 'polymorph-screen/references/chat.md', contents: chatReference(registry) },
    { path: 'polymorph-screen/references/charts.md', contents: chartsReference(registry, run) },
    { path: 'polymorph-screen/references/rich-text.md', contents: richTextReference(registry) },
  ]
}

/** The spec format's outline, which does not change with the vocabulary. */
function specReference(registry: Registry): string {
  const f = new Facts(registry)
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
one of its parts (such as ${f.part('Table', 'Row')}), as the card lists them for the
app's framework.

A value, as a prop or a child, is a string, a number, a boolean, \`null\`, an element, a list, a
binding \`{ "$": "inputName" }\`, or a structured object \`{ "$object": { … } }\` for data a prop
takes.

A prop whose type is a node, such as ${f.m('Dashboard')}'s ${f.p('Dashboard', 'actions')} and
${f.p('Dashboard', 'primary')}, takes an element as its value, or a list of elements, which \`emit\`
writes as a fragment. This \`root\` is a dashboard whose action goes to another page and whose main
column is one ${f.part('Dashboard', 'Panel')} holding a chart. Its spec declares the inputs
\`byDay\`, \`loading\` and \`onNavigate\`:

\`\`\`json
{
  "component": "Dashboard",
  "props": {
    "title": "Support",
    "actions": {
      "component": "Link",
      "props": { "href": "/tickets/new", "variant": "button", "buttonVariant": "solid", "onNavigate": { "$": "onNavigate" } },
      "children": ["New ticket"]
    },
    "primary": {
      "component": "Dashboard.Panel",
      "props": { "title": "Opened and resolved" },
      "children": [
        {
          "component": "LineChart",
          "props": {
            "label": "Tickets opened and resolved by day",
            "data": { "$": "byDay" },
            "loading": { "$": "loading" },
            "series": [
              { "$object": { "key": "opened", "label": "Opened" } },
              { "$object": { "key": "resolved", "label": "Resolved" } }
            ],
            "x": { "$object": { "key": "day", "scale": "time", "label": "Day" } }
          }
        }
      ]
    }
  }
}
\`\`\`

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
