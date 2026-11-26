---
name: polymorph-screen
description: Build or change a screen, page, form, dialog or layout in an app that uses the polymorph design system, in React, Vue, Svelte, Solid, Angular or an HTML page. Use for any UI work in a repository whose package.json depends on a @polymorph/* or @metamorph-labs/polymorph-* package, or that has a polymorph.json or polymorph/system-card.md. Covers reading the system card, choosing members, writing a screen spec or framework code, validating it against the red rules, fixing violations, emitting a spec, and rendering it at phone and desktop width to read its layout faults. Its references cover a screen written in code and its container, an AI chat or assistant screen, charts and dashboards, and rich text with mentions and comments.
---

# Build a screen with polymorph

Polymorph is a closed vocabulary of interface components, called members, and a set of lint rules,
the red rules, that keep design decisions out of application code. The theme decides every colour,
size, font and motion. A screen composes members, sets their props and binds content to them.

You reach the tools from a shell. Every command in this skill starts with the same words:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 card --framework <framework>
```

If the session also has an MCP server named `polymorph`, its tools do the same jobs:
`get_system_card` for `card`, `search_components` for `search`, `get_component` for
`component`, `validate`, `fix`, `emit_screen` for `emit` and `render_screen` for `render`.
Pass the app's framework as `framework` to every one that takes it. `--json` on a verb prints the
tool's answer as JSON and nothing else, for a script that reads it. A server started for no
project, as a plugin's is, cannot read the framework from the project, and reads code as React's.

## 1. Find the framework and how the app writes screens

Read `package.json` and `polymorph.json` at the project root. A package may be listed under its
published name, `@metamorph-labs/polymorph-<name>`.

| The project has | The framework |
| --- | --- |
| `@polymorph/react-ui` | `react` |
| `@polymorph/vue-ui` | `vue` |
| `@polymorph/svelte-ui` | `svelte` |
| `@polymorph/solid-ui` | `solid` |
| `@polymorph/angular-ui` | `angular` |
| `"framework": "elements"` in `polymorph.json` | `elements`: `<poly-*>` custom elements in HTML pages with no build |

That is `<framework>` in every command below. A project that vendors members has their source under
the `dir` that `polymorph.json` names, usually `src/polymorph/`, and imports them from there.
Those files are the vocabulary: do not edit them to make a screen work.

Then look for screen specs: JSON files with `"spec": "polymorph-screen/1"`, usually in
`src/screens/`, each beside the component emitted from it. If the app has them, write the new
screen as a spec (step 4). Otherwise write it in the framework's own code (step 5).

## 2. Read the card

```sh
npx -y @metamorph-labs/polymorph@1.0.18 card --framework <framework>
```

The card lists every member with its props, the variants and tones each takes, its compound parts
(such as `Table.Row`), the icon roles, the token families, the red rules and the
exception ladder. `polymorph/system-card.md` holds the card as it was when the project was set up.
The command answers for the release it names. Read it once when the work starts. For one member
after that, `component` is shorter and has more.

A member or a prop that is not in the card does not exist. Do not invent one, and do not bring in
components from another interface library.

## 3. Choose the members

```sh
npx -y @metamorph-labs/polymorph@1.0.18 search date picker --framework <framework>
npx -y @metamorph-labs/polymorph@1.0.18 component DatePicker --framework <framework>
```

`search` takes plain words and finds members by name, purpose, prop or variant. With no words it
lists every member. `component` prints one member: each prop with its type and default, the
lawful variant and tone pairs, its states, its parts and what it depends on. A wrong name is
answered with suggestions and exit code 1.

- Lay out with `Stack`, `Inline` and `Grid` and their spacing props
  (`gap`, `p`, `px` and `py`), which take steps of the space scale, never lengths.
- Start a page from a page archetype, such as `ListPage`, `DetailPage` or `FormPage`, or from `PageHeader`.
- Show an icon with `Icon`, its `name` one of the card's icon roles.
- Put text in `Text`, whose `tone` and `size` take the
  place of a colour or a font size, and a heading in `Heading`, whose
  `level` sets its rank.

Some screens have a procedure of their own. Read its file before you write the screen:

| The screen | Read |
| --- | --- |
| Is written in code, or is the container of an emitted spec | [references/code.md](references/code.md) |
| Needs the app around it: the root's providers, the mode, a form, a toast, a dialog, navigation | [references/app.md](references/app.md) |
| Holds a conversation with a model | [references/chat.md](references/chat.md) |
| Draws a chart | [references/charts.md](references/charts.md) |
| Takes or shows formatted text, mentions or comments on words | [references/rich-text.md](references/rich-text.md) |

Three jobs are another skill's: a screen a model writes while the product runs
(`polymorph-runtime-screen`), an agent on the page that reads and operates the members
(`polymorph-agent-bridge`), and a SwiftUI or Compose screen (`polymorph-native`).

## 4. Write a spec, then emit it

The format is in [references/screen-spec.md](references/screen-spec.md). Check the spec, then
compile it into a component:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 validate src/screens/inbox.json --framework <framework>
npx -y @metamorph-labs/polymorph@1.0.18 emit src/screens/inbox.json <out> --framework <framework>
```

`validate` lists each fault at its path, such as `$.root.children[1]`, with suggestions for a
wrong name, and exits 0 when the spec is lawful. `emit` validates again, compiles the spec, checks
the output against the red rules, and writes nothing when either fails. `<out>` is the component
to write, with the framework's extension: `.tsx` for React and Solid, `.vue`, `.svelte`, and
`.ts` for an Angular standalone component.

The emitted component holds no state and no logic. A container you write renders it, owns the
state, and passes the data and the callbacks the spec declares as `inputs`.
[references/code.md](references/code.md) shows one. Never edit an emitted
file: change the spec and emit it again.

## 5. Or write the screen in code

Import members from the framework's vocabulary package, or from the vendored directory in a project
that vendors. [references/code.md](references/code.md) has the import line for each framework and
a worked screen, and [references/app.md](references/app.md) what the app wires around it. Then
check the file:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 validate src/pages/Settings.tsx --framework <framework>
```

`validate` takes several files. For a whole directory, use `check`, which reads each file in its
own framework:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 check src
```

The red rules do not read an HTML page. In an `elements` project, check a page by reading it
against the card.

## 6. Fix every violation

Each violation is a line with the file, the position, the rule and its message. Under it are the
lawful answers:

- `fix`: a rewrite with exactly one lawful answer. The `fix` command below applies them.
- `use`: the members, props or tokens the message names. A colour, size or spacing becomes a prop
  of a member, as `component` lists them. A clickable `<div>` becomes a `Button`. A
  glyph from an icon set becomes `Icon` with a role as its `name`.
- `climb`: the rungs of the exception ladder that answer the rule. When no member, variant or prop
  fits, follow the `polymorph-rules` skill.

Apply every rewrite that has one answer, then work through what is left:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 fix src/pages/Settings.tsx --framework <framework>
```

With `--dry-run`, `fix` prints the fixed code and writes nothing. Never add an `eslint-disable`
comment for a polymorph rule. Run `validate` again until it exits 0.

## 7. Look at the screen

```sh
npx -y @metamorph-labs/polymorph@1.0.18 render src/screens/inbox.json --system plain
```

`render` draws a spec in a browser at a phone width (375 by 812) and a desktop width (1440 by
900), writes the pictures beside the spec (`src/screens/inbox.render/sampled-phone.png`), and lists
the layout faults it measured in each. Open the pictures and look at them. With no data, each input
is sampled from its type, so the pictures show where content goes. `--data <file>` draws the screen
with a JSON value for each input, and `--empty <file>` adds a second drawing with its values laid
over those.

| Fault | What to change |
| --- | --- |
| `sideways-scroll` | Something is wider than the window. Let an `Inline` wrap (`wrap`), move actions into a menu, or use a member built to scroll. |
| `clipped-text` | Text does not fit its box. Shorten it, or give its container room. |
| `small-target` | Controls are too small or too close together. Use a larger size or more space between them. |
| `cut-off` | Content lies where nothing scrolls to it. Change the composition. |
| `no-gap` | Two members touch. Put them in a `Stack` or `Inline` with a `gap`. |
| `unseen-focus` | A control's focus mark is hidden. Do not put the control in a box that clips it. |

Change the composition or a prop to fix a fault, never a style. `--system` names a shipped system:
the one the app's theme starts from, or `plain`. `axes` lists them. The first `render`
on a machine may answer that its browser is missing, with the command that downloads it. Run that
command once, then render again.

`render` draws specs only. For a screen written in code, run the app and look at it in a browser
when the session can.

## 8. Run the checks

```sh
npx -y @metamorph-labs/polymorph@1.0.18 check src
```

`check` runs the red rules over the directory whatever the project's lint config holds, and exits 1
on any violation. Then run the project's own lint and typecheck, as `package.json` names them. Its
lint runs the red rules too only when its ESLint config loads them: it imports `@polymorph/rules`
or spreads the fragment `polymorph.eslint.js` that `init` and `add` write.

## What application code may not contain

- CSS files, `<style>` blocks, CSS-in-JS, or a stylesheet import other than a font package's.
- A `style`, `className` or `css` prop, on a member or a plain element, and a `class` on either
  in a framework that writes one. A declared zone lifts this for a plain element (the
  `polymorph-rules` skill).
- A colour (`#7c3aed`, `rgb()`, `oklch()`) or a length (`12px`, `1.5rem`) in a string.
- A raw `<button>`, `<input>`, `<select>`, `<textarea>` or `<option>`, or a click, key or pointer
  handler on a `<div>`, `<span>`, `<li>` or `<a>`.
- An import from an icon set, a motion library or a chart library, or an inline `<svg>`.
- A `--pm-*` custom property declared by the app.
- An `eslint-disable` comment for a polymorph rule.
