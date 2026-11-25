---
name: polymorph-rules
description: Resolve a polymorph red-rule violation, a lint error whose rule starts with polymorph/ such as polymorph/no-raw-styles, polymorph/no-raw-interactive or polymorph/no-app-css, or a design need the polymorph vocabulary does not seem to cover. Use when ESLint, Stylelint, polymorph validate or polymorph check reports a polymorph/ rule, before adding any eslint-disable comment, and when a screen needs a style, a control, an icon, a chart, motion or another library's component that no member provides. Walks the exception ladder rung by rung.
---

# Answer a red rule

The red rules are lint rules that keep design decisions out of application code. Exceptions are
allowed when they are declared: a declared exception names its reason, where a reviewer can read
it. A silenced rule is not allowed. Never add `eslint-disable`, `eslint-disable-next-line`
or `stylelint-disable` for a polymorph rule, and never change a lint config to turn one off.

Every command in this skill starts with the same words, the polymorph tools run from a shell.
`<framework>` is the app's: the `polymorph-screen` skill says how to tell it. An MCP server
named `polymorph` does the same jobs through `validate` and `fix`, given the framework as
`framework`, and `get_component`.

## 1. Read what the rule says

```sh
npx -y @metamorph-labs/polymorph@1.0.17 validate src/App.tsx --framework <framework>
```

Each violation is a line with the file, the position, the rule and its message. Under it:

- `fix`: a rewrite with exactly one lawful answer.
- `use`: the members, props and tokens the message names, each with its rung.
- `climb`: every rung of the ladder that answers this rule.

## 2. Take the rewrite when there is one

```sh
npx -y @metamorph-labs/polymorph@1.0.17 fix src/App.tsx --dry-run --framework <framework>
npx -y @metamorph-labs/polymorph@1.0.17 fix src/App.tsx --framework <framework>
```

The first prints the fixed code, and the second writes it. The project's own `eslint --fix`
applies the same rewrites. A violation left after the fix is a decision: take the next step.

## 3. Climb the exception ladder

Take the first rung that works. Each rung is more governed than the next.

1. **Variant selection**: Pick a variant, size or tone the member already offers.
2. **Contextual re-assignment** (`DensityScope`, `ToneScope`): A subtree re-assigns a named decision such as density or tone.
3. **Instance patch** (`patch`): One instance re-assigns semantic tokens, never raw values.
4. **Bespoke zone** (`Bespoke`, `ThirdParty`): A declared boundary for genuinely one-off composition, or around another library's component.
5. **Promotion**: A recurring patch or zone is promoted into the vocabulary or deleted.

[references/ladder.md](references/ladder.md) has each rung's procedure, with code.

## 4. Which rungs answer which rule

| Rule | What it holds | Rungs |
| --- | --- | --- |
| `polymorph/no-app-css` | Application code may not contain or import stylesheets. | 1, 4 |
| `polymorph/no-app-member-selectors` | Application CSS never restyles a member through `data-member`. | 1, 5 |
| `polymorph/no-app-theme-selectors` | Application CSS never branches on the theme's attributes. | 1, 2 |
| `polymorph/no-external-dataviz` | Chart physics is borrowed by the chart engine and by nothing else. | 1, 4 |
| `polymorph/no-external-icons` | Icons are referenced by semantic role, not imported as glyphs. | 1, 4, 5 |
| `polymorph/no-external-motion` | Motion is owned by the vocabulary and never imported by app code. | 1, 4 |
| `polymorph/no-motion-outside-vocabulary` | Motion binds to component state and is never declared by application CSS. | 1, 4 |
| `polymorph/no-raw-interactive` | Interactive elements come from the vocabulary, never from raw HTML. | 1, 4 |
| `polymorph/no-raw-styles` | Application code composes the vocabulary and binds content; it does not express style. | 1, 3, 4 |
| `polymorph/no-root-font-size` | Application CSS never sets the root font size. | 2 |
| `polymorph/no-token-declarations` | Application CSS reads `--pm-*` tokens and never declares one. | 1, 2, 3 |
| `polymorph/one-opener` | A page composes exactly one opener — PageHeader or Hero, never both. | 1 |
| `polymorph/scoped-token-owners` | Pattern-scoped tokens are referenced only by their owning pattern. | none |

Common cases:

- A colour, length or style on a member: find the prop that decides it with `component <Name>`,
  such as `Button`'s `variant` and `tone` or
  `Stack`'s `gap`. A spacing the scale lacks for one instance is a
  `patch` (rung 3). A one-off illustration is a `Bespoke` zone (rung 4).
- A raw control, or a click handler on a plain element: the member that is that control, such as
  `Button`, `Checkbox`, `Select`, `Input` and `Textarea`.
  `search` finds it by what it does.
- An icon set or an inline `<svg>`: `Icon` with a role from the card as its
  `name`. A glyph no role names is a `Bespoke` zone until the vocabulary adds
  a role.
- A chart library: the chart members. A chart they cannot draw goes in a `Bespoke` zone.
- A motion library: members animate their own states. Motion the vocabulary has no member for goes
  in a `Bespoke` zone.
- A stylesheet import: delete it. Another library's own stylesheet is imported in the file that
  hosts the library inside `ThirdParty`.
- Another library's component, such as a map, an editor or a data grid: `ThirdParty`
  (rung 4).

## 5. When the same exception keeps coming back

A patch or a zone that recurs is promoted into the vocabulary or deleted (rung 5). That is a
decision for whoever owns the design system: tell the person you are working for, with the zones
and their reasons. Do not build a private copy of a member.
