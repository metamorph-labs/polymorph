---
name: polymorph-screen
description: Build or change a screen, page, form, dialog or layout in an app that uses the polymorph design system, in React, Vue, Svelte, Solid, Angular or an HTML page. Use for any UI work in a repository whose package.json depends on a @polymorph/* or @metamorph-labs/polymorph-* package, or that has a polymorph.json or polymorph/system-card.md. Covers reading the system card, choosing members, writing a screen spec or framework code, validating it against the red rules, fixing violations, emitting a spec, and rendering it at phone and desktop width to read its layout faults.
---

# Build a screen with polymorph

Polymorph is a closed vocabulary of interface components, called members, and a set of lint rules,
the red rules, that keep design decisions out of application code. The theme decides every colour,
size, font and motion. A screen composes members, sets their props and binds content to them.

You reach the tools from a shell. Every command in this skill starts with the same words:

```sh
npx -y @metamorph-labs/polymorph@1.0.17 card
```

If the session also has an MCP server named `polymorph`, its tools give the same answers:
`get_system_card` for `card`, `search_components` for `search`, `get_component` for
`component`, `validate`, `emit_screen` for `emit` and `render_screen` for `render`. Use
whichever you have.

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

A project that vendors members has their source under the `dir` that `polymorph.json` names,
usually `src/polymorph/`, and imports them from there. Those files are the vocabulary: do not edit
them to make a screen work.

Then look for screen specs: JSON files with `"spec": "polymorph-screen/1"`, usually in
`src/screens/`, each beside the component emitted from it. If the app has them, write the new
screen as a spec (step 4). Otherwise write it in the framework's own code (step 5).

## 2. Read the card

```sh
npx -y @metamorph-labs/polymorph@1.0.17 card --framework vue
```

Name the app's framework. The card lists every member with its props, the variants and tones each
takes, its compound parts (`Card.Header`), the icon roles, the token families, the red rules and
the exception ladder. `polymorph/system-card.md` holds the card as it was when the project was set
up. The command answers for the release the command names.

A member or a prop that is not in the card does not exist. Do not invent one, and do not bring in
components from another interface library.

## 3. Choose the members

```sh
npx -y @metamorph-labs/polymorph@1.0.17 search date picker --framework vue
npx -y @metamorph-labs/polymorph@1.0.17 component DatePicker --framework vue
```

`search` takes plain words and finds members by name, purpose, prop or variant. With no words it
lists every member. `component` prints one member: each prop with its type and default, the
lawful variant and tone pairs, its states, its parts and what it depends on. A wrong name is
answered with suggestions and exit code 1.

- Lay out with `Stack`, `Inline` and `Grid` and their spacing props (`gap`, `p`, `px`,
  `py`), which take steps of the space scale, never lengths.
- Start a page from a page archetype or from `PageHeader` when the card lists one that fits.
- Show an icon with `Icon` and a role from the card's icon roles.
- Put text in `Heading` and `Text`. Their `tone` and `size` props take the place of a colour or
  a font size.

## 4. Write a spec, then emit it

The format is in [references/screen-spec.md](references/screen-spec.md). Check the spec, then
compile it into a component:

```sh
npx -y @metamorph-labs/polymorph@1.0.17 validate src/screens/inbox.json
npx -y @metamorph-labs/polymorph@1.0.17 emit src/screens/inbox.json src/screens/Inbox.tsx
```

`validate` lists each fault at its path, such as `$.root.children[1]`, with suggestions for a
wrong name, and exits 0 when the spec is lawful. `emit` validates again, compiles the spec, checks
the output against the red rules, and writes nothing when either fails. The output path decides the
framework: `.tsx` for React, `.vue`, `.svelte`, and `.ts` for an Angular standalone component.
Add `--framework solid` for Solid's TSX.

The emitted component holds no state and no logic. A container you write renders it, owns the
state, and passes the data and the callbacks the spec declares as `inputs`. Never edit an emitted
file: change the spec and emit it again.

## 5. Or write the screen in code

Import members from the framework's vocabulary package, or from the vendored directory in a project
that vendors. Then check the file:

```sh
npx -y @metamorph-labs/polymorph@1.0.17 validate src/pages/Settings.tsx
```

`validate` takes several files. For a whole directory, use `check`:

```sh
npx -y @metamorph-labs/polymorph@1.0.17 check src
```

The red rules do not read an HTML page. In an `elements` project, check a page by reading it
against the card.

## 6. Fix every violation

Each violation is a line with the file, the position, the rule and its message. Under it are the
lawful answers:

- `fix`: a rewrite with exactly one lawful answer. The `fix` command below applies them.
- `use`: the members, props or tokens the message names. A colour, size or spacing becomes a prop
  of a member (`tone`, `size`, `gap`). A clickable `<div>` becomes a `Button`. A glyph from
  an icon set becomes `Icon` with a role.
- `climb`: the rungs of the exception ladder that answer the rule. When no member, variant or prop
  fits, follow the `polymorph-rules` skill.

Apply every rewrite that has one answer, then work through what is left:

```sh
npx -y @metamorph-labs/polymorph@1.0.17 fix src/pages/Settings.tsx
```

With `--dry-run`, `fix` prints the fixed code and writes nothing. Never add an `eslint-disable`
comment for a polymorph rule. Run `validate` again until it exits 0.

## 7. Look at the screen

```sh
npx -y @metamorph-labs/polymorph@1.0.17 render src/screens/inbox.json --system plain
```

`render` draws a spec in a browser at a phone width (375 by 812) and a desktop width (1440 by
900), writes the pictures beside the spec (`src/screens/inbox.render/sampled-phone.png`), and lists
the layout faults it measured in each. Open the pictures and look at them. With no data, each input
is sampled from its type, so the pictures show where content goes. `--data <file>` draws the screen
with a JSON value for each input, and `--empty <file>` adds a second drawing with its values laid
over those.

| Fault | What to change |
| --- | --- |
| `sideways-scroll` | Something is wider than the window. Let an `Inline` wrap, move actions into a menu, or use a member built to scroll. |
| `clipped-text` | Text does not fit its box. Shorten it, or give its container room. |
| `small-target` | Controls are too small or too close together. Use a larger `size` or more `gap`. |
| `cut-off` | Content lies where nothing scrolls to it. Change the composition. |
| `no-gap` | Two members touch. Put them in a `Stack` or `Inline` with a `gap`. |
| `unseen-focus` | A control's focus mark is hidden. Do not put the control in a box that clips it. |

Change the composition or a prop to fix a fault, never a style. `--system` names a shipped system:
the one the app's theme starts from, or `plain`. `axes` lists them. The first `render`
on a machine may answer that its browser is missing, with the command that downloads it. Run that
command once, then render again.

`render` draws specs only. For a screen written in code, run the app and look at it in a browser
when the session can.

## 8. Run the project's own checks

Run the project's lint and typecheck, as `package.json` names them (`npm run lint`). The red rules
run inside its ESLint and Stylelint configs, so a clean lint is the last word.

## What application code may not contain

- CSS files, `<style>` blocks, CSS-in-JS, or a stylesheet import other than a font package's.
- `style`, `className`, `class` or `css` on a member.
- A colour (`#7c3aed`, `rgb()`, `oklch()`) or a length (`12px`, `1.5rem`) in a string.
- A raw `<button>`, `<input>`, `<select>`, `<textarea>` or `<option>`, or a click, key or pointer
  handler on a `<div>`, `<span>`, `<li>` or `<a>`.
- An import from an icon set, a motion library or a chart library, or an inline `<svg>`.
- A `--pm-*` custom property declared by the app.
- An `eslint-disable` comment for a polymorph rule.
